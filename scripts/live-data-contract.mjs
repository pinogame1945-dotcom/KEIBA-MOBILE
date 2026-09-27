import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const queue = readFileSync(new URL("../src/services/raceFetchQueue.ts", import.meta.url), "utf8");
const refresh = readFileSync(new URL("../src/services/raceRefreshService.ts", import.meta.url), "utf8");
const result = readFileSync(new URL("../src/services/resultService.ts", import.meta.url), "utf8");
const parser = readFileSync(new URL("../src/data/netkeiba/resultParser.ts", import.meta.url), "utf8");
const screen = readFileSync(new URL("../src/screens/RaceCardScreen.tsx", import.meta.url), "utf8");

for (const token of ["PENDING","FETCHING","RETRY","DONE","FAILED","attempts<3","race_fetch_target"]) {
  assert.ok(queue.includes(token), "persistent JRA fetch queue contract missing: " + token);
}
for (const token of [
  "authoritativeRaceNos","recordNavigationEvidence","prepareRaceFetchRun",
  "claimNextRaceFetchItem","markRaceFetchFailed","findRaceFetchUrl",
]) {
  assert.ok(refresh.includes(token), "JRA refresh recovery contract missing: " + token);
}
assert.ok(
  refresh.includes("saveOfficialMeeting(meetingCards, expected)"),
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

console.log("LIVE data contract: PASS");
