export type StoredRaceDaySummary = {
  raceDate: string;
  raceCount: number;
  resultCount: number;
};

export type StoredRaceWeek = {
  key: string;
  dates: string[];
  startDate: string;
  endDate: string;
  raceCount: number;
  resultCount: number;
};

function isoDayNumber(iso:string){
  const [year,month,day]=iso.split("-").map(Number);
  return Math.floor(Date.UTC(year,Math.max(0,(month||1)-1),day||1)/86_400_000);
}

export function groupStoredRaceWeeks(rows:StoredRaceDaySummary[]):StoredRaceWeek[]{
  const sorted=[...rows]
    .filter(row=>/^\d{4}-\d{2}-\d{2}$/.test(row.raceDate))
    .sort((a,b)=>a.raceDate.localeCompare(b.raceDate));
  if(!sorted.length)return [];

  const groups:StoredRaceDaySummary[][]=[];
  for(const row of sorted){
    const current=groups[groups.length-1];
    if(!current){
      groups.push([row]);
      continue;
    }
    const previous=current[current.length-1];
    const gap=isoDayNumber(row.raceDate)-isoDayNumber(previous.raceDate);
    if(gap>=0&&gap<=3)current.push(row);
    else groups.push([row]);
  }

  return groups.map(group=>{
    const dates=group.map(row=>row.raceDate);
    return {
      key:dates[0]+".."+dates[dates.length-1],
      dates,
      startDate:dates[0],
      endDate:dates[dates.length-1],
      raceCount:group.reduce((sum,row)=>sum+row.raceCount,0),
      resultCount:group.reduce((sum,row)=>sum+row.resultCount,0),
    };
  }).reverse();
}
