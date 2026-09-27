import assert from "node:assert/strict";
import {parseCalendarDisruptions,scheduleTargetFingerprint} from "../src/data/jra/scheduleParser.ts";

const url="https://www.jra.go.jp/keiba/calendar2026/2026/9/0927.html";

const meeting=parseCalendarDisruptions(
  "<html><body>中山競馬の開催を中止します。</body></html>",
  url,
);
assert.equal(meeting.length,1);
assert.equal(meeting[0].scope,"MEETING");
assert.equal(meeting[0].venue,"中山");
assert.equal(meeting[0].kind,"CANCELLED");

const race=parseCalendarDisruptions(
  "<html><body>第2回中京競馬第7日第2競走の取りやめ</body></html>",
  url,
);
assert.equal(race.length,1);
assert.equal(race[0].scope,"RACE");
assert.equal(race[0].venue,"中京");
assert.equal(race[0].raceNo,2);
assert.equal(race[0].kind,"ABANDONED");

const base={
  meetings:[{
    raceDate:"2026-09-27",venue:"中山",meetingNo:4,meetingDay:8,
    races:[{raceDate:"2026-09-27",venue:"中山",raceNo:1,raceName:null,startTime:"10:10",discipline:"FLAT" as const,surface:"TURF" as const,distanceM:1200,sourceUrl:url}],
  }],
};
const normal=scheduleTargetFingerprint(base);
const disrupted=scheduleTargetFingerprint({...base,disruptions:meeting});
assert.notEqual(normal,disrupted);

console.log("schedule disruption regression: PASS");
