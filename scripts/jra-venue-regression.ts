import assert from "node:assert/strict";
import {parseVenueConditionPage} from "../src/data/jra/venueConditionParser.ts";

const html=`
<html><head><title>馬場情報（中山競馬場） JRA</title></head><body>
<h2>第4回中山競馬第9日（2026年9月27日（日曜））</h2>
<h3>馬場状態（9月25日（金曜）正午現在）</h3>
<a>馬場状態に関する基礎知識</a>
<div>天候：晴</div>
<h4>芝</h4><p>良</p>
<h4>ダート</h4><p>良</p>
<a>馬場状態に関する基礎知識</a>
<h3>芝のクッション値</h3>
</body></html>`;

const parsed=parseVenueConditionPage(html,"中山","https://www.jra.go.jp/keiba/baba/");
assert.equal(parsed.raceDate,"2026-09-27");
assert.equal(parsed.observedLabel,"9月25日（金曜）正午現在");
assert.equal(parsed.weather,"晴");
assert.equal(parsed.turfCondition,"良");
assert.equal(parsed.dirtCondition,"良");

assert.throws(
  ()=>parseVenueConditionPage(
    "<html><title>馬場情報（中山競馬場）</title><body>馬場状態 馬場状態に関する基礎知識 芝のクッション値</body></html>",
    "中山",
    "https://www.jra.go.jp/keiba/baba/",
  ),
  /天候・芝・ダート状態/,
);

console.log("JRA venue condition runtime regression: PASS");
