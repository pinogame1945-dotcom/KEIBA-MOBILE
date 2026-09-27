import type { ScheduleTarget } from "../domain/live";
import { fetchJraHtml } from "../data/jra/http";
import { calendarDayUrl,parseCalendarDay,scheduleTargetFingerprint } from "../data/jra/scheduleParser";
import { getScheduleTarget,localTodayIso,saveScheduleTarget } from "../repositories/liveRepository";

const FRESH_MS=30*60*1000;
function shiftDate(iso:string,days:number){
  const [y,m,d]=iso.split("-").map(Number);
  const date=new Date(Date.UTC(y,m-1,d));date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}
function dayDistance(a:string,b:string){
  const am=Date.parse(a+"T00:00:00Z"),bm=Date.parse(b+"T00:00:00Z");
  return Number.isFinite(am)&&Number.isFinite(bm)?Math.round(Math.abs(am-bm)/86400000):999;
}
function fresh(target:ScheduleTarget|null){
  const ms=target?Date.parse(target.fetchedAt):NaN;
  return Number.isFinite(ms)&&Date.now()-ms<FRESH_MS;
}
export async function refreshScheduleTarget(force=false):Promise<ScheduleTarget>{
  const cached=await getScheduleTarget();if(!force&&fresh(cached))return cached!;
  const today=localTodayIso(),found=new Map<string,{url:string;meetings:ScheduleTarget["meetings"]}>();
  for(const offset of [0,-1,1,-2,2,-3,3,4]){
    const date=shiftDate(today,offset),url=calendarDayUrl(date);
    try{const meetings=parseCalendarDay(await fetchJraHtml(url),url);if(meetings.length)found.set(date,{url,meetings});}catch{}
  }
  if(!found.size){if(cached)return cached;throw new Error("JRA開催日程から対象開催日を発見できない");}
  const dates=[...found.keys()].sort();
  const anchor=dates.map(date=>({date,distance:dayDistance(date,today)})).sort((a,b)=>a.distance-b.distance||a.date.localeCompare(b.date))[0].date;
  const selected=dates.filter(date=>dayDistance(date,anchor)<=3).sort();
  const meetings:ScheduleTarget["meetings"]=[],sourceUrls:string[]=[];
  for(const date of selected){const item=found.get(date);if(item){meetings.push(...item.meetings);sourceUrls.push(item.url);}}
  const target:ScheduleTarget={fetchedAt:new Date().toISOString(),dates:[...new Set(meetings.map(m=>m.raceDate))].sort(),meetings,sourceUrls:[...new Set(sourceUrls)],fingerprint:""};
  target.fingerprint=scheduleTargetFingerprint(target);await saveScheduleTarget(target);return target;
}
