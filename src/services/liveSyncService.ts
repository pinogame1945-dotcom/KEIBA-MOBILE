import { raceStartEpoch } from "../data/jra/oddsAvailability";
import {
  getFinalOddsConfirmedAt,getFinalOddsProbeAt,getOddsAvailability,getRace,getRaceResultCompleteness,
  getWeekEntries,getWeekMeta,listRacingWeekRaces,localTodayIso,setWeekMeta,
} from "../repositories/liveRepository";
import { refreshLatestOdds } from "./oddsService";
import { refreshCurrentWeekRaceData,refreshKnownRaceStates,refreshRaceState } from "./raceRefreshService";
import { refreshOfficialRaceResult } from "./resultService";
import { refreshScheduleTarget } from "./scheduleTargetService";
import { refreshTodayVenueConditions } from "./venueConditionService";

const SCHEDULE_ATTEMPT="live_schedule_attempt_at";
const FULL_ATTEMPT="live_full_attempt_at";
const FULL_SUCCESS="live_full_success_at";
let syncPromise:Promise<void>|null=null;
const warmPromises=new Map<string,Promise<void>>();

function parsedTime(value:string|null){
  const ms=value?Date.parse(value):NaN;
  return Number.isFinite(ms)?ms:0;
}
function oddsRefreshInterval(remaining:number){
  if(remaining<=20*60*1000)return 2*60*1000;
  if(remaining<=60*60*1000)return 5*60*1000;
  return 15*60*1000;
}
async function latestOddsAt(raceKey:string){
  const rows=await getOddsAvailability(raceKey);
  return rows.reduce((latest,row)=>Math.max(latest,parsedTime(row.observedAt)),0);
}
async function refreshScheduleIfDue(onMutation?:()=>void){
  const now=Date.now();
  const last=parsedTime(await getWeekMeta(SCHEDULE_ATTEMPT));
  if(last&&now-last<30*60*1000)return;
  await setWeekMeta(SCHEDULE_ATTEMPT,new Date(now).toISOString());
  await refreshScheduleTarget(false);
  onMutation?.();
}
async function refreshCardLayer(onMutation?:()=>void){
  const now=Date.now();
  const [state,lastFull,lastAttempt]=await Promise.all([
    getWeekMeta("race_fetch_state"),getWeekMeta(FULL_SUCCESS),getWeekMeta(FULL_ATTEMPT),
  ]);
  const incomplete=state==="RUNNING"||state==="FAILED"||state==="PARTIAL";
  const fullDue=incomplete
    ?!parsedTime(lastAttempt)||now-parsedTime(lastAttempt)>=15*60*1000
    :!parsedTime(lastFull)||now-parsedTime(lastFull)>=6*60*60*1000;
  if(fullDue){
    await setWeekMeta(FULL_ATTEMPT,new Date(now).toISOString());
    const result=await refreshCurrentWeekRaceData(undefined,onMutation);
    if(result.pendingMeetings===0){
      await setWeekMeta(FULL_SUCCESS,new Date().toISOString());
    }
  }else{
    await refreshKnownRaceStates(onMutation);
  }
}
async function refreshIncompleteResults(onMutation?:()=>void){
  const races=await listRacingWeekRaces();
  const now=Date.now();
  const candidates=races
    .filter(race=>race.canonicalRaceId)
    .filter(race=>race.scheduleStatus==="ACTIVE"&&race.raceStatus!=="CANCELLED"&&race.raceStatus!=="ABANDONED")
    .filter(race=>{
      const start=raceStartEpoch(race);
      return start!=null&&start+15*60*1000<=now;
    })
    .sort((a,b)=>(raceStartEpoch(b)??0)-(raceStartEpoch(a)??0));
  let refreshed=0;
  const conditionRepairs:typeof races=[];
  for(const race of candidates){
    const completeness=await getRaceResultCompleteness(race.raceKey);
    if(completeness.resultReady){
      if(!completeness.conditionsComplete)conditionRepairs.push(race);
      continue;
    }
    if(refreshed>=4)continue;
    try{
      await refreshOfficialRaceResult(race);
      onMutation?.();
      refreshed+=1;
    }catch{}
  }

  let repairedConditions=0;
  for(const race of conditionRepairs){
    if(repairedConditions>=2)break;
    const key="condition_repair_attempt:"+race.raceKey;
    const last=parsedTime(await getWeekMeta(key));
    if(last&&now-last<30*60*1000)continue;
    await setWeekMeta(key,new Date(now).toISOString());
    try{
      await refreshOfficialRaceResult(race);
      onMutation?.();
      repairedConditions+=1;
    }catch{}
  }
}
async function refreshIncompletePayouts(){
  const races=await listRacingWeekRaces();
  const now=Date.now();
  const candidates=races
    .filter(race=>race.canonicalRaceId)
    .filter(race=>race.scheduleStatus==="ACTIVE"&&race.raceStatus!=="CANCELLED"&&race.raceStatus!=="ABANDONED")
    .filter(race=>{
      const start=raceStartEpoch(race);
      return start!=null&&start+15*60*1000<=now;
    })
    .sort((a,b)=>(raceStartEpoch(b)??0)-(raceStartEpoch(a)??0));

  for(const race of candidates){
    const state=await getRaceResultCompleteness(race.raceKey);
    if(!state.resultReady||state.payoutReady)continue;
    const key="payout_repair_attempt:"+race.raceKey;
    const last=parsedTime(await getWeekMeta(key));
    if(last&&now-last<30*60*1000)continue;
    await setWeekMeta(key,new Date(now).toISOString());
    await refreshOfficialRaceResult(race).catch(()=>undefined);
    break;
  }
}

async function refreshDueOdds(){
  const races=await listRacingWeekRaces();
  const now=Date.now(),today=localTodayIso();
  const candidates=races
    .filter(race=>
      race.raceDate===today&&race.status==="OFFICIAL"&&race.scheduleStatus==="ACTIVE"&&
      race.raceStatus!=="CANCELLED"&&race.raceStatus!=="ABANDONED"
    )
    .map(race=>({race,start:raceStartEpoch(race)}))
    .filter((item):item is {race:typeof races[number];start:number}=>
      item.start!=null&&item.start-now<=3*60*60*1000
    )
    .sort((a,b)=>Math.abs(a.start-now)-Math.abs(b.start-now));

  let attempts=0;
  for(const {race,start} of candidates){
    if(await getFinalOddsConfirmedAt(race.raceKey))continue;

    const settlement=await getRaceResultCompleteness(race.raceKey);
    if(settlement.resultReady){
      const lastProbe=parsedTime(await getFinalOddsProbeAt(race.raceKey));
      if(lastProbe&&now-lastProbe<10*60*1000)continue;
    }else{
      const last=await latestOddsAt(race.raceKey);
      if(last&&now-last<oddsRefreshInterval(start-now))continue;
    }

    try{
      const entries=await getWeekEntries(race.raceKey);
      if(entries.length){
        await refreshLatestOdds(race,entries);
        attempts+=1;
      }
    }catch{}
    if(attempts>=2)break;
  }
}

export function syncLiveCache(onMutation?:()=>void){
  if(syncPromise)return syncPromise;
  syncPromise=(async()=>{
    await refreshScheduleIfDue(onMutation).catch(()=>undefined);
    await Promise.allSettled([
      refreshTodayVenueConditions().then(()=>onMutation?.()),
      refreshCardLayer(onMutation),
      refreshIncompleteResults(onMutation),
      refreshIncompletePayouts(),
      refreshDueOdds(),
    ]);
  })().finally(()=>{syncPromise=null;});
  return syncPromise;
}

export function warmRaceData(raceKey:string,onMutation?:()=>void){
  const existing=warmPromises.get(raceKey);
  if(existing)return existing;
  const job=(async()=>{
    let race=await getRace(raceKey);
    if(!race)return;
    if(race.scheduleStatus!=="ACTIVE"||race.raceStatus==="CANCELLED"||race.raceStatus==="ABANDONED")return;
    const start=raceStartEpoch(race);
    const now=Date.now();

    if(start!=null&&start+15*60*1000<=now){
      const completeness=await getRaceResultCompleteness(raceKey);
      const repairs:Promise<unknown>[]=[];
      if(race.status!=="OFFICIAL"){
        repairs.push(refreshRaceState(race).then(()=>onMutation?.()));
      }
      if(!completeness.resultReady){
        repairs.push(refreshOfficialRaceResult(race).then(()=>onMutation?.()));
      }
      await Promise.allSettled(repairs);
      race=await getRace(raceKey)??race;
      const entries=await getWeekEntries(raceKey);
      if(race.status==="OFFICIAL"&&entries.length&&!await getFinalOddsConfirmedAt(raceKey)){
        await refreshLatestOdds(race,entries).then(()=>onMutation?.()).catch(()=>undefined);
      }
      return;
    }

    if(race.status!=="OFFICIAL"){
      await refreshRaceState(race).then(()=>onMutation?.()).catch(()=>undefined);
      race=await getRace(raceKey)??race;
      if(race.status!=="OFFICIAL")return;
    }else{
      const fetched=parsedTime(race.fetchedAt);
      if(!fetched||now-fetched>5*60*1000){
        await refreshRaceState(race).then(()=>onMutation?.()).catch(()=>undefined);
        race=await getRace(raceKey)??race;
      }
    }

    const lastOdds=await latestOddsAt(raceKey);
    const remaining=start==null?3*60*60*1000:Math.max(0,start-now);
    if(!lastOdds||now-lastOdds>oddsRefreshInterval(remaining)){
      const entries=await getWeekEntries(raceKey);
      if(entries.length){
        await refreshLatestOdds(race,entries).then(()=>onMutation?.()).catch(()=>undefined);
      }
    }
  })().finally(()=>warmPromises.delete(raceKey));
  warmPromises.set(raceKey,job);
  return job;
}
