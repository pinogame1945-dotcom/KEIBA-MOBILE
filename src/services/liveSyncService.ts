import { raceStartEpoch } from "../data/jra/oddsAvailability";
import {
  getOddsAvailability,getRace,getRaceResults,getWeekEntries,getWeekMeta,
  listRaceKeysWithResults,listRacingWeekRaces,localTodayIso,racingWeekCandidateDates,setWeekMeta,
} from "../repositories/liveRepository";
import { refreshLatestOdds } from "./oddsService";
import { refreshCurrentWeekRaceData,refreshDueRaceStates,refreshRaceState } from "./raceRefreshService";
import { refreshOfficialRaceResult } from "./resultService";
import { refreshTodayVenueConditions } from "./venueConditionService";

const WEEK_ATTEMPT_META = "live_sync_week_attempt_at";
let syncPromise: Promise<void> | null = null;
const warmPromises = new Map<string, Promise<void>>();

function parsedTime(value: string | null) {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function oddsRefreshInterval(remainingMs: number) {
  if (remainingMs <= 20 * 60 * 1000) return 2 * 60 * 1000;
  if (remainingMs <= 60 * 60 * 1000) return 5 * 60 * 1000;
  return 15 * 60 * 1000;
}

async function latestOddsAt(raceKey: string) {
  const availability = await getOddsAvailability(raceKey);
  return availability.reduce((latest, row) => Math.max(latest, parsedTime(row.observedAt)), 0);
}

async function refreshWeekIfDue() {
  const races = await listRacingWeekRaces();
  const now = Date.now();
  const scheduled = races.some((race) => race.status === "SCHEDULED");
  const lastAttempt = parsedTime(await getWeekMeta(WEEK_ATTEMPT_META));
  const interval = !races.length
    ? 5 * 60 * 1000
    : scheduled
      ? 15 * 60 * 1000
      : 30 * 60 * 1000;
  if (lastAttempt && now - lastAttempt < interval) return;

  await setWeekMeta(WEEK_ATTEMPT_META, new Date(now).toISOString());
  try {
    await refreshCurrentWeekRaceData();
  } catch {
    // Cache-first: a temporary JRA failure must never block the UI.
  }
}

async function refreshOnePendingResult() {
  const races = await listRacingWeekRaces();
  const dates = racingWeekCandidateDates();
  const resultKeys = new Set(await listRaceKeysWithResults(dates));
  const now = Date.now();

  const candidates = races
    .filter((race) => race.raceDate === localTodayIso() && race.status === "OFFICIAL" && !resultKeys.has(race.raceKey))
    .filter((race) => {
      const start = raceStartEpoch(race);
      return start != null && start + 3 * 60 * 1000 <= now;
    })
    .sort((a,b) => (raceStartEpoch(b) ?? 0) - (raceStartEpoch(a) ?? 0));

  for (const candidate of candidates.slice(0, 4)) {
    try {
      await refreshOfficialRaceResult(candidate);
      break;
    } catch {}
  }
}

async function refreshOneUpcomingOdds() {
  const races = await listRacingWeekRaces();
  const now = Date.now();
  const today = localTodayIso();
  const candidates = races
    .filter((race) => race.raceDate === today && race.status === "OFFICIAL")
    .map((race) => ({ race, start: raceStartEpoch(race) }))
    .filter((item): item is { race: typeof races[number]; start: number } =>
      item.start != null && item.start > now && item.start - now <= 3 * 60 * 60 * 1000
    )
    .sort((a,b) => a.start - b.start);

  for (const { race, start } of candidates) {
    const last = await latestOddsAt(race.raceKey);
    if (last && now - last < oddsRefreshInterval(start - now)) continue;
    try {
      const entries = await getWeekEntries(race.raceKey);
      if (entries.length) await refreshLatestOdds(race, entries);
    } catch {}
    break;
  }
}

export function syncLiveCache() {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    await refreshWeekIfDue();
    await refreshDueRaceStates().catch(() => undefined);
    await refreshTodayVenueConditions().catch(() => undefined);
    // Keep network work bounded: at most one successful result and one odds refresh per sweep.
    await refreshOnePendingResult();
    await refreshOneUpcomingOdds();
  })().finally(() => { syncPromise = null; });
  return syncPromise;
}

export function warmRaceData(raceKey: string) {
  const existing = warmPromises.get(raceKey);
  if (existing) return existing;
  const job = (async () => {
    let race = await getRace(raceKey);
    if (!race) return;

    if (race.status !== "OFFICIAL") {
      await refreshCurrentWeekRaceData().catch(() => undefined);
      race = await getRace(raceKey);
      if (!race || race.status !== "OFFICIAL") return;
    }

    const start = raceStartEpoch(race);
    const now = Date.now();
    if (start != null && start <= now) {
      const results = await getRaceResults(raceKey);
      if (!results.length) await refreshOfficialRaceResult(race).catch(() => undefined);
      return;
    }

    const fetchedAt = parsedTime(race.fetchedAt);
    if (!fetchedAt || now - fetchedAt > 5 * 60 * 1000) {
      await refreshRaceState(race).catch(() => undefined);
      race = await getRace(raceKey) ?? race;
    }

    const lastOdds = await latestOddsAt(raceKey);
    const remaining = start == null ? 3 * 60 * 60 * 1000 : Math.max(0, start - now);
    if (!lastOdds || now - lastOdds > oddsRefreshInterval(remaining)) {
      const entries = await getWeekEntries(raceKey);
      if (entries.length) await refreshLatestOdds(race, entries).catch(() => undefined);
    }
  })().finally(() => warmPromises.delete(raceKey));
  warmPromises.set(raceKey, job);
  return job;
}
