import { load } from "cheerio";
import { absoluteJraUrl } from "./http.ts";

export type VenueConditionSnapshot = {
  venue: string;
  raceDate: string | null;
  observedLabel: string | null;
  weather: string | null;
  turfCondition: string | null;
  dirtCondition: string | null;
  sourceUrl: string;
};

function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function isoDate(text: string) {
  const m = text.match(/((?:19|20)\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  return m
    ? `${m[1]}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[3])).padStart(2, "0")}`
    : null;
}

export function discoverVenueConditionUrl(html: string, venue: string, baseUrl: string) {
  const $ = load(html);
  const title = clean($("h1").first().text()) + " " + clean($("title").text());
  if (title.includes(venue + "競馬場")) return baseUrl;

  let found: string | null = null;
  $("a[href]").each((_, el) => {
    if (found) return;
    const label = clean($(el).text());
    if (!label.includes(venue + "競馬場")) return;
    found = absoluteJraUrl($(el).attr("href") ?? "", baseUrl);
  });
  return found;
}

export function parseVenueConditionPage(
  html: string,
  venue: string,
  sourceUrl: string,
): VenueConditionSnapshot {
  const $ = load(html);
  const pageText = clean($.root().text());

  if (!pageText.includes(venue + "競馬場")) {
    throw new Error("JRA馬場情報の競馬場が一致しない");
  }

  const start = pageText.indexOf("馬場状態");
  if (start < 0) throw new Error("JRA馬場情報の現況を確認できない");

  // The current JRA page places a "馬場状態に関する基礎知識" link immediately
  // after the heading and before the actual weather/track values. Treating that link
  // as the end marker produced a successful-but-empty snapshot.
  const endCandidates = ["芝のクッション値", "週間情報"]
    .map((token) => pageText.indexOf(token, start + 4))
    .filter((index) => index > start);
  const end = endCandidates.length ? Math.min(...endCandidates) : Math.min(pageText.length, start + 800);
  const block = pageText.slice(start, end);
  const headingWindow = pageText.slice(Math.max(0, start - 220), start + 40);

  const parsed = {
    venue,
    raceDate: isoDate(headingWindow),
    observedLabel: block.match(/馬場状態（(.+?現在)）/)?.[1] ?? null,
    weather: block.match(/天候[：:]?\s*(晴|曇|雨|小雨|雪|小雪)/)?.[1] ?? null,
    turfCondition: block.match(/芝\s*(良|稍重|重|不良)/)?.[1] ?? null,
    dirtCondition: block.match(/ダート\s*(良|稍重|重|不良)/)?.[1] ?? null,
    sourceUrl,
  };
  if (!parsed.weather && !parsed.turfCondition && !parsed.dirtCondition) {
    throw new Error("JRA馬場情報の天候・芝・ダート状態を取得できない");
  }
  return parsed;
}
