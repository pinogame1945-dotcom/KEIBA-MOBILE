import type { JraEntry, JraRaceResult } from "./live";

function normalizedHorseName(value:string){
  return value
    .replace(/[\s　]/g,"")
    .replace(/[（(]外[）)]/g,"")
    .replace(/[［\[]地[］\]]/g,"")
    .replace(/^外/,"");
}

export function assertResultMatchesStoredEntries(
  entries:JraEntry[],
  results:JraRaceResult[],
){
  if(!entries.length)return;

  const numberedEntries=entries.filter((entry):entry is JraEntry & {horseNo:number}=>entry.horseNo!=null);
  if(!numberedEntries.length)return;

  const entryByNo=new Map(numberedEntries.map(entry=>[entry.horseNo,entry]));
  const seen=new Set<number>();

  for(const row of results){
    if(row.horseNo==null||!Number.isInteger(row.horseNo)||row.horseNo<1||row.horseNo>18){
      throw new Error("結果の馬番が不正なため保存しない");
    }
    if(seen.has(row.horseNo)){
      throw new Error("結果に同一馬番が重複しているため保存しない: "+row.horseNo);
    }
    seen.add(row.horseNo);

    const entry=entryByNo.get(row.horseNo);
    if(!entry){
      throw new Error("結果に出馬表外の馬番が含まれるため保存しない: "+row.horseNo);
    }
    if(normalizedHorseName(entry.horseName)!==normalizedHorseName(row.horseName)){
      throw new Error(
        "結果と出馬表の馬名が一致しないため保存しない: "+
        row.horseNo+" "+entry.horseName+" / "+row.horseName,
      );
    }
  }

  const missingActive=numberedEntries
    .filter(entry=>entry.entryStatus==="ACTIVE"&&!seen.has(entry.horseNo))
    .map(entry=>entry.horseNo);
  if(missingActive.length){
    throw new Error("結果に現役出走馬が欠けているため保存しない: "+missingActive.join(","));
  }
}
