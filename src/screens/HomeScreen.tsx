import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { JraRace, RaceNotice } from "../domain/live";
import { raceStartEpoch } from "../data/jra/oddsAvailability";
import { raceCourseLabel } from "../ui/raceLabels";
import { listRacingWeekRaces, listTodayNotices, localTodayIso } from "../repositories/liveRepository";
import { refreshCurrentWeekRaceData } from "../services/raceRefreshService";
import { refreshScheduleTarget } from "../services/scheduleTargetService";

type Props = {
  onOpenWeek: () => void;
  onOpenRace: (raceKey: string) => void;
  active?: boolean;
  cacheRevision?: number;
};

const WEEKDAY = ["日","月","火","水","木","金","土"];

function todayLabel() {
  const now = new Date();
  return `${now.getMonth() + 1}月${now.getDate()}日 ${WEEKDAY[now.getDay()]}曜日`;
}

function noticeText(notice: RaceNotice) {
  if (notice.kind === "TRACK_CHANGED") return "馬場状態が変更";
  if (notice.kind === "WEATHER_CHANGED") return "天候が変更";
  if (notice.kind === "START_TIME_CHANGED") return "発走時刻が変更";
  if (notice.kind === "SCRATCHED") return "出走取消";
  return "競走除外";
}

function noticeDetail(notice: RaceNotice) {
  if (notice.kind === "TRACK_CHANGED" || notice.kind === "WEATHER_CHANGED" || notice.kind === "START_TIME_CHANGED") {
    return `${notice.previousValue ?? "?"} → ${notice.nextValue ?? "?"}`;
  }
  return `${notice.horseNo ?? ""}番 ${notice.horseName ?? ""}`.trim();
}

function raceDateShort(iso: string) {
  const [y,m,d] = iso.split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  return `${m}/${d}(${WEEKDAY[date.getDay()]})`;
}

export function HomeScreen({ onOpenWeek, onOpenRace, active = true, cacheRevision = 0 }: Props) {
  const [notices, setNotices] = useState<RaceNotice[]>([]);
  const [races, setRaces] = useState<JraRace[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [nextNotices, nextRaces] = await Promise.all([
      listTodayNotices(20),
      listRacingWeekRaces(),
    ]);
    setNotices(nextNotices);
    setRaces(nextRaces);
    return nextRaces;
  }, []);

  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshScheduleTarget(true);
      await load();
      await refreshCurrentWeekRaceData(undefined, async () => { await load(); });
      await load();
    } catch {
      // Home stays usable from local cache even if JRA is temporarily unavailable.
    } finally {
      setRefreshing(false);
    }
  }, [load, refreshing]);

  useEffect(() => {
    if (!active) return;
    void load();
  }, [active, cacheRevision, load]);

  const raceDates = useMemo(() => [...new Set(races.map((race) => race.raceDate))].sort(), [races]);
  const today = localTodayIso();
  const todayRaces = useMemo(() => races.filter((race) => race.raceDate === today), [races, today]);
  const venues = useMemo(() => [...new Set(todayRaces.map((race) => race.venue))], [todayRaces]);
  const nextRace = useMemo(() => {
    const now = Date.now();
    return todayRaces
      .filter((race) => {
        const start = raceStartEpoch(race);
        return start != null && start > now;
      })
      .sort((a,b) => (raceStartEpoch(a) ?? Infinity) - (raceStartEpoch(b) ?? Infinity))[0] ?? null;
  }, [todayRaces]);

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.topBar}>
          <View style={styles.side} />
          <Text style={styles.appTitle}>KEIBA</Text>
          <View style={styles.side}><Text style={styles.live}>● LIVE</Text></View>
        </View>

        <View style={styles.dateRow}>
          <View>
            <Text style={styles.dateMain}>{todayLabel()}</Text>
            <Text style={styles.dateSub}>{todayRaces.length ? "JRA 開催中" : "JRA 開催情報"}</Text>
          </View>
          <TouchableOpacity style={styles.refreshButton} onPress={() => void refresh()} disabled={refreshing}>
            <Text style={styles.refreshText}>{refreshing ? "更新中" : "更新 ↻"}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.weekCard} onPress={onOpenWeek}>
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.weekTitle}>今週のレース</Text>
              <Text style={styles.weekSub}>開催日と競馬場をまとめて確認</Text>
            </View>
            <Text style={styles.chevronDark}>›</Text>
          </View>
          <View style={styles.dateChips}>
            {raceDates.length ? raceDates.map((date) => (
              <View key={date} style={[styles.dateChip, date === today && styles.dateChipActive]}>
                <Text style={[styles.dateChipText, date === today && styles.dateChipTextActive]}>{raceDateShort(date)}</Text>
                {date === today ? <Text style={styles.todayMini}>今日</Text> : null}
              </View>
            )) : <Text style={styles.noRaceText}>開催データ取得待ち</Text>}
          </View>
          <Text style={styles.weekVenueText}>
            {venues.length ? "今日の開催　" + venues.join("・") : "今日の開催は取得待ち"}
          </Text>
        </TouchableOpacity>

        {nextRace ? (
          <TouchableOpacity style={styles.nextCard} onPress={() => onOpenRace(nextRace.raceKey)}>
            <View style={styles.rowBetween}>
              <Text style={styles.nextLabel}>NEXT RACE</Text>
              <View style={styles.startPill}><Text style={styles.startPillText}>{nextRace.startTime ?? "--:--"} 発走</Text></View>
            </View>
            <Text style={styles.nextRaceNo}>{nextRace.venue} {nextRace.raceNo}R</Text>
            <View style={styles.rowBetween}>
              <View style={styles.flex1}>
                <Text style={styles.nextRaceName}>{nextRace.raceName ?? "レース名取得待ち"}</Text>
                <Text style={styles.nextMeta}>
                  {[raceCourseLabel(nextRace), nextRace.weather, nextRace.trackCondition].filter(Boolean).join(" / ")}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.nextCard}>
            <Text style={styles.nextLabel}>NEXT RACE</Text>
            <Text style={styles.nextRaceName}>本日の次レースはありません</Text>
          </View>
        )}

        <View style={styles.noticeCard}>
          <View style={styles.rowBetween}>
            <Text style={styles.noticeHeading}>お知らせ</Text>
            <Text style={styles.noticeHint}>重要な変更</Text>
          </View>
          {notices.length ? notices.slice(0, 2).map((notice, index) => (
            <View key={notice.id} style={[styles.noticeRow, index > 0 && styles.borderTop]}>
              <View style={[styles.noticeIcon, notice.kind === "SCRATCHED" || notice.kind === "EXCLUDED" ? styles.noticeIconDanger : null]}>
                <Text style={styles.noticeIconText}>
                  {notice.kind === "TRACK_CHANGED" ? "馬" : notice.kind === "WEATHER_CHANGED" ? "天" : notice.kind === "START_TIME_CHANGED" ? "時" : "取"}
                </Text>
              </View>
              <View style={styles.flex1}>
                <View style={styles.inline}>
                  <Text style={styles.noticeRace}>{notice.venue} {notice.raceNo}R</Text>
                  <Text style={styles.noticeTime}>{notice.observedAt.slice(11,16)}</Text>
                </View>
                <Text style={styles.noticeTitle}>{noticeText(notice)}</Text>
                <Text style={styles.noticeDetail}>{noticeDetail(notice)}</Text>
              </View>
            </View>
          )) : <Text style={styles.emptyNotice}>重要な変更はまだない。</Text>}
          {notices.length > 2 ? <Text style={styles.moreNotice}>ほか {notices.length - 2}件</Text> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f4f6f8" },
  container: { padding: 16, paddingBottom: 28, gap: 14 },
  flex1: { flex: 1 },
  topBar: { height: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  side: { width: 72, alignItems: "flex-end" },
  appTitle: { fontSize: 19, fontWeight: "900", color: "#111827", letterSpacing: 0.6 },
  live: { color: "#6b7280", fontSize: 11, fontWeight: "900" },
  dateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dateMain: { color: "#111827", fontSize: 25, fontWeight: "900" },
  dateSub: { color: "#6b7280", fontSize: 12, fontWeight: "800", marginTop: 3 },
  refreshButton: { backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 15, paddingVertical: 12 },
  refreshText: { color: "#374151", fontSize: 12, fontWeight: "900" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  inline: { flexDirection: "row", alignItems: "center", gap: 7 },
  weekCard: { backgroundColor: "#fff", borderRadius: 22, padding: 18 },
  weekTitle: { color: "#111827", fontSize: 22, fontWeight: "900" },
  weekSub: { color: "#6b7280", fontSize: 11, marginTop: 4 },
  chevronDark: { color: "#9ca3af", fontSize: 30, fontWeight: "300" },
  dateChips: { flexDirection: "row", gap: 7, marginTop: 15, flexWrap: "wrap" },
  dateChip: { minWidth: 96, backgroundColor: "#eef2f7", borderRadius: 14, paddingVertical: 10, paddingHorizontal: 10, alignItems: "center" },
  dateChipActive: { backgroundColor: "#111827" },
  dateChipText: { color: "#4b5563", fontSize: 11, fontWeight: "900" },
  dateChipTextActive: { color: "#fff" },
  todayMini: { color: "#9ca3af", fontSize: 8, fontWeight: "800", marginTop: 2 },
  noRaceText: { color: "#9ca3af", fontSize: 11 },
  weekVenueText: { marginTop: 12, color: "#4b5563", fontSize: 11, fontWeight: "900" },
  nextCard: { backgroundColor: "#111827", borderRadius: 22, padding: 18 },
  nextLabel: { color: "#9ca3af", fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  startPill: { backgroundColor: "#374151", borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  startPillText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  nextRaceNo: { marginTop: 12, color: "#fff", fontSize: 16, fontWeight: "900" },
  nextRaceName: { color: "#fff", fontSize: 22, fontWeight: "900", marginTop: 5 },
  nextMeta: { color: "#d1d5db", fontSize: 11, marginTop: 7 },
  chevron: { color: "#fff", fontSize: 34, fontWeight: "300" },
  noticeCard: { backgroundColor: "#fff", borderRadius: 22, padding: 18 },
  noticeHeading: { color: "#111827", fontSize: 21, fontWeight: "900" },
  noticeHint: { color: "#9ca3af", fontSize: 10, fontWeight: "800" },
  noticeRow: { flexDirection: "row", gap: 11, paddingVertical: 13 },
  borderTop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb" },
  noticeIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: "#111827", alignItems: "center", justifyContent: "center" },
  noticeIconDanger: { backgroundColor: "#b91c1c" },
  noticeIconText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  noticeRace: { color: "#6b7280", fontSize: 11, fontWeight: "900" },
  noticeTime: { color: "#9ca3af", fontSize: 10 },
  noticeTitle: { color: "#111827", fontSize: 15, fontWeight: "900", marginTop: 3 },
  noticeDetail: { color: "#4b5563", fontSize: 13, fontWeight: "700", marginTop: 3 },
  emptyNotice: { color: "#6b7280", fontSize: 12, paddingVertical: 16 },
  moreNotice: { color: "#6b7280", fontSize: 11, fontWeight: "800", textAlign: "center", paddingTop: 8 },
});
