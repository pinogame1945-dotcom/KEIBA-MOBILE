import { load } from "cheerio";
import type { JraEntry, JraRaceCard } from "../../domain/live";
import { absoluteJraUrl } from "./http";
import { extractOfficialEntryRows, inferGateFromHorseNo } from "./entryTableExtractor";
import { parseJraRaceHeader, parseJraRaceIdentity } from "./raceHeaderParser";

function clean(value:string|null|undefined){return (value??"").replace(/\s+/g," ").trim();}
function toInt(value:string|undefined|null){const n=Number.parseInt((value??"").replace(/,/g,""),10);return Number.isFinite(n)?n:null;}
function toFloat(value:string|undefined|null){const n=Number.parseFloat((value??"").replace(/,/g,""));return Number.isFinite(n)?n:null;}
function canonicalSex(value:string|null|undefined){return value==="せん"||value==="セン"||value==="騸"||value==="セ"?"セ":value??null;}
function cleanJockeyName(value:string|null|undefined){
  const normalized=clean(value).replace(/^(?:騎手[：:\s]*)/,"").replace(/^[☆★△▲▽▼◇◆]+/,"").trim();
  return normalized||null;
}
function pushJraUrl(out:Set<string>,href:string,baseUrl:string){
  const url=absoluteJraUrl(href,baseUrl);
  if(!url||!url.includes("/JRADB/accessD.html"))return;
  try{
    const parsed=new URL(url),cname=parsed.searchParams.get("CNAME");
    if(!cname||!cname.includes("pw01dde"))return;
    out.add(url);
  }catch{}
}
export function discoverFeatureLinks(html:string,baseUrl:string){
  const $=load(html),out=new Set<string>();
  $("a[href]").each((_,el)=>{
    const href=$(el).attr("href")??"";
    if(!href.includes("/keiba/race/")&&!href.includes("/keiba/g1/")&&!href.includes("/JRADB/accessD.html"))return;
    const url=absoluteJraUrl(href,baseUrl);if(url)out.add(url);
  });
  return [...out];
}
export function discoverRaceCardLinks(html:string,baseUrl:string){
  const $=load(html),out=new Set<string>();
  $("a[href]").each((_,el)=>{const href=$(el).attr("href")??"";if(href.includes("/JRADB/accessD.html"))pushJraUrl(out,href,baseUrl);});
  const fullPath=/(?:https?:\/\/(?:www\.)?jra\.go\.jp)?(\/JRADB\/accessD\.html\?CNAME=[^"'<>\s]+)/g;
  for(const match of html.matchAll(fullPath))pushJraUrl(out,match[1].replace(/&amp;/g,"&"),baseUrl);
  const cname=/(pw01dde[0-9A-Za-z%/_-]{12,})/g;
  for(const match of html.matchAll(cname))pushJraUrl(out,"/JRADB/accessD.html?CNAME="+match[1].replace(/&amp;/g,"&"),baseUrl);
  return [...out];
}
export function parseRaceCard(html:string,sourceUrl:string):JraRaceCard{
  if(!parseJraRaceIdentity(sourceUrl))throw new Error("JRA正式出馬表URLではない");
  const race=parseJraRaceHeader(html,sourceUrl);
  const raw=extractOfficialEntryRows(html);
  if(!raw.length)throw new Error("JRA出馬表から出走馬を取得できない");
  const fieldSize=Math.max(raw.length,...raw.map(row=>row.horseNo??0));
  const entries:JraEntry[]=raw.map(row=>{
    const rowText=row.rowText,horseText=row.horseCellText;
    const status:JraEntry["entryStatus"]=rowText.includes("除外")?"EXCLUDED":rowText.includes("取消")?"SCRATCHED":"ACTIVE";
    const body=horseText.match(/(\d{3})\s*kg\s*\(([+-]?\d+)\)/)??rowText.match(/(\d{3})\s*kg\s*\(([+-]?\d+)\)/);
    const sexAge=(row.sexCellText||rowText).match(/(牡|牝|セ|せん)(\d+)\s*[/／]?\s*([^\s]*)/);
    const carried=(row.sexCellText||rowText).match(/(\d{2}(?:\.\d)?)\s*kg/);
    const odds=horseText.match(/(\d+(?:\.\d+)?)\s*\((\d+)番人気\)/);
    const pedigree=horseText+" "+rowText;
    const sire=pedigree.match(/父[：:]\s*([^\s]+)/)?.[1]??null;
    const dam=pedigree.match(/母[：:]\s*([^\s(]+)(?:\(母の父[：:]\s*([^)]+)\))?/);
    return {
      raceKey:race.raceKey,canonicalHorseId:null,
      gate:row.gate??inferGateFromHorseNo(row.horseNo,fieldSize),horseNo:row.horseNo,horseName:row.horseName,
      entryStatus:status,sex:canonicalSex(sexAge?.[1]),age:sexAge?Number(sexAge[2]):null,
      coatColor:clean(sexAge?.[3])||null,carriedWeight:toFloat(carried?.[1]),
      jockeyName:cleanJockeyName(row.jockeyLinkText||row.jockeyCellText),
      trainerName:clean(row.trainerLinkText||row.trainerCellText)||null,
      bodyWeight:toInt(body?.[1]),bodyWeightDiff:body?Number(body[2]):null,
      winOdds:toFloat(odds?.[1]),popularity:toInt(odds?.[2]),sire,dam:dam?.[1]??null,damsire:dam?.[2]??null,
    };
  });
  return {race,entries,officialNumbered:false};
}
