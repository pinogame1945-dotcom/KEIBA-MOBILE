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
  week.includes("[venueStatusRace.weather, venueStatusRace.trackCondition]"),
  "venue header should keep only venue-level weather/track condition summary",
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

console.log("LIVE UI contract: PASS");
