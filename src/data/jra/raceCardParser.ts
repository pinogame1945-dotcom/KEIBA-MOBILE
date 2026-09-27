import { load } from "cheerio";
import type { JraEntry, JraRaceCard } from "../../domain/live";
import { absoluteJraUrl } from "./http";
import { parseJraRaceHeader, parseJraRaceIdentity } from "./raceHeaderParser";

function clean(value: string | null | undefined) { return (value ?? "").replace(/\s+/g, " ").trim(); }
function toInt(value: string | undefined | null) {
  const n = Number.parseInt((value ?? "").replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}
function embeddedInt(value: string | undefined | null) {
  const match = (value ?? "").match(/\d+/);
  return match ? Number(match[0]) : null;
}
function toFloat(value: string | undefined | null) {
  const n = Number.parseFloat((value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
function canonicalSex(value: string | null | undefined) {
  return value === "せん" || value === "セン" || value === "騸" || value === "セ" ? "セ" : value ?? null;
}
function cleanJockeyName(value: string | null | undefined) {
  const normalized = clean(value).replace(/^(?:騎手[：:\s]*)/, "").replace(/^[☆★△▲▽▼◇◆]+/, "").trim();
  return normalized || null;
}
function pushJraUrl(out: Set<string>, href: string, baseUrl: string) {
  const url = absoluteJraUrl(href, baseUrl);
  if (!url || !url.includes("/JRADB/accessD.html")) return;
  try {
    const parsed = new URL(url);
    const cname = parsed.searchParams.get("CNAME");
    if (!cname || !cname.includes("pw01dde")) return;
    out.add(url);
  } catch {}
}

export function discoverFeatureLinks(html: string, baseUrl: string) {
  const $ = load(html);
  const out = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (!href.includes("/keiba/race/") && !href.includes("/keiba/g1/") && !href.includes("/JRADB/accessD.html")) return;
    const url = absoluteJraUrl(href, baseUrl);
    if (url) out.add(url);
  });
  return [...out];
}

export function discoverRaceCardLinks(html: string, baseUrl: string) {
  const $ = load(html);
  const out = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (href.includes("/JRADB/accessD.html")) pushJraUrl(out, href, baseUrl);
  });
  const fullPath = /(?:https?:\/\/(?:www\.)?jra\.go\.jp)?(\/JRADB\/accessD\.html\?CNAME=[^"'<>\s]+)/g;
  for (const match of html.matchAll(fullPath)) pushJraUrl(out, match[1].replace(/&amp;/g, "&"), baseUrl);
  const cname = /(pw01dde[0-9A-Za-z%/_-]{12,})/g;
  for (const match of html.matchAll(cname)) pushJraUrl(out, "/JRADB/accessD.html?CNAME=" + match[1].replace(/&amp;/g, "&"), baseUrl);
  return [...out];
}

function inferGateFromHorseNo(horseNo: number | null, fieldSize: number): number | null {
  if (horseNo == null || horseNo < 1 || fieldSize < 1 || fieldSize > 18 || horseNo > fieldSize) return null;
  if (fieldSize <= 8) return horseNo;
  const capacities = Array.from({ length: 8 }, () => 1);
  let remaining = fieldSize - 8;
  while (remaining > 0) {
    for (let gate = 7; gate >= 0 && remaining > 0; gate -= 1) {
      capacities[gate] += 1;
      remaining -= 1;
    }
  }
  let upper = 0;
  for (let gate = 0; gate < capacities.length; gate += 1) {
    upper += capacities[gate];
    if (horseNo <= upper) return gate + 1;
  }
  return null;
}
function fillMissingGates(entries: JraEntry[]) {
  const horseNos = entries.map((entry) => entry.horseNo).filter((value): value is number => value != null);
  const fieldSize = Math.max(entries.length, ...horseNos, 0);
  return entries.map((entry) => entry.gate != null ? entry : { ...entry, gate: inferGateFromHorseNo(entry.horseNo, fieldSize) });
}

export function parseRaceCard(html: string, sourceUrl: string): JraRaceCard {
  const race = parseJraRaceHeader(html, sourceUrl);
  const $ = load(html);
  const table = $("table").filter((_, el) => {
    const text = clean($(el).text());
    return text.includes("馬名") && text.includes("騎手");
  }).first();
  if (!table.length) throw new Error("JRA出馬表から出走馬を取得できない");

  const headerRow = table.find("tr").filter((_, tr) => clean($(tr).find("th").text()).includes("馬名")).first();
  const headers: string[] = [];
  headerRow.children("th").each((i, th) => { headers[i] = clean($(th).text()); });
  const find = (...keys: string[]) => headers.findIndex((h) => keys.some((k) => h.includes(k)));
  const gateIdx = find("枠");
  const noIdx = find("馬番");
  const horseIdx = find("馬名");
  const sexIdx = find("性齢");
  const jockeyIdx = find("騎手");
  const trainerIdx = find("調教師", "厩舎");
  const rows: JraEntry[] = [];

  table.find("tr").each((_, tr) => {
    const cells = $(tr).children("td");
    if (!cells.length) return;
    const rowText = clean($(tr).text());
    const entryStatus: JraEntry["entryStatus"] = rowText.includes("除外") ? "EXCLUDED" : rowText.includes("取消") ? "SCRATCHED" : "ACTIVE";
    const horseCell = horseIdx >= 0 ? cells.eq(horseIdx) : cells.eq(Math.min(2, cells.length - 1));
    const sexCell = sexIdx >= 0 ? cells.eq(sexIdx) : cells.eq(Math.min(3, cells.length - 1));
    const horseCellText = clean(horseCell.text());
    const horseLink = horseCell.find("a[href*='/horse/']").first();
    let horseName = clean(horseLink.text()) || clean(horseCellText.split(" ")[0]);
    horseName = clean(horseName.replace(/(?:除外|取消)$/, ""));
    if (!horseName || /^(?:馬名|父|母)$/.test(horseName)) return;

    const gateCell = gateIdx >= 0 ? cells.eq(gateIdx) : null;
    const gate = gateCell ? toInt(gateCell.text()) ?? embeddedInt(gateCell.find("img").first().attr("alt")) ?? embeddedInt(gateCell.find("img").first().attr("title")) : null;
    const horseNo = noIdx >= 0 ? toInt(cells.eq(noIdx).text()) : toInt(rowText.match(/(?:^|\s)(\d{1,2})(?:\s|$)/)?.[1]);
    const odds = horseCellText.match(/(\d+(?:\.\d+)?)\s*\((\d+)番人気\)/);
    const body = horseCellText.match(/(\d{3})\s*kg\s*\(([+-]?\d+)\)/);
    const sexAge = clean(sexCell.text()).match(/(牡|牝|セ|せん)(\d+)\s*[/／]\s*([^\s]+)/);
    const carried = clean(sexCell.text()).match(/(\d{2}(?:\.\d)?)\s*kg/);
    const jockeyCell = jockeyIdx >= 0 ? cells.eq(jockeyIdx) : sexCell;
    const jockeyLink = jockeyCell.find("a[href]").last();
    let jockeyName = cleanJockeyName(jockeyLink.text());
    if (!jockeyName && jockeyIdx >= 0) jockeyName = cleanJockeyName(jockeyCell.text());

    const trainerCellText = trainerIdx >= 0 ? clean(cells.eq(trainerIdx).text()) : "";
    const trainerLink = $(tr).find("a[href]").filter((_, a) => /trainer|chokyo|chokyosi/i.test($(a).attr("href") ?? "")).first();
    let trainerName = clean(trainerLink.text()) || null;
    if (!trainerName && trainerCellText && trainerCellText.length <= 24) trainerName = trainerCellText;

    const sire = horseCellText.match(/父[：:]\s*([^\s]+)/)?.[1] ?? null;
    const dam = horseCellText.match(/母[：:]\s*([^\s(]+)(?:\(母の父[：:]\s*([^)]+)\))?/);

    rows.push({
      raceKey: race.raceKey,
      canonicalHorseId: null,
      gate, horseNo, horseName, entryStatus,
      sex: canonicalSex(sexAge?.[1]),
      age: sexAge ? Number(sexAge[2]) : null,
      coatColor: sexAge?.[3] ?? null,
      carriedWeight: toFloat(carried?.[1]),
      jockeyName,
      trainerName,
      bodyWeight: toInt(body?.[1]),
      bodyWeightDiff: body ? Number(body[2]) : null,
      winOdds: toFloat(odds?.[1]),
      popularity: toInt(odds?.[2]),
      sire,
      dam: dam?.[1] ?? null,
      damsire: dam?.[2] ?? null,
    });
  });

  const unique = new Map<string, JraEntry>();
  for (const entry of rows) {
    const id = String(entry.horseNo ?? "") + ":" + entry.horseName;
    if (!unique.has(id)) unique.set(id, entry);
  }
  const entries = fillMissingGates([...unique.values()].sort((a,b) => (a.horseNo ?? 99) - (b.horseNo ?? 99)));
  if (!entries.length) throw new Error("JRA出馬表から出走馬を取得できない");
  if (!parseJraRaceIdentity(sourceUrl)) throw new Error("JRA正式出馬表URLではない");
  return { race, entries, officialNumbered: false };
}
