import assert from "node:assert/strict";
import {earliestScheduleDate,selectActiveSchedule} from "../src/data/jra/reschedule.ts";

const oldKey="JRA:2026-09-27:中山:1";
const newKey="JRA:2026-09-28:中山:1";
const rows=[
  {raceKey:newKey,raceDate:"2026-09-28",fetchedAt:"2026-09-27T09:00:00.000Z"},
  {raceKey:oldKey,raceDate:"2026-09-27",fetchedAt:"2026-09-27T10:00:00.000Z"},
];
assert.equal(selectActiveSchedule(rows)?.raceKey,newKey);
assert.equal(selectActiveSchedule([...rows].reverse())?.raceKey,newKey);
assert.equal(earliestScheduleDate(rows),"2026-09-27");

const twiceMoved=[
  ...rows,
  {raceKey:"JRA:2026-09-29:中山:1",raceDate:"2026-09-29",fetchedAt:"2026-09-28T08:00:00.000Z"},
];
assert.equal(selectActiveSchedule(twiceMoved)?.raceDate,"2026-09-29");
assert.equal(earliestScheduleDate(twiceMoved),"2026-09-27");

console.log("reschedule regression: PASS");
