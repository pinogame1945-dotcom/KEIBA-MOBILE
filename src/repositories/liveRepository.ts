import type {
  JraEntry, JraPayout, JraRace, JraRaceCard, JraRaceResult, OddsBetType, OddsRow, RaceNotice, ScheduleMeeting,
} from "../domain/live";
import { getLiveDb } from "../storage/liveDb";

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

export async function saveScheduleMeetings(meetings: ScheduleMeeting[]) {
  const db = await getLiveDb();
  await db.withTransactionAsync(async () => {
    for (const meeting of meetings) {
      for (const race of meeting.races) {
        const key = scheduleRaceKey(race.raceDate, race.venue, race.raceNo);
        await db.runAsync(
          `INSERT INTO races(
            race_key,canonical_race_id,race_date,venue,race_no,race_name,race_class,start_time,
            discipline,surface,distance_m,direction,weather,track_condition,source_url,fetched_at,status
          ) VALUES(?,NULL,?,?,?,?,?,? ,?,?,?,NULL,NULL,NULL,?,?, 'SCHEDULED')
          ON CONFLICT(race_key) DO UPDATE SET
            race_name=CASE WHEN races.status='OFFICIAL' THEN races.race_name ELSE excluded.race_name END,
            start_time=CASE WHEN races.status='OFFICIAL' THEN races.start_time ELSE excluded.start_time END,
            discipline=CASE WHEN races.status='OFFICIAL' THEN races.discipline ELSE excluded.discipline END,
            surface=CASE WHEN races.status='OFFICIAL' THEN races.surface ELSE excluded.surface END,
            distance_m=CASE WHEN races.status='OFFICIAL' THEN races.distance_m ELSE excluded.distance_m END,
            source_url=CASE WHEN races.status='OFFICIAL' THEN races.source_url ELSE excluded.source_url END,
            fetched_at=CASE WHEN races.status='OFFICIAL' THEN races.fetched_at ELSE excluded.fetched_at END`,
          key, race.raceDate, race.venue, race.raceNo, race.raceName, null, race.startTime,
          race.discipline, race.surface, race.distanceM, race.sourceUrl, new Date().toISOString(),
        );
      }
    }
  });
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
  await recordChanges(db, card);
  const r = card.race;
  await db.runAsync(
    `INSERT INTO races(
      race_key,canonical_race_id,race_date,venue,race_no,race_name,race_class,start_time,
      discipline,surface,distance_m,direction,weather,track_condition,source_url,fetched_at,status
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'OFFICIAL')
    ON CONFLICT(race_key) DO UPDATE SET
      canonical_race_id=COALESCE(excluded.canonical_race_id,races.canonical_race_id),
      race_name=excluded.race_name,race_class=excluded.race_class,start_time=excluded.start_time,
      discipline=excluded.discipline,surface=excluded.surface,distance_m=excluded.distance_m,
      direction=excluded.direction,
      weather=COALESCE(excluded.weather,races.weather),
      track_condition=COALESCE(excluded.track_condition,races.track_condition),
      source_url=excluded.source_url,fetched_at=excluded.fetched_at,status='OFFICIAL'`,
    r.raceKey, r.canonicalRaceId, r.raceDate, r.venue, r.raceNo, r.raceName, r.raceClass, r.startTime,
    r.discipline, r.surface, r.distanceM, r.direction, r.weather, r.trackCondition, r.sourceUrl, r.fetchedAt,
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
  const db = await getLiveDb();
  await db.withTransactionAsync(async () => {
    const existing = await db.getAllAsync<{ race_no: number }>(
      "SELECT race_no FROM races WHERE race_date=? AND venue=? AND status='OFFICIAL' ORDER BY race_no",
      first.raceDate, first.venue,
    );
    const omitted = existing.map((r) => r.race_no).filter((no) => !expected.includes(no));
    if (omitted.length) throw new Error("既存の正式開催からレースが消えたため更新を保留: " + omitted.join(","));
    for (const card of cards) await writeOfficialCard(db, card);
  });
}

export async function saveOfficialCard(card: JraRaceCard) {
  const db = await getLiveDb();
  await db.withTransactionAsync(async () => { await writeOfficialCard(db, card); });
}

function raceSelect() {
  return `race_key AS raceKey,canonical_race_id AS canonicalRaceId,race_date AS raceDate,venue,race_no AS raceNo,
    race_name AS raceName,race_class AS raceClass,start_time AS startTime,discipline,surface,distance_m AS distanceM,
    direction,weather,track_condition AS trackCondition,source_url AS sourceUrl,fetched_at AS fetchedAt,status`;
}

export async function listTodayRaces() {
  const db = await getLiveDb();
  return db.getAllAsync<JraRace>(
    `SELECT ${raceSelect()} FROM races WHERE race_date=? ORDER BY venue,race_no`,
    localTodayIso(),
  );
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

export async function listRacesForDates(dates: string[]) {
  if (!dates.length) return [] as JraRace[];
  const db = await getLiveDb();
  const placeholders = dates.map(() => "?").join(",");
  return db.getAllAsync<JraRace>(
    `SELECT ${raceSelect()} FROM races WHERE race_date IN (${placeholders}) ORDER BY race_date,venue,race_no`,
    ...dates,
  );
}

export async function listRacingWeekRaces(nowMs = Date.now()) {
  return listRacesForDates(racingWeekCandidateDates(nowMs));
}
export async function getRace(raceKey: string) {
  const db = await getLiveDb();
  return db.getFirstAsync<JraRace>(`SELECT ${raceSelect()} FROM races WHERE race_key=?`, raceKey);
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
  const db = await getLiveDb();
  await db.runAsync("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, value);
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
  const db = await getLiveDb();
  const updatedAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
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
  const db = await getLiveDb();
  for (const type of types) await db.runAsync("DELETE FROM odds_actions WHERE race_key=? AND bet_type=?", raceKey, type);
}
export async function clearOddsActionCache(raceKey: string) {
  const db = await getLiveDb();
  await db.runAsync("DELETE FROM odds_actions WHERE race_key=?", raceKey);
}

export async function saveOddsSnapshotRows(
  raceKey: string,
  rows: OddsRowInput[],
  observedAt: string,
  sourceUrl: string | null,
  _canonicalRaceId: string | null,
  options: { checkpoint?: string | null } = {},
) {
  const db = await getLiveDb();
  await db.withTransactionAsync(async () => {
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

export async function getLatestOddsRows(raceKey: string, betType?: OddsBetType, limit = 1000) {
  const db = await getLiveDb();
  const where = betType ? "WHERE race_key=? AND bet_type=?" : "WHERE race_key=?";
  const args: Array<string | number> = betType ? [raceKey, betType, limit] : [raceKey, limit];
  return db.getAllAsync<OddsRow>(
    `SELECT race_key AS raceKey,bet_type AS betType,selection_1 AS selection1,
      NULLIF(selection_2,-1) AS selection2,NULLIF(selection_3,-1) AS selection3,
      odds,odds_min AS oddsMin,odds_max AS oddsMax,observed_at AS observedAt,source_url AS sourceUrl
      FROM odds_current ${where} ORDER BY selection_1,selection_2,selection_3 LIMIT ?`,
    ...args,
  );
}

export async function getOddsRowsForSelection(
  raceKey: string,
  betType: OddsBetType,
  selection: number,
  limit = 1000,
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
      LIMIT ?`,
    raceKey,betType,selection,selection,selection,limit,
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
  const placeholders = dates.map(() => "?").join(",");
  const rows = await db.getAllAsync<{ raceKey: string }>(
    `SELECT DISTINCT rr.race_key AS raceKey
     FROM race_results rr
     INNER JOIN races r ON r.race_key=rr.race_key
     WHERE r.race_date IN (${placeholders})`,
    ...dates,
  );
  return rows.map((row) => row.raceKey);
}

export type OfficialRaceConditions = {
  weather: string | null;
  turfCondition: string | null;
  dirtCondition: string | null;
};

function conditionForRace(race: JraRace, conditions: OfficialRaceConditions) {
  if (race.discipline === "OBSTACLE" || race.surface === "MIXED") {
    if (conditions.turfCondition && conditions.dirtCondition && conditions.turfCondition !== conditions.dirtCondition) {
      return `芝${conditions.turfCondition} / ダ${conditions.dirtCondition}`;
    }
    return conditions.turfCondition ?? conditions.dirtCondition;
  }
  return race.surface === "DIRT" ? conditions.dirtCondition : conditions.turfCondition;
}

export async function applyVenueConditions(
  raceDate: string,
  venue: string,
  conditions: OfficialRaceConditions,
) {
  const db = await getLiveDb();
  const races = await db.getAllAsync<JraRace>(
    `SELECT ${raceSelect()} FROM races WHERE race_date=? AND venue=? AND status='OFFICIAL' ORDER BY race_no`,
    raceDate, venue,
  );
  if (!races.length) return 0;
  await db.withTransactionAsync(async () => {
    for (const race of races) {
      const nextWeather = conditions.weather;
      const nextTrack = conditionForRace(race, conditions);
      if (race.weather != null && nextWeather != null && race.weather !== nextWeather) {
        await insertNotice(db, race, "WEATHER_CHANGED", race.weather, nextWeather);
      }
      if (race.trackCondition != null && nextTrack != null && race.trackCondition !== nextTrack) {
        await insertNotice(db, race, "TRACK_CHANGED", race.trackCondition, nextTrack);
      }
      await db.runAsync(
        `UPDATE races SET weather=COALESCE(?,weather),track_condition=COALESCE(?,track_condition) WHERE race_key=?`,
        nextWeather,nextTrack,race.raceKey,
      );
    }
  });
  return races.length;
}

export async function saveOfficialRaceResult(
  race: JraRace,
  results: JraRaceResult[],
  payouts: JraPayout[],
  conditions?: OfficialRaceConditions,
) {
  if (!results.length) throw new Error("公式結果が空のため保存しない");
  const db = await getLiveDb();
  const observedAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
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
  });
}
