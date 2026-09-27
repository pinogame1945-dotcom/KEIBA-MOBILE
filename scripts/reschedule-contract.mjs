import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const domain=readFileSync(new URL("../src/domain/live.ts",import.meta.url),"utf8");
const storage=readFileSync(new URL("../src/storage/liveDb.ts",import.meta.url),"utf8");
const repository=readFileSync(new URL("../src/repositories/liveRepository.ts",import.meta.url),"utf8");
const schedule=readFileSync(new URL("../src/services/scheduleTargetService.ts",import.meta.url),"utf8");
const refresh=readFileSync(new URL("../src/services/raceRefreshService.ts",import.meta.url),"utf8");
const result=readFileSync(new URL("../src/services/resultService.ts",import.meta.url),"utf8");
const odds=readFileSync(new URL("../src/services/oddsService.ts",import.meta.url),"utf8");
const labels=readFileSync(new URL("../src/ui/raceLabels.ts",import.meta.url),"utf8");

for(const token of ["RaceLifecycleStatus","RaceScheduleStatus","MEETING_RESCHEDULED","RACE_CANCELLED"]){
  assert.ok(domain.includes(token),"domain disruption contract missing: "+token);
}
for(const token of ["scheduled_date TEXT","actual_date TEXT","schedule_status TEXT","superseded_by_race_key TEXT","invalidated_reason TEXT"]){
  assert.ok(storage.includes(token),"storage disruption contract missing: "+token);
}
for(const token of ["persistScheduleTarget","reconcileScheduleGroup","selectActiveSchedule","invalidateRaceSession","schedule_status='RESCHEDULED'"]){
  assert.ok(repository.includes(token),"repository reschedule contract missing: "+token);
}
assert.ok(schedule.includes("parseCalendarDisruptions"),"schedule refresh must carry explicit JRA disruptions");
assert.ok(refresh.includes('race.scheduleStatus!=="ACTIVE"'),"card refresh must reject stale schedules");
assert.ok(result.includes('race.scheduleStatus !== "ACTIVE"'),"result fetch must reject stale schedules");
assert.ok(odds.includes('race.scheduleStatus !== "ACTIVE"'),"odds fetch must reject stale schedules");
for(const token of ["順延 → ","開催中止","競走取りやめ"]){
  assert.ok(labels.includes(token),"race label contract missing: "+token);
}

console.log("reschedule contract: PASS");
