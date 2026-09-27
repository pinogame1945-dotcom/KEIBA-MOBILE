import type { JraEntry, JraRace } from "../../domain/live";

export const ODDS_NORMAL_REFRESH_MS = 10 * 60 * 1000;
export const ODDS_NEAR_REFRESH_MS = 5 * 60 * 1000;
export const ODDS_NEAR_WINDOW_MS = 30 * 60 * 1000;
export const ODDS_FINAL_DELAY_MS = 10 * 60 * 1000;

export function bracketQuinellaOffered(entries: JraEntry[]) {
  if (entries.length >= 9) return true;
  if (!entries.length) return null;
  const gates = entries.map((entry) => entry.gate);
  if (gates.some((gate) => gate == null)) return null;
  return new Set(gates as number[]).size < entries.length;
}

export function raceStartEpoch(race: JraRace) {
  if (!race.startTime) return null;
  const match = race.startTime.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const value = new Date(race.raceDate + "T" + match[1].padStart(2, "0") + ":" + match[2] + ":00").getTime();
  return Number.isFinite(value) ? value : null;
}
