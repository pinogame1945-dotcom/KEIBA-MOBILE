import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RaceNotice } from "../domain/live";
import { listTodayNotices, listTodayRaces } from "../repositories/liveRepository";

type Props = { onOpenToday: () => void };

function noticeText(notice: RaceNotice) {
  if (notice.kind === "TRACK_CHANGED") return "馬場 " + (notice.previousValue ?? "?") + " → " + (notice.nextValue ?? "?");
  if (notice.kind === "WEATHER_CHANGED") return "天候 " + (notice.previousValue ?? "?") + " → " + (notice.nextValue ?? "?");
  if (notice.kind === "START_TIME_CHANGED") return "発走 " + (notice.previousValue ?? "?") + " → " + (notice.nextValue ?? "?");
  if (notice.kind === "SCRATCHED") return (notice.horseNo ?? "") + "番 " + (notice.horseName ?? "") + " 出走取消";
  return (notice.horseNo ?? "") + "番 " + (notice.horseName ?? "") + " 除外";
}

export function HomeScreen({ onOpenToday }: Props) {
  const [notices, setNotices] = useState<RaceNotice[]>([]);
  const [raceCount, setRaceCount] = useState(0);
  const [officialCount, setOfficialCount] = useState(0);

  const load = useCallback(async () => {
    const [nextNotices, races] = await Promise.all([listTodayNotices(20), listTodayRaces()]);
    setNotices(nextNotices);
    setRaceCount(races.length);
    setOfficialCount(races.filter((race) => race.status === "OFFICIAL").length);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>KEIBA</Text>
        <Text style={styles.subtitle}>MOBILE / 実戦専用</Text>

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>お知らせ</Text>
            <Text style={styles.muted}>{notices.length}件</Text>
          </View>
          {notices.length === 0 ? (
            <Text style={styles.empty}>今日の変更通知はまだない。</Text>
          ) : notices.slice(0, 8).map((notice) => (
            <View key={notice.id} style={styles.notice}>
              <Text style={styles.noticeRace}>{notice.venue} {notice.raceNo}R</Text>
              <Text style={styles.noticeBody}>{noticeText(notice)}</Text>
              <Text style={styles.noticeTime}>{notice.observedAt.slice(11, 19)}</Text>
            </View>
          ))}
          <Text style={styles.hint}>出馬表更新時に馬場・天候・取消・除外の差分を記録する。</Text>
        </View>

        <TouchableOpacity style={styles.primaryCard} onPress={onOpenToday}>
          <Text style={styles.primaryTitle}>今日のレース</Text>
          <Text style={styles.primaryBody}>{raceCount}R / 正式出馬表 {officialCount}R</Text>
          <Text style={styles.primaryLink}>開催・出走表・馬情報・最新オッズ →</Text>
        </TouchableOpacity>

        <View style={styles.disabledCard}>
          <Text style={styles.cardTitle}>予想</Text>
          <Text style={styles.empty}>L1 / L2 / L3 はLIVE基盤完成後に接続する。</Text>
        </View>

        <View style={styles.disabledCard}>
          <Text style={styles.cardTitle}>結果</Text>
          <Text style={styles.empty}>結果機能は後続フェーズ。</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f3f4f6" },
  container: { padding: 18, paddingBottom: 36, gap: 12 },
  title: { fontSize: 32, fontWeight: "900", letterSpacing: 1 },
  subtitle: { marginTop: -4, marginBottom: 8, fontSize: 12, color: "#6b7280" },
  card: { borderRadius: 18, backgroundColor: "#fff", padding: 16 },
  primaryCard: { borderRadius: 18, backgroundColor: "#111827", padding: 18 },
  disabledCard: { borderRadius: 18, backgroundColor: "#e5e7eb", padding: 16 },
  cardTitle: { fontSize: 19, fontWeight: "800" },
  primaryTitle: { fontSize: 21, fontWeight: "900", color: "#fff" },
  primaryBody: { marginTop: 8, fontSize: 14, color: "#d1d5db" },
  primaryLink: { marginTop: 12, fontSize: 13, fontWeight: "700", color: "#fff" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  muted: { color: "#6b7280", fontSize: 12 },
  empty: { marginTop: 8, color: "#6b7280", lineHeight: 20 },
  notice: { paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb" },
  noticeRace: { fontSize: 12, fontWeight: "800", color: "#6b7280" },
  noticeBody: { marginTop: 2, fontSize: 15, fontWeight: "700" },
  noticeTime: { marginTop: 2, fontSize: 11, color: "#9ca3af" },
  hint: { marginTop: 10, fontSize: 11, lineHeight: 16, color: "#9ca3af" },
});
