import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { JraRace } from "../domain/live";
import { listTodayRaces } from "../repositories/liveRepository";
import {
  refreshTodayRaceData, type RaceRefreshProgress,
} from "../services/raceRefreshService";
import { RaceCardScreen } from "./RaceCardScreen";

type Props = { onBack: () => void };

export function TodayRacesScreen({ onBack }: Props) {
  const [races, setRaces] = useState<JraRace[]>([]);
  const [selectedRaceKey, setSelectedRaceKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState<RaceRefreshProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const next = await listTodayRaces();
    setRaces(next);
    return next;
  }, []);

  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      await refreshTodayRaceData(setProgress);
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

  const grouped = useMemo(() => {
    const map = new Map<string, JraRace[]>();
    for (const race of races) {
      const group = map.get(race.venue) ?? [];
      group.push(race);
      map.set(race.venue, group);
    }
    return [...map.entries()];
  }, [races]);

  if (selectedRaceKey) {
    return (
      <RaceCardScreen
        raceKey={selectedRaceKey}
        onOpenWeek={() => { setSelectedRaceKey(null); void load(); }}
        onOpenRace={(nextRaceKey) => setSelectedRaceKey(nextRaceKey)}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack}><Text style={styles.back}>← ホーム</Text></TouchableOpacity>
          <Text style={styles.title}>今日のレース</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={() => void refresh()} disabled={refreshing}>
            <Text style={styles.refreshText}>{refreshing ? "更新中" : "JRA更新"}</Text>
          </TouchableOpacity>
        </View>

        {refreshing && (
          <View style={styles.progress}>
            <ActivityIndicator />
            <Text style={styles.progressText}>{progress?.message ?? "JRAを確認中"}</Text>
            {progress && <Text style={styles.progressSmall}>{progress.current}/{progress.total}</Text>}
          </View>
        )}
        {error && <Text style={styles.error}>{error}</Text>}

        {!races.length && !refreshing && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>今日の開催データがない</Text>
            <Text style={styles.emptyBody}>JRA更新を押して開催日程を取得する。</Text>
          </View>
        )}

        {grouped.map(([venue, venueRaces]) => (
          <View key={venue} style={styles.venueSection}>
            <Text style={styles.venueTitle}>{venue}</Text>
            {venueRaces.map((race) => (
              <TouchableOpacity key={race.raceKey} style={styles.raceRow} onPress={() => setSelectedRaceKey(race.raceKey)}>
                <View style={styles.raceNoBox}>
                  <Text style={styles.raceNo}>{race.raceNo}R</Text>
                  <Text style={styles.start}>{race.startTime ?? "--:--"}</Text>
                </View>
                <View style={styles.raceMain}>
                  <Text style={styles.raceName}>{race.raceName ?? "レース名取得待ち"}</Text>
                  <Text style={styles.raceMeta}>
                    {[race.surface, race.distanceM ? race.distanceM + "m" : null, race.weather, race.trackCondition].filter(Boolean).join(" / ") || "詳細取得待ち"}
                  </Text>
                </View>
                <View style={[styles.badge, race.status === "OFFICIAL" ? styles.official : styles.scheduled]}>
                  <Text style={styles.badgeText}>{race.status === "OFFICIAL" ? "出馬表" : "予定"}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f3f4f6" },
  container: { padding: 14, paddingBottom: 40 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  back: { fontSize: 13, fontWeight: "700", color: "#374151" },
  title: { flex: 1, fontSize: 23, fontWeight: "900" },
  refreshButton: { backgroundColor: "#111827", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  refreshText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  progress: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, backgroundColor: "#fff", borderRadius: 12, marginBottom: 12 },
  progressText: { flex: 1, fontSize: 13, fontWeight: "600" },
  progressSmall: { fontSize: 11, color: "#6b7280" },
  error: { marginBottom: 12, padding: 10, borderRadius: 10, backgroundColor: "#fee2e2", color: "#991b1b" },
  emptyCard: { padding: 20, borderRadius: 16, backgroundColor: "#fff" },
  emptyTitle: { fontSize: 17, fontWeight: "800" },
  emptyBody: { marginTop: 6, color: "#6b7280" },
  venueSection: { marginBottom: 18 },
  venueTitle: { fontSize: 20, fontWeight: "900", marginBottom: 7 },
  raceRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 13, padding: 12, marginBottom: 7 },
  raceNoBox: { width: 48, alignItems: "center" },
  raceNo: { fontWeight: "900", fontSize: 16 },
  start: { marginTop: 2, fontSize: 11, color: "#6b7280" },
  raceMain: { flex: 1, paddingHorizontal: 8 },
  raceName: { fontWeight: "800", fontSize: 14 },
  raceMeta: { marginTop: 3, fontSize: 11, color: "#6b7280" },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  official: { backgroundColor: "#dcfce7" },
  scheduled: { backgroundColor: "#e5e7eb" },
  badgeText: { fontSize: 10, fontWeight: "800", color: "#374151" },
});
