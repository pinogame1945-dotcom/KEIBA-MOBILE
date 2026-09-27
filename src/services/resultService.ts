import type { JraRace } from "../domain/live";
import { fetchJraHtml, fetchJraPostHtml } from "../data/jra/http";
import { raceStartEpoch } from "../data/jra/oddsAvailability";
import { discoverRaceResultAction, parseJraRaceResultPage } from "../data/jra/resultParser";
import { fetchNetkeibaHtml } from "../data/netkeiba/http";
import { parseNetkeibaRaceResultPage } from "../data/netkeiba/resultParser";
import { getRacePayouts, getRaceResults, saveOfficialRaceResult } from "../repositories/liveRepository";

const RESULT_SETTLE_DELAY_MS = 15 * 60 * 1000;
const resultRefreshes = new Map<string, Promise<ReturnType<typeof parseNetkeibaRaceResultPage>>>();

export async function loadRaceResult(raceKey: string) {
  const [results, payouts] = await Promise.all([
    getRaceResults(raceKey),
    getRacePayouts(raceKey),
  ]);
  return { results, payouts };
}

function preferLiveResultPage(raceDate: string) {
  const target = Date.parse(raceDate + "T00:00:00+09:00");
  return Number.isFinite(target) && Math.abs(Date.now() - target) <= 14 * 24 * 60 * 60 * 1000;
}

function resultSourceUrls(race: JraRace) {
  if (!race.canonicalRaceId) return [];
  const live = "https://race.netkeiba.com/race/result.html?race_id=" + race.canonicalRaceId;
  const historical = "https://db.netkeiba.com/race/" + race.canonicalRaceId + "/";
  return preferLiveResultPage(race.raceDate) ? [live,historical] : [historical,live];
}

async function fetchNetkeibaResult(race: JraRace) {
  let lastError: unknown = null;
  for (const url of resultSourceUrls(race)) {
    try {
      const html = await fetchNetkeibaHtml(url);
      return parseNetkeibaRaceResultPage(html, race);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (/アクセス制限|制限ページ/.test(message)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("netkeiba確定結果を取得できない");
}

async function fetchJraResultFallback(race: JraRace) {
  if (!race.sourceUrl.includes("/JRADB/accessD.html")) {
    throw new Error("JRA正式出馬表URLが未取得");
  }
  const raceHtml = await fetchJraHtml(race.sourceUrl);
  const action = discoverRaceResultAction(raceHtml);
  if (!action) throw new Error("JRA公式結果はまだ公開されていない");
  const resultHtml = await fetchJraPostHtml(action.path, action.cname);
  return parseJraRaceResultPage(resultHtml, race);
}

async function refreshOfficialRaceResultImpl(race: JraRace) {
  const start = raceStartEpoch(race);
  if (start != null && Date.now() < start + RESULT_SETTLE_DELAY_MS) {
    throw new Error("発走直後のため確定結果の公開を待っている");
  }

  let primaryError: unknown = null;
  if (race.canonicalRaceId) {
    try {
      const parsed = await fetchNetkeibaResult(race);
      await saveOfficialRaceResult(race, parsed.results, parsed.payouts, parsed.conditions);
      return parsed;
    } catch (error) {
      primaryError = error;
      console.warn("netkeiba result refresh failed; trying JRA fallback", race.raceKey, error);
    }
  }

  try {
    const parsed = await fetchJraResultFallback(race);
    await saveOfficialRaceResult(race, parsed.results, parsed.payouts, parsed.conditions);
    return parsed;
  } catch (fallbackError) {
    const primary = primaryError instanceof Error ? primaryError.message : primaryError ? String(primaryError) : null;
    const fallback = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
    throw new Error(primary ? "確定結果取得失敗: " + primary + " / JRA: " + fallback : fallback);
  }
}

export function refreshOfficialRaceResult(race: JraRace) {
  const existing = resultRefreshes.get(race.raceKey);
  if (existing) return existing;
  const task = refreshOfficialRaceResultImpl(race).finally(() => {
    if (resultRefreshes.get(race.raceKey) === task) resultRefreshes.delete(race.raceKey);
  });
  resultRefreshes.set(race.raceKey, task);
  return task;
}
