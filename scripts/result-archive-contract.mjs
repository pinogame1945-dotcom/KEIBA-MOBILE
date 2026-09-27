import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const storage = readFileSync(new URL("../src/storage/liveDb.ts", import.meta.url), "utf8");
const repository = readFileSync(new URL("../src/repositories/liveRepository.ts", import.meta.url), "utf8");
const result = readFileSync(new URL("../src/services/resultService.ts", import.meta.url), "utf8");
const sync = readFileSync(new URL("../src/services/liveSyncService.ts", import.meta.url), "utf8");

for (const token of [
  "LIVE_SCHEMA_VERSION = 2",
  "schema_migrations",
  "PRAGMA user_version=",
  "race_archive_state",
  "result_provenance",
  "result-archive-foundation-v1",
]) {
  assert.ok(storage.includes(token), "result archive migration contract missing: " + token);
}

for (const token of [
  "recomputeRaceArchiveState",
  'archiveState: "LIVE" | "INCOMPLETE" | "READY"',
  "finalOddsReady",
  "conditionsReady",
  "resultFingerprint",
  "INSERT OR IGNORE INTO result_provenance",
]) {
  assert.ok(repository.includes(token), "result archive repository contract missing: " + token);
}

assert.ok(
  repository.includes("markFinalOddsConfirmed") &&
  repository.includes("await recomputeRaceArchiveState(db,raceKey)"),
  "JRA-confirmed final odds must advance archive readiness",
);

assert.ok(
  result.includes('source:"NETKEIBA"') &&
  result.includes('source:"JRA"') &&
  result.includes("NETKEIBA_RESULT_PARSER_VERSION") &&
  result.includes("JRA_RESULT_PARSER_VERSION"),
  "official result provenance must preserve source and parser version",
);

assert.ok(
  !storage.includes("l1_snapshot") &&
  !storage.includes("l2_snapshot") &&
  !storage.includes("l3_snapshot"),
  "RESULT ARCHIVE v1 must not pre-commit MOBILE L1/L2/L3 storage contracts",
);


assert.ok(
  repository.includes("assertResultMatchesStoredEntries") &&
  repository.includes("listIncompleteArchiveRaces") &&
  repository.includes("JOIN races r ON r.race_key=rr.race_key") &&
  !repository.includes('"SELECT DISTINCT race_key AS raceKey FROM race_results"'),
  "phase 2 must guard official results, expose bounded archive backlog reads and avoid full result-history scans",
);

assert.ok(
  sync.includes("refreshArchiveBacklog") &&
  sync.includes("listIncompleteArchiveRaces(64)") &&
  sync.includes('"archive_result_repair_attempt:"') &&
  sync.includes('"archive_odds_repair_attempt:"'),
  "expired-week archive gaps must receive throttled bounded repair without depending on current-week navigation",
);

console.log("Result archive contract: PASS");
