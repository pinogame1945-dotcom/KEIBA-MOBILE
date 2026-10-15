import assert from "node:assert/strict";
import {buildL21PrebetSnapshot} from "../src/domain/l21PrebetSnapshot.ts";
import type {JraRace,JraEntry,OddsRow} from "../src/domain/live.ts";

const key="JRA_TEST_2025",url="https://www.jra.go.jp/JRADB/accessD.html";
const time="2025-01-06T13:00:00+09:00";
const race={
  raceKey:key,canonicalRaceId:"202507010212",raceDate:"2025-01-06",
  startTime:"14:30",raceStatus:"SCHEDULED",scheduleStatus:"ACTIVE",
  status:"OFFICIAL",sourceUrl:url,
} as JraRace;
const entries=[1,2,3,4].map((horseNo)=>({
  raceKey:key,canonicalHorseId:"id"+horseNo,horseNo,entryStatus:"ACTIVE",
})) as JraEntry[];
const capture={
  source_system:"KEIBA_MOBILE_JRA" as const,
  final_probe_checked:true as const,is_final:false as const,
  source_status:"LIVE" as const,
  final_probe_checked_at:"2025-01-06T13:02:00+09:00",
  bet_cutoff_at:"2025-01-06T14:25:00+09:00",
};
const row=(betType:OddsRow["betType"],a:number,b:number|null,c:number|null):OddsRow=>({
  raceKey:key,betType,selection1:a,selection2:b,selection3:c,
  odds:18.9,oddsMin:null,oddsMax:null,observedAt:time,sourceUrl:url,
});
const rows:OddsRow[]=[];
for(let a=1;a<=4;a++)rows.push(row("WIN",a,null,null));
for(let a=1;a<=4;a++)for(let b=a+1;b<=4;b++)rows.push(row("QUINELLA",a,b,null));
for(let a=1;a<=4;a++)for(let b=a+1;b<=4;b++)for(let c=b+1;c<=4;c++)rows.push(row("TRIO",a,b,c));
for(let a=1;a<=4;a++)for(let b=1;b<=4;b++)for(let c=1;c<=4;c++){
  if(a!==b&&a!==c&&b!==c)rows.push(row("TRIFECTA",a,b,c));
}
assert.equal(rows.length,38);
const result=buildL21PrebetSnapshot(race,entries,rows,capture);
assert.equal(result.odds_rows.length,38);
assert.equal(result.export_contract,"KEIBA_MOBILE_L21_PREBET_EXPORT_V1");
assert.equal(result.race.status,"OFFICIAL");
assert.equal(result.race.raceStatus,"SCHEDULED");
const rejected=(change:(a:JraRace[],e:JraEntry[],r:OddsRow[],c:typeof capture)=>void,expected:string)=>{
  const a=[{...race}];const e=entries.map(x=>({...x}));
  const r=rows.map(x=>({...x}));const c={...capture};
  change(a,e,r,c);
  assert.throws(()=>buildL21PrebetSnapshot(a[0],e,r,c),
    (err:unknown)=>err instanceof Error&&err.message.includes(expected),
    expected);
};
rejected((a)=>{a[0].status="SCHEDULED";},"NO_OFFICIAL_PRESTART_CARD");
rejected((a)=>{a[0].raceStatus="COMPLETED";},"NO_OFFICIAL_PRESTART_CARD");
rejected((a)=>{a[0].canonicalRaceId="202607010212";},"2026_HISTORICAL_REPLAY_SEALED");
rejected((_a,_e,r)=>{r.pop();},"MISSING_FULL_PHYSICAL_BET_BOOK");
rejected((_a,_e,r)=>{r.push({...r[0]});},"DUPLICATE_PHYSICAL_ODDS");
rejected((_a,_e,r)=>{r[0].observedAt="2025-01-06T13:01:00+09:00";},"ODDS_CAPTURE_MIXED_TIMES");
rejected((_a,_e,r)=>{r[0].odds=null;},"QUOTE_MISSING_OR_INVALID");
rejected((_a,_e,r)=>{r[0].sourceUrl="https://example.net";},"QUOTE_MISSING_OR_INVALID");
rejected((_a,_e,r)=>{r[0].selection1=5;},"NONSTARTER_OR_NULL");
rejected((_a,_e,_r,c)=>{c.is_final=true as never;},"FINAL_PROBE_NOT_PROVEN_NONFINAL");
rejected((_a,_e,_r,c)=>{c.final_probe_checked_at="2025-01-06T13:02:01+09:00";},"NONATOMIC_SEQUENTIAL_ODDS_CAPTURE_TOO_STALE");
rejected((_a,_e,_r,c)=>{c.final_probe_checked_at="2025-01-06T14:26:00+09:00";},"POST_CUTOFF_OR_START");
rejected((_a,_e,_r,c)=>{c.bet_cutoff_at="2025-01-06T14:40:00+09:00";},"POST_CUTOFF_OR_START");
console.log("KEIBA_MOBILE_L21_FULL_THREE_BETTYPE_PLUS_WIN_SOURCE_CONTRACT_PASS",rows.length);
