import { load } from "cheerio";
import type { JraRaceCard } from "../../domain/live";
import { parseJraRaceIdentity } from "./raceHeaderParser";

function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
function intValue(value: string | null | undefined) {
  const match = clean(value).match(/\d+/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

export function markOfficialNumberedRaceCard(html: string, card: JraRaceCard): JraRaceCard {
  const identity = parseJraRaceIdentity(card.race.sourceUrl);
  if (!identity) throw new Error("JRA正式出馬表URLではない");
  if (identity.raceDate !== card.race.raceDate || identity.venue !== card.race.venue || identity.raceNo !== card.race.raceNo) {
    throw new Error("出馬表URLと解析結果のレースidentityが一致しない");
  }

  const $ = load(html);
  const table = $("table").filter((_, el) => {
    const text = clean($(el).text());
    return text.includes("馬名") && text.includes("騎手");
  }).first();
  if (!table.length) throw new Error("出馬表テーブルがない");

  const headerRow = table.find("tr").filter((_, tr) => clean($(tr).find("th").text()).includes("馬名")).first();
  const headers: string[] = [];
  headerRow.children("th").each((index, th) => { headers[index] = clean($(th).text()); });
  const gateIdx = headers.findIndex((value) => value.includes("枠"));
  const horseNoIdx = headers.findIndex((value) => value.includes("馬番"));
  const horseIdx = headers.findIndex((value) => value.includes("馬名"));
  if (gateIdx < 0 || horseNoIdx < 0 || horseIdx < 0) {
    throw new Error("馬番・枠番号が明示された正式出馬表ではない");
  }

  const explicitRows: Array<{ gate: number; horseNo: number }> = [];
  let invalid = false;
  table.find("tr").each((_, tr) => {
    const cells = $(tr).children("td");
    if (!cells.length) return;
    const horseCell = cells.eq(horseIdx);
    if (!clean(horseCell.text()) && !clean(horseCell.find("a").first().text())) return;
    const gateCell = cells.eq(gateIdx);
    const gate = intValue(gateCell.text()) ?? intValue(gateCell.find("img").first().attr("alt")) ?? intValue(gateCell.find("img").first().attr("title"));
    const horseNo = intValue(cells.eq(horseNoIdx).text());
    if (gate == null || gate < 1 || gate > 8 || horseNo == null || horseNo < 1 || horseNo > 18) {
      invalid = true;
      return;
    }
    explicitRows.push({ gate, horseNo });
  });
  if (invalid || !explicitRows.length || card.entries.length !== explicitRows.length) {
    throw new Error("HTML上の正式馬番・枠番と解析結果が一致しない");
  }

  const gateByNo = new Map(explicitRows.map((row) => [row.horseNo, row.gate] as const));
  const seen = new Set<number>();
  for (const entry of card.entries) {
    if (entry.horseNo == null || entry.gate == null || gateByNo.get(entry.horseNo) !== entry.gate || seen.has(entry.horseNo)) {
      throw new Error("解析馬番・枠番が正式出馬表と一致しない");
    }
    seen.add(entry.horseNo);
  }
  return { ...card, officialNumbered: true };
}
