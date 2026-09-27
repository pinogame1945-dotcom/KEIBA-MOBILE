import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { JraRace, VenueConditionSnapshot } from "../domain/live";
import type { StoredRaceWeek } from "../domain/raceArchiveWeeks";
import { raceStartEpoch } from "../data/jra/oddsAvailability";
import { raceCourseLabel, raceStateLabel } from "../ui/raceLabels";
import {
  getVenueConditionSnapshot, listRaceKeysWithResults, listRacesForDates, listRacingWeekRaces,
  listStoredRaceWeeks, localTodayIso,
} from "../repositories/liveRepository";
import { refreshScheduleTarget } from "../services/scheduleTargetService";
import { refreshTodayVenueConditions } from "../services/venueConditionService";
import {
  refreshCurrentWeekRaceData, type RaceRefreshProgress,
} from "../services/raceRefreshService";

type Props = {
  onOpenRace: (raceKey: string) => void;
  onBack?: () => void;
  active?: boolean;
  cacheRevision?: number;
};

const WEEKDAY = ["日","月","火","水","木","金","土"];

function dateLabel(iso: string) {
  const [y,m,d] = iso.split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  return `${m}/${d}(${WEEKDAY[date.getDay()]})`;
}

function archiveWeekLabel(week: StoredRaceWeek) {
  const [sy,sm,sd]=week.startDate.split("-").map(Number);
  const [ey,em,ed]=week.endDate.split("-").map(Number);
  if (week.startDate===week.endDate) return `${sy}/${sm}/${sd}`;
  if (sy===ey) return `${sy}/${sm}/${sd}〜${em}/${ed}`;
  return `${sy}/${sm}/${sd}〜${ey}/${em}/${ed}`;
}

function localTimeLabel(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return String(date.getHours()).padStart(2,"0") + ":" + String(date.getMinutes()).padStart(2,"0");
}

export function WeekRacesScreen({
  onOpenRace,
  onBack,
  active = true,
  cacheRevision = 0,
}: Props) {
  const [races, setRaces] = useState<JraRace[]>([]);
  const [resultKeys, setResultKeys] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState<RaceRefreshProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [venueSnapshot, setVenueSnapshot] = useState<VenueConditionSnapshot | null>(null);
  const [storedWeeks, setStoredWeeks] = useState<StoredRaceWeek[]>([]);
  const [selectedWeekKey, setSelectedWeekKey] = useState("CURRENT");
  const isCurrentWeek = selectedWeekKey === "CURRENT";

  const load = useCallback(async () => {
    const [currentRaces,weeks] = await Promise.all([
      listRacingWeekRaces(),
      listStoredRaceWeeks(),
    ]);
    const currentDates = new Set(currentRaces.map((race) => race.raceDate));
    const archiveWeeks = weeks.filter((week) => !week.dates.some((date) => currentDates.has(date)));
    setStoredWeeks(archiveWeeks);

    let nextRaces = currentRaces;
    if (selectedWeekKey !== "CURRENT") {
      const selectedWeek = archiveWeeks.find((week) => week.key === selectedWeekKey);
      if (selectedWeek) {
        nextRaces = await listRacesForDates(selectedWeek.dates);
      } else {
        setSelectedWeekKey("CURRENT");
      }
    }

    const dates = [...new Set(nextRaces.map((race) => race.raceDate))];
    const keys = await listRaceKeysWithResults(dates);
    setRaces(nextRaces);
    setResultKeys(new Set(keys));
    return nextRaces;
  }, [selectedWeekKey]);

  const refresh = useCallback(async () => {
    if (refreshing || !isCurrentWeek) return;
    setRefreshing(true);
    setError(null);
    try {
      await refreshScheduleTarget(true);
      await load();
      await Promise.allSettled([
        refreshTodayVenueConditions(true).then(() => load()),
        refreshCurrentWeekRaceData(setProgress, async () => { await load(); }),
      ]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }, [isCurrentWeek, load, refreshing]);

  useEffect(() => {
    if (!active) return;
    void load().catch((e) => {
      setError(e instanceof Error ? e.message : String(e));
    });
  }, [active, cacheRevision, load]);

  useEffect(() => {
    setSelectedDate(null);
    setSelectedVenue(null);
    setVenueSnapshot(null);
    setError(null);
  }, [selectedWeekKey]);

  const actualDates = useMemo(
    () => [...new Set(races.map((race) => race.raceDate))].sort(),
    [races],
  );

  useEffect(() => {
    if (!actualDates.length) return;
    if (selectedDate && actualDates.includes(selectedDate)) return;
    const today = localTodayIso();
    setSelectedDate(actualDates.includes(today) ? today : actualDates[0]);
  }, [actualDates, selectedDate]);

  const dayRaces = useMemo(
    () => selectedDate ? races.filter((race) => race.raceDate === selectedDate) : [],
    [races, selectedDate],
  );
  const venues = useMemo(() => [...new Set(dayRaces.map((race) => race.venue))], [dayRaces]);

  useEffect(() => {
    if (!venues.length) {
      setSelectedVenue(null);
      return;
    }
    if (!selectedVenue || !venues.includes(selectedVenue)) setSelectedVenue(venues[0]);
  }, [venues, selectedVenue]);

  const visible = useMemo(
    () => dayRaces.filter((race) => race.venue === selectedVenue).sort((a,b) => a.raceNo - b.raceNo),
    [dayRaces, selectedVenue],
  );

  useEffect(() => {
    if (!selectedDate || !selectedVenue) {
      setVenueSnapshot(null);
      return;
    }
    let cancelled = false;
    void getVenueConditionSnapshot(selectedDate, selectedVenue)
      .then((snapshot) => { if (!cancelled) setVenueSnapshot(snapshot ?? null); })
      .catch(() => { if (!cancelled) setVenueSnapshot(null); });
    return () => { cancelled = true; };
  }, [selectedDate, selectedVenue, cacheRevision, refreshing]);

  const now = Date.now();
  const nextRaceKey = visible
    .filter((race) => {
      const start = raceStartEpoch(race);
      return race.scheduleStatus === "ACTIVE" &&
        race.raceStatus !== "CANCELLED" &&
        race.raceStatus !== "ABANDONED" &&
        start != null && start > now;
    })
    .sort((a,b) => (raceStartEpoch(a) ?? Infinity) - (raceStartEpoch(b) ?? Infinity))[0]?.raceKey ?? null;

  const snapshotUsable = Boolean(
    venueSnapshot &&
    selectedDate &&
    venueSnapshot.sourceObservedDate === selectedDate &&
    (venueSnapshot.weather || venueSnapshot.turfCondition || venueSnapshot.dirtCondition),
  );
  const currentSnapshot = snapshotUsable ? venueSnapshot : null;
  const latestWeatherRace = [...visible].reverse().find((item) => item.weather);
  const latestTurfRace = [...visible].reverse().find(
    (item) => item.surface === "TURF" && item.trackCondition,
  );
  const latestDirtRace = [...visible].reverse().find(
    (item) => item.surface === "DIRT" && item.trackCondition,
  );
  const resultWeather = latestWeatherRace?.weather ?? null;
  const resultTurf = latestTurfRace?.trackCondition ?? null;
  const resultDirt = latestDirtRace?.trackCondition ?? null;
  const venueWeather = resultWeather ?? currentSnapshot?.weather ?? null;
  const venueTurf = resultTurf ?? currentSnapshot?.turfCondition ?? null;
  const venueDirt = resultDirt ?? currentSnapshot?.dirtCondition ?? null;
  const venueStatusText = [
    venueWeather ? "天候 " + venueWeather : null,
    venueTurf ? "芝 " + venueTurf : null,
    venueDirt ? "ダ " + venueDirt : null,
  ].filter(Boolean).join(" / ") || (venueSnapshot ? "馬場情報 更新待ち" : "馬場情報 未取得");
  const usesResultCondition = Boolean(resultWeather || resultTurf || resultDirt);
  const usesSnapshotCondition = Boolean(
    currentSnapshot && (
      (!resultWeather && currentSnapshot.weather) ||
      (!resultTurf && currentSnapshot.turfCondition) ||
      (!resultDirt && currentSnapshot.dirtCondition)
    ),
  );
  const venueSourceText = usesResultCondition && usesSnapshotCondition
    ? "結果情報＋JRA馬場"
    : usesResultCondition
      ? "結果情報から取得"
      : usesSnapshotCondition
        ? currentSnapshot?.sourceObservedLabel
          ? "JRA " + currentSnapshot.sourceObservedLabel
          : "JRA馬場情報"
        : venueSnapshot
          ? "JRA馬場情報 更新待ち"
          : "馬場取得時刻なし";

  const conditionForRace = (race: JraRace) => {
    const weather = race.weather ?? currentSnapshot?.weather ?? null;
    if (race.discipline === "OBSTACLE" || race.surface === "MIXED") {
      const turf = currentSnapshot?.turfCondition ?? null;
      const dirt = currentSnapshot?.dirtCondition ?? null;
      const genericTrack = !turf && !dirt ? race.trackCondition : null;
      return [
        weather ? "天候 " + weather : null,
        turf ? "芝 " + turf : null,
        dirt ? "ダ " + dirt : null,
        genericTrack ? "馬場 " + genericTrack : null,
      ].filter((value): value is string => Boolean(value));
    }
    if (race.surface === "DIRT") {
      const dirt = race.trackCondition ?? currentSnapshot?.dirtCondition ?? null;
      return [
        weather ? "天候 " + weather : null,
        dirt ? "ダ " + dirt : null,
      ].filter((value): value is string => Boolean(value));
    }
    const turf = race.trackCondition ?? currentSnapshot?.turfCondition ?? null;
    return [
      weather ? "天候 " + weather : null,
      turf ? "芝 " + turf : null,
    ].filter((value): value is string => Boolean(value));
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerSide}>
            {onBack ? <TouchableOpacity onPress={onBack}><Text style={styles.backArrow}>←</Text></TouchableOpacity> : null}
          </View>
          <Text style={styles.title}>{isCurrentWeek ? "今週のレース" : "過去のレース"}</Text>
          {isCurrentWeek ? (
            <TouchableOpacity style={styles.headerSide} onPress={() => void refresh()} disabled={refreshing}>
              <Text style={styles.live}>{refreshing ? "更新中" : "● LIVE"}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.headerSide}><Text style={styles.archiveMark}>保存済み</Text></View>
          )}
        </View>

        {refreshing && (
          <View style={styles.progress}>
            <ActivityIndicator />
            <Text style={styles.progressText}>{progress?.message ?? "JRAを確認中"}</Text>
          </View>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekTabs}>
          <TouchableOpacity
            style={[styles.weekTab, isCurrentWeek && styles.weekTabActive]}
            onPress={() => setSelectedWeekKey("CURRENT")}
          >
            <Text style={[styles.weekText, isCurrentWeek && styles.weekTextActive]}>今週</Text>
          </TouchableOpacity>
          {storedWeeks.map((week) => {
            const activeWeek = selectedWeekKey === week.key;
            return (
              <TouchableOpacity
                key={week.key}
                style={[styles.weekTab, activeWeek && styles.weekTabActive]}
                onPress={() => setSelectedWeekKey(week.key)}
              >
                <Text style={[styles.weekText, activeWeek && styles.weekTextActive]}>
                  {archiveWeekLabel(week)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {!!actualDates.length && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateTabs}>
            {actualDates.map((date) => {
              const isToday = date === localTodayIso();
              return (
                <TouchableOpacity
                  key={date}
                  style={[styles.dateTab, selectedDate === date && styles.dateTabActive]}
                  onPress={() => setSelectedDate(date)}
                >
                  <Text style={[styles.dateText, selectedDate === date && styles.dateTextActive]}>{dateLabel(date)}</Text>
                  {isToday ? <Text style={[styles.todayText, selectedDate === date && styles.todayTextActive]}>今日</Text> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {!!venues.length && (
          <View style={styles.venueTabs}>
            {venues.map((venue) => (
              <TouchableOpacity
                key={venue}
                style={[styles.venueTab, selectedVenue === venue && styles.venueTabActive]}
                onPress={() => setSelectedVenue(venue)}
              >
                <Text style={[styles.venueText, selectedVenue === venue && styles.venueTextActive]}>{venue}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {selectedVenue && visible.length ? (
          <View style={styles.venueStatus}>
            <View>
              <Text style={styles.venueStatusTitle}>{selectedVenue}</Text>
              <Text style={styles.venueStatusMeta}>
                {venueStatusText}
              </Text>
            </View>
            <Text style={styles.updated}>{venueSourceText}</Text>
          </View>
        ) : null}

        {!races.length && !refreshing ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {isCurrentWeek ? "今週の開催データがない" : "この開催週の保存データがない"}
            </Text>
            <Text style={styles.emptyBody}>
              {isCurrentWeek ? "右上のLIVE更新でJRA開催日程を取得する。" : "保存済みレースを確認できない。"}
            </Text>
          </View>
        ) : null}

        {visible.map((race) => {
          const state = raceStateLabel(race, resultKeys.has(race.raceKey), now);
          const isNext = race.raceKey === nextRaceKey;
          const isPast = (raceStartEpoch(race) ?? Infinity) <= now;
          const isFinal = state === "結果確定";
          const isDisrupted = race.scheduleStatus === "RESCHEDULED" ||
            race.raceStatus === "CANCELLED" || race.raceStatus === "ABANDONED";
          return (
            <TouchableOpacity
              key={race.raceKey}
              style={[
                styles.raceCard,
                isNext && styles.raceCardNext,
                isPast && !isNext && !isDisrupted && !isFinal && styles.raceCardPast,
                isDisrupted && styles.raceCardDisrupted,
              ]}
              onPress={() => onOpenRace(race.raceKey)}
            >
              <View style={styles.raceNoBlock}>
                <Text style={styles.raceNo}>{race.raceNo}R</Text>
                <Text style={styles.start}>{race.startTime ?? "--:--"}</Text>
                {isNext ? <Text style={styles.nextBadge}>NEXT</Text> : null}
                {!isNext && isFinal ? <Text style={styles.resultBadge}>結果確定</Text> : null}
              </View>
              <View style={styles.raceMain}>
                <Text style={styles.raceName}>{race.raceName ?? "レース名取得待ち"}</Text>
                <Text style={styles.raceMeta}>
                  {[race.raceClass, raceCourseLabel(race)].filter(Boolean).join("　") || "詳細取得待ち"}
                </Text>
                <Text style={styles.raceCondition}>
                  {[...conditionForRace(race), isFinal ? null : state].filter(Boolean).join(" / ")}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f4f6f8" },
  container: { padding: 16, paddingBottom: 28, gap: 12 },
  header: { height: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerSide: { width: 72, alignItems: "flex-start" },
  backArrow: { color: "#111827", fontSize: 28, fontWeight: "800" },
  title: { fontSize: 24, fontWeight: "900", color: "#111827" },
  live: { color: "#6b7280", fontSize: 11, fontWeight: "900" },
  archiveMark: { color: "#6b7280", fontSize: 10, fontWeight: "900" },
  weekTabs: { gap: 7, paddingVertical: 1 },
  weekTab: {
    minHeight: 34, borderRadius: 17, backgroundColor: "#e5e7eb",
    paddingHorizontal: 13, alignItems: "center", justifyContent: "center",
  },
  weekTabActive: { backgroundColor: "#111827" },
  weekText: { color: "#4b5563", fontSize: 11, fontWeight: "900" },
  weekTextActive: { color: "#fff" },
  progress: { backgroundColor: "#fff", borderRadius: 12, padding: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  progressText: { color: "#374151", fontSize: 12, fontWeight: "700", flex: 1 },
  error: { backgroundColor: "#fee2e2", color: "#991b1b", borderRadius: 12, padding: 10, fontSize: 11 },
  dateTabs: { gap: 8 },
  dateTab: { minWidth: 112, backgroundColor: "#e5e7eb", borderRadius: 18, paddingVertical: 13, paddingHorizontal: 12, alignItems: "center" },
  dateTabActive: { backgroundColor: "#111827" },
  dateText: { color: "#4b5563", fontSize: 13, fontWeight: "900" },
  dateTextActive: { color: "#fff" },
  todayText: { color: "#6b7280", fontSize: 9, fontWeight: "800", marginTop: 2 },
  todayTextActive: { color: "#9ca3af" },
  venueTabs: { backgroundColor: "#e5e7eb", borderRadius: 16, padding: 4, flexDirection: "row" },
  venueTab: { flex: 1, minHeight: 54, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  venueTabActive: { backgroundColor: "#fff" },
  venueText: { color: "#6b7280", fontSize: 17, fontWeight: "900" },
  venueTextActive: { color: "#111827" },
  venueStatus: { backgroundColor: "#111827", borderRadius: 18, padding: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  venueStatusTitle: { color: "#fff", fontSize: 17, fontWeight: "900" },
  venueStatusMeta: { color: "#d1d5db", fontSize: 11, fontWeight: "700", marginTop: 4 },
  updated: { color: "#9ca3af", fontSize: 10 },
  emptyCard: { backgroundColor: "#fff", borderRadius: 18, padding: 20 },
  emptyTitle: { fontSize: 17, fontWeight: "900", color: "#111827" },
  emptyBody: { marginTop: 5, color: "#6b7280", fontSize: 12 },
  raceCard: { backgroundColor: "#fff", borderRadius: 18, padding: 15, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "transparent" },
  raceCardNext: { borderWidth: 2, borderColor: "#111827" },
  raceCardPast: { opacity: 0.55 },
  raceCardDisrupted: { opacity: 0.72 },
  raceNoBlock: { width: 68, alignItems: "center" },
  raceNo: { fontSize: 20, fontWeight: "900", color: "#111827" },
  start: { marginTop: 3, color: "#6b7280", fontSize: 12, fontWeight: "700" },
  nextBadge: { marginTop: 5, backgroundColor: "#111827", color: "#fff", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, fontSize: 8, fontWeight: "900" },
  resultBadge: {
    marginTop: 5, backgroundColor: "#111827", color: "#fff", borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 3, fontSize: 8, fontWeight: "900",
  },
  raceMain: { flex: 1 },
  raceName: { color: "#111827", fontSize: 16, fontWeight: "900" },
  raceMeta: { marginTop: 5, color: "#4b5563", fontSize: 11, fontWeight: "800" },
  raceCondition: { marginTop: 3, color: "#9ca3af", fontSize: 10 },
  chevron: { color: "#9ca3af", fontSize: 28, fontWeight: "300" },
});
