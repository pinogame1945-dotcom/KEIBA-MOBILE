import { load } from "cheerio";
import type { ScheduleMeeting, ScheduleRace } from "../../domain/live";

const VENUES = ["札幌","函館","福島","新潟","東京","中山","中京","京都","阪神","小倉"];

function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
function dateFromDayUrl(url: string) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/calendar(\d{4})\/(\d{4})\/(\d{1,2})\/(\d{4})\.html$/);
    if (!match) return null;
    const year = Number(match[2]);
    const month = Number(match[3]);
    const md = match[4];
    const mm = Number(md.slice(0, 2));
    const dd = Number(md.slice(2, 4));
    if (year !== Number(match[1]) || month !== mm) return null;
    return String(year) + "-" + String(mm).padStart(2, "0") + "-" + String(dd).padStart(2, "0");
  } catch {
    return null;
  }
}
function parseSurface(text: string): ScheduleRace["surface"] {
  const turf = /（芝(?:・[^）]+)?）/.test(text);
  const dirt = /（ダ(?:ート)?(?:・[^）]+)?）/.test(text);
  if (turf && dirt) return "MIXED";
  if (turf) return "TURF";
  if (dirt) return "DIRT";
  return null;
}
function parseDistance(text: string) {
  const match = text.match(/([\d,]{3,5})\s*（(?:芝|ダ)/);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

export function calendarDayUrl(iso: string) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error("開催日の日付形式が不正");
  return "https://www.jra.go.jp/keiba/calendar" + m[1] + "/" + m[1] + "/" + Number(m[2]) + "/" + m[2] + m[3] + ".html";
}

export function parseCalendarDay(html: string, sourceUrl: string): ScheduleMeeting[] {
  const raceDate = dateFromDayUrl(sourceUrl);
  if (!raceDate) throw new Error("JRA開催日程URLの日付を解析できない");
  const $ = load(html);
  const text = clean($.root().text());
  const venuePattern = new RegExp("(\\d+)回(" + VENUES.join("|") + ")(\\d+)日", "g");
  const headings = [...text.matchAll(venuePattern)];
  const meetings: ScheduleMeeting[] = [];

  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i];
    const meetingNo = Number(heading[1]);
    const venue = heading[2];
    const meetingDay = Number(heading[3]);
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[i + 1]?.index ?? text.length;
    const section = text.slice(start, end);
    const raceStarts = [...section.matchAll(/(\d{1,2})レース/g)];
    const races: ScheduleRace[] = [];
    for (let raceIndex = 0; raceIndex < raceStarts.length; raceIndex += 1) {
      const startMatch = raceStarts[raceIndex];
      const chunkStart = startMatch.index ?? 0;
      const chunkEnd = raceStarts[raceIndex + 1]?.index ?? section.length;
      const chunk = section.slice(chunkStart, chunkEnd);
      const match = chunk.match(/^(\d{1,2})レース\s*\|?\s*(.+?)\s*\|?\s*(\d{1,2})時(\d{2})分/);
      if (!match) continue;
      const raceNo = Number(match[1]);
      if (!Number.isFinite(raceNo) || raceNo < 1) continue;
      const description = clean(match[2]).replace(/^\|\s*/, "").replace(/\s*\|$/, "");
      races.push({
        raceDate, venue, raceNo,
        raceName: description || null,
        startTime: String(Number(match[3])).padStart(2, "0") + ":" + match[4],
        discipline: description.includes("障害") ? "OBSTACLE" : "FLAT",
        surface: parseSurface(description),
        distanceM: parseDistance(description),
        sourceUrl,
      });
    }
    if (races.length) {
      const unique = new Map<number, ScheduleRace>();
      for (const race of races) if (!unique.has(race.raceNo)) unique.set(race.raceNo, race);
      meetings.push({ raceDate, venue, meetingNo, meetingDay, races: [...unique.values()].sort((a,b) => a.raceNo - b.raceNo) });
    }
  }
  if (!meetings.length) throw new Error("JRA開催日程からレース一覧を解析できない");
  return meetings;
}
