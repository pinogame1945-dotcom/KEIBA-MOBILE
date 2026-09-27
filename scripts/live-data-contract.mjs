import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const queue = readFileSync(new URL("../src/services/raceFetchQueue.ts", import.meta.url), "utf8");
const refresh = readFileSync(new URL("../src/services/raceRefreshService.ts", import.meta.url), "utf8");
const result = readFileSync(new URL("../src/services/resultService.ts", import.meta.url), "utf8");
const parser = readFileSync(new URL("../src/data/netkeiba/resultParser.ts", import.meta.url), "utf8");
const screen = readFileSync(new URL("../src/screens/RaceCardScreen.tsx", import.meta.url), "utf8");
const repository = readFileSync(new URL("../src/repositories/liveRepository.ts", import.meta.url), "utf8");
const sync = readFileSync(new URL("../src/services/liveSyncService.ts", import.meta.url), "utf8");
const venue = readFileSync(new URL("../src/services/venueConditionService.ts", import.meta.url), "utf8");
const schedule = readFileSync(new URL("../src/services/scheduleTargetService.ts", import.meta.url), "utf8");
const storage = readFileSync(new URL("../src/storage/liveDb.ts", import.meta.url), "utf8");
const odds = readFileSync(new URL("../src/services/oddsService.ts", import.meta.url), "utf8");
const oddsCollector = readFileSync(new URL("../src/data/jra/oddsCollector.ts", import.meta.url), "utf8");

for (const token of ["PENDING","FETCHING","RETRY","DONE","FAILED","attempts<3","race_fetch_target","COMPLETED"]) {
  assert.ok(queue.includes(token), "persistent JRA fetch queue contract missing: " + token);
}
for (const token of [
  "authoritativeRaceNos","recordEvidence","prepareRaceFetchRun",
  "claimNextRaceFetchItem","markRaceFetchFailed","findRaceFetchUrl",
]) {
  assert.ok(refresh.includes(token), "JRA refresh recovery contract missing: " + token);
}
assert.ok(
  refresh.includes("saveOfficialMeeting(cards,expected)"),
  "verified formal navigation set must drive atomic meeting persistence",
);
assert.ok(
  result.includes("race.netkeiba.com/race/result.html?race_id=") &&
  result.includes("db.netkeiba.com/race/") &&
  result.includes("fetchJraResultFallback"),
  "result retrieval must keep live/historical netkeiba sources plus JRA fallback",
);
assert.ok(result.includes("resultRefreshes"), "duplicate result refreshes must be coalesced");
for (const token of ["race_table_01","RaceTable01","All_Result_Table","normalizePayoutCombinations","平均1F"]) {
  assert.ok(parser.includes(token), "result parser regression guard missing: " + token);
}
assert.ok(
  screen.includes("autoCardRepairRaceKey") && screen.includes("出馬表を再取得"),
  "stuck schedule-only race must have automatic and manual repair paths",
);
assert.ok(
  repository.includes("getScheduleTarget") &&
  repository.includes("scheduleRaceAsDisplay") &&
  repository.includes("listOfficialRacesForDates"),
  "schedule display must be independent from formal race persistence",
);
assert.ok(
  sync.includes("getRaceResultCompleteness") &&
  sync.includes("refreshRaceState(race)") &&
  sync.includes("Promise.allSettled") &&
  !sync.includes("await refreshCurrentWeekRaceData().catch"),
  "warm/sync paths must repair layers independently instead of full-week blocking",
);
assert.ok(
  repository.includes("resultReady=resultCount>0") &&
  repository.includes("payoutReady=payoutCount>0") &&
  repository.includes("complete:resultReady"),
  "finish-order readiness must be independent from payout repair",
);
assert.ok(
  sync.includes("refreshIncompletePayouts") &&
  sync.includes("completeness.resultReady"),
  "payout repair must not consume result-collection slots",
);
assert.ok(
  storage.includes("withLiveDbWrite") &&
  storage.includes("withLiveDbTransaction") &&
  repository.includes("withLiveDbTransaction") &&
  queue.includes("withLiveDbTransaction"),
  "all LIVE mutations must share the serialized database write lane",
);
assert.ok(
  odds.includes("probeJraFinalOdds") &&
  odds.includes("markFinalOddsConfirmed") &&
  oddsCollector.includes('"POSTTIME"') &&
  !sync.includes("ODDS_FINAL_DELAY_MS") &&
  !screen.includes("ODDS_FINAL_DELAY_MS"),
  "final odds must be confirmed from JRA state rather than elapsed scheduled time",
);
assert.ok(
  !repository.includes("saveScheduleMeetings") &&
  !repository.includes("applyVenueConditions"),
  "schedule rows and current venue conditions must not overwrite formal/final race records",
);
assert.ok(
  venue.includes("saveVenueConditionSnapshot") &&
  venue.includes("getScheduleTarget"),
  "venue conditions must be stored as an independent snapshot layer",
);
assert.ok(
  schedule.includes("refreshScheduleTarget") &&
  schedule.includes("probeDates") &&
  schedule.includes("cachedLatest"),
  "race dates must come from JRA schedule discovery rather than fixed weekdays",
);
assert.ok(
  !result.includes("正式出馬表取得後に結果を確認できる"),
  "final results must remain repairable even when the formal card layer is incomplete",
);

console.log("LIVE data contract: PASS");
