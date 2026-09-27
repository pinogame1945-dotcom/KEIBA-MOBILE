import { load, type CheerioAPI } from "cheerio";
import type { JraPayout, JraRace, JraRaceResult, OddsBetType } from "../../domain/live";
import type { OfficialRaceConditions } from "../../repositories/liveRepository";

const BET_MAP: Record<string, OddsBetType> = {
  "単勝": "WIN",
  "複勝": "PLACE",
  "枠連": "BRACKET_QUINELLA",
  "馬連": "QUINELLA",
  "ワイド": "WIDE",
  "馬単": "EXACTA",
  "三連複": "TRIO",
  "3連複": "TRIO",
  "三連単": "TRIFECTA",
  "3連単": "TRIFECTA",
};

function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
function compact(value: string | null | undefined) {
  return clean(value).replace(/\s/g, "");
}
function intOrNull(value: string | null | undefined) {
  const match = clean(value).replace(/,/g, "").match(/-?\d+/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}
function floatOrNull(value: string | null | undefined) {
  const match = clean(value).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}
function parseLast3f(value: string | null | undefined) {
  const text = clean(value).replace(/[()]/g, "").replace(/,/g, "");
  const colon = text.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/);
  if (colon) {
    const minutes = Number(colon[1]);
    const seconds = Number(colon[2]);
    return Number.isFinite(minutes) && Number.isFinite(seconds) && seconds < 60
      ? Number((minutes * 60 + seconds).toFixed(1))
      : null;
  }
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  if (n >= 100) {
    const minutes = Math.floor(n / 100);
    const seconds = n - minutes * 100;
    if (minutes >= 1 && seconds >= 0 && seconds < 60) return Number((minutes * 60 + seconds).toFixed(1));
  }
  return n;
}
function resultStatus(raw: string): JraRaceResult["resultStatus"] {
  const text = compact(raw);
  if (/^\d+$/.test(text)) return "FINISHED";
  if (text.includes("取消")) return "SCRATCHED";
  if (text.includes("除外")) return "EXCLUDED";
  if (text.includes("失格")) return "DISQUALIFIED";
  if (text.includes("中止")) return "DNF";
  return "UNKNOWN";
}
function directCells($: CheerioAPI, row: any, selector: "td" | "th,td" = "td") {
  const children = $(row).children();
  return selector === "td" ? children.filter("td") : children.filter("th,td");
}
function splitCellLines($: CheerioAPI, cell: any) {
  const lis = cell.find("li");
  if (lis.length) {
    const lines: string[] = [];
    lis.each((_: number, el: any) => {
      const text = clean($(el).text());
      if (text) lines.push(text);
    });
    if (lines.length) return lines;
  }
  const clone = cell.clone();
  clone.find("br").each((_: number, br: any) => { $(br).replaceWith("\n"); });
  const lines = clone.text().split(/\n+/).map(clean).filter(Boolean);
  return lines.length ? lines : [clean(clone.text())].filter(Boolean);
}
function payoutArity(type: OddsBetType) {
  if (["BRACKET_QUINELLA","QUINELLA","WIDE","EXACTA"].includes(type)) return 2;
  if (type === "TRIO" || type === "TRIFECTA") return 3;
  return 1;
}
function integerTokens(value: string) {
  return [...clean(value).matchAll(/\d[\d,]*/g)]
    .map((match) => Number(match[0].replace(/,/g, "")))
    .filter(Number.isFinite);
}
function normalizePayoutCombinations(type: OddsBetType, lines: string[]) {
  const arity = payoutArity(type);
  const cleaned = lines.map(clean).filter(Boolean);
  if (arity === 1) return cleaned.map((line) => String(integerTokens(line)[0] ?? line));
  const perLine = cleaned.map(integerTokens);
  if (perLine.every((tokens) => tokens.length === arity)) {
    return perLine.map((tokens) => tokens.join("-"));
  }
  const flat = perLine.flat();
  const out: string[] = [];
  for (let i = 0; i + arity <= flat.length; i += arity) out.push(flat.slice(i, i + arity).join("-"));
  return out;
}
function valueAt<T>(values: T[], index: number): T | null {
  if (index < values.length) return values[index] ?? null;
  return values.length === 1 ? values[0] ?? null : null;
}
function findLast3fColumn(headers: string[]) {
  const normalized = headers.map(compact);
  const exact = [/^上り(?:3F|３F)?$/, /^上がり(?:3F|３F)?$/, /^後(?:3|３)F$/];
  for (let i = 0; i < normalized.length; i += 1) {
    if (exact.some((pattern) => pattern.test(normalized[i]))) return i;
  }
  return normalized.findIndex((header) =>
    !header.includes("指数") && (header.includes("上り") || header.includes("上がり") || header.includes("後3F"))
  );
}
function parseConditions(meta: string, race: JraRace): OfficialRaceConditions {
  const weather = meta.match(/天候\s*[:：]?\s*(晴|曇|雨|小雨|雪|小雪)/)?.[1] ?? null;
  const turf = meta.match(/芝\s*[:：]?\s*(良|稍重|重|不良)/)?.[1] ?? null;
  const dirt = meta.match(/(?:ダート|ダ)\s*[:：]?\s*(良|稍重|重|不良)/)?.[1] ?? null;
  const generic = meta.match(/馬場\s*[:：]?\s*(良|稍重|重|不良)/)?.[1] ?? null;
  return {
    weather,
    turfCondition: turf ?? (race.surface === "TURF" ? generic : null),
    dirtCondition: dirt ?? (race.surface === "DIRT" ? generic : null),
  };
}

export function parseNetkeibaRaceResultPage(html: string, race: JraRace) {
  const $ = load(html);
  const pageText = clean($.root().text());
  const dm = pageText.match(/((?:19|20)\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (dm) {
    const actualDate = dm[1] + "-" + String(Number(dm[2])).padStart(2, "0") + "-" + String(Number(dm[3])).padStart(2, "0");
    if (actualDate !== race.raceDate) throw new Error("netkeiba結果ページの日付が対象レースと一致しない");
  }

  const liveMeta = [clean($(".RaceData01").first().text()),clean($(".RaceData02").first().text())]
    .filter(Boolean).join(" ");
  const meta = $(".data_intro").first().length
    ? clean($(".data_intro").first().text())
    : $(".race_head").first().length
      ? clean($(".race_head").first().text())
      : liveMeta || pageText;

  let table = $("table.race_table_01").first();
  if (!table.length) table = $("table.RaceTable01").first();
  if (!table.length) table = $("#All_Result_Table table").first();
  if (!table.length) table = $("table[class*='race_table']").first();
  if (!table.length) table = $("table[class*='RaceTable']").first();
  if (!table.length) {
    $("table").each((_, candidate) => {
      if (table.length) return;
      const headerText = compact($(candidate).find("th").text());
      if (headerText.includes("着順") && headerText.includes("馬名") &&
          (headerText.includes("騎手") || headerText.includes("タイム"))) {
        table = $(candidate);
      }
    });
  }
  if (!table.length) throw new Error("netkeiba確定結果表を確認できない");

  let headerRow = table.find("tr").filter((_, tr) => {
    const text = compact($(tr).find("th").text());
    return text.includes("着順") && text.includes("馬名");
  }).first();
  if (!headerRow.length) headerRow = table.find("tr").first();

  const headers: string[] = [];
  headerRow.find("th").each((i, el) => { headers[i] = clean($(el).text()); });
  const find = (...needles: string[]) =>
    headers.findIndex((header) => needles.some((needle) => compact(header).includes(compact(needle))));
  const idx = {
    finish: find("着順"),
    number: find("馬番"),
    horse: find("馬名"),
    time: find("タイム"),
    margin: find("着差"),
    last3f: findLast3fColumn(headers),
    average1f: find("平均1F"),
    popularity: find("人気"),
  };
  if (idx.finish < 0 || idx.number < 0 || idx.horse < 0) {
    throw new Error("netkeiba確定結果の必須列を確認できない");
  }

  const results: JraRaceResult[] = [];
  table.find("tr").each((_, tr) => {
    const cells = directCells($, tr);
    if (!cells.length) return;
    const textAt = (index: number) => index >= 0 ? clean(cells.eq(index).text()) : "";
    const finishRaw = textAt(idx.finish);
    const horseCell = cells.eq(idx.horse);
    const horseName = clean(horseCell.find("a[href*='/horse/']").first().text()) || textAt(idx.horse);
    if (!finishRaw || !horseName) return;

    results.push({
      raceKey: race.raceKey,
      finishPosition: /^\d+$/.test(compact(finishRaw)) ? intOrNull(finishRaw) : null,
      finishRaw,
      horseNo: intOrNull(textAt(idx.number)),
      horseName,
      finishTime: idx.time >= 0 ? textAt(idx.time) || null : null,
      margin: idx.margin >= 0 ? textAt(idx.margin) || null : null,
      last3f: idx.last3f >= 0 ? parseLast3f(textAt(idx.last3f)) : null,
      average1f: idx.average1f >= 0 ? floatOrNull(textAt(idx.average1f)) : null,
      popularity: idx.popularity >= 0 ? intOrNull(textAt(idx.popularity)) : null,
      resultStatus: resultStatus(finishRaw),
    });
  });
  if (!results.some((row) => row.finishPosition != null)) {
    throw new Error("netkeiba確定着順を確認できない");
  }

  const payouts: JraPayout[] = [];
  $("tr").each((_, tr) => {
    const cells = directCells($, tr, "th,td");
    if (cells.length < 3) return;
    const betType = BET_MAP[compact(cells.eq(0).text())];
    if (!betType) return;

    const combinations = normalizePayoutCombinations(betType, splitCellLines($, cells.eq(1)));
    const amounts = splitCellLines($, cells.eq(2)).map((value) => intOrNull(value));
    const popularities = cells.length >= 4
      ? splitCellLines($, cells.eq(3)).map((value) => intOrNull(value))
      : [];
    const count = Math.max(combinations.length, amounts.length, popularities.length, 1);
    for (let i = 0; i < count; i += 1) {
      const selection = valueAt(combinations, i);
      const payoutYen = valueAt(amounts, i);
      if (!selection || payoutYen == null) continue;
      payouts.push({
        raceKey: race.raceKey,
        betType,
        selection,
        payoutYen,
        popularity: valueAt(popularities, i),
      });
    }
  });

  return { results, payouts, conditions: parseConditions(meta, race) };
}
