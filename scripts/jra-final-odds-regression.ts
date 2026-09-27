import assert from "node:assert/strict";
import {isJraFinalOddsHtml} from "../src/data/jra/oddsFinalParser.ts";

assert.equal(
  isJraFinalOddsHtml("<div>オッズは最終オッズです。</div>"),
  true,
);
assert.equal(
  isJraFinalOddsHtml("<div>このレースの最終オッズを表示しています。</div>"),
  true,
);
assert.equal(
  isJraFinalOddsHtml("<div>現在のオッズを表示しています。</div>"),
  false,
);
assert.equal(
  isJraFinalOddsHtml("<script>const help='最終オッズです';</script><div>現在オッズ</div>"),
  false,
);

console.log("JRA final odds marker regression: PASS");
