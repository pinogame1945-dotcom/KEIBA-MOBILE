function isoDayNumber(iso:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return Number.NaN;
  const [year,month,day]=iso.split("-").map(Number);
  return Math.floor(Date.UTC(year,(month||1)-1,day||1)/86_400_000);
}

export function carryForwardAdjacentScheduleDates(
  cachedDates:string[],
  nextDates:string[],
  maxGapDays=3,
){
  const cached=[...new Set(cachedDates)]
    .filter(date=>Number.isFinite(isoDayNumber(date)))
    .sort();
  const next=[...new Set(nextDates)]
    .filter(date=>Number.isFinite(isoDayNumber(date)))
    .sort();

  if(!cached.length||!next.length)return next;

  const cachedLatest=cached[cached.length-1];
  const nextFirst=next[0];
  const gap=isoDayNumber(nextFirst)-isoDayNumber(cachedLatest);

  if(gap<0||gap>maxGapDays)return next;
  return [...new Set([...cached,...next])].sort();
}
