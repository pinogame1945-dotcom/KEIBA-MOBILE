import type { JraRace, JraRaceCard, ScheduleMeeting } from "../domain/live";
import { fetchJraHtml } from "../data/jra/http";
import { markOfficialNumberedRaceCard } from "../data/jra/officialCardGuard";
import {
  discoverFeatureLinks, discoverRaceCardLinks, parseRaceCard,
} from "../data/jra/raceCardParser";
import { parseJraRaceIdentity } from "../data/jra/raceHeaderParser";
import { calendarDayUrl, parseCalendarDay } from "../data/jra/scheduleParser";
import {
  listTodayRaces, localTodayIso, saveOfficialCard, saveOfficialMeeting, saveScheduleMeetings,
} from "../repositories/liveRepository";
import { raceStartEpoch } from "../data/jra/oddsAvailability";

const HOME = "https://www.jra.go.jp/";
const THIS_WEEK = "https://www.jra.go.jp/keiba/thisweek/";
const MAX_CARD_PAGES = 80;

export type RaceRefreshProgress = {
  phase: "SCHEDULE" | "DISCOVERY" | "CARDS" | "DONE";
  message: string;
  current: number;
  total: number;
};

function meetingKey(venue: string, meetingNo: number, meetingDay: number) {
  return venue + "|" + meetingNo + "|" + meetingDay;
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

async function discoverSeeds(meetings: ScheduleMeeting[], onProgress?: (p: RaceRefreshProgress) => void) {
  const seeds = new Set<string>();
  const scanPage = async (url: string) => {
    const html = await fetchJraHtml(url);
    for (const link of discoverRaceCardLinks(html, url)) {
      if (isTargetUrl(link, meetings)) seeds.add(link);
    }
    return { html, features: discoverFeatureLinks(html, url) };
  };

  onProgress?.({ phase: "DISCOVERY", message: "JRA正式出馬表入口を確認", current: 0, total: 1 });
  const weekly = await scanPage(THIS_WEEK);
  const features = weekly.features.filter((url) =>
    url.includes("/keiba/race/") || url.includes("/keiba/g1/")
  ).slice(0, 12);

  for (let i = 0; i < features.length && seeds.size < meetings.length; i += 1) {
    onProgress?.({ phase: "DISCOVERY", message: "正式出馬表リンクを探索", current: i + 1, total: features.length });
    try { await scanPage(features[i]); } catch {}
  }

  if (seeds.size < meetings.length) {
    try {
      const home = await scanPage(HOME);
      const homeFeatures = home.features.filter((url) =>
        url.includes("/keiba/race/") || url.includes("/keiba/g1/")
      ).slice(0, 8);
      for (const url of homeFeatures) {
        if (seeds.size >= meetings.length) break;
        try { await scanPage(url); } catch {}
      }
    } catch {}
  }
  return [...seeds];
}

export async function refreshTodayRaceData(onProgress?: (p: RaceRefreshProgress) => void) {
  const today = localTodayIso();
  const scheduleUrl = calendarDayUrl(today);
  onProgress?.({ phase: "SCHEDULE", message: "今日の開催を確認", current: 0, total: 1 });
  const scheduleHtml = await fetchJraHtml(scheduleUrl);
  const meetings = parseCalendarDay(scheduleHtml, scheduleUrl);
  await saveScheduleMeetings(meetings);

  let seeds: string[] = [];
  try {
    seeds = await discoverSeeds(meetings, onProgress);
  } catch {
    onProgress?.({ phase: "DONE", message: "開催日程取得済み・正式出馬表の公開待ち", current: 0, total: meetings.length });
    return { meetings: meetings.length, officialSaved: 0, pendingMeetings: meetings.length };
  }

  const queue = [...seeds];
  const queued = new Set(queue);
  const visited = new Set<string>();
  const cards = new Map<string, Map<number, JraRaceCard>>();
  const navigation = new Map<string, Set<number>>();

  while (queue.length && visited.size < MAX_CARD_PAGES) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);
    onProgress?.({ phase: "CARDS", message: "正式出馬表を検証", current: visited.size, total: Math.max(queued.size, 1) });

    let html: string;
    try { html = await fetchJraHtml(url); } catch { continue; }

    const own = parseJraRaceIdentity(url);
    const ownMeeting = targetMeeting(own, meetings);
    if (own && ownMeeting) {
      const key = meetingKey(own.venue, own.meetingNo, own.meetingDay);
      const set = navigation.get(key) ?? new Set<number>();
      set.add(own.raceNo);
      navigation.set(key, set);
    }

    for (const link of discoverRaceCardLinks(html, url)) {
      const identity = parseJraRaceIdentity(link);
      const meeting = targetMeeting(identity, meetings);
      if (!identity || !meeting) continue;
      const key = meetingKey(identity.venue, identity.meetingNo, identity.meetingDay);
      const set = navigation.get(key) ?? new Set<number>();
      set.add(identity.raceNo);
      navigation.set(key, set);
      if (!queued.has(link) && !visited.has(link)) {
        queued.add(link);
        queue.push(link);
      }
    }

    if (!ownMeeting || !own) continue;
    try {
      const card = markOfficialNumberedRaceCard(html, parseRaceCard(html, url));
      const key = meetingKey(own.venue, own.meetingNo, own.meetingDay);
      const group = cards.get(key) ?? new Map<number, JraRaceCard>();
      group.set(card.race.raceNo, card);
      cards.set(key, group);
    } catch {
      // 未確定・一時欠落ページは保存しない。
    }
  }

  let officialSaved = 0;
  let pendingMeetings = 0;
  for (const meeting of meetings) {
    const key = meetingKey(meeting.venue, meeting.meetingNo, meeting.meetingDay);
    const expected = [...(navigation.get(key) ?? new Set<number>())].sort((a,b) => a-b);
    const group = cards.get(key) ?? new Map<number, JraRaceCard>();
    if (!expected.length || !expected.every((no) => group.has(no))) {
      pendingMeetings += 1;
      continue;
    }
    const meetingCards = expected.map((no) => group.get(no)!).filter(Boolean);
    try {
      await saveOfficialMeeting(meetingCards, expected);
      officialSaved += meetingCards.length;
    } catch {
      pendingMeetings += 1;
    }
  }

  onProgress?.({
    phase: "DONE",
    message: officialSaved ? officialSaved + "Rの正式出馬表を更新" : "開催日程取得済み・正式出馬表の完成待ち",
    current: meetings.length - pendingMeetings,
    total: meetings.length,
  });
  return { meetings: meetings.length, officialSaved, pendingMeetings };
}

export async function refreshRaceState(race: JraRace) {
  if (race.status !== "OFFICIAL" || !race.sourceUrl.includes("/JRADB/accessD.html")) {
    throw new Error("正式出馬表URLがまだ取得されていない");
  }
  const html = await fetchJraHtml(race.sourceUrl);
  const card = markOfficialNumberedRaceCard(html, parseRaceCard(html, race.sourceUrl));
  await saveOfficialCard(card);
  return card;
}

function dueIntervalMs(race: JraRace, nowMs: number) {
  const start = raceStartEpoch(race);
  if (start == null) return 60 * 60 * 1000;
  const remaining = start - nowMs;
  if (remaining <= 0) return Number.POSITIVE_INFINITY;
  return remaining <= 3 * 60 * 60 * 1000 ? 20 * 60 * 1000 : 60 * 60 * 1000;
}

let dueSweep: Promise<void> | null = null;
export function refreshDueRaceStates() {
  if (dueSweep) return dueSweep;
  dueSweep = (async () => {
    const now = Date.now();
    const races = await listTodayRaces();
    const candidates = races.filter((race) => {
      if (race.status !== "OFFICIAL") return false;
      const start = raceStartEpoch(race);
      if (start != null && start <= now) return false;
      const fetchedAt = Date.parse(race.fetchedAt);
      return !Number.isFinite(fetchedAt) || now - fetchedAt >= dueIntervalMs(race, now);
    });
    for (const race of candidates) {
      try { await refreshRaceState(race); } catch {}
    }
  })().finally(() => { dueSweep = null; });
  return dueSweep;
}
