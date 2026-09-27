import { load, type CheerioAPI } from "cheerio";
import type { JraPayout, JraRaceResult, OddsBetType } from "../../domain/live";

export type JraAction = { path: string; cname: string };

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
  const m = clean(value).replace(/,/g, "").match(/-?\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function floatOrNull(value: string | null | undefined) {
  const m = clean(value).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function parseAction(onclick: string | null | undefined): JraAction | null {
  const m = (onclick ?? "").match(/doAction\(\s*['"]([^'"]*accessS\.html)['"]\s*,\s*['"]([^'"]+)['"]/);
  return m ? { path: m[1], cname: m[2] } : null;
}

export function discoverRaceResultAction(html: string): JraAction | null {
  const $ = load(html);
  let found: JraAction | null = null;
  $("a[onclick]").each((_, el) => {
    if (found) return;
    const label = compact($(el).text());
    if (!label.includes("レース結果")) return;
    const action = parseAction($(el).attr("onclick"));
    if (action) found = action;
  });
  return found;
}

function directCells($: CheerioAPI, row: any) {
  return $(row).children("th,td");
}

function findResultTable($: CheerioAPI) {
  let table: any = null;
  $("table").each((_, el) => {
    if (table) return;
    const text = compact($(el).text());
    if (text.includes("着順") && text.includes("馬番") && text.includes("タイム") && text.includes("推定上り")) {
      table = el;
    }
  });
  return table;
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
  clone.find("br").each((_: number, br: any) => $(br).replaceWith("\n"));
  const text = clone.text();
  const lines = text.split(/\n+/).map(clean).filter(Boolean);
  return lines.length ? lines : [clean(text)].filter(Boolean);
}

function valueAt(values: string[], index: number) {
  if (index < values.length) return values[index] ?? null;
  return values.length === 1 ? values[0] ?? null : null;
}

export function parseJraRaceResultPage(html: string, raceKey: string) {
  const $ = load(html);
  const table = findResultTable($);
  if (!table) throw new Error("JRAレース結果表を確認できない");

  const headerRow = $(table).find("tr").toArray().find((row) => {
    const text = compact(directCells($, row).text());
    return text.includes("着順") && text.includes("馬番") && text.includes("タイム");
  });
  if (!headerRow) throw new Error("JRAレース結果の列見出しを確認できない");

  const headers = directCells($, headerRow).toArray().map((cell) => compact($(cell).text()));
  const findIndex = (patterns: RegExp[], fallback: number) => {
    const index = headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
    return index >= 0 ? index : fallback;
  };
  const idx = {
    finish: findIndex([/^着順$/], 0),
    number: findIndex([/^馬番$/], 2),
    horse: findIndex([/^馬名/], 3),
    time: findIndex([/^タイム$/], 7),
    margin: findIndex([/^着差$/], 8),
    last3f: findIndex([/推定上り/, /上がり/, /上り/], 10),
    popularity: findIndex([/単勝人気/, /^人気$/], 13),
  };

  const results: JraRaceResult[] = [];
  $(table).find("tr").each((_, row) => {
    if (row === headerRow) return;
    const cells = directCells($, row);
    if (cells.length < 4) return;

    const finishRaw = clean(cells.eq(idx.finish).text());
    const horseNo = intOrNull(cells.eq(idx.number).text());
    const horseCell = cells.eq(idx.horse);
    const linkedName = clean(horseCell.find("a[href]").first().text());
    const horseName = linkedName || clean(horseCell.text())
      .replace(/ブリンカー着用/g, "")
      .replace(/外/g, "")
      .trim();
    if (!finishRaw || !horseName) return;

    const position = /^\d+$/.test(compact(finishRaw)) ? intOrNull(finishRaw) : null;
    results.push({
      raceKey,
      finishPosition: position,
      finishRaw,
      horseNo,
      horseName,
      finishTime: clean(cells.eq(idx.time).text()) || null,
      margin: clean(cells.eq(idx.margin).text()) || null,
      last3f: floatOrNull(cells.eq(idx.last3f).text()),
      popularity: intOrNull(cells.eq(idx.popularity).text()),
      resultStatus: resultStatus(finishRaw),
    });
  });

  if (!results.some((row) => row.finishPosition != null)) {
    throw new Error("JRA公式着順を確認できない");
  }

  const payouts: JraPayout[] = [];
  $("tr").each((_, row) => {
    const cells = directCells($, row);
    if (cells.length < 3) return;
    const label = compact(cells.eq(0).text());
    const betType = BET_MAP[label];
    if (!betType) return;

    const selections = splitCellLines($, cells.eq(1));
    const amounts = splitCellLines($, cells.eq(2));
    const popularities = cells.length >= 4 ? splitCellLines($, cells.eq(3)) : [];
    const count = Math.max(selections.length, amounts.length);
    for (let i = 0; i < count; i += 1) {
      const selection = valueAt(selections, i);
      const amount = valueAt(amounts, i);
      if (!selection || !amount) continue;
      payouts.push({
        raceKey,
        betType,
        selection: compact(selection).replace(/[－ー]/g, "-"),
        payoutYen: intOrNull(amount),
        popularity: intOrNull(valueAt(popularities, i)),
      });
    }
  });

  return { results, payouts };
}
