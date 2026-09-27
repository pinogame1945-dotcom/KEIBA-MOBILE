import { assertResultMatchesStoredEntries } from "../domain/resultArchiveGuard";
import type {
  JraEntry, JraPayout, JraRace, JraRaceCard, JraRaceResult, OddsBetType, OddsRow, RaceNotice, ScheduleMeeting,
  ScheduleTarget, VenueConditionSnapshot,
} from "../domain/live";
import { canonicalRaceIdFromSchedule } from "../data/jra/raceHeaderParser";
import { earliestScheduleDate, selectActiveSchedule } from "../data/jra/reschedule";
import { getLiveDb, withLiveDbTransaction, withLiveDbWrite } from "../storage/liveDb";

export type JraOddsBetType = OddsBetType;
export type OddsActionCache = { betType: OddsBetType; path: string; cname: string; updatedAt: string; };
export type OddsRowInput = Omit<OddsRow, "raceKey" | "observedAt" | "sourceUrl">;

export function localTodayIso(nowMs = Date.now()) {
  const d = new Date(nowMs);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function scheduleRaceKey(raceDate: string, venue: string, raceNo: number) {
  return "JRA:" + raceDate + ":" + venue + ":" + raceNo;
}


const SCHEDULE_TARGET_META = "schedule_target_v2";

export async function saveScheduleTarget(target: ScheduleTarget) {
  await persistScheduleTarget(target);
}

export async function getScheduleTarget(): Promise<ScheduleTarget | null> {
  const raw = await getWeekMeta(SCHEDULE_TARGET_META);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ScheduleTarget;
    if (!Array.isArray(parsed.dates) || !Array.isArray(parsed.meetings)) return null;
    if (!Array.isArray(parsed.disruptions)) parsed.disruptions = [];
    return parsed;
  } catch {
    return null;
  }
}

function scheduleRaceAsDisplay(
  meeting: ScheduleMeeting,
  race: ScheduleMeeting["races"][number],
  fetchedAt: string,
): JraRace {
  return {
    raceKey: scheduleRaceKey(race.raceDate, race.venue, race.raceNo),
    canonicalRaceId: canonicalRaceIdFromSchedule(
      race.raceDate, race.venue, meeting.meetingNo, meeting.meetingDay, race.raceNo,
    ),
    raceDate: race.raceDate,
    scheduledDate: race.raceDate,
    actualDate: race.raceDate,
    raceStatus: "SCHEDULED",
    scheduleStatus: "ACTIVE",
    supersededByRaceKey: null,
    venue: race.venue,
    raceNo: race.raceNo,
    raceName: race.raceName,
    raceClass: null,
    startTime: race.startTime,
    discipline: race.discipline,
    surface: race.surface,
    distanceM: race.distanceM,
    direction: null,
    weather: null,
    trackCondition: null,
    sourceUrl: race.sourceUrl,
    fetchedAt,
    status: "SCHEDULED",
  };
}

function scheduledDisplayRaces(target: ScheduleTarget | null, dates: string[]) {
  if (!target) return [] as JraRace[];
  const wanted = new Set(dates);
  return target.meetings.flatMap((meeting) =>
    wanted.has(meeting.raceDate)
      ? meeting.races.map((race) => scheduleRaceAsDisplay(meeting, race, target.fetchedAt))
      : []
  );
}

function noticeKey(input: {
  raceKey: string; kind: string; horseNo?: number | null; previous?: string | null; next?: string | null;
}) {
  return [input.raceKey, input.kind, input.horseNo ?? "", input.previous ?? "", input.next ?? ""].join("|");
}

async function insertNotice(
  db: Awaited<ReturnType<typeof getLiveDb>>,
  race: JraRace,
  kind: string,
  previous: string | null,
  next: string | null,
  horseNo: number | null = null,
  horseName: string | null = null,
) {
  const observedAt = new Date().toISOString();
  await db.runAsync(
    `INSERT OR IGNORE INTO notices(
      event_key,race_key,race_date,venue,race_no,kind,horse_no,horse_name,previous_value,next_value,observed_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    noticeKey({ raceKey: race.raceKey, kind, horseNo, previous, next }),
    race.raceKey, race.raceDate, race.venue, race.raceNo, kind, horseNo, horseName, previous, next, observedAt,
  );
}


async function invalidateRaceSession(
  db: Awaited<ReturnType<typeof getLiveDb>>,
  raceKey: string,
  reason: "RESCHEDULED" | "CANCELLED" | "ABANDONED",
) {
  await db.runAsync(
    `UPDATE odds_history
     SET invalidated_at=COALESCE(invalidated_at,CURRENT_TIMESTAMP),
         invalidated_reason=COALESCE(invalidated_reason,?)
     WHERE race_key=? AND invalidated_at IS NULL`,
    reason,raceKey,
  );
  await db.runAsync("DELETE FROM odds_current WHERE race_key=?",raceKey);
  await db.runAsync("DELETE FROM odds_actions WHERE race_key=?",raceKey);
  await db.runAsync(
    "DELETE FROM meta WHERE key IN (?,?,?)",
    "odds_final_confirmed:"+raceKey,
    "odds_final_probe:"+raceKey,
    "payout_repair_attempt:"+raceKey,
  );
}

async function insertScheduleNotice(
  db: Awaited<ReturnType<typeof getLiveDb>>,
  input: {
    eventKey: string;
    raceKey: string;
    raceDate: string;
    venue: string;
    raceNo: number;
    kind: string;
    previousValue: string | null;
    nextValue: string | null;
    observedAt: string;
  },
) {
  await db.runAsync(
    `INSERT OR IGNORE INTO notices(
      event_key,race_key,race_date,venue,race_no,kind,horse_no,horse_name,previous_value,next_value,observed_at
    ) VALUES(?,?,?,?,?,?,NULL,NULL,?,?,?)`,
    input.eventKey,input.raceKey,input.raceDate,input.venue,input.raceNo,input.kind,
    input.previousValue,input.nextValue,input.observedAt,
  );
}

async function reconcileScheduleGroup(
  db: Awaited<ReturnType<typeof getLiveDb>>,
  canonicalRaceId: string | null,
  observedAt: string,
) {
  if (!canonicalRaceId) return;
  const rows = await db.getAllAsync<{
    raceKey:string;raceDate:string;fetchedAt:string;venue:string;raceNo:number;
  }>(
    `SELECT race_key AS raceKey,race_date AS raceDate,fetched_at AS fetchedAt,venue,race_no AS raceNo
     FROM races WHERE canonical_race_id=?`,
    canonicalRaceId,
  );
  if (rows.length <= 0) return;
  const active = selectActiveSchedule(rows);
  const scheduledDate = earliestScheduleDate(rows);
  if (!active || !scheduledDate) return;

  await db.runAsync(
    `UPDATE races
     SET scheduled_date=?,actual_date=?,schedule_status='ACTIVE',
         superseded_by_race_key=NULL,archived_at=NULL
     WHERE race_key=?`,
    scheduledDate,active.raceDate,active.raceKey,
  );

  for (const stale of rows.filter((row) => row.raceKey !== active.raceKey)) {
    await db.runAsync(
      `UPDATE races
       SET scheduled_date=?,actual_date=?,schedule_status='RESCHEDULED',
           superseded_by_race_key=?,archived_at=COALESCE(archived_at,?)
       WHERE race_key=?`,
      scheduledDate,active.raceDate,active.raceKey,observedAt,stale.raceKey,
    );
    await invalidateRaceSession(db,stale.raceKey,"RESCHEDULED");
    await insertScheduleNotice(db,{
      eventKey:["MEETING_RESCHEDULED",stale.raceDate,stale.venue,active.raceDate].join("|"),
      raceKey:"JRA-MEETING:"+stale.raceDate+":"+stale.venue,
      raceDate:stale.raceDate,
      venue:stale.venue,
      raceNo:0,
      kind:"MEETING_RESCHEDULED",
      previousValue:stale.raceDate,
      nextValue:active.raceDate,
      observedAt,
    });
  }
}

async function applyScheduleDisruptions(
  db: Awaited<ReturnType<typeof getLiveDb>>,
  target: ScheduleTarget,
) {
  for (const disruption of target.disruptions ?? []) {
    const rows = disruption.scope === "MEETING"
      ? await db.getAllAsync<{raceKey:string;raceStatus:string}>(
          "SELECT race_key AS raceKey,race_status AS raceStatus FROM races WHERE race_date=? AND venue=? AND schedule_status='ACTIVE'",
          disruption.raceDate,disruption.venue,
        )
      : await db.getAllAsync<{raceKey:string;raceStatus:string}>(
          "SELECT race_key AS raceKey,race_status AS raceStatus FROM races WHERE race_date=? AND venue=? AND race_no=? AND schedule_status='ACTIVE'",
          disruption.raceDate,disruption.venue,disruption.raceNo,
        );
    for (const row of rows) {
      if (row.raceStatus === "COMPLETED") continue;
      await db.runAsync(
        "UPDATE races SET race_status=? WHERE race_key=?",
        disruption.kind,row.raceKey,
      );
      await invalidateRaceSession(db,row.raceKey,disruption.kind);
    }
    const raceNo = disruption.scope === "RACE" ? disruption.raceNo ?? 0 : 0;
    await insertScheduleNotice(db,{
      eventKey:[
        disruption.scope === "MEETING" ? "MEETING_CANCELLED" : "RACE_CANCELLED",
        disruption.raceDate,disruption.venue,raceNo,disruption.kind,
      ].join("|"),
      raceKey:disruption.scope === "MEETING"
        ? "JRA-MEETING:"+disruption.raceDate+":"+disruption.venue
        : scheduleRaceKey(disruption.raceDate,disruption.venue,raceNo),
      raceDate:disruption.raceDate,
      venue:disruption.venue,
      raceNo,
      kind:disruption.scope === "MEETING" ? "MEETING_CANCELLED" : "RACE_CANCELLED",
      previousValue:"SCHEDULED",
      nextValue:disruption.kind,
      observedAt:target.fetchedAt,
    });
  }
}

async function persistScheduleTarget(target: ScheduleTarget) {
  await withLiveDbTransaction(async (db) => {
    await db.runAsync(
      "INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      SCHEDULE_TARGET_META,JSON.stringify(target),
    );

    const canonicalIds = new Set<string>();
    for (const meeting of target.meetings) {
      for (const race of meeting.races) {
        const row = scheduleRaceAsDisplay(meeting,race,target.fetchedAt);
        if (row.canonicalRaceId) canonicalIds.add(row.canonicalRaceId);
        await db.runAsync(
          `INSERT INTO races(
            race_key,canonical_race_id,race_date,scheduled_date,actual_date,race_status,schedule_status,
            superseded_by_race_key,archived_at,venue,race_no,race_name,race_class,start_time,
            discipline,surface,distance_m,direction,weather,track_condition,source_url,fetched_at,status
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(race_key) DO UPDATE SET
            canonical_race_id=COALESCE(excluded.canonical_race_id,races.canonical_race_id),
            scheduled_date=COALESCE(races.scheduled_date,excluded.scheduled_date),
            actual_date=CASE WHEN races.race_status='COMPLETED' THEN races.actual_date ELSE excluded.actual_date END,
            race_name=COALESCE(races.race_name,excluded.race_name),
            start_time=COALESCE(excluded.start_time,races.start_time),
            discipline=excluded.discipline,surface=COALESCE(excluded.surface,races.surface),
            distance_m=COALESCE(excluded.distance_m,races.distance_m),
            source_url=excluded.source_url,fetched_at=excluded.fetched_at`,
          row.raceKey,row.canonicalRaceId,row.raceDate,row.scheduledDate,row.actualDate,row.raceStatus,row.scheduleStatus,
          row.supersededByRaceKey,null,row.venue,row.raceNo,row.raceName,row.raceClass,row.startTime,
          row.discipline,row.surface,row.distanceM,row.direction,row.weather,row.trackCondition,row.sourceUrl,row.fetchedAt,row.status,
        );
      }
    }

    for (const canonicalRaceId of canonicalIds) {
      await reconcileScheduleGroup(db,canonicalRaceId,target.fetchedAt);
    }
    await applyScheduleDisruptions(db,target);
  });
}

async function recordChanges(db: Awaited<ReturnType<typeof getLiveDb>>, card: JraRaceCard) {
  const previous = await db.getFirstAsync<{
    start_time: string | null; weather: string | null; track_condition: string | null; status: string;
  }>("SELECT start_time,weather,track_condition,status FROM races WHERE race_key=?", card.race.raceKey);
  if (!previous || previous.status !== "OFFICIAL") return;

  const scalar = async (kind: string, before: string | null, after: string | null) => {
    if (before == null || after == null || before === after) return;
    await insertNotice(db, card.race, kind, before, after);
  };
  await scalar("TRACK_CHANGED", previous.track_condition, card.race.trackCondition);
  await scalar("WEATHER_CHANGED", previous.weather, card.race.weather);
  await scalar("START_TIME_CHANGED", previous.start_time, card.race.startTime);

  const oldEntries = await db.getAllAsync<{ horse_no: number | null; horse_name: string; entry_status: string }>(
    "SELECT horse_no,horse_name,entry_status FROM entries WHERE race_key=?",
    card.race.raceKey,
  );
  const byNo = new Map(oldEntries.filter((e) => e.horse_no != null).map((e) => [e.horse_no as number, e]));
  for (const entry of card.entries) {
    if (entry.horseNo == null || (entry.entryStatus !== "SCRATCHED" && entry.entryStatus !== "EXCLUDED")) continue;
    const before = byNo.get(entry.horseNo);
    if (!before || before.entry_status === entry.entryStatus) continue;
    await insertNotice(
      db,
      card.race,
      entry.entryStatus === "EXCLUDED" ? "EXCLUDED" : "SCRATCHED",
      before.entry_status,
      entry.entryStatus,
      entry.horseNo,
      entry.horseName || before.horse_name,
    );
  }
}

async function writeOfficialCard(db: Awaited<ReturnType<typeof getLiveDb>>, card: JraRaceCard) {
  const existingResult = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM race_results WHERE race_key=?",
    card.race.raceKey,
  );
  const hasFinalResult = Number(existingResult?.count ?? 0) > 0;
  if (!hasFinalResult) await recordChanges(db, card);

  const r = card.race;
  const cardWeather = hasFinalResult ? null : r.weather;
  const cardTrackCondition = hasFinalResult ? null : r.trackCondition;
  await db.runAsync(
    `INSERT INTO races(
      race_key,canonical_race_id,race_date,scheduled_date,actual_date,race_status,schedule_status,
      superseded_by_race_key,archived_at,venue,race_no,race_name,race_class,start_time,
      discipline,surface,distance_m,direction,weather,track_condition,source_url,fetched_at,status
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'OFFICIAL')
    ON CONFLICT(race_key) DO UPDATE SET
      canonical_race_id=COALESCE(excluded.canonical_race_id,races.canonical_race_id),
      race_name=excluded.race_name,race_class=excluded.race_class,start_time=excluded.start_time,
      discipline=excluded.discipline,surface=excluded.surface,distance_m=excluded.distance_m,
      direction=excluded.direction,
      weather=COALESCE(excluded.weather,races.weather),
      track_condition=COALESCE(excluded.track_condition,races.track_condition),
      source_url=excluded.source_url,fetched_at=excluded.fetched_at,status='OFFICIAL'`,
    r.raceKey,r.canonicalRaceId,r.raceDate,r.scheduledDate,r.actualDate,r.raceStatus,r.scheduleStatus,
    r.supersededByRaceKey,null,r.venue,r.raceNo,r.raceName,r.raceClass,r.startTime,
    r.discipline,r.surface,r.distanceM,r.direction,cardWeather,cardTrackCondition,r.sourceUrl,r.fetchedAt,
  );
  await db.runAsync("DELETE FROM entries WHERE race_key=?", r.raceKey);
  for (const e of card.entries) {
    await db.runAsync(
      `INSERT INTO entries(
        race_key,canonical_horse_id,gate,horse_no,horse_name,entry_status,sex,age,coat_color,carried_weight,
        jockey_name,trainer_name,body_weight,body_weight_diff,win_odds,popularity,sire,dam,damsire
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      e.raceKey, e.canonicalHorseId, e.gate, e.horseNo, e.horseName, e.entryStatus, e.sex, e.age, e.coatColor,
      e.carriedWeight, e.jockeyName, e.trainerName, e.bodyWeight, e.bodyWeightDiff, e.winOdds, e.popularity,
      e.sire, e.dam, e.damsire,
    );
  }
}

export async function saveOfficialMeeting(cards: JraRaceCard[], authoritativeRaceNos: number[]) {
  if (!cards.length) return;
  const first = cards[0].race;
  const expected = [...new Set(authoritativeRaceNos)].sort((a,b) => a-b);
  const actual = [...new Set(cards.map((c) => c.race.raceNo))].sort((a,b) => a-b);
  if (expected.join(",") !== actual.join(",")) throw new Error("正式ナビ集合と保存対象レース集合が一致しない");
  await withLiveDbTransaction(async (db) => {
    const existing = await db.getAllAsync<{ race_no: number }>(
      "SELECT race_no FROM races WHERE race_date=? AND venue=? AND status='OFFICIAL' AND schedule_status='ACTIVE' AND race_status NOT IN ('CANCELLED','ABANDONED') ORDER BY race_no",
      first.raceDate, first.venue,
    );
    const omitted = existing.map((r) => r.race_no).filter((no) => !expected.includes(no));
    if (omitted.length) throw new Error("既存の正式開催からレースが消えたため更新を保留: " + omitted.join(","));
    for (const card of cards) await writeOfficialCard(db, card);
  });
}

export async function saveOfficialCard(card: JraRaceCard) {
  await withLiveDbTransaction(async (db) => { await writeOfficialCard(db, card); });
}

function raceSelect() {
  return `race_key AS raceKey,canonical_race_id AS canonicalRaceId,race_date AS raceDate,
    COALESCE(scheduled_date,race_date) AS scheduledDate,actual_date AS actualDate,
    race_status AS raceStatus,schedule_status AS scheduleStatus,superseded_by_race_key AS supersededByRaceKey,
    venue,race_no AS raceNo,race_name AS raceName,race_class AS raceClass,start_time AS startTime,discipline,surface,distance_m AS distanceM,
    direction,weather,track_condition AS trackCondition,source_url AS sourceUrl,fetched_at AS fetchedAt,status`;
}

async function listStoredRacesForDates(dates: string[]) {
  if (!dates.length) return [] as JraRace[];
  const db = await getLiveDb();
  const placeholders = dates.map(() => "?").join(",");
  return db.getAllAsync<JraRace>(
    `SELECT ${raceSelect()} FROM races WHERE race_date IN (${placeholders})
     ORDER BY race_date,venue,race_no`,
    ...dates,
  );
}

export async function listOfficialRacesForDates(dates: string[]) {
  return (await listStoredRacesForDates(dates)).filter((race) =>
    race.status === "OFFICIAL" &&
    race.scheduleStatus === "ACTIVE" &&
    race.raceStatus !== "CANCELLED" &&
    race.raceStatus !== "ABANDONED"
  );
}

function mergeScheduledWithStored(schedule: JraRace, stored: JraRace | undefined) {
  if (!stored) return schedule;
  if (stored.status === "OFFICIAL") return stored;
  return {
    ...schedule,
    canonicalRaceId: stored.canonicalRaceId ?? schedule.canonicalRaceId,
    scheduledDate: stored.scheduledDate ?? schedule.scheduledDate,
    actualDate: stored.actualDate ?? schedule.actualDate,
    raceStatus: stored.raceStatus ?? schedule.raceStatus,
    scheduleStatus: stored.scheduleStatus ?? schedule.scheduleStatus,
    supersededByRaceKey: stored.supersededByRaceKey ?? schedule.supersededByRaceKey,
    raceName: stored.raceName ?? schedule.raceName,
    raceClass: stored.raceClass ?? schedule.raceClass,
    weather: stored.weather ?? schedule.weather,
    trackCondition: stored.trackCondition ?? schedule.trackCondition,
  } satisfies JraRace;
}

export async function listRacesForDates(dates: string[]) {
  if (!dates.length) return [] as JraRace[];
  const [target, stored] = await Promise.all([
    getScheduleTarget(),
    listStoredRacesForDates(dates),
  ]);
  const scheduled = scheduledDisplayRaces(target, dates);
  if (!scheduled.length) return stored;

  const byKey = new Map(stored.map((race) => [race.raceKey, race]));
  const scheduledKeys = new Set(scheduled.map((race) => race.raceKey));
  return scheduled
    .map((race) => mergeScheduledWithStored(race, byKey.get(race.raceKey)))
    .concat(stored.filter((race) => !scheduledKeys.has(race.raceKey)))
    .sort((a,b) => a.raceDate.localeCompare(b.raceDate) || a.venue.localeCompare(b.venue,"ja") || a.raceNo - b.raceNo);
}

export async function listTodayRaces() {
  return listRacesForDates([localTodayIso()]);
}

function shiftLocalIso(iso: string, days: number) {
  const [y,m,d] = iso.split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  date.setDate(date.getDate() + days);
  return localTodayIso(date.getTime());
}

export function racingWeekCandidateDates(nowMs = Date.now()) {
  const now = new Date(nowMs);
  const day = now.getDay();
  const deltaToSaturday = day === 6 ? 0 : day === 0 ? -1 : day === 1 ? -2 : 6 - day;
  const saturday = shiftLocalIso(localTodayIso(nowMs), deltaToSaturday);
  return [saturday, shiftLocalIso(saturday, 1), shiftLocalIso(saturday, 2)];
}

export async function listRacingWeekRaces(nowMs = Date.now()) {
  const target = await getScheduleTarget();
  const dates = target?.dates?.length ? target.dates : racingWeekCandidateDates(nowMs);
  const base = await listRacesForDates(dates);
  const canonicalIds = [...new Set(base.map((race) => race.canonicalRaceId).filter((id): id is string => Boolean(id)))];
  if (!canonicalIds.length) return base;
  const db = await getLiveDb();
  const placeholders = canonicalIds.map(() => "?").join(",");
  const stale = await db.getAllAsync<JraRace>(
    `SELECT ${raceSelect()} FROM races
     WHERE canonical_race_id IN (${placeholders}) AND schedule_status='RESCHEDULED'
     ORDER BY race_date,venue,race_no`,
    ...canonicalIds,
  );
  const byKey = new Map(base.map((race) => [race.raceKey,race]));
  for (const race of stale) if (!byKey.has(race.raceKey)) byKey.set(race.raceKey,race);
  return [...byKey.values()].sort(
    (a,b) => a.raceDate.localeCompare(b.raceDate) || a.venue.localeCompare(b.venue,"ja") || a.raceNo-b.raceNo,
  );
}

export async function getRace(raceKey: string) {
  const db = await getLiveDb();
  const stored = await db.getFirstAsync<JraRace>(`SELECT ${raceSelect()} FROM races WHERE race_key=?`, raceKey);
  if (stored?.status === "OFFICIAL") return stored;
  const target = await getScheduleTarget();
  if (target) {
    for (const meeting of target.meetings) {
      for (const race of meeting.races) {
        if (scheduleRaceKey(race.raceDate,race.venue,race.raceNo) === raceKey) {
          return mergeScheduledWithStored(scheduleRaceAsDisplay(meeting,race,target.fetchedAt), stored ?? undefined);
        }
      }
    }
  }
  return stored;
}
export async function getWeekEntries(raceKey: string) {
  const db = await getLiveDb();
  return db.getAllAsync<JraEntry>(
    `SELECT race_key AS raceKey,canonical_horse_id AS canonicalHorseId,gate,horse_no AS horseNo,horse_name AS horseName,
      entry_status AS entryStatus,sex,age,coat_color AS coatColor,carried_weight AS carriedWeight,jockey_name AS jockeyName,
      trainer_name AS trainerName,body_weight AS bodyWeight,body_weight_diff AS bodyWeightDiff,win_odds AS winOdds,
      popularity,sire,dam,damsire FROM entries WHERE race_key=? ORDER BY horse_no`,
    raceKey,
  );
}
export async function listTodayNotices(limit = 30) {
  const db = await getLiveDb();
  return db.getAllAsync<RaceNotice>(
    `SELECT id,race_key AS raceKey,race_date AS raceDate,venue,race_no AS raceNo,kind,horse_no AS horseNo,
      horse_name AS horseName,previous_value AS previousValue,next_value AS nextValue,observed_at AS observedAt
      FROM notices WHERE race_date=? ORDER BY observed_at DESC,id DESC LIMIT ?`,
    localTodayIso(), Math.max(1, Math.min(100, limit)),
  );
}

export async function getWeekMeta(key: string) {
  const db = await getLiveDb();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key=?", key);
  return row?.value ?? null;
}
export async function setWeekMeta(key: string, value: string) {
  await withLiveDbWrite(async (db) => {
    await db.runAsync("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, value);
  });
}


const FINAL_ODDS_META_PREFIX = "odds_final_confirmed:";
const FINAL_ODDS_PROBE_META_PREFIX = "odds_final_probe:";

export type RaceArchiveState = {
  raceKey: string;
  canonicalRaceId: string | null;
  resultReady: boolean;
  payoutReady: boolean;
  finalOddsReady: boolean;
  conditionsReady: boolean;
  archiveState: "LIVE" | "INCOMPLETE" | "READY";
  archivedAt: string | null;
  updatedAt: string;
};

export type ResultProvenanceInput = {
  source: string;
  sourceUrl: string | null;
  parserVersion: number;
  fetchedAt?: string;
};

async function recomputeRaceArchiveState(
  db: Awaited<ReturnType<typeof getLiveDb>>,
  raceKey: string,
) {
  const [result,payout,race,finalOdds,existing] = await Promise.all([
    db.getFirstAsync<{count:number}>("SELECT COUNT(*) AS count FROM race_results WHERE race_key=?",raceKey),
    db.getFirstAsync<{count:number}>("SELECT COUNT(*) AS count FROM payouts WHERE race_key=?",raceKey),
    db.getFirstAsync<{
      canonicalRaceId:string|null;raceStatus:string;weather:string|null;trackCondition:string|null;
    }>(
      `SELECT canonical_race_id AS canonicalRaceId,race_status AS raceStatus,
         weather,track_condition AS trackCondition
       FROM races WHERE race_key=?`,
      raceKey,
    ),
    db.getFirstAsync<{value:string}>("SELECT value FROM meta WHERE key=?",FINAL_ODDS_META_PREFIX+raceKey),
    db.getFirstAsync<{archivedAt:string|null}>(
      "SELECT archived_at AS archivedAt FROM race_archive_state WHERE race_key=?",
      raceKey,
    ),
  ]);
  if (!race) return;

  const resultReady=Number(result?.count??0)>0;
  const payoutReady=Number(payout?.count??0)>0;
  const finalOddsReady=Boolean(finalOdds?.value);
  const conditionsReady=Boolean(race.weather&&race.trackCondition);
  const ready=resultReady&&payoutReady&&finalOddsReady&&conditionsReady;
  const archiveState:RaceArchiveState["archiveState"]=ready
    ?"READY"
    :race.raceStatus==="COMPLETED"
      ?"INCOMPLETE"
      :"LIVE";
  const now=new Date().toISOString();
  const archivedAt=ready?(existing?.archivedAt??now):null;

  await db.runAsync(
    `INSERT INTO race_archive_state(
       race_key,canonical_race_id,result_ready,payout_ready,final_odds_ready,
       conditions_ready,archive_state,archived_at,updated_at
     ) VALUES(?,?,?,?,?,?,?,?,?)
     ON CONFLICT(race_key) DO UPDATE SET
       canonical_race_id=excluded.canonical_race_id,
       result_ready=excluded.result_ready,
       payout_ready=excluded.payout_ready,
       final_odds_ready=excluded.final_odds_ready,
       conditions_ready=excluded.conditions_ready,
       archive_state=excluded.archive_state,
       archived_at=excluded.archived_at,
       updated_at=excluded.updated_at`,
    raceKey,race.canonicalRaceId,
    resultReady?1:0,payoutReady?1:0,finalOddsReady?1:0,conditionsReady?1:0,
    archiveState,archivedAt,now,
  );
}

export async function getRaceArchiveState(raceKey:string):Promise<RaceArchiveState|null>{
  const db=await getLiveDb();
  const row=await db.getFirstAsync<{
    raceKey:string;canonicalRaceId:string|null;resultReady:number;payoutReady:number;
    finalOddsReady:number;conditionsReady:number;archiveState:"LIVE"|"INCOMPLETE"|"READY";
    archivedAt:string|null;updatedAt:string;
  }>(
    `SELECT race_key AS raceKey,canonical_race_id AS canonicalRaceId,
       result_ready AS resultReady,payout_ready AS payoutReady,
       final_odds_ready AS finalOddsReady,conditions_ready AS conditionsReady,
       archive_state AS archiveState,archived_at AS archivedAt,updated_at AS updatedAt
     FROM race_archive_state WHERE race_key=?`,
    raceKey,
  );
  return row?{
    ...row,
    resultReady:Boolean(row.resultReady),
    payoutReady:Boolean(row.payoutReady),
    finalOddsReady:Boolean(row.finalOddsReady),
    conditionsReady:Boolean(row.conditionsReady),
  }:null;
}

export function getFinalOddsConfirmedAt(raceKey: string) {
  return getWeekMeta(FINAL_ODDS_META_PREFIX + raceKey);
}
export async function markFinalOddsConfirmed(raceKey: string, observedAt: string) {
  await withLiveDbTransaction(async db=>{
    await db.runAsync(
      "INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      FINAL_ODDS_META_PREFIX+raceKey,observedAt,
    );
    await recomputeRaceArchiveState(db,raceKey);
  });
}
export function getFinalOddsProbeAt(raceKey: string) {
  return getWeekMeta(FINAL_ODDS_PROBE_META_PREFIX + raceKey);
}
export function markFinalOddsProbe(raceKey: string, observedAt: string) {
  return setWeekMeta(FINAL_ODDS_PROBE_META_PREFIX + raceKey, observedAt);
}


export async function saveVenueConditionSnapshot(snapshot: VenueConditionSnapshot) {
  await withLiveDbTransaction(async (db) => {
  const previous = await db.getFirstAsync<{
    weather: string | null;
    turfCondition: string | null;
    dirtCondition: string | null;
    sourceObservedDate: string | null;
  }>(
    `SELECT weather,turf_condition AS turfCondition,dirt_condition AS dirtCondition,
      source_observed_date AS sourceObservedDate
     FROM venue_conditions WHERE race_date=? AND venue=?`,
    snapshot.raceDate,snapshot.venue,
  );

  const trackLabel = (turf: string | null, dirt: string | null) =>
    [turf ? "芝 " + turf : null, dirt ? "ダ " + dirt : null].filter(Boolean).join(" / ") || null;
  const currentSource = snapshot.sourceObservedDate === snapshot.raceDate;
  const previousCurrent = previous?.sourceObservedDate === snapshot.raceDate;
  const previousTrack = previous ? trackLabel(previous.turfCondition,previous.dirtCondition) : null;
  const nextTrack = trackLabel(snapshot.turfCondition,snapshot.dirtCondition);

    if (previous && currentSource && previousCurrent) {
      const venueRaceKey = "JRA-VENUE:" + snapshot.raceDate + ":" + snapshot.venue;
      const addVenueNotice = async (kind: string, before: string | null, after: string | null) => {
        if (!before || !after || before === after) return;
        const eventKey = [venueRaceKey,kind,before,after].join("|");
        await db.runAsync(
          `INSERT OR IGNORE INTO notices(
            event_key,race_key,race_date,venue,race_no,kind,horse_no,horse_name,previous_value,next_value,observed_at
          ) VALUES(?,?,?,?,0,?,NULL,NULL,?,?,?)`,
          eventKey,venueRaceKey,snapshot.raceDate,snapshot.venue,kind,before,after,snapshot.fetchedAt,
        );
      };
      await addVenueNotice("WEATHER_CHANGED",previous.weather,snapshot.weather);
      await addVenueNotice("TRACK_CHANGED",previousTrack,nextTrack);
    }

    await db.runAsync(
      `INSERT INTO venue_conditions(
        race_date,venue,weather,turf_condition,dirt_condition,source_observed_label,source_observed_date,fetched_at,source_url
      ) VALUES(?,?,?,?,?,?,?,?,?)
      ON CONFLICT(race_date,venue) DO UPDATE SET
        weather=excluded.weather,turf_condition=excluded.turf_condition,dirt_condition=excluded.dirt_condition,
        source_observed_label=excluded.source_observed_label,source_observed_date=excluded.source_observed_date,
        fetched_at=excluded.fetched_at,source_url=excluded.source_url`,
      snapshot.raceDate,snapshot.venue,snapshot.weather,snapshot.turfCondition,snapshot.dirtCondition,
      snapshot.sourceObservedLabel,snapshot.sourceObservedDate,snapshot.fetchedAt,snapshot.sourceUrl,
    );
  });
}

export async function getVenueConditionSnapshot(raceDate: string, venue: string) {
  const db = await getLiveDb();
  return db.getFirstAsync<VenueConditionSnapshot>(
    `SELECT race_date AS raceDate,venue,weather,turf_condition AS turfCondition,dirt_condition AS dirtCondition,
      source_observed_label AS sourceObservedLabel,source_observed_date AS sourceObservedDate,
      fetched_at AS fetchedAt,source_url AS sourceUrl
     FROM venue_conditions WHERE race_date=? AND venue=?`,
    raceDate,venue,
  );
}

export async function getOddsActionCache(raceKey: string) {
  const db = await getLiveDb();
  return db.getAllAsync<OddsActionCache>(
    "SELECT bet_type AS betType,path,cname,updated_at AS updatedAt FROM odds_actions WHERE race_key=?",
    raceKey,
  );
}
export async function saveOddsActionCache(
  raceKey: string,
  rows: Array<{ betType: OddsBetType; path: string; cname: string }>,
) {
  const updatedAt = new Date().toISOString();
  await withLiveDbTransaction(async (db) => {
    for (const row of rows) {
      await db.runAsync(
        `INSERT INTO odds_actions(race_key,bet_type,path,cname,updated_at) VALUES(?,?,?,?,?)
         ON CONFLICT(race_key,bet_type) DO UPDATE SET path=excluded.path,cname=excluded.cname,updated_at=excluded.updated_at`,
        raceKey, row.betType, row.path, row.cname, updatedAt,
      );
    }
  });
}
export async function clearOddsActionCacheTypes(raceKey: string, types: OddsBetType[]) {
  if (!types.length) return;
  await withLiveDbWrite(async (db) => {
    for (const type of types) await db.runAsync("DELETE FROM odds_actions WHERE race_key=? AND bet_type=?", raceKey, type);
  });
}
export async function clearOddsActionCache(raceKey: string) {
  await withLiveDbWrite(async (db) => {
    await db.runAsync("DELETE FROM odds_actions WHERE race_key=?", raceKey);
  });
}

export async function saveOddsSnapshotRows(
  raceKey: string,
  rows: OddsRowInput[],
  observedAt: string,
  sourceUrl: string | null,
  _canonicalRaceId: string | null,
  options: { checkpoint?: string | null } = {},
) {
  await withLiveDbTransaction(async (db) => {
    for (const row of rows) {
      if (row.selection1 == null) continue;
      const s2 = row.selection2 ?? -1;
      const s3 = row.selection3 ?? -1;
      await db.runAsync(
        `INSERT OR IGNORE INTO odds_history(
          race_key,bet_type,selection_1,selection_2,selection_3,odds,odds_min,odds_max,observed_at,source_url,checkpoint
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        raceKey,row.betType,row.selection1,s2,s3,row.odds,row.oddsMin,row.oddsMax,observedAt,sourceUrl,options.checkpoint ?? null,
      );
      await db.runAsync(
        `INSERT INTO odds_current(
          race_key,bet_type,selection_1,selection_2,selection_3,odds,odds_min,odds_max,observed_at,source_url
        ) VALUES(?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(race_key,bet_type,selection_1,selection_2,selection_3) DO UPDATE SET
          odds=excluded.odds,odds_min=excluded.odds_min,odds_max=excluded.odds_max,
          observed_at=excluded.observed_at,source_url=excluded.source_url`,
        raceKey,row.betType,row.selection1,s2,s3,row.odds,row.oddsMin,row.oddsMax,observedAt,sourceUrl,
      );
    }
  });
}

export async function getLatestOddsRows(
  raceKey: string,
  betType?: OddsBetType,
  limit = 1000,
  offset = 0,
) {
  const db = await getLiveDb();
  const where = betType ? "WHERE race_key=? AND bet_type=?" : "WHERE race_key=?";
  const args: Array<string | number> = betType
    ? [raceKey, betType, limit, offset]
    : [raceKey, limit, offset];
  return db.getAllAsync<OddsRow>(
    `SELECT race_key AS raceKey,bet_type AS betType,selection_1 AS selection1,
      NULLIF(selection_2,-1) AS selection2,NULLIF(selection_3,-1) AS selection3,
      odds,odds_min AS oddsMin,odds_max AS oddsMax,observed_at AS observedAt,source_url AS sourceUrl
      FROM odds_current ${where} ORDER BY selection_1,selection_2,selection_3 LIMIT ? OFFSET ?`,
    ...args,
  );
}

export async function getOddsRowsForSelection(
  raceKey: string,
  betType: OddsBetType,
  selection: number,
  limit = 1000,
  offset = 0,
) {
  const db = await getLiveDb();
  return db.getAllAsync<OddsRow>(
    `SELECT race_key AS raceKey,bet_type AS betType,selection_1 AS selection1,
      NULLIF(selection_2,-1) AS selection2,NULLIF(selection_3,-1) AS selection3,
      odds,odds_min AS oddsMin,odds_max AS oddsMax,observed_at AS observedAt,source_url AS sourceUrl
      FROM odds_current
      WHERE race_key=? AND bet_type=?
        AND (selection_1=? OR selection_2=? OR selection_3=?)
      ORDER BY COALESCE(odds,odds_min,999999999),selection_1,selection_2,selection_3
      LIMIT ? OFFSET ?`,
    raceKey,betType,selection,selection,selection,limit,offset,
  );
}

export async function getLatestWinOddsByHorse(raceKey: string) {
  const db = await getLiveDb();
  return db.getAllAsync<{ horseNo: number; odds: number | null }>(
    `SELECT selection_1 AS horseNo,odds
     FROM odds_current
     WHERE race_key=? AND bet_type='WIN' AND selection_1 IS NOT NULL
     ORDER BY selection_1`,
    raceKey,
  );
}

export async function getOddsAvailability(raceKey: string) {
  const db = await getLiveDb();
  return db.getAllAsync<{ betType: OddsBetType; observedAt: string }>(
    `SELECT bet_type AS betType,MAX(observed_at) AS observedAt FROM odds_current
     WHERE race_key=? GROUP BY bet_type`,
    raceKey,
  );
}


export async function getRaceResults(raceKey: string) {
  const db = await getLiveDb();
  return db.getAllAsync<JraRaceResult>(
    `SELECT race_key AS raceKey,finish_position AS finishPosition,finish_raw AS finishRaw,
      horse_no AS horseNo,horse_name AS horseName,finish_time AS finishTime,margin,last_3f AS last3f,
      average_1f AS average1f,popularity,result_status AS resultStatus
     FROM race_results WHERE race_key=?
     ORDER BY CASE WHEN finish_position IS NULL THEN 999 ELSE finish_position END,horse_no`,
    raceKey,
  );
}

export async function getRacePayouts(raceKey: string) {
  const db = await getLiveDb();
  return db.getAllAsync<JraPayout>(
    `SELECT race_key AS raceKey,bet_type AS betType,selection,payout_yen AS payoutYen,popularity
     FROM payouts WHERE race_key=?
     ORDER BY CASE bet_type
       WHEN 'WIN' THEN 1 WHEN 'PLACE' THEN 2 WHEN 'BRACKET_QUINELLA' THEN 3
       WHEN 'QUINELLA' THEN 4 WHEN 'WIDE' THEN 5 WHEN 'EXACTA' THEN 6
       WHEN 'TRIO' THEN 7 WHEN 'TRIFECTA' THEN 8 ELSE 99 END,selection`,
    raceKey,
  );
}

export async function listRaceKeysWithResults(dates: string[]) {
  if (!dates.length) return [] as string[];
  const db = await getLiveDb();
  const placeholders=dates.map(()=>"?").join(",");
  const rows = await db.getAllAsync<{ raceKey: string }>(
    `SELECT DISTINCT rr.race_key AS raceKey
     FROM race_results rr
     JOIN races r ON r.race_key=rr.race_key
     WHERE r.race_date IN (${placeholders})`,
    ...dates,
  );
  return rows.map((row) => row.raceKey);
}

export async function listIncompleteArchiveRaces(limit=48){
  const db=await getLiveDb();
  const safeLimit=Math.max(1,Math.min(200,Math.floor(limit)));
  return db.getAllAsync<JraRace>(
    `SELECT ${raceSelect()}
     FROM races
     WHERE races.schedule_status='ACTIVE'
       AND races.race_status NOT IN ('CANCELLED','ABANDONED')
       AND COALESCE((
         SELECT a.archive_state FROM race_archive_state a WHERE a.race_key=races.race_key
       ),'LIVE')<>'READY'
     ORDER BY races.race_date DESC,races.venue,races.race_no DESC
     LIMIT ?`,
    safeLimit,
  );
}

export async function getRaceResultCompleteness(raceKey: string) {
  const db = await getLiveDb();
  const [result,payout,race] = await Promise.all([
    db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM race_results WHERE race_key=?",raceKey),
    db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM payouts WHERE race_key=?",raceKey),
    db.getFirstAsync<{ weather: string | null; trackCondition: string | null }>(
      "SELECT weather,track_condition AS trackCondition FROM races WHERE race_key=?",raceKey,
    ),
  ]);
  const resultCount=Number(result?.count??0),payoutCount=Number(payout?.count??0);
  const conditionsComplete=Boolean(race?.weather&&race?.trackCondition);
  const resultReady=resultCount>0;
  const payoutReady=payoutCount>0;
  // Results, payouts and race conditions are independent LIVE layers. A stored
  // finish order must immediately count as RESULT_READY so payout repair cannot
  // starve older races in the result collector.
  return {
    resultCount,payoutCount,conditionsComplete,
    resultReady,payoutReady,
    complete:resultReady,
  };
}

export type OfficialRaceConditions = {
  weather: string | null;
  turfCondition: string | null;
  dirtCondition: string | null;
};

function resultFingerprint(
  results:JraRaceResult[],
  payouts:JraPayout[],
  conditions:OfficialRaceConditions|undefined,
){
  const canonical=JSON.stringify({
    results:[...results]
      .sort((a,b)=>(a.horseNo??999)-(b.horseNo??999)||a.horseName.localeCompare(b.horseName,"ja"))
      .map(row=>[
        row.horseNo,row.horseName,row.finishPosition,row.finishRaw,row.finishTime,row.margin,
        row.last3f,row.average1f,row.popularity,row.resultStatus,
      ]),
    payouts:[...payouts]
      .sort((a,b)=>a.betType.localeCompare(b.betType)||a.selection.localeCompare(b.selection))
      .map(row=>[row.betType,row.selection,row.payoutYen,row.popularity]),
    conditions:conditions??null,
  });
  let hash=0x811c9dc5;
  for(let i=0;i<canonical.length;i++){
    hash^=canonical.charCodeAt(i);
    hash=Math.imul(hash,0x01000193);
  }
  return "fnv1a32:"+((hash>>>0).toString(16).padStart(8,"0"));
}

function conditionForRace(race: JraRace, conditions: OfficialRaceConditions) {
  if (race.discipline === "OBSTACLE" || race.surface === "MIXED") {
    if (conditions.turfCondition && conditions.dirtCondition && conditions.turfCondition !== conditions.dirtCondition) {
      return `芝${conditions.turfCondition} / ダ${conditions.dirtCondition}`;
    }
    return conditions.turfCondition ?? conditions.dirtCondition;
  }
  return race.surface === "DIRT" ? conditions.dirtCondition : conditions.turfCondition;
}

export async function saveOfficialRaceResult(
  race: JraRace,
  results: JraRaceResult[],
  payouts: JraPayout[],
  conditions?: OfficialRaceConditions,
  provenance?: ResultProvenanceInput,
) {
  if (!results.length) throw new Error("公式結果が空のため保存しない");
  const observedAt = new Date().toISOString();
  await withLiveDbTransaction(async (db) => {
    const storedEntries=await db.getAllAsync<JraEntry>(
      `SELECT race_key AS raceKey,canonical_horse_id AS canonicalHorseId,gate,horse_no AS horseNo,
        horse_name AS horseName,entry_status AS entryStatus,sex,age,coat_color AS coatColor,
        carried_weight AS carriedWeight,jockey_name AS jockeyName,trainer_name AS trainerName,
        body_weight AS bodyWeight,body_weight_diff AS bodyWeightDiff,win_odds AS winOdds,popularity,
        sire,dam,damsire
       FROM entries WHERE race_key=? ORDER BY horse_no`,
      race.raceKey,
    );
    assertResultMatchesStoredEntries(storedEntries,results);

    const [existingResults,existingPayouts] = await Promise.all([
      db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM race_results WHERE race_key=?",race.raceKey),
      db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM payouts WHERE race_key=?",race.raceKey),
    ]);
    if (Number(existingResults?.count ?? 0) > results.length) {
      throw new Error("既存結果より出走馬数が減るため更新を保留");
    }
    if (Number(existingPayouts?.count ?? 0) > 0 && payouts.length < Number(existingPayouts?.count ?? 0)) {
      throw new Error("既存払戻より件数が減るため更新を保留");
    }
    await db.runAsync(
      `INSERT INTO races(
        race_key,canonical_race_id,race_date,scheduled_date,actual_date,race_status,schedule_status,
        superseded_by_race_key,archived_at,venue,race_no,race_name,race_class,start_time,
        discipline,surface,distance_m,direction,weather,track_condition,source_url,fetched_at,status
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(race_key) DO UPDATE SET
        canonical_race_id=COALESCE(excluded.canonical_race_id,races.canonical_race_id),
        scheduled_date=COALESCE(races.scheduled_date,excluded.scheduled_date),
        actual_date=excluded.actual_date,race_status='COMPLETED',
        race_name=COALESCE(races.race_name,excluded.race_name),
        weather=COALESCE(races.weather,excluded.weather),
        track_condition=COALESCE(races.track_condition,excluded.track_condition)`,
      race.raceKey,race.canonicalRaceId,race.raceDate,race.scheduledDate,race.actualDate ?? race.raceDate,
      "COMPLETED",race.scheduleStatus,race.supersededByRaceKey,null,
      race.venue,race.raceNo,race.raceName,race.raceClass,race.startTime,
      race.discipline,race.surface,race.distanceM,race.direction,race.weather,race.trackCondition,race.sourceUrl,race.fetchedAt,race.status,
    );
    await db.runAsync("DELETE FROM race_results WHERE race_key=?", race.raceKey);
    await db.runAsync("DELETE FROM payouts WHERE race_key=?", race.raceKey);
    for (const row of results) {
      await db.runAsync(
        `INSERT INTO race_results(
          race_key,finish_position,finish_raw,horse_no,horse_name,finish_time,margin,last_3f,average_1f,popularity,result_status,observed_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        race.raceKey,row.finishPosition,row.finishRaw,row.horseNo,row.horseName,row.finishTime,row.margin,row.last3f,row.average1f,
        row.popularity,row.resultStatus,observedAt,
      );
    }
    for (const row of payouts) {
      await db.runAsync(
        `INSERT INTO payouts(race_key,bet_type,selection,payout_yen,popularity,observed_at)
         VALUES(?,?,?,?,?,?)`,
        race.raceKey,row.betType,row.selection,row.payoutYen,row.popularity,observedAt,
      );
    }
    if (conditions) {
      const nextTrack = conditionForRace(race, conditions);
      await db.runAsync(
        `UPDATE races SET weather=COALESCE(?,weather),track_condition=COALESCE(?,track_condition) WHERE race_key=?`,
        conditions.weather,nextTrack,race.raceKey,
      );
    }

    const storedConditions=await db.getFirstAsync<{weather:string|null;trackCondition:string|null}>(
      "SELECT weather,track_condition AS trackCondition FROM races WHERE race_key=?",
      race.raceKey,
    );
    const conditionsComplete=Boolean(storedConditions?.weather&&storedConditions?.trackCondition);
    const provenanceAt=provenance?.fetchedAt??observedAt;
    await db.runAsync(
      `INSERT OR IGNORE INTO result_provenance(
         race_key,source,source_url,parser_version,result_fingerprint,fetched_at,
         result_count,payout_count,conditions_complete
       ) VALUES(?,?,?,?,?,?,?,?,?)`,
      race.raceKey,provenance?.source??"UNKNOWN",provenance?.sourceUrl??race.sourceUrl,
      provenance?.parserVersion??0,resultFingerprint(results,payouts,conditions),provenanceAt,
      results.length,payouts.length,conditionsComplete?1:0,
    );
    await recomputeRaceArchiveState(db,race.raceKey);
  });
}
