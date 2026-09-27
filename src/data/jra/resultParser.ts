import { load, type CheerioAPI } from "cheerio";
import type { JraPayout, JraRace, JraRaceResult, OddsBetType } from "../../domain/live";
import type { OfficialRaceConditions } from "../../repositories/liveRepository";

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
    if (found || !compact($(el).text()).includes("レース結果")) return;
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
    if (text.includes("着順") && text.includes("馬番") && text.includes("馬名") && text.includes("タイム")) {
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

function assertIdentity(pageText: string, race: JraRace) {
  const [y,m,d] = race.raceDate.split("-").map(Number);
  if (!pageText.includes(`${y}年${m}月${d}日`)) {
    throw new Error("JRA結果ページの日付が対象レースと一致しない");
  }
  if (!new RegExp("\\d+回" + race.venue + "\\d+日").test(pageText)) {
    throw new Error("JRA結果ページの競馬場が対象レースと一致しない");
  }
  if (!new RegExp("(?:^|\\s)" + race.raceNo + "レース(?:\\s|$)").test(pageText)) {
    throw new Error("JRA結果ページのレース番号が対象レースと一致しない");
  }
}

function parseConditions(pageText: string): OfficialRaceConditions {
  return {
    weather: pageText.match(/天候\s*(晴|曇|雨|小雨|雪|小雪)/)?.[1] ?? null,
    turfCondition: pageText.match(/芝\s*(良|稍重|重|不良)/)?.[1] ?? null,
    dirtCondition: pageText.match(/ダート\s*(良|稍重|重|不良)/)?.[1] ?? null,
  };
}

export function parseJraRaceResultPage(html: string, race: JraRace) {
  const $ = load(html);
  const pageText = clean($.root().text());
  assertIdentity(pageText, race);

  const table = findResultTable($);
  if (!table) throw new Error("JRAレース結果表を確認できない");

  const headerRow = $(table).find("tr").toArray().find((row) => {
    const text = compact(directCells($, row).text());
    return text.includes("着順") && text.includes("馬番") && text.includes("タイム");
  });
  if (!headerRow) throw new Error("JRAレース結果の列見出しを確認できない");

  const headers = directCells($, headerRow).toArray().map((cell) => compact($(cell).text()));
  const findIndex = (patterns: RegExp[]) =>
    headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));

  const idx = {
    finish: findIndex([/^着順$/]),
    number: findIndex([/^馬番$/]),
    horse: findIndex([/^馬名/]),
    time: findIndex([/^タイム$/]),
    margin: findIndex([/^着差$/]),
    last3f: findIndex([/推定上り/, /上がり3F/, /^上り$/]),
    average1f: findIndex([/平均1F/]),
    popularity: findIndex([/単勝人気/, /^人気$/]),
  };

  if (idx.finish < 0 || idx.number < 0 || idx.horse < 0 || idx.time < 0) {
    throw new Error("JRAレース結果の必須列を確認できない");
  }

  const results: JraRaceResult[] = [];
  $(table).find("tr").each((_, row) => {
    if (row === headerRow) return;
    const cells = directCells($, row);
    if (cells.length < 4) return;

    const finishRaw = clean(cells.eq(idx.finish).text());
    const horseNo = intOrNull(cells.eq(idx.number).text());
    const horseCell = cells.eq(idx.horse);
    const linkedName = clean(horseCell.find("a[href],a[onclick]").first().text());
    const horseName = linkedName ||
      clean(horseCell.text()).replace(/ブリンカー着用/g, "").replace(/外/g, "").trim();

    if (!finishRaw || !horseName) return;

    results.push({
      raceKey: race.raceKey,
      finishPosition: /^\d+$/.test(compact(finishRaw)) ? intOrNull(finishRaw) : null,
      finishRaw,
      horseNo,
      horseName,
      finishTime: clean(cells.eq(idx.time).text()) || null,
      margin: idx.margin >= 0 ? clean(cells.eq(idx.margin).text()) || null : null,
      last3f: idx.last3f >= 0 ? floatOrNull(cells.eq(idx.last3f).text()) : null,
      average1f: idx.average1f >= 0 ? floatOrNull(cells.eq(idx.average1f).text()) : null,
      popularity: idx.popularity >= 0 ? intOrNull(cells.eq(idx.popularity).text()) : null,
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

    const betType = BET_MAP[compact(cells.eq(0).text())];
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
        raceKey: race.raceKey,
        betType,
        selection: compact(selection).replace(/[－ー]/g, "-"),
        payoutYen: intOrNull(amount),
        popularity: intOrNull(valueAt(popularities, i)),
      });
    }
  });

  return {
    results,
    payouts,
    conditions: parseConditions(pageText),
  };
}
