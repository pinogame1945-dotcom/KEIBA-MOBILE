import assert from "node:assert/strict";
import {extractOfficialEntryRows,inferGateFromHorseNo} from "../src/data/jra/entryTableExtractor.ts";
import {parseRaceCard} from "../src/data/jra/raceCardParser.ts";
import {markOfficialNumberedRaceCard} from "../src/data/jra/officialCardGuard.ts";

const url="https://www.jra.go.jp/JRADB/accessD.html?CNAME=pw01dde0106202604090220260927%2F00";
const rows=Array.from({length:10},(_,i)=>{
  const no=i+1;
  const gate=inferGateFromHorseNo(no,10);
  const gateCell=(no===8||no===10)?"":`<td rowspan="${no===7||no===9?2:1}"><img alt="枠${gate}"></td>`;
  return `<tr>${gateCell}<td>${no}</td><td><a href="/horse/${no}">テストホース${no}</a> ${3+no/10} (${no}番人気)</td><td>牡2 / 鹿 55 kg</td><td><a href="/jockey/${no}">騎手${no}</a></td></tr>`;
}).join("");
const html=`
<html><body>
<div>ここから本文です 2026年9月27日 4回中山9日 2レース 発走時刻：10時25分</div>
<h2>2歳未勝利</h2>
<div>コース：2,000メートル（芝・右） 天候：晴 芝の状態：良</div>
<div>馬名 / 単勝オッズ</div>
<table>
<tr><th rowspan="2">枠</th><th rowspan="2">馬番</th><th>馬名 / 単勝オッズ</th><th>性齢 / 毛色 負担重量</th><th>騎手</th></tr>
<tr><th>血統・馬体重</th><th>調教師</th><th>情報</th></tr>
${rows}
</table>
</body></html>`;

const extracted=extractOfficialEntryRows(html);
assert.equal(extracted.length,10);
assert.deepEqual(extracted.map(row=>row.horseNo),[1,2,3,4,5,6,7,8,9,10]);
assert.equal(extracted[7].gate,7,"rowspan frame must carry into the following horse row");
assert.equal(extracted[9].gate,8,"last rowspan frame must carry into the following horse row");

const card=markOfficialNumberedRaceCard(html,parseRaceCard(html,url));
assert.equal(card.entries.length,10);
assert.equal(card.entries[7].gate,7);
assert.equal(card.entries[9].gate,8);
assert.equal(card.race.weather,"晴");
assert.equal(card.race.trackCondition,"良");

console.log("JRA entry parser runtime regression: PASS");
