import type { JraEntry, JraRace, OddsBetType } from "../domain/live";
import { refreshAllRaceOdds } from "../data/jra/oddsCollector";
import { bracketQuinellaOffered } from "../data/jra/oddsAvailability";
import {
  getLatestOddsRows,getLatestWinOddsByHorse,getOddsAvailability,getOddsRowsForSelection,
} from "../repositories/liveRepository";

const LABEL: Record<OddsBetType, string> = {
  WIN: "単勝",
  PLACE: "複勝",
  BRACKET_QUINELLA: "枠連",
  QUINELLA: "馬連",
  WIDE: "ワイド",
  EXACTA: "馬単",
  TRIO: "3連複",
  TRIFECTA: "3連単",
};

export function oddsBetTypeLabel(type: OddsBetType) {
  return LABEL[type];
}

export function requiredOddsTypes(entries: JraEntry[]): OddsBetType[] {
  const types: OddsBetType[] = ["WIN","PLACE","QUINELLA","WIDE","EXACTA","TRIO","TRIFECTA"];
  if (bracketQuinellaOffered(entries) !== false) types.splice(2, 0, "BRACKET_QUINELLA");
  return types;
}

export async function loadOddsMeta(raceKey: string) {
  const availability = await getOddsAvailability(raceKey);
  const latestObservedAt = availability
    .map((row) => Date.parse(row.observedAt))
    .filter(Number.isFinite)
    .sort((a,b) => b-a)[0];
  return {
    availableTypes: availability.map((row) => row.betType),
    latestObservedAt: Number.isFinite(latestObservedAt) ? new Date(latestObservedAt).toISOString() : null,
  };
}

export async function loadOddsRows(
  raceKey: string,
  betType: OddsBetType,
  selection?: number | null,
  limit = 120,
) {
  return selection == null
    ? getLatestOddsRows(raceKey, betType, limit)
    : getOddsRowsForSelection(raceKey, betType, selection, limit);
}

export async function loadLatestWinOdds(raceKey: string) {
  return getLatestWinOddsByHorse(raceKey);
}

export async function refreshLatestOdds(race: JraRace, entries: JraEntry[]) {
  if (race.status !== "OFFICIAL") throw new Error("正式出馬表取得後にオッズを更新できる");
  const result = await refreshAllRaceOdds(race);
  const latest = await loadOddsMeta(race.raceKey);
  const required = requiredOddsTypes(entries);
  const missing = required.filter((type) => !latest.availableTypes.includes(type));
  return { ...result, ...latest, missing };
}
