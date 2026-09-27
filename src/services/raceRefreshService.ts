import type { JraRace, JraRaceCard, ScheduleMeeting } from "../domain/live";
import { fetchJraHtml } from "../data/jra/http";
import { markOfficialNumberedRaceCard } from "../data/jra/officialCardGuard";
import {
  discoverFeatureLinks, discoverRaceCardLinks, parseRaceCard,
} from "../data/jra/raceCardParser";
import { parseJraRaceIdentity } from "../data/jra/raceHeaderParser";
import { calendarDayUrl, parseCalendarDay } from "../data/jra/scheduleParser";
import {
  listTodayRaces, localTodayIso, racingWeekCandidateDates, saveOfficialCard, saveOfficialMeeting, saveScheduleMeetings,
} from "../repositories/liveRepository";
import { raceStartEpoch } from "../data/jra/oddsAvailability";
import {
  claimNextRaceFetchItem, enqueueRaceFetchUrl, findRaceFetchUrl, finishRaceFetchRun,
  getRaceFetchStats, markRaceFetchDone, markRaceFetchFailed, prepareRaceFetchRun,
} from "./raceFetchQueue";

const HOME = "https://www.jra.go.jp/";
const THIS_WEEK = "https://www.jra.go.jp/keiba/thisweek/";
const MAX_CARD_PAGES = 160;

export type RaceRefreshProgress = {
  phase: "SCHEDULE" | "DISCOVERY" | "CARDS" | "DONE";
  message: string;
  current: number;
  total: number;
};

function meetingKey(venue: string, meetingNo: number, meetingDay: number) {
  return venue + "|" + meetingNo + "|" + meetingDay;
}

function targetFingerprint(meetings: ScheduleMeeting[]) {
  return meetings
    .map((meeting) =>
      [meeting.raceDate,meeting.venue,meeting.meetingNo,meeting.meetingDay,
        meeting.races.map((race) => race.raceNo).sort((a,b) => a-b).join(",")].join(":")
    )
    .sort()
    .join("|");
}

function targetMeeting(identity: ReturnType<typeof parseJraRaceIdentity>, meetings: ScheduleMeeting[]) {
  if (!identity) return null;
  return meetings.find((meeting) =>
    Number(meeting.raceDate.slice(0, 4)) === identity.year &&
    meeting.venue === identity.venue &&
    meeting.meetingNo === identity.meetingNo &&
    meeting.meetingDay === identity.meetingDay
  ) ?? null;
}

function isTargetUrl(url: string, meetings: ScheduleMeeting[]) {
  return Boolean(targetMeeting(parseJraRaceIdentity(url), meetings));
}

function metadata(url: string) {
  const identity = parseJraRaceIdentity(url);
  return identity ? {
    raceDate: identity.raceDate,
    venue: identity.venue,
    raceNo: identity.raceNo,
  } : { raceDate: null, venue: null, raceNo: null };
}

async function discoverSeeds(meetings: ScheduleMeeting[], onProgress?: (p: RaceRefreshProgress) => void) {
  const seeds = new Set<string>();
  const targetKeys = new Set(meetings.map((meeting) => meetingKey(meeting.venue, meeting.meetingNo, meeting.meetingDay)));
  const allMeetingsCovered = () => {
    const covered = new Set<string>();
    for (const url of seeds) {
      const identity = parseJraRaceIdentity(url);
      if (identity) covered.add(meetingKey(identity.venue, identity.meetingNo, identity.meetingDay));
    }
    return [...targetKeys].every((key) => covered.has(key));
  };
  const scanPage = async (url: string) => {
    const html = await fetchJraHtml(url);
    for (const link of discoverRaceCardLinks(html, url)) {
      if (isTargetUrl(link, meetings)) seeds.add(link);
    }
    return { features: discoverFeatureLinks(html, url) };
  };

  onProgress?.({ phase: "DISCOVERY", message: "JRA正式出馬表入口を確認", current: 0, total: 1 });
  const weekly = await scanPage(THIS_WEEK);
  const features = weekly.features.filter((url) =>
    url.includes("/keiba/race/") || url.includes("/keiba/g1/")
  ).slice(0, 16);

  for (let i = 0; i < features.length && !allMeetingsCovered(); i += 1) {
    onProgress?.({ phase: "DISCOVERY", message: "正式出馬表リンクを探索", current: i + 1, total: features.length });
    try { await scanPage(features[i]); } catch (error) {
      console.warn("JRA feature-page discovery failed", features[i], error);
    }
  }

  if (!allMeetingsCovered()) {
    try {
      const home = await scanPage(HOME);
      const homeFeatures = home.features.filter((url) =>
        url.includes("/keiba/race/") || url.includes("/keiba/g1/")
      ).slice(0, 10);
      for (const url of homeFeatures) {
        if (allMeetingsCovered()) break;
        try { await scanPage(url); } catch (error) {
          console.warn("JRA home discovery failed", url, error);
        }
      }
    } catch (error) {
      console.warn("JRA home discovery unavailable", error);
    }
  }
  return [...seeds];
}

type CandidateMeetings = Map<string, Map<number, JraRaceCard>>;
type NavigationEvidence = Map<string, Map<string, number>>;

function raceNoSignature(values: Iterable<number>) {
  return [...new Set(values)].sort((a,b) => a-b).join(",");
}

function recordNavigationEvidence(
  evidence: NavigationEvidence,
  key: string,
  raceNos: Iterable<number>,
) {
  const signature = raceNoSignature(raceNos);
  if (!signature) return;
  const group = evidence.get(key) ?? new Map<string, number>();
  group.set(signature, (group.get(signature) ?? 0) + 1);
  evidence.set(key, group);
}

function authoritativeRaceNos(meeting: ScheduleMeeting, navigation: NavigationEvidence) {
  const key = meetingKey(meeting.venue, meeting.meetingNo, meeting.meetingDay);
  const evidence = navigation.get(key);
  if (!evidence?.size) return null;

  const scheduleSignature = raceNoSignature(meeting.races.map((race) => race.raceNo));
  const ranked = [...evidence.entries()]
    .sort((a,b) => b[1] - a[1] || b[0].split(",").length - a[0].split(",").length);
  for (const [signature,count] of ranked) {
    if (signature === scheduleSignature || count >= 2) {
      return signature.split(",").map(Number).filter(Number.isFinite);
    }
  }
  return null;
}

async function drainQueue(
  meetings: ScheduleMeeting[],
  fingerprint: string,
  onProgress?: (p: RaceRefreshProgress) => void,
) {
  const cards: CandidateMeetings = new Map();
  const navigation: NavigationEvidence = new Map();
  let processed = 0;

  while (processed < MAX_CARD_PAGES) {
    const item = await claimNextRaceFetchItem();
    if (!item) break;
    processed += 1;
    onProgress?.({
      phase: "CARDS",
      message: "正式出馬表を検証",
      current: processed,
      total: Math.max((await getRaceFetchStats()).total, 1),
    });

    try {
      const html = await fetchJraHtml(item.url);
      const pageNavigation = new Map<string, Set<number>>();
      for (const link of discoverRaceCardLinks(html, item.url)) {
        const identity = parseJraRaceIdentity(link);
        const meeting = targetMeeting(identity, meetings);
        if (!identity || !meeting) continue;
        const key = meetingKey(identity.venue, identity.meetingNo, identity.meetingDay);
        const set = pageNavigation.get(key) ?? new Set<number>();
        set.add(identity.raceNo);
        pageNavigation.set(key, set);
        const meta = metadata(link);
        await enqueueRaceFetchUrl({ url: link, targetFingerprint: fingerprint, ...meta });
      }

      const own = parseJraRaceIdentity(item.url);
      const ownMeeting = targetMeeting(own, meetings);
      if (own && ownMeeting) {
        const key = meetingKey(own.venue, own.meetingNo, own.meetingDay);
        const set = pageNavigation.get(key) ?? new Set<number>();
        set.add(own.raceNo);
        pageNavigation.set(key, set);
      }
      for (const [key,raceNos] of pageNavigation) recordNavigationEvidence(navigation,key,raceNos);

      if (own && ownMeeting) {
        try {
          const card = markOfficialNumberedRaceCard(html, parseRaceCard(html, item.url));
          const key = meetingKey(own.venue, own.meetingNo, own.meetingDay);
          const group = cards.get(key) ?? new Map<number, JraRaceCard>();
          group.set(card.race.raceNo, card);
          cards.set(key, group);
          await markRaceFetchDone(item.url);
        } catch (error) {
          await markRaceFetchFailed(item.url, item.attempts, error);
        }
      } else {
        await markRaceFetchDone(item.url);
      }
    } catch (error) {
      await markRaceFetchFailed(item.url, item.attempts, error);
    }
  }

  return { cards, navigation };
}

async function refreshRaceDates(
  dates: string[],
  onProgress?: (p: RaceRefreshProgress) => void,
) {
  const meetings: ScheduleMeeting[] = [];
  for (let i = 0; i < dates.length; i += 1) {
    const date = dates[i];
    onProgress?.({
      phase: "SCHEDULE",
      message: "開催日程を確認 " + date,
      current: i + 1,
      total: dates.length,
    });
    try {
      const scheduleUrl = calendarDayUrl(date);
      const scheduleHtml = await fetchJraHtml(scheduleUrl);
      const parsed = parseCalendarDay(scheduleHtml, scheduleUrl);
      if (parsed.length) {
        meetings.push(...parsed);
        await saveScheduleMeetings(parsed);
      }
    } catch (error) {
      console.warn("JRA schedule refresh skipped", date, error);
    }
  }

  if (!meetings.length) {
    onProgress?.({ phase: "DONE", message: "対象期間のJRA開催なし", current: 0, total: 0 });
    return { meetings: 0, officialSaved: 0, pendingMeetings: 0 };
  }

  const fingerprint = targetFingerprint(meetings);
  await prepareRaceFetchRun(fingerprint);

  try {
    const stats = await getRaceFetchStats();
    if (stats.total === 0) {
      const seeds = await discoverSeeds(meetings, onProgress);
      for (const url of seeds) {
        await enqueueRaceFetchUrl({ url, targetFingerprint: fingerprint, ...metadata(url) });
      }
      if (!seeds.length) {
        await finishRaceFetchRun(true);
        onProgress?.({
          phase: "DONE",
          message: "開催日程取得済み・正式出馬表の公開待ち",
          current: 0,
          total: meetings.length,
        });
        return { meetings: meetings.length, officialSaved: 0, pendingMeetings: meetings.length };
      }
    }

    const discovery = await drainQueue(meetings, fingerprint, onProgress);
    let officialSaved = 0;
    let pendingMeetings = 0;

    for (const meeting of meetings) {
      const key = meetingKey(meeting.venue, meeting.meetingNo, meeting.meetingDay);
      const expected = authoritativeRaceNos(meeting, discovery.navigation);
      const group = discovery.cards.get(key) ?? new Map<number, JraRaceCard>();
      if (!expected?.length || !expected.every((raceNo) => group.has(raceNo))) {
        pendingMeetings += 1;
        continue;
      }
      const meetingCards = expected.map((raceNo) => group.get(raceNo)!).filter(Boolean);
      if (meetingCards.length !== expected.length) {
        pendingMeetings += 1;
        continue;
      }
      try {
        await saveOfficialMeeting(meetingCards, expected);
        officialSaved += meetingCards.length;
      } catch (error) {
        pendingMeetings += 1;
        console.warn("Verified JRA meeting save deferred", key, error);
      }
    }

    await finishRaceFetchRun(true);
    onProgress?.({
      phase: "DONE",
      message: officialSaved
        ? officialSaved + "Rの正式出馬表を更新"
        : "開催日程取得済み・正式出馬表の完成待ち",
      current: meetings.length - pendingMeetings,
      total: meetings.length,
    });
    return { meetings: meetings.length, officialSaved, pendingMeetings };
  } catch (error) {
    await finishRaceFetchRun(false, error instanceof Error ? error.message : String(error)).catch(() => undefined);
    throw error;
  }
}

export function refreshTodayRaceData(onProgress?: (p: RaceRefreshProgress) => void) {
  return refreshRaceDates([localTodayIso()], onProgress);
}

export function refreshCurrentWeekRaceData(onProgress?: (p: RaceRefreshProgress) => void) {
  return refreshRaceDates(racingWeekCandidateDates(), onProgress);
}

export async function refreshRaceState(race: JraRace) {
  let sourceUrl = race.status === "OFFICIAL" && race.sourceUrl.includes("/JRADB/accessD.html")
    ? race.sourceUrl
    : null;
  let queuedError: string | null = null;
  if (!sourceUrl) {
    const queued = await findRaceFetchUrl(race.raceDate, race.venue, race.raceNo);
    sourceUrl = queued?.url ?? null;
    queuedError = queued?.lastError ?? null;
  }
  if (!sourceUrl) {
    throw new Error(queuedError || "正式出馬表URLをまだ発見できていない。今週のレースを更新する。");
  }
  const html = await fetchJraHtml(sourceUrl);
  const card = markOfficialNumberedRaceCard(html, parseRaceCard(html, sourceUrl));
  await saveOfficialCard(card);
  return card;
}

function dueIntervalMs(race: JraRace, nowMs: number) {
  if (race.status !== "OFFICIAL") return 2 * 60 * 1000;
  const start = raceStartEpoch(race);
  if (start == null) return 30 * 60 * 1000;
  const remaining = start - nowMs;
  if (remaining <= 0) return Number.POSITIVE_INFINITY;
  if (remaining <= 60 * 60 * 1000) return 3 * 60 * 1000;
  if (remaining <= 3 * 60 * 60 * 1000) return 10 * 60 * 1000;
  return 30 * 60 * 1000;
}

let dueSweep: Promise<void> | null = null;
export function refreshDueRaceStates() {
  if (dueSweep) return dueSweep;
  dueSweep = (async () => {
    const now = Date.now();
    const races = await listTodayRaces();
    const candidates = races.filter((race) => {
      if (race.status === "OFFICIAL") {
        const start = raceStartEpoch(race);
        if (start != null && start <= now) return false;
      }
      const fetchedAt = Date.parse(race.fetchedAt);
      return !Number.isFinite(fetchedAt) || now - fetchedAt >= dueIntervalMs(race, now);
    });
    for (const race of candidates.slice(0, 2)) {
      try { await refreshRaceState(race); } catch (error) {
        console.warn("JRA race-state refresh failed", race.raceKey, error);
      }
    }
  })().finally(() => { dueSweep = null; });
  return dueSweep;
}
