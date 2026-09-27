import { load } from "cheerio";

type LinkInfo = { text: string; href: string; };

type GridCell = {
  text: string;
  imageText: string[];
  links: LinkInfo[];
  isHeader: boolean;
};

export type ExtractedOfficialEntryRow = {
  gate: number | null;
  horseNo: number | null;
  horseName: string;
  rowText: string;
  horseCellText: string;
  sexCellText: string;
  jockeyCellText: string;
  trainerCellText: string;
  jockeyLinkText: string | null;
  trainerLinkText: string | null;
  explicitGate: boolean;
  explicitHorseNo: boolean;
};

function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
function compact(value: string | null | undefined) {
  return clean(value).replace(/\s/g, "");
}
function boundedInt(value: string | null | undefined, min: number, max: number) {
  const text = compact(value);
  const match = text.match(/^\D*(\d{1,2})\D*$/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
function embeddedInt(values: Array<string | null | undefined>, min: number, max: number) {
  for (const raw of values) {
    const match = clean(raw).match(/\d{1,2}/);
    if (!match) continue;
    const n = Number(match[0]);
    if (Number.isFinite(n) && n >= min && n <= max) return n;
  }
  return null;
}
function positiveSpan(value: string | undefined) {
  const n = Number(value ?? "1");
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}
function cellInfo($: ReturnType<typeof load>, node: any): GridCell {
  const cell = $(node);
  const imageText: string[] = [];
  cell.find("img").each((_, img) => {
    const alt = $(img).attr("alt");
    const title = $(img).attr("title");
    if (alt) imageText.push(alt);
    if (title) imageText.push(title);
  });
  const links: LinkInfo[] = [];
  cell.find("a").each((_, a) => {
    const text = clean($(a).text());
    const href = clean($(a).attr("href"));
    if (text) links.push({ text, href });
  });
  return {
    text: clean(cell.text()),
    imageText,
    links,
    isHeader: String((node as { tagName?: string }).tagName ?? "").toLowerCase() === "th",
  };
}
function buildGrid($: ReturnType<typeof load>, table: any) {
  const grid: GridCell[][] = [];
  let carried = new Map<number,{cell:GridCell;remaining:number}>();
  $(table).find("tr").each((_, tr) => {
    const row: GridCell[] = [];
    const next = new Map<number,{cell:GridCell;remaining:number}>();
    for (const [column, span] of carried) {
      row[column] = span.cell;
      if (span.remaining > 1) next.set(column,{cell:span.cell,remaining:span.remaining - 1});
    }
    let column = 0;
    $(tr).children("th,td").each((__, node) => {
      while (row[column]) column += 1;
      const info = cellInfo($,node);
      const colspan = positiveSpan($(node).attr("colspan"));
      const rowspan = positiveSpan($(node).attr("rowspan"));
      for (let offset=0; offset<colspan; offset+=1) {
        const target=column+offset;
        row[target]=info;
        if (rowspan>1) next.set(target,{cell:info,remaining:rowspan-1});
      }
      column += colspan;
    });
    if (row.some(Boolean)) grid.push(row);
    carried=next;
  });
  return grid;
}
function headerIndex(grid: GridCell[][], token: string) {
  const columns=Math.max(0,...grid.map(row=>row.length));
  let best=-1,bestScore=-Infinity;
  for(let column=0;column<columns;column+=1){
    const labels=[...new Set(grid.map(row=>row[column]).filter(cell=>cell?.isHeader).map(cell=>clean(cell.text)).filter(Boolean))];
    for(const label of labels){
      if(!label.includes(token))continue;
      const score=(compact(label)===compact(token)?1000:0)-label.length;
      if(score>bestScore){best=column;bestScore=score;}
    }
  }
  return best;
}
function horseName(cell: GridCell | undefined) {
  if(!cell)return "";
  const horseLink = cell.links.find(link => /\/horse\//i.test(link.href));
  const fallbackLink = cell.links.find(link => link.text && !/^(?:オッズ|騎手|調教師|厩舎|父|母)$/.test(link.text));
  const source=horseLink?.text||fallbackLink?.text||cell.text;
  return clean(source)
    .replace(/(?:除外|取消)$/,"")
    .replace(/\d+(?:\.\d+)?\s*\(\d+番人気\).*$/,"")
    .replace(/\d{3}\s*kg\s*\([+-]?\d+\).*$/,"")
    .trim();
}
function pickTable($: ReturnType<typeof load>) {
  let winner:any=null;
  let winnerScore=-1;
  $("table").each((_, table) => {
    const text=clean($(table).text());
    let score=0;
    if(text.includes("馬名"))score+=30;
    if(text.includes("馬番"))score+=25;
    if(text.includes("枠"))score+=20;
    if(text.includes("騎手"))score+=15;
    score+=Math.min($(table).find("tr").length,20);
    if(score>winnerScore){winner=table;winnerScore=score;}
  });
  return winnerScore>=75?winner:null;
}

export function inferGateFromHorseNo(horseNo:number|null,fieldSize:number):number|null{
  if(horseNo==null||horseNo<1||fieldSize<1||fieldSize>18||horseNo>fieldSize)return null;
  if(fieldSize<=8)return horseNo;
  const capacities=Array.from({length:8},()=>1);
  let remaining=fieldSize-8;
  while(remaining>0){
    for(let gate=7;gate>=0&&remaining>0;gate-=1){capacities[gate]+=1;remaining-=1;}
  }
  let upper=0;
  for(let gate=0;gate<capacities.length;gate+=1){
    upper+=capacities[gate];
    if(horseNo<=upper)return gate+1;
  }
  return null;
}

function isInactiveEntryRow(row:ExtractedOfficialEntryRow){
  return /(?:取消|除外)/.test(row.rowText);
}

function recoverInactiveNumbering(rows:ExtractedOfficialEntryRow[]){
  const known=rows.map(row=>row.horseNo).filter((value):value is number=>value!=null);
  const fieldSize=Math.max(rows.length,...known,0);
  if(fieldSize<1||fieldSize>18)return rows;

  const unresolved=rows.filter(row=>row.horseNo==null);
  if(!unresolved.length)return rows;
  if(unresolved.some(row=>!isInactiveEntryRow(row)))return rows;

  const used=new Set(known);
  const missing=Array.from({length:fieldSize},(_,index)=>index+1).filter(no=>!used.has(no));
  if(missing.length!==unresolved.length)return rows;

  let missingIndex=0;
  const recovered=rows.map(row=>{
    if(row.horseNo!=null)return row;
    const horseNo=missing[missingIndex++];
    return {
      ...row,
      horseNo,
      gate:row.gate??inferGateFromHorseNo(horseNo,fieldSize),
    };
  });

  const numbers=recovered.map(row=>row.horseNo);
  if(numbers.some(no=>no==null))return rows;
  for(let i=1;i<numbers.length;i+=1){
    if((numbers[i-1] as number)>=(numbers[i] as number))return rows;
  }
  return recovered;
}

export function extractOfficialEntryRows(html:string):ExtractedOfficialEntryRow[]{
  const $=load(html);
  const table=pickTable($);
  if(!table)throw new Error("JRA出馬表テーブルがない");
  const grid=buildGrid($,table);
  const gateIdx=headerIndex(grid,"枠");
  const horseNoIdx=headerIndex(grid,"馬番");
  const horseIdx=headerIndex(grid,"馬名");
  const sexIdx=headerIndex(grid,"性齢");
  const jockeyIdx=headerIndex(grid,"騎手");
  const trainerIdx=Math.max(headerIndex(grid,"調教師"),headerIndex(grid,"厩舎"));
  if(gateIdx<0||horseNoIdx<0||horseIdx<0)throw new Error("馬番・枠番号が明示された正式出馬表ではない");

  const rows:ExtractedOfficialEntryRow[]=[];
  for(const row of grid){
    const horseCell=row[horseIdx];
    if(!horseCell||horseCell.isHeader)continue;
    const name=horseName(horseCell);
    if(!name||/^(?:馬名|父|母)$/.test(name))continue;
    const gateCell=row[gateIdx],horseNoCell=row[horseNoIdx];
    const gate=boundedInt(gateCell?.text,1,8)??embeddedInt(gateCell?.imageText??[],1,8);
    const no=boundedInt(horseNoCell?.text,1,18)??embeddedInt(horseNoCell?.imageText??[],1,18);
    const jockeyCell=jockeyIdx>=0?row[jockeyIdx]:undefined;
    const trainerCell=trainerIdx>=0?row[trainerIdx]:undefined;
    const rowLinks=[...new Set(row.filter(Boolean).flatMap(cell=>cell.links))];
    const jockeyLink =
      jockeyCell?.links.filter(link=>/jockey|datafile\/leading|kishu/i.test(link.href)).at(-1) ??
      rowLinks.filter(link=>/jockey|datafile\/leading|kishu/i.test(link.href)).at(-1) ??
      jockeyCell?.links.at(-1);
    const trainerLink =
      trainerCell?.links.find(link=>/trainer|chokyo|chokyosi/i.test(link.href)) ??
      rowLinks.find(link=>/trainer|chokyo|chokyosi/i.test(link.href)) ??
      trainerCell?.links[0];
    rows.push({
      gate,horseNo:no,horseName:name,
      rowText:clean([...new Set(row.filter(Boolean).map(cell=>cell.text).filter(Boolean))].join(" ")),
      horseCellText:horseCell.text,
      sexCellText:sexIdx>=0?row[sexIdx]?.text??"":"",
      jockeyCellText:jockeyCell?.text??"",
      trainerCellText:trainerCell?.text??"",
      jockeyLinkText:jockeyLink?.text??null,
      trainerLinkText:trainerLink?.text??null,
      explicitGate:gate!=null,
      explicitHorseNo:no!=null,
    });
  }
  const recoveredRows=recoverInactiveNumbering(rows);
  const unique=new Map<string,ExtractedOfficialEntryRow>();
  for(const row of recoveredRows){
    const key=String(row.horseNo??"")+":"+row.horseName;
    if(!unique.has(key))unique.set(key,row);
  }
  return [...unique.values()].sort((a,b)=>(a.horseNo??99)-(b.horseNo??99));
}
