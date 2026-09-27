import type { JraRaceCard } from "../../domain/live";
import { extractOfficialEntryRows } from "./entryTableExtractor";
import { parseJraRaceIdentity } from "./raceHeaderParser";

export function markOfficialNumberedRaceCard(html:string,card:JraRaceCard):JraRaceCard{
  const identity=parseJraRaceIdentity(card.race.sourceUrl);
  if(!identity)throw new Error("JRA正式出馬表URLではない");
  if(identity.raceDate!==card.race.raceDate||identity.venue!==card.race.venue||identity.raceNo!==card.race.raceNo){
    throw new Error("出馬表URLと解析結果のレースidentityが一致しない");
  }
  const explicit=extractOfficialEntryRows(html);
  if(!explicit.length)throw new Error("HTML上で番号付き出走馬を確認できない");
  if(explicit.some(row=>!row.explicitGate||!row.explicitHorseNo)){
    throw new Error("HTML上の正式馬番・枠番が欠けた出走馬がある");
  }
  if(card.entries.length!==explicit.length)throw new Error("HTML出走馬数と解析出走馬数が一致しない");
  const gateByNo=new Map<number,number>();
  for(const row of explicit){
    if(row.horseNo==null||row.gate==null)throw new Error("正式馬番・枠番が欠けている");
    if(gateByNo.has(row.horseNo))throw new Error("HTML上の馬番が重複している");
    gateByNo.set(row.horseNo,row.gate);
  }
  const seen=new Set<number>();
  for(const entry of card.entries){
    if(entry.horseNo==null||entry.gate==null)throw new Error("正式馬番・枠番が欠けている出走馬がある");
    if(gateByNo.get(entry.horseNo)!==entry.gate)throw new Error("解析馬番・枠番が正式出馬表と一致しない");
    if(seen.has(entry.horseNo))throw new Error("馬番が重複している");
    if(entry.raceKey!==card.race.raceKey)throw new Error("出走馬のraceKeyがレースと一致しない");
    seen.add(entry.horseNo);
  }
  return {...card,officialNumbered:true};
}
