import assert from "node:assert/strict";
import {extractOfficialEntryRows,inferGateFromHorseNo} from "../src/data/jra/entryTableExtractor.ts";

const rows=Array.from({length:10},(_,i)=>{
  const no=i+1;
  const gate=inferGateFromHorseNo(no,10);
  const gateCell=(no===8||no===10)?"":`<td rowspan="${no===7||no===9?2:1}"><img alt="枠${gate}"></td>`;
  return `<tr>${gateCell}<td>${no}</td><td><a href="/owner/${no}">馬主${no}</a><a href="/horse/${no}">テストホース${no}</a> ${3+no/10} (${no}番人気)</td><td>牡2 / 鹿 55 kg</td><td><a href="/misc/${no}">他${no}</a><a href="/jockey/${no}">騎手${no}</a></td><td><a href="/trainer/${no}">調教師${no}</a></td></tr>`;
}).join("");

const html=`
<html><body>
<div>馬名 / 単勝オッズ</div>
<table>
<tr><th rowspan="2">枠</th><th rowspan="2">馬番</th><th>馬名 / 単勝オッズ</th><th>性齢 / 毛色 負担重量</th><th>騎手</th><th>調教師</th></tr>
<tr><th>血統・馬体重</th><th>情報</th><th>補足</th><th>厩舎情報</th></tr>
${rows}
</table>
</body></html>`;

const extracted=extractOfficialEntryRows(html);
assert.equal(extracted.length,10);
assert.deepEqual(extracted.map(row=>row.horseNo),[1,2,3,4,5,6,7,8,9,10]);
assert.equal(extracted[7].gate,7,"rowspan frame must carry into the following horse row");
assert.equal(extracted[9].gate,8,"last rowspan frame must carry into the following horse row");
assert.equal(extracted[0].horseName,"テストホース1");
assert.equal(extracted[0].jockeyLinkText,"騎手1");
assert.equal(extracted[0].trainerLinkText,"調教師1");
assert.ok(extracted.every(row=>row.explicitGate&&row.explicitHorseNo));

const gateCases=[[1,8,1],[8,8,8],[7,10,7],[8,10,7],[9,10,8],[10,10,8],[13,18,7],[18,18,8]];
for(const [horseNo,fieldSize,expected] of gateCases){
  assert.equal(inferGateFromHorseNo(horseNo,fieldSize),expected);
}
console.log("JRA entry extractor runtime regression: PASS");
