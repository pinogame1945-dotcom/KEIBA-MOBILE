import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const week = readFileSync(new URL("../src/screens/WeekRacesScreen.tsx", import.meta.url), "utf8");
const race = readFileSync(new URL("../src/screens/RaceCardScreen.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

assert.ok(
  !week.includes("surfaceLabel(venueStatusRace.surface)"),
  "venue header must not present one race surface as a meeting-wide attribute",
);
assert.ok(
  week.includes("venueSnapshot.sourceObservedDate === selectedDate") &&
  week.includes("latestTurfRace") &&
  week.includes("latestDirtRace") &&
  week.includes('"天候 " + venueWeather') &&
  week.includes('"芝 " + venueTurf') &&
  week.includes('"ダ " + venueDirt'),
  "venue conditions must combine same-day JRA snapshot data with latest race-result weather/turf/dirt data",
);

for (const token of [
  "horseOddsReturnRef",
  "cardScrollYRef",
  "pendingCardRestoreYRef",
  "scrollRef.current?.scrollTo",
  "BackHandler.addEventListener",
  "horseOddsReturnRef.current = { scrollY: cardScrollYRef.current",
]) {
  assert.ok(race.includes(token), "horse-odds return contract missing: " + token);
}
assert.ok(
  race.includes('if (tab === "CARD" && horseOddsReturnRef.current)'),
  "CARD tab must consume the horse-odds return context instead of losing scroll history",
);
assert.ok(
  race.includes('onPress={handleBack}'),
  "header back must honor the internal horse-odds return path before leaving the race",
);
assert.ok(
  race.includes('"確定結果を確認中"') && !race.includes('"JRA公式結果を確認中"'),
  "result waiting copy must match the multi-source result pipeline",
);
assert.ok(
  race.includes("✓ 最終オッズ") && race.includes("finalOddsConfirmedAt"),
  "JRA-confirmed final odds must be visible and stop manual refresh",
);
assert.ok(
  app.includes('if (last?.type === "RACE") return [...prev.slice(0, -1), next]') &&
  app.includes('lastIndexOf("WEEK")') &&
  !app.includes("combined.length > 6"),
  "race-to-race navigation must replace the route while preserving the parent screen",
);


for (const token of [
  "listRacingWeekRaces",
  "meetingSwitcherOpen",
  "meetingSwitchOptions",
  'candidate.scheduleStatus !== "ACTIVE"',
  'candidate.raceStatus === "CANCELLED"',
  'candidate.raceStatus === "ABANDONED"',
  "candidate.raceNo === race.raceNo",
  "meetingSwitchRows",
  "meetingSwitchRow",
  "meetingVenueScroller",
  "meetingSwitchChip",
  "setMeetingSwitcherOpen(false)",
]) {
  assert.ok(race.includes(token), "race meeting switcher contract missing: " + token);
}

assert.ok(
  race.includes('meetingSwitchRowDate: { width: 62') &&
  race.includes('minWidth: 64, minHeight: 34') &&
  race.includes('horizontal') &&
  !race.includes("meetingSwitcherGrid") &&
  !race.includes("meetingSwitchButton:"),
  "meeting switcher must use compact date rows with horizontally scalable venue chips",
);

assert.ok(
  !race.includes('style={styles.raceNavCenter} onPress={onOpenWeek}'),
  "center race navigation must open the meeting switcher instead of returning to the week list",
);
assert.ok(
  race.includes('if (meetingSwitcherOpen)') &&
  race.includes('setMeetingSwitcherOpen(false);') &&
  race.includes('BackHandler.addEventListener'),
  "back must close the meeting switcher before leaving the race",
);
assert.ok(
  app.includes('if (last?.type === "RACE") return [...prev.slice(0, -1), next]'),
  "meeting switching must replace the current race route instead of growing navigation history",
);


assert.ok(
  week.includes("!isFinal && styles.raceCardPast") &&
  week.includes("<Text style={styles.resultBadge}>結果確定</Text>") &&
  !week.includes('<Text style={styles.resultBadge}>結果</Text>'),
  "final races must stay readable and use an explicit result-confirmed badge",
);
assert.ok(
  week.includes("isFinal ? null : state") &&
  week.includes('"天候 " + weather') &&
  week.includes('"ダ " + dirt') &&
  week.includes('"芝 " + turf'),
  "race rows must use labeled weather/surface conditions without duplicating final state text",
);
assert.ok(
  race.includes("autoOddsAttemptAt") &&
  race.includes("nowMs - autoOddsAttemptAt.current < 60 * 1000") &&
  !race.includes("autoOddsStarted"),
  "missing odds must retry on a bounded interval instead of latching after one attempt",
);
assert.ok(
  race.includes("venueSnapshot.sourceObservedDate === race.raceDate"),
  "race detail must not treat a stale venue snapshot as current conditions",
);

console.log("LIVE UI contract: PASS");
