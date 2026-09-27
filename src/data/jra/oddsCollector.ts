import { load } from "cheerio";
import { fetchJraHtml, fetchJraPostHtml } from "./http";
import {
  clearOddsActionCacheTypes,getOddsActionCache,getWeekEntries,JraOddsBetType,
  saveOddsActionCache,saveOddsSnapshotRows,
} from "../../repositories/liveRepository";
import { parseJraRaceIdentity } from "./raceHeaderParser";
import { bracketQuinellaOffered,raceStartEpoch } from "./oddsAvailability";
import { parseCombinationRows,parseWinPlaceRows } from "./oddsParser";
import type { JraRace as JraWeekRace } from "../../domain/live";
import { isJraFinalOddsHtml } from "./oddsFinalParser";

type OddsAction={path:string;cname:string;label:string;rowText:string};
type OddsActionResolution={actions:Map<JraOddsBetType,OddsAction>;visitedPages:number};
const raceRefreshes=new Map<string,Promise<{
  betTypes:JraOddsBetType[];
  rowCount:number;
  visitedPages:number;
  missingBetTypes:JraOddsBetType[];
}>>();

const primaryRefreshes=new Map<string,Promise<{
  betTypes:JraOddsBetType[];
  rowCount:number;
  visitedPages:number;
  missingBetTypes:JraOddsBetType[];
}>>();

function oddsSnapshotCheckpoint(race:JraWeekRace,nowMs:number){
  const start=raceStartEpoch(race);
  if(start==null)return "PRELOAD";
  const remaining=start-nowMs;
  if(remaining<=0)return "POSTTIME";
  if(remaining<=5*60*1000)return "T5";
  if(remaining<=10*60*1000)return "T10";
  if(remaining<=30*60*1000)return "T30";
  return "EARLY";
}

function clean(value:string|null|undefined){return (value??"").replace(/\s+/g," ").trim();}
function extractAction(onclick:string|null|undefined):{path:string;cname:string}|null{
  const m=(onclick??"").match(/doAction\(\s*['"]([^'"]*accessO\.html)['"]\s*,\s*['"]([^'"]+)['"]/);
  return m?{path:m[1],cname:m[2]}:null;
}
function discoverActions(html:string):OddsAction[]{
  const $=load(html);const out:OddsAction[]=[];
  $("a[onclick]").each((_,a)=>{
    const action=extractAction($(a).attr("onclick"));if(!action)return;
    out.push({...action,label:clean($(a).text()),rowText:clean($(a).closest("tr").text())});
  });
  return out;
}
export async function probeJraFinalOdds(race:JraWeekRace){
  const raceHtml=await fetchJraHtml(race.sourceUrl);
  if(isJraFinalOddsHtml(raceHtml))return {isFinal:true,raceHtml,checkedPages:1};

  const landing=discoverActions(raceHtml)
    .find(action=>action.label.replace(/\s/g,"")==="オッズ");
  if(!landing)return {isFinal:false,raceHtml,checkedPages:1};

  const oddsHtml=await fetchJraPostHtml(landing.path,landing.cname);
  return {
    isFinal:isJraFinalOddsHtml(oddsHtml),
    raceHtml,
    checkedPages:2,
  };
}

function classify(label:string):JraOddsBetType|null{
  const text=label.replace(/\s/g,"");
  if(/3連単|三連単/.test(text))return "TRIFECTA";
  if(/3連複|三連複/.test(text))return "TRIO";
  if(/馬単/.test(text))return "EXACTA";
  if(/ワイド/.test(text))return "WIDE";
  if(/馬連/.test(text))return "QUINELLA";
  if(/枠連/.test(text))return "BRACKET_QUINELLA";
  if(/単勝|複勝/.test(text))return "WIN";
  return null;
}
function actionKey(action:OddsAction){return action.path+"|"+action.cname;}
function targetRaceSignature(race:JraWeekRace){
  const identity=parseJraRaceIdentity(race.sourceUrl);
  if(!identity)return null;
  return identity.venueCode+String(identity.year)+
    String(identity.meetingNo).padStart(2,"0")+
    String(identity.meetingDay).padStart(2,"0")+
    String(identity.raceNo).padStart(2,"0")+
    identity.raceDate.replace(/-/g,"");
}
function actionMatchesRace(action:OddsAction,race:JraWeekRace){
  const signature=targetRaceSignature(race);
  return signature? action.cname.includes(signature):false;
}
function navigationScore(action:OddsAction,race:JraWeekRace){
  const text=(action.label+" "+action.rowText).replace(/\s/g,"");
  const identity=parseJraRaceIdentity(race.sourceUrl);
  const raceTag=String(race.raceNo)+"R";
  const venueRace=race.venue+raceTag;
  const meetingTag=identity?identity.meetingNo+"回"+race.venue+identity.meetingDay+"日":null;
  if(text.includes(venueRace))return 1000;
  if(race.raceName&&text.includes(race.raceName.replace(/\s/g,"")))return 950;
  if(meetingTag&&text.includes(meetingTag))return 900;
  if(text.includes(raceTag)&&text.includes(race.venue))return 850;
  if(text.includes(raceTag))return 700;
  if(text.includes(race.venue))return 500;
  if(text.includes("オッズ"))return 250;
  return 0;
}
async function resolveBetTypeActions(
  race:JraWeekRace,
  initialHtml:string,
  required:JraOddsBetType[],
  maxPages=8,
):Promise<OddsActionResolution>{
  const selected=new Map<JraOddsBetType,OddsAction>();
  const visited=new Set<string>();
  let currentHtml=initialHtml,visitedPages=0;
  while(visitedPages<maxPages){
    visitedPages++;
    const actions=discoverActions(currentHtml);
    for(const action of actions){
      const betType=classify(action.label);
      if(betType&&actionMatchesRace(action,race)&&!selected.has(betType)){
        selected.set(betType,action);
      }
    }
    if(required.every(type=>selected.has(type)))break;

    const exactRace=actions.find(action=>
      actionMatchesRace(action,race)&&
      !classify(action.label)&&
      !visited.has(actionKey(action))
    );
    const next=exactRace??actions
      .filter(action=>!classify(action.label))
      .filter(action=>!visited.has(actionKey(action)))
      .map(action=>({action,score:navigationScore(action,race)}))
      .filter(item=>item.score>0).sort((a,b)=>b.score-a.score)[0]?.action;
    if(!next)break;
    visited.add(actionKey(next));
    currentHtml=await fetchJraPostHtml(next.path,next.cname);
  }
  return {actions:selected,visitedPages};
}

async function cachedOrDiscoverActions(
  race:JraWeekRace,
  required:JraOddsBetType[],
  initialRaceHtml?:string,
){
  const cached=await getOddsActionCache(race.raceKey);
  const actions=new Map<JraOddsBetType,OddsAction>();
  for(const row of cached){
    actions.set(row.betType,{path:row.path,cname:row.cname,label:row.betType,rowText:""});
  }
  if(required.every(type=>actions.has(type)))return {actions,visitedPages:0};

  const raceHtml=initialRaceHtml??await fetchJraHtml(race.sourceUrl);
  const landing=discoverActions(raceHtml).find(action=>action.label.replace(/\s/g,"")==="オッズ");
  if(!landing)return {actions,visitedPages:0};
  const landingHtml=await fetchJraPostHtml(landing.path,landing.cname);
  const resolved=await resolveBetTypeActions(race,landingHtml,required);
  for(const [type,action] of resolved.actions)actions.set(type,action);
  await saveOddsActionCache(
    race.raceKey,
    [...actions].map(([betType,action])=>({betType,path:action.path,cname:action.cname})),
  );
  return {actions,visitedPages:resolved.visitedPages};
}

async function collectWithActions(
  race:JraWeekRace,
  actions:Map<JraOddsBetType,OddsAction>,
  visitedPages:number,
  onlyTypes?:Set<JraOddsBetType>,
  checkpointOverride?:string|null,
){
  const observedAt=new Date().toISOString();
  const checkpoint=checkpointOverride??oddsSnapshotCheckpoint(race,Date.parse(observedAt));
  const savedTypes=new Set<JraOddsBetType>();
  let rowCount=0;
  for(const [betType,action] of actions){
    if(onlyTypes&&!onlyTypes.has(betType))continue;
    const html=await fetchJraPostHtml(action.path,action.cname);
    const rows=betType==="WIN"?parseWinPlaceRows(html):parseCombinationRows(html,betType);
    if(!rows.length)continue;
    await saveOddsSnapshotRows(
      race.raceKey,rows,observedAt,race.sourceUrl,race.canonicalRaceId??null,
      {checkpoint},
    );
    rows.forEach(row=>savedTypes.add(row.betType));
    rowCount+=rows.length;
  }
  return {betTypes:[...savedTypes],rowCount,visitedPages};
}

async function requiredBetTypes(race:JraWeekRace){
  const entries=await getWeekEntries(race.raceKey).catch(()=>[]);
  const bracket=bracketQuinellaOffered(entries);
  const required:JraOddsBetType[]=[
    "WIN","QUINELLA","WIDE","EXACTA","TRIO","TRIFECTA",
  ];
  if(bracket!==false)required.splice(1,0,"BRACKET_QUINELLA");
  return required;
}

async function refreshAllRaceOddsImpl(
  race:JraWeekRace,
  initialRaceHtml?:string,
  checkpointOverride?:string|null,
){
  const required=await requiredBetTypes(race);
  let resolved=await cachedOrDiscoverActions(race,required,initialRaceHtml);
  const first=await collectWithActions(
    race,resolved.actions,resolved.visitedPages,new Set(required),checkpointOverride,
  );
  let missing=required.filter(type=>!first.betTypes.includes(type));
  if(!missing.length){
    return {...first,missingBetTypes:[]};
  }

  // A missing single bet type must never force every already-successful type
  // through a second network pass. Invalidate and retry only the missing types.
  await clearOddsActionCacheTypes(race.raceKey,missing).catch(()=>undefined);
  resolved=await cachedOrDiscoverActions(race,required);
  const retry=await collectWithActions(
    race,resolved.actions,resolved.visitedPages,new Set(missing),checkpointOverride,
  );
  const betTypes=[...new Set([...first.betTypes,...retry.betTypes])];
  missing=required.filter(type=>!betTypes.includes(type));
  return {
    betTypes,
    rowCount:first.rowCount+retry.rowCount,
    visitedPages:first.visitedPages+retry.visitedPages,
    missingBetTypes:missing,
  };
}

export function refreshAllRaceOdds(
  race:JraWeekRace,
  initialRaceHtml?:string,
  checkpointOverride?:string|null,
){
  const existing=raceRefreshes.get(race.raceKey);
  if(existing){
    if(checkpointOverride==="FINAL"){
      return existing.then(()=>refreshAllRaceOdds(race,initialRaceHtml,checkpointOverride));
    }
    return existing;
  }
  const job=refreshAllRaceOddsImpl(race,initialRaceHtml,checkpointOverride)
    .finally(()=>{raceRefreshes.delete(race.raceKey);});
  raceRefreshes.set(race.raceKey,job);
  return job;
}


async function refreshPrimaryRaceOddsImpl(race:JraWeekRace){
  const required:JraOddsBetType[]=["WIN"];
  let resolved=await cachedOrDiscoverActions(race,required);
  const first=await collectWithActions(
    race,resolved.actions,resolved.visitedPages,new Set(required),
  );
  let missing=required.filter(type=>!first.betTypes.includes(type));
  if(!missing.length)return {...first,missingBetTypes:[]};

  await clearOddsActionCacheTypes(race.raceKey,missing).catch(()=>undefined);
  resolved=await cachedOrDiscoverActions(race,required);
  const retry=await collectWithActions(
    race,resolved.actions,resolved.visitedPages,new Set(missing),
  );
  const betTypes=[...new Set([...first.betTypes,...retry.betTypes])];
  missing=required.filter(type=>!betTypes.includes(type));
  return {
    betTypes,
    rowCount:first.rowCount+retry.rowCount,
    visitedPages:first.visitedPages+retry.visitedPages,
    missingBetTypes:missing,
  };
}

export function refreshPrimaryRaceOdds(race:JraWeekRace){
  const full=raceRefreshes.get(race.raceKey);
  if(full)return full;
  const existing=primaryRefreshes.get(race.raceKey);
  if(existing)return existing;
  const job=refreshPrimaryRaceOddsImpl(race)
    .finally(()=>{primaryRefreshes.delete(race.raceKey);});
  primaryRefreshes.set(race.raceKey,job);
  return job;
}

export async function refreshRaceOddsOnly(race:JraWeekRace){
  return refreshAllRaceOdds(race);
}
