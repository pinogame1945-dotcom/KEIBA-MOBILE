import type { JraEntry, JraRace, OddsBetType, OddsRow } from "./live";

/** Strict read-only L2.1 input export. Nothing here predicts or places bets.
 * An original JRA FINAL-state probe must be executed AFTER reading the
 * complete original same-capture market snapshot and before the cutoff.
 */
export type L21CaptureEvidence={
  source_system:"KEIBA_MOBILE_JRA";
  final_probe_checked:true;
  is_final:false;
  source_status:"LIVE";
  final_probe_checked_at:string;
  bet_cutoff_at:string;
};

export type L21PrebetSnapshot={
  race:JraRace;
  entries:JraEntry[];
  odds_rows:OddsRow[];
  capture:L21CaptureEvidence;
  export_contract:"KEIBA_MOBILE_L21_PREBET_EXPORT_V1";
  export_note:"CANDIDATE_ONLY_NOT_SERVER_TIMESTAMP_ATTESTED";
};

const TYPES=["WIN","QUINELLA","TRIO","TRIFECTA"] as const satisfies readonly OddsBetType[];
type Needed=typeof TYPES[number];

function iso(s:string,label:string){
  const x=Date.parse(s);
  if(!Number.isFinite(x)||!/(Z|[+-]\d\d:\d\d)$/.test(s)){
    throw new Error("L21_INVALID_TIME_"+label);
  }
  return x;
}
function selection(typ:Needed,nums:number[]){
  const list=typ==="WIN"?nums.slice(0,1):nums;
  if(new Set(list).size!==list.length||list.some(n=>!Number.isInteger(n)||n<1||n>18)){
    throw new Error("L21_INVALID_HORSE_SELECTION");
  }
  if(typ!=="TRIFECTA")list.sort((a,b)=>a-b);
  return typ+":"+list.join("-");
}
function choose(n:number,k:number){
  let v=1;
  for(let i=1;i<=k;i++)v=v*(n-i+1)/i;
  return Math.round(v);
}

/** Rejects missing physical combinations rather than exporting a partial book.
 * For N starters needs N WIN + C(N,2) QUINELLA + C(N,3) TRIO +
 * N*(N-1)*(N-2) TRIFECTA independent prices.
 */
export function buildL21PrebetSnapshot(
  race:JraRace, entries:JraEntry[], rows:OddsRow[], evidence:L21CaptureEvidence,
):L21PrebetSnapshot{
  if(!/^202[2-5]\d{8}$/.test(race.canonicalRaceId??"")){
    throw new Error("L21_CANONICAL_RACE_ID_REQUIRED_2026_SEALED");
  }
  if(race.status!=="OFFICIAL"||race.raceStatus!=="SCHEDULED"||
     race.scheduleStatus!=="ACTIVE"){
    throw new Error("L21_NO_OFFICIAL_PRESTART_CARD");
  }
  if(!/^\d{4}-\d\d-\d\d$/.test(race.raceDate)||
     !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(race.startTime??"")){
    throw new Error("L21_MISSING_RACE_CLOCK");
  }
  const start=iso(race.raceDate+"T"+race.startTime+":00+09:00","START");
  const end=iso(evidence.bet_cutoff_at,"CUTOFF");
  const probe=iso(evidence.final_probe_checked_at,"PROBE");
  if(!(probe<end&&end<start)){
    throw new Error("L21_POST_CUTOFF_OR_START_FINAL_PROBE");
  }
  if(evidence.source_system!=="KEIBA_MOBILE_JRA"||
     evidence.final_probe_checked!==true||
     evidence.is_final!==false||evidence.source_status!=="LIVE"){
    throw new Error("L21_FINAL_PROBE_NOT_PROVEN_NONFINAL");
  }
  const url=new URL(race.sourceUrl);
  if(url.protocol!=="https:"||!["www.jra.go.jp","jra.go.jp","www.jra.jp","jra.jp"].includes(url.hostname)){
    throw new Error("L21_UNTRUSTED_JRA_RACE_SOURCE");
  }
  const starters=entries.filter(e=>e.entryStatus==="ACTIVE");
  const nos=starters.map(e=>{
    if(e.raceKey!==race.raceKey||!Number.isInteger(e.horseNo)||e.horseNo==null||
       e.horseNo<1||e.horseNo>18||!e.canonicalHorseId){
      throw new Error("L21_ACTIVE_HORSE_ID_OR_NUMBER_MISSING");
    }
    return e.horseNo;
  });
  if(nos.length<3||nos.length>18||new Set(nos).size!==nos.length||
     entries.some(e=>e.raceKey!==race.raceKey)){
    throw new Error("L21_ENTRY_FIELD_NOT_UNIQUE");
  }
  const active=new Set(nos);
  const required:Record<Needed,number>={
    WIN:nos.length, QUINELLA:choose(nos.length,2),
    TRIO:choose(nos.length,3),
    TRIFECTA:nos.length*(nos.length-1)*(nos.length-2),
  };
  const seen=new Set<string>();
  const observed=new Set<string>();
  const counters:Record<Needed,number>={WIN:0,QUINELLA:0,TRIO:0,TRIFECTA:0};
  if(!rows.length)throw new Error("L21_NO_ODDS_SNAPSHOT");
  for(const row of rows){
    if(!TYPES.some(t=>t===row.betType)){
      throw new Error("L21_BET_TYPE_OUTSIDE_FROZEN_STANDARD");
    }
    const bet=row.betType as Needed;
    if(row.raceKey!==race.raceKey||row.sourceUrl!==race.sourceUrl||
       !Number.isFinite(row.odds)||row.odds==null||row.odds<1||
       row.oddsMin!=null||row.oddsMax!=null){
      throw new Error("L21_QUOTE_MISSING_OR_INVALID");
    }
    const raw=bet==="WIN"
      ?[row.selection1]:(bet==="QUINELLA"
        ?[row.selection1,row.selection2]:[row.selection1,row.selection2,row.selection3]);
    if(raw.some(n=>n==null||!active.has(n))){
      throw new Error("L21_NONSTARTER_OR_NULL_SELECTION");
    }
    if(bet==="WIN"&&(row.selection2!=null||row.selection3!=null)||
       bet==="QUINELLA"&&row.selection3!=null){
      throw new Error("L21_QUOTE_ARITY_INVALID");
    }
    const ticket=selection(bet,raw as number[]);
    if(seen.has(ticket))throw new Error("L21_DUPLICATE_PHYSICAL_ODDS");
    seen.add(ticket);
    observed.add(row.observedAt);
    counters[bet]++;
  }
  if(observed.size!==1)throw new Error("L21_ODDS_CAPTURE_MIXED_TIMES");
  const observedAt=[...observed][0];
  const observedMs=iso(observedAt,"ODDS");
  if(!(observedMs<=probe&&probe<end)){
    throw new Error("L21_QUOTES_NOT_PROBED_BEFORE_CUTOFF");
  }
  for(const type of TYPES){
    if(counters[type]!==required[type]){
      throw new Error("L21_MISSING_FULL_PHYSICAL_BET_BOOK_"+type+"_"+
        counters[type]+"_of_"+required[type]);
    }
  }
  return {
    race,entries,odds_rows:rows,capture:evidence,
    export_contract:"KEIBA_MOBILE_L21_PREBET_EXPORT_V1",
    export_note:"CANDIDATE_ONLY_NOT_SERVER_TIMESTAMP_ATTESTED",
  };
}
