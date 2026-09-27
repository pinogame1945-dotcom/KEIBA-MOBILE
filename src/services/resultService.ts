import type { JraRace } from "../domain/live";
import { fetchJraHtml, fetchJraPostHtml } from "../data/jra/http";
import { raceStartEpoch } from "../data/jra/oddsAvailability";
import { discoverRaceResultAction, parseJraRaceResultPage } from "../data/jra/resultParser";
import { getRacePayouts, getRaceResults, saveOfficialRaceResult } from "../repositories/liveRepository";

export async function loadRaceResult(raceKey: string) {
  const [results, payouts] = await Promise.all([
    getRaceResults(raceKey),
    getRacePayouts(raceKey),
  ]);
  return { results, payouts };
}

export async function refreshOfficialRaceResult(race: JraRace) {
  if (race.status !== "OFFICIAL") {
    throw new Error("正式出馬表取得後に結果を確認できる");
  }
  const start = raceStartEpoch(race);
  if (start != null && start > Date.now()) {
    throw new Error("発走前のため結果はまだない");
  }

  const raceHtml = await fetchJraHtml(race.sourceUrl);
  const action = discoverRaceResultAction(raceHtml);
  if (!action) {
    throw new Error("JRA公式結果はまだ公開されていない");
  }
  const resultHtml = await fetchJraPostHtml(action.path, action.cname);
  const parsed = parseJraRaceResultPage(resultHtml, race.raceKey);
  await saveOfficialRaceResult(race.raceKey, parsed.results, parsed.payouts);
  return parsed;
}
