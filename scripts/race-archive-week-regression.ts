import assert from "node:assert/strict";
import { groupStoredRaceWeeks } from "../src/domain/raceArchiveWeeks.ts";
import { carryForwardAdjacentScheduleDates } from "../src/domain/scheduleWindow.ts";

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

const mondayCarryover=carryForwardAdjacentScheduleDates(
  ["2026-09-26","2026-09-27"],
  ["2026-09-28"],
);
assert.deepEqual(mondayCarryover,["2026-09-26","2026-09-27","2026-09-28"]);

const tuesdayCarryover=carryForwardAdjacentScheduleDates(
  ["2026-10-03","2026-10-04"],
  ["2026-10-06"],
);
assert.deepEqual(tuesdayCarryover,["2026-10-03","2026-10-04","2026-10-06"]);

const normalNextWeek=carryForwardAdjacentScheduleDates(
  ["2026-09-26","2026-09-27"],
  ["2026-10-03","2026-10-04"],
);
assert.deepEqual(normalNextWeek,["2026-10-03","2026-10-04"]);

const currentDates=new Set(mondayCarryover);
const hiddenWhileCurrent=groupStoredRaceWeeks([
  {raceDate:"2026-09-26",raceCount:24,resultCount:24},
  {raceDate:"2026-09-27",raceCount:24,resultCount:24},
]).filter(week=>!week.dates.some(date=>currentDates.has(date)));
assert.equal(hiddenWhileCurrent.length,0);

const nextWeekDates=new Set(normalNextWeek);
const visibleAfterRollover=groupStoredRaceWeeks([
  {raceDate:"2026-09-26",raceCount:24,resultCount:24},
  {raceDate:"2026-09-27",raceCount:24,resultCount:24},
]).filter(week=>!week.dates.some(date=>nextWeekDates.has(date)));
assert.equal(visibleAfterRollover.length,1);
assert.deepEqual(visibleAfterRollover[0].dates,["2026-09-26","2026-09-27"]);

console.log("Race archive week grouping regression: PASS");
