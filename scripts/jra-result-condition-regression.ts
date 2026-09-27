import assert from "node:assert/strict";
import type { JraRace } from "../src/domain/live.ts";
import { parseJraRaceResultPage } from "../src/data/jra/resultParser.ts";

const race:JraRace={
  raceKey:"JRA:2026-09-27:中山:1",
  canonicalRaceId:"202606040901",
  raceDate:"2026-09-27",
  scheduledDate:"2026-09-27",
  actualDate:"2026-09-27",
  raceStatus:"COMPLETED",
  scheduleStatus:"ACTIVE",
  supersededByRaceKey:null,
  venue:"中山",
  raceNo:1,
  raceName:"2歳未勝利",
  raceClass:"未勝利",
  startTime:"10:00",
  discipline:"FLAT",
  surface:"DIRT",
  distanceM:1200,
  direction:"RIGHT",
  weather:null,
  trackCondition:null,
  sourceUrl:"https://www.jra.go.jp/JRADB/accessD.html?CNAME=test",
  fetchedAt:"2026-09-27T10:00:00+09:00",
  status:"OFFICIAL",
};

const html=`
<html><body>
<div>2026年9月27日（日曜） 4回中山9日 発走時刻：10時00分</div>
<ul><li>天候：曇</li><li>ダート：稍重</li></ul>
<table>
<tr><th>着順</th><th>馬番</th><th>馬名</th><th>タイム</th></tr>
<tr><td>1</td><td>7</td><td><a href="/horse/1">マリノエスプレッソ</a></td><td>1:11.6</td></tr>
</table>
</body></html>`;

const parsed=parseJraRaceResultPage(html,race);
assert.equal(parsed.results.length,1);
assert.equal(parsed.conditions.weather,"曇");
assert.equal(parsed.conditions.dirtCondition,"稍重");
assert.equal(parsed.conditions.turfCondition,null);

console.log("JRA result condition runtime regression: PASS");
