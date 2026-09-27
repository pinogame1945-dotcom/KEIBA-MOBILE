import { fetchJraHtml } from "../data/jra/http";
import { discoverVenueConditionUrl,parseVenueConditionPage } from "../data/jra/venueConditionParser";
import { getScheduleTarget,localTodayIso,saveVenueConditionSnapshot } from "../repositories/liveRepository";

const BASE="https://www.jra.go.jp/keiba/baba/";
const INTERVAL_MS=5*60*1000;
let running:Promise<number>|null=null;
let lastAttemptAt=0;

function observedDate(label:string|null,raceDate:string|null,today:string){
  const match=label?.match(/(\d{1,2})月\s*(\d{1,2})日/);
  if(match){
    const year=Number((raceDate??today).slice(0,4));
    return String(year)+"-"+String(Number(match[1])).padStart(2,"0")+"-"+String(Number(match[2])).padStart(2,"0");
  }
  return raceDate;
}

export function refreshTodayVenueConditions(force=false){
  if(running)return running;
  running=(async()=>{
    const now=Date.now();
    if(!force&&lastAttemptAt&&now-lastAttemptAt<INTERVAL_MS)return 0;
    lastAttemptAt=now;

    const today=localTodayIso();
    const target=await getScheduleTarget();
    const venues=[...new Set(
      (target?.meetings??[])
        .filter(meeting=>meeting.raceDate===today)
        .map(meeting=>meeting.venue),
    )];
    if(!venues.length)return 0;

    const baseHtml=await fetchJraHtml(BASE);
    let saved=0;
    for(const venue of venues){
      try{
        const url=discoverVenueConditionUrl(baseHtml,venue,BASE);
        if(!url)continue;
        const html=url===BASE?baseHtml:await fetchJraHtml(url);
        const snapshot=parseVenueConditionPage(html,venue,url);
        await saveVenueConditionSnapshot({
          raceDate:today,
          venue,
          weather:snapshot.weather,
          turfCondition:snapshot.turfCondition,
          dirtCondition:snapshot.dirtCondition,
          sourceObservedLabel:snapshot.observedLabel,
          sourceObservedDate:observedDate(snapshot.observedLabel,snapshot.raceDate,today),
          fetchedAt:new Date().toISOString(),
          sourceUrl:url,
        });
        saved+=1;
      }catch(error){
        console.warn("JRA venue condition refresh failed",venue,error);
      }
    }
    return saved;
  })().finally(()=>{running=null;});
  return running;
}
