import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { JraRace } from "../domain/live";
import { raceStartEpoch } from "../data/jra/oddsAvailability";
import {
  listRaceKeysWithResults, listRacingWeekRaces, localTodayIso, racingWeekCandidateDates,
} from "../repositories/liveRepository";
import {
  refreshCurrentWeekRaceData, type RaceRefreshProgress,
} from "../services/raceRefreshService";

type Props = {
  onOpenRace: (raceKey: string) => void;
};

const WEEKDAY = ["日","月","火","水","木","金","土"];

function dateLabel(iso: string) {
  const [y,m,d] = iso.split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  return `${m}/${d}(${WEEKDAY[date.getDay()]})`;
}

function raceStateLabel(race: JraRace, resultKeys: Set<string>, now = Date.now()) {
  if (resultKeys.has(race.raceKey)) return "結果確定";
  const start = raceStartEpoch(race);
  if (start != null && start <= now) return "結果待ち";
  return race.status === "OFFICIAL" ? "出馬表" : "予定";
}

export function WeekRacesScreen({ onOpenRace }: Props) {
  const [races, setRaces] = useState<JraRace[]>([]);
  const [resultKeys, setResultKeys] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState<RaceRefreshProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const dates = racingWeekCandidateDates();
    const [nextRaces, keys] = await Promise.all([
      listRacingWeekRaces(),
      listRaceKeysWithResults(dates),
    ]);
    setRaces(nextRaces);
    setResultKeys(new Set(keys));
    return nextRaces;
  }, []);

  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      await refreshCurrentWeekRaceData(setProgress);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }, [load, refreshing]);

  useEffect(() => {
    void load().then((current) => {
      if (!current.length) void refresh();
    });
  }, [load]);

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

  const now = Date.now();
  const nextRaceKey = visible
    .filter((race) => {
      const start = raceStartEpoch(race);
      return start != null && start > now;
    })
    .sort((a,b) => (raceStartEpoch(a) ?? Infinity) - (raceStartEpoch(b) ?? Infinity))[0]?.raceKey ?? null;

  const venueStatusRace = [...visible].reverse().find((race) => race.weather || race.trackCondition || race.surface) ?? visible[0];

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerSide} />
          <Text style={styles.title}>今週のレース</Text>
          <TouchableOpacity style={styles.headerSide} onPress={() => void refresh()} disabled={refreshing}>
            <Text style={styles.live}>{refreshing ? "更新中" : "● LIVE"}</Text>
          </TouchableOpacity>
        </View>

        {refreshing && (
          <View style={styles.progress}>
            <ActivityIndicator />
            <Text style={styles.progressText}>{progress?.message ?? "JRAを確認中"}</Text>
          </View>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}

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

        {selectedVenue && venueStatusRace ? (
          <View style={styles.venueStatus}>
            <View>
              <Text style={styles.venueStatusTitle}>{selectedVenue}</Text>
              <Text style={styles.venueStatusMeta}>
                {[venueStatusRace.weather, venueStatusRace.surface, venueStatusRace.trackCondition].filter(Boolean).join(" / ") || "状態取得待ち"}
              </Text>
            </View>
            <Text style={styles.updated}>最終更新 {venueStatusRace.fetchedAt.slice(11,16)}</Text>
          </View>
        ) : null}

        {!races.length && !refreshing ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>今週の開催データがない</Text>
            <Text style={styles.emptyBody}>右上のLIVE更新でJRA開催日程を取得する。</Text>
          </View>
        ) : null}

        {visible.map((race) => {
          const state = raceStateLabel(race, resultKeys, now);
          const isNext = race.raceKey === nextRaceKey;
          const isPast = (raceStartEpoch(race) ?? Infinity) <= now;
          return (
            <TouchableOpacity
              key={race.raceKey}
              style={[styles.raceCard, isNext && styles.raceCardNext, isPast && !isNext && styles.raceCardPast]}
              onPress={() => onOpenRace(race.raceKey)}
            >
              <View style={styles.raceNoBlock}>
                <Text style={styles.raceNo}>{race.raceNo}R</Text>
                <Text style={styles.start}>{race.startTime ?? "--:--"}</Text>
                {isNext ? <Text style={styles.nextBadge}>NEXT</Text> : null}
                {!isNext && state === "結果確定" ? <Text style={styles.resultBadge}>結果</Text> : null}
              </View>
              <View style={styles.raceMain}>
                <Text style={styles.raceName}>{race.raceName ?? "レース名取得待ち"}</Text>
                <Text style={styles.raceMeta}>
                  {[race.raceClass, race.surface, race.distanceM ? race.distanceM.toLocaleString() + "m" : null, race.direction].filter(Boolean).join("　") || "詳細取得待ち"}
                </Text>
                <Text style={styles.raceCondition}>
                  {[race.weather, race.trackCondition, state].filter(Boolean).join(" / ")}
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
  headerSide: { width: 72, alignItems: "flex-end" },
  title: { fontSize: 24, fontWeight: "900", color: "#111827" },
  live: { color: "#6b7280", fontSize: 11, fontWeight: "900" },
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
  raceNoBlock: { width: 68, alignItems: "center" },
  raceNo: { fontSize: 20, fontWeight: "900", color: "#111827" },
  start: { marginTop: 3, color: "#6b7280", fontSize: 12, fontWeight: "700" },
  nextBadge: { marginTop: 5, backgroundColor: "#111827", color: "#fff", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, fontSize: 8, fontWeight: "900" },
  resultBadge: { marginTop: 5, color: "#111827", fontSize: 9, fontWeight: "900" },
  raceMain: { flex: 1 },
  raceName: { color: "#111827", fontSize: 16, fontWeight: "900" },
  raceMeta: { marginTop: 5, color: "#4b5563", fontSize: 11, fontWeight: "800" },
  raceCondition: { marginTop: 3, color: "#9ca3af", fontSize: 10 },
  chevron: { color: "#9ca3af", fontSize: 28, fontWeight: "300" },
});
