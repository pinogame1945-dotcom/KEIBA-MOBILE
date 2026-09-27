import assert from "node:assert/strict";
import { assertResultMatchesStoredEntries } from "../src/domain/resultArchiveGuard.ts";
import type { JraEntry, JraRaceResult } from "../src/domain/live.ts";

const entry=(horseNo:number,horseName:string,entryStatus:JraEntry["entryStatus"]="ACTIVE"):JraEntry=>({
  raceKey:"R",canonicalHorseId:null,gate:1,horseNo,horseName,entryStatus,
  sex:null,age:null,coatColor:null,carriedWeight:null,jockeyName:null,trainerName:null,
  bodyWeight:null,bodyWeightDiff:null,winOdds:null,popularity:null,sire:null,dam:null,damsire:null,
});
const result=(horseNo:number|null,horseName:string,status:JraRaceResult["resultStatus"]="FINISHED"):JraRaceResult=>({
  raceKey:"R",finishPosition:status==="FINISHED"?horseNo:null,finishRaw:status==="FINISHED"?String(horseNo):status,
  horseNo,horseName,finishTime:null,margin:null,last3f:null,average1f:null,popularity:null,resultStatus:status,
});

assert.doesNotThrow(()=>assertResultMatchesStoredEntries(
  [entry(1,"アルファ"),entry(2,"ベータ")],
  [result(1,"アルファ"),result(2,"ベータ")],
));

assert.doesNotThrow(()=>assertResultMatchesStoredEntries(
  [entry(1,"アルファ"),entry(2,"ベータ","SCRATCHED")],
  [result(1,"アルファ")],
));

assert.throws(
  ()=>assertResultMatchesStoredEntries(
    [entry(1,"アルファ"),entry(2,"ベータ")],
    [result(1,"アルファ")],
  ),
  /現役出走馬が欠け/,
);

assert.throws(
  ()=>assertResultMatchesStoredEntries(
    [entry(1,"アルファ"),entry(2,"ベータ")],
    [result(1,"アルファ"),result(1,"アルファ")],
  ),
  /同一馬番が重複/,
);

assert.throws(
  ()=>assertResultMatchesStoredEntries(
    [entry(1,"アルファ")],
    [result(2,"ベータ")],
  ),
  /出馬表外の馬番/,
);

assert.throws(
  ()=>assertResultMatchesStoredEntries(
    [entry(1,"アルファ")],
    [result(1,"ガンマ")],
  ),
  /馬名が一致しない/,
);

// Missing formal cards must not block the result-only repair path.
assert.doesNotThrow(()=>assertResultMatchesStoredEntries([], [result(1,"アルファ")]));

console.log("Result archive guard regression: PASS");
