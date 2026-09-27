import type { JraEntry, JraRace, OddsBetType } from "../domain/live";
import { probeJraFinalOdds, refreshAllRaceOdds } from "../data/jra/oddsCollector";
import { bracketQuinellaOffered } from "../data/jra/oddsAvailability";
import {
  getFinalOddsConfirmedAt,getLatestOddsRows,getLatestWinOddsByHorse,getOddsAvailability,getOddsRowsForSelection,
  getRaceResultCompleteness,markFinalOddsConfirmed,markFinalOddsProbe,
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
  const finalConfirmedAt = await getFinalOddsConfirmedAt(raceKey);
  return {
    availableTypes: availability.map((row) => row.betType),
    latestObservedAt: Number.isFinite(latestObservedAt) ? new Date(latestObservedAt).toISOString() : null,
    finalConfirmedAt,
  };
}

export async function loadOddsRows(
  raceKey: string,
  betType: OddsBetType,
  selection?: number | null,
  limit = 120,
  offset = 0,
) {
  return selection == null
    ? getLatestOddsRows(raceKey, betType, limit, offset)
    : getOddsRowsForSelection(raceKey, betType, selection, limit, offset);
}

export async function loadLatestWinOdds(raceKey: string) {
  return getLatestWinOddsByHorse(raceKey);
}

// Compatibility for the current race screen while it is migrated to per-view reads.
// Keeps rendering bounded: at most 120 rows per available bet type.
export async function loadOdds(raceKey: string) {
  const meta = await loadOddsMeta(raceKey);
  const groups = await Promise.all(
    meta.availableTypes.map((type) => loadOddsRows(raceKey, type, null, 120)),
  );
  return {
    rows: groups.flat(),
    availableTypes: meta.availableTypes,
    latestObservedAt: meta.latestObservedAt,
  };
}

export async function refreshLatestOdds(race: JraRace, entries: JraEntry[]) {
  if (race.scheduleStatus !== "ACTIVE") throw new Error("順延前の日程のオッズは更新しない");
  if (race.raceStatus === "CANCELLED" || race.raceStatus === "ABANDONED") {
    throw new Error("中止・取りやめレースのオッズは更新しない");
  }
  if (race.status !== "OFFICIAL") throw new Error("正式出馬表取得後にオッズを更新できる");

  const required = requiredOddsTypes(entries);
  const alreadyFinal = await getFinalOddsConfirmedAt(race.raceKey);
  if (alreadyFinal) {
    const latest = await loadOddsMeta(race.raceKey);
    const missing = required.filter((type) => !latest.availableTypes.includes(type));
    return {
      betTypes: latest.availableTypes,
      rowCount: 0,
      visitedPages: 0,
      missingBetTypes: missing,
      ...latest,
      missing,
      finalConfirmed: true,
    };
  }

  const settlement = await getRaceResultCompleteness(race.raceKey);
  if (settlement.resultReady) {
    const probe = await probeJraFinalOdds(race);
    const probeAt = new Date().toISOString();
    await markFinalOddsProbe(race.raceKey, probeAt);

    // A published result means this race is overdue for odds recovery. The JRA
    // final marker only controls FINAL confirmation; it must never suppress the
    // actual odds fetch and leave an OFFICIAL race at zero rows.
    const result = await refreshAllRaceOdds(
      race,
      probe.raceHtml,
      probe.isFinal ? "FINAL" : undefined,
    );
    const latest = await loadOddsMeta(race.raceKey);
    const missing = required.filter((type) => !latest.availableTypes.includes(type));
    if (probe.isFinal && !missing.length && !result.missingBetTypes.length) {
      const confirmedAt = latest.latestObservedAt ?? new Date().toISOString();
      await markFinalOddsConfirmed(race.raceKey, confirmedAt);
      return {
        ...result,
        ...latest,
        finalConfirmedAt: confirmedAt,
        missing,
        finalConfirmed: true,
      };
    }
    return { ...result, ...latest, missing, finalConfirmed: false };
  }

  // No official result yet: the scheduled post time is not treated as the real
  // start. Keep LIVE odds refreshes working through delays and race-day trouble.
  const result = await refreshAllRaceOdds(race);
  const latest = await loadOddsMeta(race.raceKey);
  const missing = required.filter((type) => !latest.availableTypes.includes(type));
  return { ...result, ...latest, missing, finalConfirmed: false };
}
