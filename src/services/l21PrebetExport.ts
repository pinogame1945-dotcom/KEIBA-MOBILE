import { probeJraFinalOdds } from "../data/jra/oddsCollector";
import {
  getFinalOddsConfirmedAt,
  getL21OriginalOddsRowsAt,
  getOddsAvailability,
  getRace,
  getWeekEntries,
} from "../repositories/liveRepository";
import { buildL21PrebetSnapshot } from "../domain/l21PrebetSnapshot";
import type { L21PrebetSnapshot } from "../domain/l21PrebetSnapshot";

/** Read-only export candidate, to be explicitly handed to KEIBA-ML.
 * A betting cutoff time must be supplied by a separately validated source;
 * never manufacture one as "post time minus 5 minutes".
 *
 * This performs a fresh JRA FINAL probe after reading the full exact
 * odds_history observedAt snapshot and before accepting the report.
 * NO betting/financial instructions are generated or carried out.
 *
 * Note: observedAt is the client capture group's recorded time, not an
 * independently authenticated JRA server publication timestamp.
 */
export async function exportL21PrebetCandidate(
  raceKey:string,betCutoffAt:string,
):Promise<L21PrebetSnapshot>{
  const race=await getRace(raceKey);
  if(!race||race.status!=="OFFICIAL"||
     race.raceStatus!=="SCHEDULED"||race.scheduleStatus!=="ACTIVE"){
    throw new Error("L21_NO_ACTIVE_OFFICIAL_PRESTART_RACE");
  }
  if(!race.canonicalRaceId)throw new Error("L21_CANONICAL_RACE_ID_MISSING");
  if(await getFinalOddsConfirmedAt(raceKey)){
    throw new Error("L21_ALREADY_MARKED_FINAL");
  }
  const entries=await getWeekEntries(raceKey);
  const types=["WIN","QUINELLA","TRIO","TRIFECTA"] as const;
  const available=await getOddsAvailability(raceKey);
  const timestamps=types.map(type=>available.find(x=>x.betType===type)?.observedAt);
  if(timestamps.some(x=>!x)||new Set(timestamps).size!==1){
    throw new Error("L21_NO_SINGLE_FOUR_BETTYPE_SNAPSHOT");
  }
  const observedAt=timestamps[0]!;
  const rows=await getL21OriginalOddsRowsAt(raceKey,observedAt);
  if(!rows.length)throw new Error("L21_SNAPSHOT_HISTORY_EMPTY");
  const cutoff=Date.parse(betCutoffAt);
  if(!Number.isFinite(cutoff)||Date.now()>=cutoff){
    throw new Error("L21_ALREADY_PAST_USER_PROVEN_BET_CUTOFF");
  }
  const probe=await probeJraFinalOdds(race);
  const checkedAt=new Date().toISOString();
  if(probe.isFinal){
    throw new Error("L21_JRA_MARKS_ODDS_FINAL");
  }
  if(Date.parse(checkedAt)>=cutoff){
    throw new Error("L21_PROBE_COMPLETED_AFTER_CUTOFF");
  }
  return buildL21PrebetSnapshot(race,entries,rows,{
    source_system:"KEIBA_MOBILE_JRA",
    final_probe_checked:true,
    is_final:false,
    source_status:"LIVE",
    final_probe_checked_at:checkedAt,
    bet_cutoff_at:betCutoffAt,
  });
}
