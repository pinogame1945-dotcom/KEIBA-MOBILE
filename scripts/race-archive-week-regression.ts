import assert from "node:assert/strict";
import { groupStoredRaceWeeks } from "../src/domain/raceArchiveWeeks.ts";

const weeks=groupStoredRaceWeeks([
  {raceDate:"2026-09-12",raceCount:24,resultCount:24},
  {raceDate:"2026-09-13",raceCount:24,resultCount:24},
  {raceDate:"2026-09-19",raceCount:24,resultCount:24},
  {raceDate:"2026-09-20",raceCount:24,resultCount:24},
  {raceDate:"2026-09-21",raceCount:24,resultCount:23},
]);

assert.equal(weeks.length,2);
assert.deepEqual(weeks[0].dates,["2026-09-19","2026-09-20","2026-09-21"]);
assert.equal(weeks[0].raceCount,72);
assert.equal(weeks[0].resultCount,71);
assert.deepEqual(weeks[1].dates,["2026-09-12","2026-09-13"]);

const rescheduled=groupStoredRaceWeeks([
  {raceDate:"2026-10-03",raceCount:24,resultCount:24},
  {raceDate:"2026-10-04",raceCount:24,resultCount:20},
  {raceDate:"2026-10-06",raceCount:12,resultCount:12},
]);
assert.equal(rescheduled.length,1);
assert.deepEqual(rescheduled[0].dates,["2026-10-03","2026-10-04","2026-10-06"]);

const separated=groupStoredRaceWeeks([
  {raceDate:"2026-10-03",raceCount:24,resultCount:24},
  {raceDate:"2026-10-07",raceCount:12,resultCount:12},
]);
assert.equal(separated.length,2);

console.log("Race archive week grouping regression: PASS");
