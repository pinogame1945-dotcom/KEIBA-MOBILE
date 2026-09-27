import { load } from "cheerio";
import type { OddsBetType as JraOddsBetType } from "../../domain/live";

export type OddsRowInput={
  betType:JraOddsBetType;
  selection1:number|null;
  selection2:number|null;
  selection3:number|null;
  odds:number|null;
  oddsMin:number|null;
  oddsMax:number|null;
};

function clean(value:string|null|undefined){
  return (value??"").replace(/\s+/g," ").trim();
}
function horseNo(value:string){
  const m=clean(value).match(/^(\d{1,2})(?:番)?$/);
  if(!m)return null;
  const n=Number(m[1]);
  return n>=1&&n<=18?n:null;
}
function oddsValue(text:string){
  const value=clean(text).replace(/,/g,"");
  const range=value.match(/(\d+(?:\.\d+)?)\s*(?:～|〜|－|-|~)\s*(\d+(?:\.\d+)?)/);
  if(range)return {odds:null,oddsMin:Number(range[1]),oddsMax:Number(range[2])};
  const explicit=value.match(/(\d+(?:\.\d+)?)\s*倍/);
  if(explicit)return {odds:Number(explicit[1]),oddsMin:null,oddsMax:null};
  if(/^\d+(?:\.\d+)?$/.test(value)){
    return {odds:Number(value),oddsMin:null,oddsMax:null};
  }
  const decimal=value.match(/\d+\.\d+/);
  return {odds:decimal?Number(decimal[0]):null,oddsMin:null,oddsMax:null};
}
function validValue(value:{odds:number|null;oddsMin:number|null}){
  return value.odds!=null||value.oddsMin!=null;
}
function unique(nums:number[]){
  return [...new Set(nums)];
}
function explicitCombination(text:string,arity:number){
  const sep="(?:-|－|–|—|→|＞|>)";
  const pattern=arity===3
    ?new RegExp("(\\d{1,2})\\s*"+sep+"\\s*(\\d{1,2})\\s*"+sep+"\\s*(\\d{1,2})")
    :new RegExp("(\\d{1,2})\\s*"+sep+"\\s*(\\d{1,2})");
  const m=clean(text).match(pattern);
  if(!m)return null;
  const nums=m.slice(1).map(Number);
  return nums.every(n=>n>=1&&n<=18)?nums:null;
}
function makeRow(betType:JraOddsBetType,nums:number[],value:ReturnType<typeof oddsValue>):OddsRowInput{
  return {
    betType,
    selection1:nums[0]??null,
    selection2:nums[1]??null,
    selection3:nums[2]??null,
    ...value,
  };
}
function dedupe(rows:OddsRowInput[]){
  const map=new Map<string,OddsRowInput>();
  for(const row of rows){
    if(row.selection1==null||!validValue(row))continue;
    const key=[row.betType,row.selection1,row.selection2,row.selection3].join(":");
    if(!map.has(key))map.set(key,row);
  }
  return [...map.values()];
}

export function parseWinPlaceRows(html:string):OddsRowInput[]{
  const $=load(html);
  const out:OddsRowInput[]=[];
  $("table").each((_,table)=>{
    const tableText=clean($(table).find("caption").first().text()+" "+$(table).find("thead").text());
    const hasWin=tableText.includes("単勝");
    const hasPlace=tableText.includes("複勝");
    // JRA can render WIN and PLACE under the same table/header. In that case
    // the old "PLACE first" classification discarded every WIN row. Treat a
    // mixed table as untyped and infer WIN from the single price and PLACE from
    // the range in each runner row.
    const tableType:JraOddsBetType|null=
      hasWin&&!hasPlace?"WIN":hasPlace&&!hasWin?"PLACE":null;
    $(table).find("tr").each((__,tr)=>{
      const cells=$(tr).children("th,td").toArray().map(cell=>clean($(cell).text())).filter(Boolean);
      const no=horseNo(cells[0]??"");
      if(no==null)return;
      const range=cells.map(oddsValue).find(v=>v.oddsMin!=null&&v.oddsMax!=null);
      const single=cells.slice(1).map(oddsValue).find(v=>v.odds!=null);
      if(tableType==="PLACE"&&range)out.push(makeRow("PLACE",[no],range));
      else if(tableType==="WIN"&&single)out.push(makeRow("WIN",[no],single));
      else{
        if(range)out.push(makeRow("PLACE",[no],range));
        if(single)out.push(makeRow("WIN",[no],single));
      }
    });
  });
  return dedupe(out);
}

export function parseBracketQuinellaRows(html:string):OddsRowInput[]{
  const $=load(html);
  const out:OddsRowInput[]=[];

  // JRAの枠連は馬連系の通常マトリクスではなく、
  // 「1枠を起点に2〜8枠」「2枠を起点に3〜8枠」…という
  // 三角形の複数tableで描画される。同枠発売がある場合は5-5等も値を持つ。
  $("table").each((_,table)=>{
    const rows=$(table).find("tr").toArray().map(tr=>{
      const texts=$(tr).children("th,td").toArray()
        .map(cell=>clean($(cell).text()));
      return {texts,frame:horseNo(texts[0]??"")};
    }).filter(row=>row.frame!=null&&row.frame>=1&&row.frame<=8);

    if(!rows.length)return;
    const firstFrame=Math.min(...rows.map(row=>row.frame!));
    if(firstFrame<1||firstFrame>8)return;

    for(const row of rows){
      const secondFrame=row.frame!;
      if(secondFrame<firstFrame||secondFrame>8)continue;
      const value=row.texts.slice(1).map(oddsValue).find(validValue);
      if(!value)continue;
      out.push(makeRow("BRACKET_QUINELLA",[firstFrame,secondFrame],value));
    }
  });
  return dedupe(out);
}

export function parseCombinationRows(html:string,betType:JraOddsBetType):OddsRowInput[]{
  if(betType==="BRACKET_QUINELLA")return parseBracketQuinellaRows(html);
  const $=load(html);
  const arity=betType==="TRIO"||betType==="TRIFECTA"?3:2;
  const out:OddsRowInput[]=[];

  $("table").each((_,table)=>{
    const caption=clean($(table).find("caption").first().text());
    const captionNums=unique((caption.match(/\d{1,2}/g)??[]).map(Number).filter(n=>n>=1&&n<=18));
    const positionText=clean($(table).parent().text());
    const firstPlace=Number(positionText.match(/1着\s*(\d{1,2})/)?.[1]??NaN);
    const secondPlace=Number(positionText.match(/2着\s*(\d{1,2})/)?.[1]??NaN);
    const orderedContext:number[]=[];
    if(Number.isFinite(firstPlace)&&firstPlace>=1&&firstPlace<=18)orderedContext.push(firstPlace);
    if(Number.isFinite(secondPlace)&&secondPlace>=1&&secondPlace<=18)orderedContext.push(secondPlace);
    const rows=$(table).find("tr").toArray();
    let columnHorseNos:number[]=[];

    for(const tr of rows){
      const cells=$(tr).children("th,td").toArray();
      const texts=cells.map(cell=>clean($(cell).text()));
      const candidate=texts.map(horseNo).filter((n):n is number=>n!=null);
      if(candidate.length>columnHorseNos.length&&texts.every((text,index)=>index===0||horseNo(text)!=null||!text)){
        columnHorseNos=candidate;
      }
    }

    for(const tr of rows){
      const cells=$(tr).children("th,td").toArray();
      const texts=cells.map(cell=>clean($(cell).text()));
      if(!texts.length)continue;

      const joined=texts.join(" ");
      const explicit=explicitCombination(joined,arity);
      const values=texts.map(oddsValue);
      const valueIndex=values.findIndex((value,index)=>horseNo(texts[index])==null&&validValue(value));
      if(explicit&&valueIndex>=0){
        out.push(makeRow(betType,explicit,values[valueIndex]));
        continue;
      }

      const exactNums=texts.map(horseNo).filter((n):n is number=>n!=null);
      const orderedBet=betType==="TRIFECTA"||betType==="EXACTA";
      const context=orderedBet
        ?unique([...orderedContext,...exactNums])
        :unique([...captionNums,...exactNums]);
      if(context.length>=arity&&valueIndex>=0){
        out.push(makeRow(betType,context.slice(0,arity),values[valueIndex]));
        continue;
      }

      const rowHead=horseNo(texts[0]??"");
      if(rowHead==null||!captionNums.length||!columnHorseNos.length)continue;
      for(let i=1;i<texts.length;i+=1){
        const value=values[i];
        if(!validValue(value))continue;
        const columnNo=columnHorseNos[i-1]??columnHorseNos[i];
        if(columnNo==null)continue;
        const nums=unique([...captionNums,rowHead,columnNo]);
        if(nums.length>=arity)out.push(makeRow(betType,nums.slice(0,arity),value));
      }
    }
  });
  return dedupe(out);
}
