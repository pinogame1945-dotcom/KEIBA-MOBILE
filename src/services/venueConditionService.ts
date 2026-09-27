import { fetchJraHtml } from "../data/jra/http";
import {
  discoverVenueConditionUrl,
  parseVenueConditionPage,
  type VenueConditionSnapshot,
} from "../data/jra/venueConditionParser";
import {
  applyVenueConditions,
  getWeekMeta,
  listTodayRaces,
  localTodayIso,
  setWeekMeta,
} from "../repositories/liveRepository";

const BASE = "https://www.jra.go.jp/keiba/baba/";
const INTERVAL_MS = 5 * 60 * 1000;

function parsed(value: string | null) {
  const ms = value ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : 0;
}

async function fetchVenueSnapshot(venue: string) {
  const baseHtml = await fetchJraHtml(BASE);
  const url = discoverVenueConditionUrl(baseHtml, venue, BASE);
  if (!url) throw new Error("JRA馬場情報で" + venue + "を確認できない");

  const html = url === BASE ? baseHtml : await fetchJraHtml(url);
  return parseVenueConditionPage(html, venue, url);
}

async function applyIfCurrent(snapshot: VenueConditionSnapshot, today: string) {
  // 前日情報を当日現況として誤表示しない。
  if (snapshot.raceDate !== today) return false;
  if (!snapshot.weather && !snapshot.turfCondition && !snapshot.dirtCondition) return false;

  await applyVenueConditions(today, snapshot.venue, snapshot);
  return true;
}

export async function refreshTodayVenueConditions() {
  const races = await listTodayRaces();
  const today = localTodayIso();
  const venues = [...new Set(
    races
      .filter((race) => race.status === "OFFICIAL")
      .map((race) => race.venue),
  )];

  for (const venue of venues) {
    const key = "venue_condition_attempt:" + today + ":" + venue;
    const last = parsed(await getWeekMeta(key));
    if (last && Date.now() - last < INTERVAL_MS) continue;

    await setWeekMeta(key, new Date().toISOString());
    try {
      const snapshot = await fetchVenueSnapshot(venue);
      await applyIfCurrent(snapshot, today);
    } catch {
      // キャッシュ優先。取得失敗や前日情報で正しい既存値を消さない。
    }
  }
}
