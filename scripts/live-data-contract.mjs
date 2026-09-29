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
const entryExtractor = readFileSync(new URL("../src/data/jra/entryTableExtractor.ts", import.meta.url), "utf8");
const officialCardGuard = readFileSync(new URL("../src/data/jra/officialCardGuard.ts", import.meta.url), "utf8");

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
  sync.includes('const FULL_TARGET="live_full_target_fingerprint"') &&
  sync.includes("getScheduleTarget()") &&
  sync.includes("fullTarget===currentFingerprint") &&
  sync.includes("!fullTargetCurrent||!parsedTime(lastFull)") &&
  sync.includes("setWeekMeta(FULL_TARGET,currentFingerprint)"),
  "a new schedule fingerprint must bypass the previous week's six-hour full-card throttle",
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
  sync.includes("completeness.conditionsComplete") &&
  sync.includes('"condition_repair_attempt:"') &&
  sync.includes("repairedConditions>=2"),
  "stored results with missing weather/track conditions must receive throttled background repair",
);
assert.ok(
  storage.includes("withLiveDbWrite") &&
  storage.includes("withLiveDbTransaction") &&
  repository.includes("withLiveDbTransaction") &&
  queue.includes("withLiveDbTransaction") &&
  !repository.includes("db.withTransactionAsync") &&
  !queue.includes("db.withTransactionAsync"),
  "all LIVE mutations must share the serialized database write lane",
);
assert.ok(
  !sync.includes("candidates.slice(0,16)") &&
  sync.includes("if(refreshed>=4)continue"),
  "result repair must scan all overdue races while limiting actual successful repairs",
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


assert.ok(
  entryExtractor.includes("recoverInactiveNumbering") &&
  entryExtractor.includes('/(?:取消|除外)/') &&
  officialCardGuard.includes('/(?:取消|除外)/') &&
  officialCardGuard.includes("row.horseNo!=null&&row.gate!=null"),
  "cancelled/excluded runners may recover uniquely missing numbering without weakening active-runner guard",
);
assert.ok(
  odds.includes('probe.isFinal ? "FINAL" : undefined') &&
  odds.includes("const result = await refreshAllRaceOdds(") &&
  !odds.includes("if (!probe.isFinal) {"),
  "published results must still trigger odds recovery even when the JRA final marker is not detected",
);

assert.ok(
  parser.includes("mergeConditions(race,meta,liveMeta,introMeta,raceHeadMeta,pageText)"),
  "netkeiba result conditions must merge split metadata blocks instead of trusting one container",
);
assert.ok(
  sync.includes("!completeness.resultReady||!completeness.conditionsComplete"),
  "warming a completed race must repair missing weather/track conditions immediately",
);


assert.ok(
  result.includes("if (!resultConditionsComplete(race, conditions))") &&
  result.includes("const jra = await fetchJraResultFallback(race)") &&
  result.includes("mergeOfficialRaceConditions(conditions, jra.conditions)"),
  "a successful netkeiba result with missing conditions must still supplement weather/going from JRA",
);
assert.ok(
  sync.includes('race.canonicalRaceId||race.sourceUrl.includes("/JRADB/accessD.html")') &&
  !sync.includes(".filter(race=>race.canonicalRaceId)"),
  "result repair must accept JRA-backed races even when canonicalRaceId is unavailable",
);

console.log("LIVE data contract: PASS");

const liveDb = readFileSync(new URL("../src/storage/liveDb.ts", import.meta.url), "utf8");
const schemaEnd = liveDb.indexOf("`;");
const rescheduleIndex = liveDb.indexOf("idx_races_canonical_schedule");
assert.ok(
  rescheduleIndex > schemaEnd,
  "reschedule index must be created only after migration columns exist on upgraded DBs",
);
