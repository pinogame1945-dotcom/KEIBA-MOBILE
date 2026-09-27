import { load } from "cheerio";
import type { JraRace } from "../../domain/live";

const VENUE_BY_CODE: Record<string, string> = {
  "01": "札幌", "02": "函館", "03": "福島", "04": "新潟", "05": "東京",
  "06": "中山", "07": "中京", "08": "京都", "09": "阪神", "10": "小倉",
};
const VENUES = Object.values(VENUE_BY_CODE);

export type JraRaceIdentity = {
  venueCode: string;
  venue: string;
  year: number;
  meetingNo: number;
  meetingDay: number;
  raceNo: number;
  raceDate: string;
};

function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
function intOrNull(value: string | null | undefined) {
  const n = Number.parseInt((value ?? "").replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}
function detectRaceClass(text: string) {
  const value = text.replace(/[\s　]/g, "").toUpperCase();
  if (/(?:GⅠ|GI(?!I)|G1|JPN1|J・GⅠ|JGⅠ)/.test(value)) return "G1";
  if (/(?:GⅡ|GII(?!I)|G2|JPN2|J・GⅡ|JGⅡ)/.test(value)) return "G2";
  if (/(?:GⅢ|GIII|G3|JPN3|J・GⅢ|JGⅢ)/.test(value)) return "G3";
  if (/(?:リステッド|\(L\))/.test(value)) return "L";
  if (/(?:3勝クラス|1600万)/.test(value)) return "3勝クラス";
  if (/(?:2勝クラス|1000万)/.test(value)) return "2勝クラス";
  if (/(?:1勝クラス|500万)/.test(value)) return "1勝クラス";
  if (/(?:新馬|メイクデビュー)/.test(value)) return "新馬";
  if (/未勝利/.test(value)) return "未勝利";
  if (/(?:オープン|OPEN)/.test(value)) return "OP";
  return null;
}
function isoDate(text: string) {
  const m = text.match(/((?:19|20)\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (!m) return null;
  return m[1] + "-" + String(Number(m[2])).padStart(2, "0") + "-" + String(Number(m[3])).padStart(2, "0");
}

export function parseJraRaceIdentity(sourceUrl: string): JraRaceIdentity | null {
  try {
    const url = new URL(sourceUrl);
    const cname = url.searchParams.get("CNAME");
    if (!cname) return null;
    const decoded = decodeURIComponent(cname);
    const token = decoded.split("/")[0];
    const match = token.match(/^pw01dde\d{2}(\d{2})(\d{4})(\d{2})(\d{2})(\d{2})(\d{8})$/);
    if (!match) return null;
    const venueCode = match[1];
    const venue = VENUE_BY_CODE[venueCode];
    if (!venue) return null;
    const raw = match[6];
    return {
      venueCode,
      venue,
      year: Number(match[2]),
      meetingNo: Number(match[3]),
      meetingDay: Number(match[4]),
      raceNo: Number(match[5]),
      raceDate: raw.slice(0, 4) + "-" + raw.slice(4, 6) + "-" + raw.slice(6, 8),
    };
  } catch {
    return null;
  }
}

export function canonicalRaceIdFromIdentity(identity: JraRaceIdentity | null): string | null {
  if (!identity) return null;
  return String(identity.year) + identity.venueCode +
    String(identity.meetingNo).padStart(2, "0") +
    String(identity.meetingDay).padStart(2, "0") +
    String(identity.raceNo).padStart(2, "0");
}

export function parseJraRaceHeader(html: string, sourceUrl: string): JraRace {
  const $ = load(html);
  const pageText = clean($.root().text());
  const bodyMarker = "ここから本文です";
  const bodyStart = pageText.indexOf(bodyMarker);
  const bodyPageText = bodyStart >= 0 ? pageText.slice(bodyStart) : pageText;
  const identity = parseJraRaceIdentity(sourceUrl);
  const bodyDate = isoDate(bodyPageText);
  const raceDate = identity?.raceDate ?? bodyDate;
  if (!raceDate) throw new Error("JRA出馬表の日付を解析できない");

  const bodyVenue = VENUES.find((name) => new RegExp("\\d+回" + name + "\\d+日").test(bodyPageText));
  const venue = identity?.venue ?? bodyVenue;
  if (!venue) throw new Error("JRA出馬表の競馬場を解析できない");

  const currentRaceNoMatch = bodyPageText.match(/(?:^|\s)([1-9]|1[0-2])レース\s*発走時刻[：:]/);
  const fallbackRaceNoMatch = identity ? null : bodyPageText.match(/(?:^|\s)([1-9]|1[0-2])レース(?:\s|$)/);
  const bodyRaceNo = Number((currentRaceNoMatch ?? fallbackRaceNoMatch)?.[1] ?? 0) || null;
  const raceNo = identity?.raceNo ?? bodyRaceNo;
  if (!raceNo) throw new Error("JRA出馬表のレース番号を解析できない");

  if (identity) {
    if (bodyDate && bodyDate !== identity.raceDate) throw new Error("JRA日付がURLと本文で不一致");
    if (bodyVenue && bodyVenue !== identity.venue) throw new Error("JRA競馬場がURLと本文で不一致");
    if (bodyRaceNo && bodyRaceNo !== identity.raceNo) throw new Error("JRAレース番号がURLと本文で不一致");
  }

  const startMatch = bodyPageText.match(/発走時刻[：:]\s*(\d{1,2})時(\d{2})分/);
  const startTime = startMatch ? String(Number(startMatch[1])).padStart(2, "0") + ":" + startMatch[2] : null;

  const entriesMarker = pageText.indexOf("馬名 / 単勝オッズ");
  const bodyText = pageText.slice(bodyStart >= 0 ? bodyStart : 0, entriesMarker > bodyStart ? entriesMarker : undefined);
  const invalidHeading = /^(?:緊急情報|検索ウィンドウ|関連メニュー|開催お知らせ|出馬表|オッズ|払戻金|レース結果|特別レース登録馬|開催日程|馬場情報|今週の注目レース|開催選択|レース選択)(?:\s.*)?$/;
  let raceName: string | null = null;
  $("h2").each((_, el) => {
    if (raceName) return;
    const text = clean($(el).text());
    if (!text || invalidHeading.test(text)) return;
    if (bodyStart >= 0 && !bodyText.includes(text)) return;
    raceName = text;
  });
  if (!raceName) {
    const match = bodyText.match(/発走時刻[：:]?\s*\d{1,2}時\d{2}分\s+(?:\d{1,2}レース\s+)?(.+?)\s+(?=(?:2歳|3歳|4歳|3歳以上|4歳以上|障害)\s)/);
    raceName = clean(match?.[1]) || null;
  }
  if (raceName && invalidHeading.test(raceName)) raceName = null;
  const raceClass = detectRaceClass(bodyText + " " + (raceName ?? ""));

  const course = bodyPageText.match(/コース[：:]\s*([\d,]+)メートル（([^）]+)）/);
  const distanceM = intOrNull(course?.[1]);
  const courseText = course?.[2] ?? "";
  const discipline = courseText.includes("障害") || raceName?.includes("障害") ? "OBSTACLE" as const : "FLAT" as const;
  const surface = courseText.includes("芝") && courseText.includes("ダート") ? "MIXED" as const
    : courseText.includes("芝") ? "TURF" as const
    : courseText.includes("ダート") ? "DIRT" as const : null;
  const direction = courseText.includes("左") ? "LEFT" as const : courseText.includes("右") ? "RIGHT" as const : null;
  // 出馬表本文には各馬の過去走馬場が含まれるため、ここでは現況を推測しない。
  // 開催日の天候・馬場は専用のJRA馬場情報から取得する。
  const weather = null;
  const trackCondition = null;

  return {
    raceKey: "JRA:" + raceDate + ":" + venue + ":" + raceNo,
    canonicalRaceId: canonicalRaceIdFromIdentity(identity),
    raceDate, venue, raceNo, raceName, raceClass, startTime, discipline, surface,
    distanceM, direction, weather, trackCondition, sourceUrl,
    fetchedAt: new Date().toISOString(),
    status: "OFFICIAL",
  };
}
