import type { JraRace, JraRaceCard, ScheduleMeeting, ScheduleTarget } from "../domain/live";
import { fetchJraHtml } from "../data/jra/http";
import { markOfficialNumberedRaceCard } from "../data/jra/officialCardGuard";
import { discoverFeatureLinks,discoverRaceCardLinks,parseRaceCard } from "../data/jra/raceCardParser";
import { parseJraRaceIdentity } from "../data/jra/raceHeaderParser";
import { raceStartEpoch } from "../data/jra/oddsAvailability";
import {
  getScheduleTarget,listOfficialRacesForDates,saveOfficialCard,saveOfficialMeeting,
} from "../repositories/liveRepository";
import {
  claimNextRaceFetchItem,enqueueRaceFetchUrl,findRaceFetchUrl,finishRaceFetchRun,getRaceFetchStats,
  markRaceFetchDone,markRaceFetchFailed,prepareRaceFetchRun,
} from "./raceFetchQueue";
import { refreshScheduleTarget } from "./scheduleTargetService";

const HOME="https://www.jra.go.jp/";
const THIS_WEEK="https://www.jra.go.jp/keiba/thisweek/";
const MAX_CARD_PAGES=160;

export type RaceRefreshProgress={
  phase:"SCHEDULE"|"DISCOVERY"|"CARDS"|"DONE";
  message:string;
  current:number;
  total:number;
};

function meetingKey(venue:string,meetingNo:number,meetingDay:number){
  return venue+"|"+meetingNo+"|"+meetingDay;
}
function targetMeeting(identity:ReturnType<typeof parseJraRaceIdentity>,meetings:ScheduleMeeting[]){
  if(!identity)return null;
  return meetings.find(meeting=>
    Number(meeting.raceDate.slice(0,4))===identity.year&&
    meeting.venue===identity.venue&&
    meeting.meetingNo===identity.meetingNo&&
    meeting.meetingDay===identity.meetingDay
  )??null;
}
function metadata(url:string){
  const identity=parseJraRaceIdentity(url);
  return identity
    ?{raceDate:identity.raceDate,venue:identity.venue,raceNo:identity.raceNo}
    :{raceDate:null,venue:null,raceNo:null};
}
async function discoverSeeds(meetings:ScheduleMeeting[],onProgress?:(p:RaceRefreshProgress)=>void){
  const seeds=new Set<string>();
  const targetKeys=new Set(meetings.map(m=>meetingKey(m.venue,m.meetingNo,m.meetingDay)));
  const allCovered=()=>{
    const covered=new Set<string>();
    for(const url of seeds){
      const id=parseJraRaceIdentity(url);
      if(id)covered.add(meetingKey(id.venue,id.meetingNo,id.meetingDay));
    }
    return [...targetKeys].every(key=>covered.has(key));
  };
  const scan=async(url:string)=>{
    const html=await fetchJraHtml(url);
    for(const link of discoverRaceCardLinks(html,url)){
      if(targetMeeting(parseJraRaceIdentity(link),meetings))seeds.add(link);
    }
    return discoverFeatureLinks(html,url);
  };

  onProgress?.({phase:"DISCOVERY",message:"JRA正式出馬表入口を確認",current:0,total:1});
  let features:string[]=[];
  try{features=await scan(THIS_WEEK);}catch(error){console.warn("JRA weekly discovery failed",error);}
  for(let i=0;i<features.length&&!allCovered()&&i<16;i+=1){
    const url=features[i];
    if(!url.includes("/keiba/race/")&&!url.includes("/keiba/g1/"))continue;
    onProgress?.({phase:"DISCOVERY",message:"正式出馬表リンクを探索",current:i+1,total:Math.min(features.length,16)});
    try{await scan(url);}catch(error){console.warn("JRA feature discovery failed",url,error);}
  }
  if(!allCovered()){
    try{
      const homeFeatures=await scan(HOME);
      for(const url of homeFeatures.slice(0,10)){
        if(allCovered())break;
        if(!url.includes("/keiba/race/")&&!url.includes("/keiba/g1/"))continue;
        try{await scan(url);}catch(error){console.warn("JRA home feature discovery failed",url,error);}
      }
    }catch(error){console.warn("JRA home discovery failed",error);}
  }
  return [...seeds];
}

type CandidateMeetings=Map<string,Map<number,JraRaceCard>>;
type NavigationEvidence=Map<string,Map<string,number>>;

function signature(values:Iterable<number>){
  return [...new Set(values)].sort((a,b)=>a-b).join(",");
}
function recordEvidence(evidence:NavigationEvidence,key:string,nos:Iterable<number>){
  const sig=signature(nos);
  if(!sig)return;
  const group=evidence.get(key)??new Map<string,number>();
  group.set(sig,(group.get(sig)??0)+1);
  evidence.set(key,group);
}
function authoritativeRaceNos(meeting:ScheduleMeeting,navigation:NavigationEvidence){
  const evidence=navigation.get(meetingKey(meeting.venue,meeting.meetingNo,meeting.meetingDay));
  if(!evidence?.size)return null;
  const scheduleSig=signature(meeting.races.map(r=>r.raceNo));
  const ranked=[...evidence.entries()]
    .sort((a,b)=>b[1]-a[1]||b[0].split(",").length-a[0].split(",").length);
  for(const [sig,count] of ranked){
    if(sig===scheduleSig||count>=2){
      return sig.split(",").map(Number).filter(Number.isFinite);
    }
  }
  return null;
}

async function drainQueue(target:ScheduleTarget,onProgress?:(p:RaceRefreshProgress)=>void){
  const cards:CandidateMeetings=new Map();
  const navigation:NavigationEvidence=new Map();
  let processed=0;
  while(processed<MAX_CARD_PAGES){
    const item=await claimNextRaceFetchItem();
    if(!item)break;
    processed+=1;
    onProgress?.({
      phase:"CARDS",message:"正式出馬表を検証",current:processed,
      total:Math.max((await getRaceFetchStats()).total,1),
    });
    try{
      const html=await fetchJraHtml(item.url);
      const pageNav=new Map<string,Set<number>>();
      for(const link of discoverRaceCardLinks(html,item.url)){
        const id=parseJraRaceIdentity(link);
        const meeting=targetMeeting(id,target.meetings);
        if(!id||!meeting)continue;
        const key=meetingKey(id.venue,id.meetingNo,id.meetingDay);
        const set=pageNav.get(key)??new Set<number>();
        set.add(id.raceNo);
        pageNav.set(key,set);
        await enqueueRaceFetchUrl({url:link,targetFingerprint:target.fingerprint,...metadata(link)});
      }

      const own=parseJraRaceIdentity(item.url);
      const ownMeeting=targetMeeting(own,target.meetings);
      if(own&&ownMeeting){
        const key=meetingKey(own.venue,own.meetingNo,own.meetingDay);
        const set=pageNav.get(key)??new Set<number>();
        set.add(own.raceNo);
        pageNav.set(key,set);
      }
      for(const [key,nos] of pageNav)recordEvidence(navigation,key,nos);

      if(own&&ownMeeting){
        try{
          const card=markOfficialNumberedRaceCard(html,parseRaceCard(html,item.url));
          const key=meetingKey(own.venue,own.meetingNo,own.meetingDay);
          const group=cards.get(key)??new Map<number,JraRaceCard>();
          group.set(card.race.raceNo,card);
          cards.set(key,group);
          await markRaceFetchDone(item.url);
        }catch(error){
          await markRaceFetchFailed(item.url,item.attempts,error);
        }
      }else{
        await markRaceFetchDone(item.url);
      }
    }catch(error){
      await markRaceFetchFailed(item.url,item.attempts,error);
    }
  }
  return {cards,navigation};
}

let fullRefresh:Promise<{meetings:number;officialSaved:number;pendingMeetings:number}>|null=null;

export function refreshCurrentWeekRaceData(
  onProgress?:(p:RaceRefreshProgress)=>void,
  onMutation?:()=>void|Promise<void>,
){
  if(fullRefresh)return fullRefresh;
  fullRefresh=(async()=>{
    onProgress?.({phase:"SCHEDULE",message:"開催日程を確認",current:0,total:1});
    const target=await refreshScheduleTarget(false);
    await onMutation?.();

    await prepareRaceFetchRun(target.fingerprint);
    try{
      let stats=await getRaceFetchStats();
      if(stats.total===0){
        const seeds=await discoverSeeds(target.meetings,onProgress);
        for(const url of seeds){
          await enqueueRaceFetchUrl({url,targetFingerprint:target.fingerprint,...metadata(url)});
        }
        if(!seeds.length){
          await finishRaceFetchRun("PARTIAL","正式出馬表入口をまだ発見できない");
          return {meetings:target.meetings.length,officialSaved:0,pendingMeetings:target.meetings.length};
        }
      }

      const discovery=await drainQueue(target,onProgress);
      let officialSaved=0;
      let pendingMeetings=0;

      for(const meeting of target.meetings){
        const key=meetingKey(meeting.venue,meeting.meetingNo,meeting.meetingDay);
        const expected=authoritativeRaceNos(meeting,discovery.navigation);
        const group=discovery.cards.get(key)??new Map<number,JraRaceCard>();
        if(!expected?.length||!expected.every(no=>group.has(no))){
          pendingMeetings+=1;
          continue;
        }
        const cards=expected.map(no=>group.get(no)!).filter(Boolean);
        if(cards.length!==expected.length){
          pendingMeetings+=1;
          continue;
        }
        try{
          await saveOfficialMeeting(cards,expected);
          officialSaved+=cards.length;
          await onMutation?.();
        }catch(error){
          pendingMeetings+=1;
          console.warn("Verified JRA meeting save deferred",key,error);
        }
      }

      stats=await getRaceFetchStats();
      const partial=
        pendingMeetings>0||stats.failed>0||stats.pending>0||stats.retry>0||stats.fetching>0;
      await finishRaceFetchRun(
        partial?"PARTIAL":"COMPLETED",
        partial?"一部レースの正式化を保留":null,
      );
      onProgress?.({
        phase:"DONE",
        message:partial
          ?officialSaved+"R更新 / "+pendingMeetings+"開催保留"
          :officialSaved+"Rの正式出馬表を更新",
        current:target.meetings.length-pendingMeetings,
        total:target.meetings.length,
      });
      return {meetings:target.meetings.length,officialSaved,pendingMeetings};
    }catch(error){
      await finishRaceFetchRun(
        "FAILED",
        error instanceof Error?error.message:String(error),
      ).catch(()=>undefined);
      throw error;
    }
  })().finally(()=>{fullRefresh=null;});
  return fullRefresh;
}

async function resolveSingleSource(race:JraRace){
  if(race.status==="OFFICIAL"&&race.sourceUrl.includes("/JRADB/accessD.html")){
    return race.sourceUrl;
  }
  const queued=await findRaceFetchUrl(race.raceDate,race.venue,race.raceNo);
  if(queued?.url)return queued.url;

  const target=await getScheduleTarget();
  const meeting=target?.meetings.find(m=>
    m.raceDate===race.raceDate&&m.venue===race.venue&&
    m.races.some(r=>r.raceNo===race.raceNo)
  );
  if(!meeting)return null;
  const seeds=await discoverSeeds([meeting]);
  return seeds.find(url=>parseJraRaceIdentity(url)?.raceNo===race.raceNo)??null;
}

export async function refreshRaceState(race:JraRace){
  const sourceUrl=await resolveSingleSource(race);
  if(!sourceUrl)throw new Error("このレースの正式出馬表URLをまだ発見できない");
  const html=await fetchJraHtml(sourceUrl);
  const card=markOfficialNumberedRaceCard(html,parseRaceCard(html,sourceUrl));
  await saveOfficialCard(card);
  return card;
}

function knownInterval(race:JraRace,now:number){
  const start=raceStartEpoch(race);
  if(start==null)return 30*60*1000;
  const remaining=start-now;
  if(remaining<=0)return Number.POSITIVE_INFINITY;
  if(remaining<=60*60*1000)return 3*60*1000;
  if(remaining<=3*60*60*1000)return 10*60*1000;
  return 30*60*1000;
}

let knownRefresh:Promise<void>|null=null;
export function refreshKnownRaceStates(onMutation?:()=>void|Promise<void>){
  if(knownRefresh)return knownRefresh;
  knownRefresh=(async()=>{
    const target=await getScheduleTarget();
    if(!target)return;
    const now=Date.now();
    const races=await listOfficialRacesForDates(target.dates);
    const candidates=races
      .filter(race=>{
        const start=raceStartEpoch(race);
        if(start!=null&&start<=now)return false;
        const fetched=Date.parse(race.fetchedAt);
        return !Number.isFinite(fetched)||now-fetched>=knownInterval(race,now);
      })
      .sort((a,b)=>(raceStartEpoch(a)??Infinity)-(raceStartEpoch(b)??Infinity));

    for(const race of candidates.slice(0,4)){
      try{
        await refreshRaceState(race);
        await onMutation?.();
      }catch(error){
        console.warn("Known race refresh failed",race.raceKey,error);
      }
    }
  })().finally(()=>{knownRefresh=null;});
  return knownRefresh;
}

export const refreshDueRaceStates=refreshKnownRaceStates;
export function refreshTodayRaceData(
  onProgress?:(p:RaceRefreshProgress)=>void,
  onMutation?:()=>void|Promise<void>,
){
  return refreshCurrentWeekRaceData(onProgress,onMutation);
}
