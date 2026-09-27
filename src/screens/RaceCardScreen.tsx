import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { JraEntry, JraRace, OddsBetType, OddsRow } from "../domain/live";
import { getRace, getWeekEntries } from "../repositories/liveRepository";
import { refreshRaceState } from "../services/raceRefreshService";
import { loadOdds, oddsBetTypeLabel, refreshLatestOdds } from "../services/oddsService";

type Props = {
  raceKey: string;
  onBack: () => void;
  onRefreshAll: () => Promise<void>;
};

const TYPE_ORDER: OddsBetType[] = ["WIN","PLACE","BRACKET_QUINELLA","QUINELLA","WIDE","EXACTA","TRIO","TRIFECTA"];

function formatSelection(row: OddsRow) {
  return [row.selection1, row.selection2, row.selection3].filter((v) => v != null).join("-");
}
function formatOdds(row: OddsRow) {
  if (row.odds != null) return row.odds.toFixed(1);
  if (row.oddsMin != null && row.oddsMax != null) return row.oddsMin.toFixed(1) + "〜" + row.oddsMax.toFixed(1);
  return "-";
}

export function RaceCardScreen({ raceKey, onBack, onRefreshAll }: Props) {
  const [race, setRace] = useState<JraRace | null>(null);
  const [entries, setEntries] = useState<JraEntry[]>([]);
  const [odds, setOdds] = useState<OddsRow[]>([]);
  const [latestObservedAt, setLatestObservedAt] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<OddsBetType>("WIN");
  const [selectedHorseNo, setSelectedHorseNo] = useState<number | null>(null);
  const [busy, setBusy] = useState<"race" | "odds" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoOddsStarted = useRef(false);

  const load = useCallback(async () => {
    const [nextRace, nextEntries, nextOdds] = await Promise.all([
      getRace(raceKey),
      getWeekEntries(raceKey),
      loadOdds(raceKey),
    ]);
    setRace(nextRace);
    setEntries(nextEntries);
    setOdds(nextOdds.rows);
    setLatestObservedAt(nextOdds.latestObservedAt);
    if (!nextOdds.availableTypes.includes(selectedType) && nextOdds.availableTypes.length) {
      setSelectedType(nextOdds.availableTypes[0]);
    }
  }, [raceKey, selectedType]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!race || race.status !== "OFFICIAL" || !entries.length || autoOddsStarted.current) return;
    const latestMs = latestObservedAt ? Date.parse(latestObservedAt) : 0;
    if (Number.isFinite(latestMs) && Date.now() - latestMs < 5 * 60 * 1000) return;
    autoOddsStarted.current = true;
    void refreshLatestOdds(race, entries).then(load).catch(() => undefined);
  }, [race, entries, latestObservedAt, load]);

  const latestWinByNo = useMemo(() => {
    const map = new Map<number, number>();
    for (const row of odds) if (row.betType === "WIN" && row.selection1 != null && row.odds != null) map.set(row.selection1, row.odds);
    return map;
  }, [odds]);

  const availableTypes = useMemo(() =>
    TYPE_ORDER.filter((type) => odds.some((row) => row.betType === type)),
  [odds]);
  const displayedOdds = useMemo(() => odds.filter((row) => row.betType === selectedType), [odds, selectedType]);
  const selectedHorse = entries.find((entry) => entry.horseNo === selectedHorseNo) ?? null;

  const refreshCard = async () => {
    if (!race || busy) return;
    setBusy("race"); setError(null);
    try { await refreshRaceState(race); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };
  const refreshOdds = async () => {
    if (!race || busy) return;
    setBusy("odds"); setError(null);
    try {
      const result = await refreshLatestOdds(race, entries);
      if (result.missing.length) setError("一部オッズ未取得: " + result.missing.map(oddsBetTypeLabel).join("・"));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  if (!race) {
    return <SafeAreaView style={styles.safeArea}><View style={styles.loading}><ActivityIndicator /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity onPress={onBack}><Text style={styles.back}>← 今日のレース</Text></TouchableOpacity>

        <View style={styles.hero}>
          <View style={styles.rowBetween}>
            <Text style={styles.heroRace}>{race.venue} {race.raceNo}R</Text>
            <Text style={styles.start}>{race.startTime ?? "--:--"} 発走</Text>
          </View>
          <Text style={styles.heroTitle}>{race.raceName ?? "レース名取得待ち"}</Text>
          <Text style={styles.meta}>
            {[race.surface, race.distanceM ? race.distanceM + "m" : null, race.direction, race.weather, race.trackCondition].filter(Boolean).join(" / ") || "詳細取得待ち"}
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => void refreshCard()} disabled={busy != null || race.status !== "OFFICIAL"}>
              <Text style={styles.secondaryText}>{busy === "race" ? "更新中" : "出馬表更新"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={() => void refreshOdds()} disabled={busy != null || race.status !== "OFFICIAL"}>
              <Text style={styles.primaryText}>{busy === "odds" ? "取得中" : "最新オッズ"}</Text>
            </TouchableOpacity>
          </View>
          {race.status !== "OFFICIAL" && (
            <TouchableOpacity style={styles.waiting} onPress={() => void onRefreshAll()}>
              <Text style={styles.waitingText}>正式出馬表は未取得。今日のJRAデータを再確認</Text>
            </TouchableOpacity>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
        </View>

        <Text style={styles.sectionTitle}>出走表</Text>
        {!entries.length ? (
          <View style={styles.card}><Text style={styles.muted}>正式出馬表の公開待ち。</Text></View>
        ) : entries.map((entry) => {
          const latestWin = entry.horseNo == null ? null : latestWinByNo.get(entry.horseNo) ?? entry.winOdds;
          const inactive = entry.entryStatus !== "ACTIVE";
          return (
            <TouchableOpacity
              key={entry.horseName + ":" + entry.horseNo}
              style={[styles.entry, inactive && styles.entryInactive]}
              onPress={() => setSelectedHorseNo(entry.horseNo)}
            >
              <View style={styles.gate}><Text style={styles.gateText}>{entry.gate ?? "-"}</Text></View>
              <Text style={styles.horseNo}>{entry.horseNo ?? "-"}</Text>
              <View style={styles.entryMain}>
                <Text style={[styles.horseName, inactive && styles.strike]}>{entry.horseName}</Text>
                <Text style={styles.entryMeta}>
                  {[entry.sex && entry.age ? entry.sex + entry.age : null, entry.carriedWeight ? entry.carriedWeight + "kg" : null, entry.jockeyName].filter(Boolean).join(" / ")}
                </Text>
              </View>
              <View style={styles.oddsMini}>
                <Text style={styles.oddsValue}>{latestWin != null ? latestWin.toFixed(1) : "-"}</Text>
                <Text style={styles.oddsLabel}>{inactive ? (entry.entryStatus === "SCRATCHED" ? "取消" : "除外") : "単勝"}</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {selectedHorse && (
          <View style={styles.horseDetail}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>{selectedHorse.horseNo}番 {selectedHorse.horseName}</Text>
              <TouchableOpacity onPress={() => setSelectedHorseNo(null)}><Text style={styles.close}>閉じる</Text></TouchableOpacity>
            </View>
            <Text style={styles.detailLine}>性齢・毛色: {[selectedHorse.sex, selectedHorse.age, selectedHorse.coatColor].filter((v) => v != null).join(" ") || "-"}</Text>
            <Text style={styles.detailLine}>騎手: {selectedHorse.jockeyName ?? "-"}</Text>
            <Text style={styles.detailLine}>調教師: {selectedHorse.trainerName ?? "-"}</Text>
            <Text style={styles.detailLine}>斤量: {selectedHorse.carriedWeight != null ? selectedHorse.carriedWeight + "kg" : "-"}</Text>
            <Text style={styles.detailLine}>馬体重: {selectedHorse.bodyWeight != null ? selectedHorse.bodyWeight + "kg (" + (selectedHorse.bodyWeightDiff != null && selectedHorse.bodyWeightDiff >= 0 ? "+" : "") + (selectedHorse.bodyWeightDiff ?? 0) + ")" : "-"}</Text>
            <Text style={styles.detailLine}>血統: 父 {selectedHorse.sire ?? "-"} / 母 {selectedHorse.dam ?? "-"} / 母父 {selectedHorse.damsire ?? "-"}</Text>
          </View>
        )}

        <View style={styles.oddsHeader}>
          <Text style={styles.sectionTitle}>最新オッズ</Text>
          <Text style={styles.updated}>更新 {latestObservedAt ? latestObservedAt.slice(11, 19) : "未取得"}</Text>
        </View>
        {availableTypes.length ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
              {availableTypes.map((type) => (
                <TouchableOpacity key={type} style={[styles.typeChip, selectedType === type && styles.typeChipActive]} onPress={() => setSelectedType(type)}>
                  <Text style={[styles.typeText, selectedType === type && styles.typeTextActive]}>{oddsBetTypeLabel(type)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.oddsTable}>
              {displayedOdds.map((row) => (
                <View key={[row.betType,row.selection1,row.selection2,row.selection3].join(":")} style={styles.oddsRow}>
                  <Text style={styles.selection}>{formatSelection(row)}</Text>
                  <Text style={styles.price}>{formatOdds(row)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <View style={styles.card}><Text style={styles.muted}>「最新オッズ」でJRA LIVEオッズを取得する。</Text></View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f3f4f6" },
  container: { padding: 14, paddingBottom: 48 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  back: { fontSize: 13, fontWeight: "700", color: "#374151", marginBottom: 10 },
  hero: { backgroundColor: "#111827", borderRadius: 18, padding: 16, marginBottom: 18 },
  heroRace: { color: "#fff", fontWeight: "900", fontSize: 18 },
  heroTitle: { color: "#fff", fontWeight: "900", fontSize: 22, marginTop: 8 },
  meta: { color: "#d1d5db", marginTop: 6, fontSize: 12 },
  start: { color: "#d1d5db", fontWeight: "700" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  actions: { flexDirection: "row", gap: 8, marginTop: 14 },
  primaryButton: { flex: 1, borderRadius: 10, backgroundColor: "#fff", padding: 11, alignItems: "center" },
  primaryText: { color: "#111827", fontWeight: "900" },
  secondaryButton: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: "#6b7280", padding: 11, alignItems: "center" },
  secondaryText: { color: "#fff", fontWeight: "800" },
  waiting: { marginTop: 10, borderRadius: 10, backgroundColor: "#374151", padding: 10 },
  waitingText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  error: { marginTop: 10, color: "#fecaca", fontSize: 12 },
  sectionTitle: { fontSize: 19, fontWeight: "900", marginBottom: 8 },
  card: { borderRadius: 14, backgroundColor: "#fff", padding: 14, marginBottom: 14 },
  muted: { color: "#6b7280" },
  entry: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, padding: 10, marginBottom: 6 },
  entryInactive: { opacity: 0.55 },
  gate: { width: 28, height: 28, borderRadius: 7, backgroundColor: "#e5e7eb", justifyContent: "center", alignItems: "center" },
  gateText: { fontWeight: "900" },
  horseNo: { width: 30, textAlign: "center", fontWeight: "900", fontSize: 16 },
  entryMain: { flex: 1 },
  horseName: { fontWeight: "900", fontSize: 15 },
  strike: { textDecorationLine: "line-through" },
  entryMeta: { marginTop: 2, fontSize: 11, color: "#6b7280" },
  oddsMini: { alignItems: "flex-end" },
  oddsValue: { fontWeight: "900", fontSize: 16 },
  oddsLabel: { fontSize: 10, color: "#6b7280" },
  horseDetail: { marginTop: 8, marginBottom: 18, borderRadius: 14, backgroundColor: "#fff", padding: 14 },
  close: { color: "#6b7280", fontSize: 12, fontWeight: "700" },
  detailLine: { marginTop: 6, fontSize: 13, lineHeight: 19 },
  oddsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 6 },
  updated: { fontSize: 11, color: "#6b7280" },
  typeRow: { gap: 7, paddingBottom: 10 },
  typeChip: { borderRadius: 999, backgroundColor: "#e5e7eb", paddingHorizontal: 12, paddingVertical: 7 },
  typeChipActive: { backgroundColor: "#111827" },
  typeText: { fontWeight: "800", fontSize: 12, color: "#374151" },
  typeTextActive: { color: "#fff" },
  oddsTable: { backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 12 },
  oddsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e5e7eb" },
  selection: { fontWeight: "800" },
  price: { fontWeight: "900" },
});
