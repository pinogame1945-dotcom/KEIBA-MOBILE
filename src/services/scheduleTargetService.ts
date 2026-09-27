import type { ScheduleTarget } from "../domain/live";
import { fetchJraHtml } from "../data/jra/http";
import { calendarDayUrl,parseCalendarDay,parseCalendarDisruptions,scheduleTargetFingerprint } from "../data/jra/scheduleParser";
import { getScheduleTarget,localTodayIso,saveScheduleTarget } from "../repositories/liveRepository";

const FRESH_MS=30*60*1000;

function shiftDate(iso:string,days:number){
  const [y,m,d]=iso.split("-").map(Number);
  const date=new Date(Date.UTC(y,m-1,d));
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}
function dayDistance(a:string,b:string){
  const am=Date.parse(a+"T00:00:00Z"),bm=Date.parse(b+"T00:00:00Z");
  return Number.isFinite(am)&&Number.isFinite(bm)?Math.abs(am-bm)/86400000:Number.POSITIVE_INFINITY;
}
function fresh(target:ScheduleTarget|null){
  const ms=target?Date.parse(target.fetchedAt):NaN;
  return Number.isFinite(ms)&&Date.now()-ms<FRESH_MS;
}

export async function refreshScheduleTarget(force=false):Promise<ScheduleTarget>{
  const cached=await getScheduleTarget();
  if(!force&&fresh(cached))return cached!;

  const today=localTodayIso();
  const cachedDates=cached?.dates.length?[...cached.dates].sort():[];
  const cachedLatest=cachedDates.length?cachedDates[cachedDates.length-1]:null;
  const probeDates:string[]=[];

  if(cached&&cachedLatest&&cachedLatest>=today){
    probeDates.push(...cachedDates);
    for(let offset=1;offset<=3;offset+=1)probeDates.push(shiftDate(cachedLatest,offset));
  }else{
    // Fresh install on a race Sunday must still recover Saturday.
    probeDates.push(shiftDate(today,-1));
    for(let offset=0;offset<=10;offset+=1)probeDates.push(shiftDate(today,offset));
  }

  const parsedByDate=new Map<string,{url:string;meetings:ScheduleTarget["meetings"];disruptions:ScheduleTarget["disruptions"]}>();
  let firstFutureDate:string|null=null;
  for(const date of [...new Set(probeDates)].sort()){
    if((!cachedLatest||cachedLatest<today)&&firstFutureDate&&date>=today&&dayDistance(firstFutureDate,date)>3)break;
    const url=calendarDayUrl(date);
    try{
      const html=await fetchJraHtml(url);
      const disruptions=parseCalendarDisruptions(html,url);
      let meetings:ScheduleTarget["meetings"]=[];
      try{
        meetings=parseCalendarDay(html,url);
      }catch{
        // A fully cancelled page can legitimately contain no normal race table.
      }
      if(!meetings.length&&!disruptions.length)continue;
      parsedByDate.set(date,{url,meetings,disruptions});
      if(date>=today&&firstFutureDate==null&&(meetings.length||disruptions.length))firstFutureDate=date;
    }catch{
      // Missing calendar pages never erase a verified cached target.
    }
  }

  let selectedDates:string[];
  if(cached&&cachedLatest&&cachedLatest>=today){
    const knownStart=cachedDates[0];
    const discovered=[...parsedByDate.keys()].sort();
    selectedDates=discovered.filter(date=>date>=knownStart&&dayDistance(knownStart,date)<=6);
    if(!selectedDates.length)selectedDates=cachedDates;
  }else{
    const discovered=[...parsedByDate.keys()].sort();
    const yesterday=shiftDate(today,-1);
    const yesterdayIsRace=parsedByDate.has(yesterday);
    const future=discovered.filter(date=>date>=today);
    if(!future.length){
      if(cached)return cached;
      throw new Error("JRA開催日程から次回開催日を発見できない");
    }
    const first=future[0];
    selectedDates=future.filter(date=>dayDistance(first,date)<=3);
    if(yesterdayIsRace&&dayDistance(yesterday,first)<=1)selectedDates=[yesterday,...selectedDates];
  }

  const meetings:ScheduleTarget["meetings"]=[],disruptions:ScheduleTarget["disruptions"]=[],sourceUrls:string[]=[];
  for(const date of [...new Set(selectedDates)].sort()){
    const parsed=parsedByDate.get(date);
    if(parsed){
      const parsedMeetings=parsed.meetings.length
        ? parsed.meetings
        : cached?.meetings.filter(meeting=>meeting.raceDate===date) ?? [];
      meetings.push(...parsedMeetings);
      disruptions.push(...parsed.disruptions);
      sourceUrls.push(parsed.url);
    }else if(cached){
      meetings.push(...cached.meetings.filter(meeting=>meeting.raceDate===date));
      disruptions.push(...((cached.disruptions ?? []).filter(item=>item.raceDate===date)));
      sourceUrls.push(calendarDayUrl(date));
    }
  }
  if(!meetings.length){
    if(cached)return cached;
    throw new Error("JRA開催日程の対象開催を解析できない");
  }

  const target:ScheduleTarget={
    fetchedAt:new Date().toISOString(),
    dates:[...new Set(meetings.map(meeting=>meeting.raceDate))].sort(),
    meetings,
    disruptions,
    sourceUrls:[...new Set(sourceUrls)],
    fingerprint:"",
  };
  target.fingerprint=scheduleTargetFingerprint(target);
  await saveScheduleTarget(target);
  return target;
}
