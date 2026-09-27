import assert from "node:assert/strict";
import type { JraRace } from "../src/domain/live.ts";
import { parseNetkeibaRaceResultPage } from "../src/data/netkeiba/resultParser.ts";

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
  sourceUrl:"https://www.jra.go.jp/JRADB/accessD.html",
  fetchedAt:"2026-09-27T10:00:00+09:00",
  status:"OFFICIAL",
};

const html=`
<html><body>
<div class="data_intro">2026年9月27日 中山1R 2歳未勝利 天候 : 曇</div>
<div class="RaceData01">ダ1200m / 発走10:00</div>
<div class="RaceData02">ダート : 良</div>
<table class="RaceTable01">
<tr><th>着順</th><th>馬番</th><th>馬名</th><th>タイム</th><th>人気</th></tr>
<tr><td>1</td><td>3</td><td><a href="/horse/1">テストホース</a></td><td>1:12.3</td><td>1</td></tr>
</table>
</body></html>`;

const parsed=parseNetkeibaRaceResultPage(html,race);
assert.equal(parsed.results.length,1);
assert.equal(parsed.conditions.weather,"曇");
assert.equal(parsed.conditions.dirtCondition,"良",
  "track condition must be recovered from RaceData02 even when data_intro is selected as primary meta");
assert.equal(parsed.conditions.turfCondition,null);

console.log("netkeiba result condition regression: PASS");
