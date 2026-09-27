import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, BackHandler, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type {
  JraEntry, JraPayout, JraRace, JraRaceResult, OddsBetType, OddsRow, VenueConditionSnapshot,
} from "../domain/live";
import { raceStartEpoch } from "../data/jra/oddsAvailability";
import {
  getRace, getRacePayouts, getRaceResults, getVenueConditionSnapshot, getWeekEntries, listRacesForDates, localTodayIso,
} from "../repositories/liveRepository";
import { refreshRaceState } from "../services/raceRefreshService";
import {
  loadLatestWinOdds,loadOddsMeta,loadOddsRows,oddsBetTypeLabel,refreshLatestOdds,
} from "../services/oddsService";
import { refreshOfficialRaceResult } from "../services/resultService";
import { refreshTodayVenueConditions } from "../services/venueConditionService";
import { raceCourseLabel, raceStateLabel } from "../ui/raceLabels";

type Props = {
  raceKey: string;
  onOpenWeek: () => void;
  onOpenRace: (raceKey: string) => void;
  onBack?: () => void;
  active?: boolean;
  cacheRevision?: number;
};

type RaceTab = "CARD" | "ODDS" | "INFO" | "RESULT";
type SortMode = "HORSE_NO" | "POPULARITY";
type OddsView = "NORMAL" | "HORSE";

const TYPE_ORDER: OddsBetType[] = [
  "WIN","PLACE","BRACKET_QUINELLA","QUINELLA","WIDE","EXACTA","TRIO","TRIFECTA",
];
const HORSE_RANK_TYPES: OddsBetType[] = [
  "BRACKET_QUINELLA","QUINELLA","WIDE","EXACTA","TRIO","TRIFECTA",
];
const ODDS_PAGE_SIZE = 80;

const GATE_COLORS: Record<number, { bg: string; fg: string; border: string }> = {
  1: { bg: "#ffffff", fg: "#111827", border: "#9ca3af" },
  2: { bg: "#171717", fg: "#ffffff", border: "#171717" },
  3: { bg: "#e53935", fg: "#ffffff", border: "#e53935" },
  4: { bg: "#3157c8", fg: "#ffffff", border: "#3157c8" },
  5: { bg: "#f4d03f", fg: "#111827", border: "#d4b21f" },
  6: { bg: "#28965a", fg: "#ffffff", border: "#28965a" },
  7: { bg: "#e68a2e", fg: "#ffffff", border: "#e68a2e" },
  8: { bg: "#e990b5", fg: "#111827", border: "#d7709b" },
};

function formatSelection(row: OddsRow) {
  return [row.selection1, row.selection2, row.selection3].filter((v) => v != null).join("-");
}

function formatOdds(row: OddsRow) {
  if (row.odds != null) return row.odds.toFixed(1);
  if (row.oddsMin != null && row.oddsMax != null) return row.oddsMin.toFixed(1) + "〜" + row.oddsMax.toFixed(1);
  return "-";
}

function formatClock(iso: string | null) {
  if (!iso) return "未取得";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "未取得";
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((n) => String(n).padStart(2, "0")).join(":");
}

function freshnessText(iso: string | null, nowMs: number) {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const seconds = Math.max(0, Math.floor((nowMs - ms) / 1000));
  if (seconds < 60) return `約${seconds}秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `約${minutes}分前`;
  return `約${Math.floor(minutes / 60)}時間前`;
}

function resultStatusLabel(result: JraRaceResult) {
  if (result.resultStatus === "SCRATCHED") return "取消";
  if (result.resultStatus === "EXCLUDED") return "除外";
  if (result.resultStatus === "DISQUALIFIED") return "失格";
  if (result.resultStatus === "DNF") return "中止";
  return result.finishRaw;
}

function HorseSheet({
  horse, close, openHorseOdds,
}: {
  horse: JraEntry;
  close: () => void;
  openHorseOdds: (horse: JraEntry) => void;
}) {
  const insets = useSafeAreaInsets();
  const gate = horse.gate != null ? GATE_COLORS[horse.gate] : null;
  return (
    <Modal transparent animationType="slide" visible onRequestClose={close}>
      <View style={styles.modalRoot}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={close} />
        <View style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom, 12) + 18 }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.rowBetween}>
            <View style={styles.inline}>
              <View style={[
                styles.sheetHorseNo,
                gate ? { backgroundColor: gate.bg, borderColor: gate.border } : null,
              ]}>
                <Text style={[styles.sheetHorseNoLabel, gate ? { color: gate.fg } : null]}>馬番</Text>
                <Text style={[styles.sheetHorseNoValue, gate ? { color: gate.fg } : null]}>{horse.horseNo ?? "-"}</Text>
              </View>
              <View style={styles.sheetNameBlock}>
                <Text style={styles.horseSheetName}>{horse.horseName}</Text>
                <Text style={styles.horseSheetMeta}>
                  {[horse.sex && horse.age ? horse.sex + horse.age : null, horse.carriedWeight != null ? horse.carriedWeight + "kg" : null,
                    horse.bodyWeight != null ? horse.bodyWeight + "kg (" + (horse.bodyWeightDiff != null && horse.bodyWeightDiff >= 0 ? "+" : "") + (horse.bodyWeightDiff ?? 0) + ")" : null]
                    .filter(Boolean).join("　")}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={close}><Text style={styles.closeText}>閉じる ×</Text></TouchableOpacity>
          </View>

          <View style={styles.detailRows}>
            <View style={styles.detailRow}><Text style={styles.detailKey}>騎手</Text><Text style={styles.detailValue}>{horse.jockeyName ?? "-"}</Text></View>
            <View style={styles.detailRow}><Text style={styles.detailKey}>調教師</Text><Text style={styles.detailValue}>{horse.trainerName ?? "-"}</Text></View>
            <View style={styles.detailRow}><Text style={styles.detailKey}>父</Text><Text style={styles.detailValue}>{horse.sire ?? "-"}</Text></View>
            <View style={styles.detailRow}><Text style={styles.detailKey}>母父</Text><Text style={styles.detailValue}>{horse.damsire ?? "-"}</Text></View>
          </View>

          {horse.entryStatus === "ACTIVE" && horse.horseNo != null ? (
            <TouchableOpacity style={styles.horseOddsJump} onPress={() => openHorseOdds(horse)}>
              <Text style={styles.horseOddsJumpText}>この馬が絡むオッズを見る →</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

export function RaceCardScreen({
  raceKey,
  onOpenWeek,
  onOpenRace,
  onBack,
  active = true,
  cacheRevision = 0,
}: Props) {
  const [race, setRace] = useState<JraRace | null>(null);
  const [entries, setEntries] = useState<JraEntry[]>([]);
  const [dayRaces, setDayRaces] = useState<JraRace[]>([]);
  const [odds, setOdds] = useState<OddsRow[]>([]);
  const [oddsPage, setOddsPage] = useState(0);
  const [oddsHasNext, setOddsHasNext] = useState(false);
  const [availableTypes, setAvailableTypes] = useState<OddsBetType[]>([]);
  const [latestWinByNo, setLatestWinByNo] = useState<Map<number, number>>(() => new Map());
  const [latestObservedAt, setLatestObservedAt] = useState<string | null>(null);
  const [results, setResults] = useState<JraRaceResult[]>([]);
  const [payouts, setPayouts] = useState<JraPayout[]>([]);
  const [venueSnapshot, setVenueSnapshot] = useState<VenueConditionSnapshot | null>(null);
  const [raceTab, setRaceTab] = useState<RaceTab>("CARD");
  const [sortMode, setSortMode] = useState<SortMode>("HORSE_NO");
  const [selectedType, setSelectedType] = useState<OddsBetType>("WIN");
  const [oddsView, setOddsView] = useState<OddsView>("NORMAL");
  const [selectedHorseNo, setSelectedHorseNo] = useState<number | null>(null);
  const [detailHorseNo, setDetailHorseNo] = useState<number | null>(null);
  const [busy, setBusy] = useState<"race" | "odds" | "result" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const autoOddsStarted = useRef(false);
  const autoResultRaceKey = useRef<string | null>(null);
  const autoCardRepairRaceKey = useRef<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const cardScrollYRef = useRef(0);
  const horseOddsReturnRef = useRef<{ scrollY: number; horseNo: number | null } | null>(null);
  const pendingCardRestoreYRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    const nextRace = await getRace(raceKey);
    if (!nextRace) {
      setRace(null);
      return;
    }
    const [nextEntries, oddsMeta, winOdds, nextResults, nextPayouts, sameDay, nextVenueSnapshot] = await Promise.all([
      getWeekEntries(raceKey),
      loadOddsMeta(raceKey),
      loadLatestWinOdds(raceKey),
      getRaceResults(raceKey),
      getRacePayouts(raceKey),
      listRacesForDates([nextRace.raceDate]),
      getVenueConditionSnapshot(nextRace.raceDate, nextRace.venue),
    ]);
    setRace(nextRace);
    setEntries(nextEntries);
    setAvailableTypes(oddsMeta.availableTypes);
    setLatestObservedAt(oddsMeta.latestObservedAt);
    setLatestWinByNo(new Map(
      winOdds
        .filter((row): row is { horseNo: number; odds: number } => row.odds != null)
        .map((row) => [row.horseNo, row.odds]),
    ));
    setResults(nextResults);
    setPayouts(nextPayouts);
    setVenueSnapshot(nextVenueSnapshot ?? null);
    setDayRaces(sameDay.filter((item) => item.venue === nextRace.venue).sort((a,b) => a.raceNo - b.raceNo));
    setSelectedType((current) =>
      oddsMeta.availableTypes.includes(current) || !oddsMeta.availableTypes.length
        ? current
        : oddsMeta.availableTypes[0]
    );
    setSelectedHorseNo((current) => {
      if (current != null) return current;
      return nextEntries.find((entry) => entry.entryStatus === "ACTIVE" && entry.horseNo != null)?.horseNo ?? null;
    });
  }, [raceKey]);

  useEffect(() => {
    autoOddsStarted.current = false;
    autoResultRaceKey.current = null;
    autoCardRepairRaceKey.current = null;
    cardScrollYRef.current = 0;
    horseOddsReturnRef.current = null;
    pendingCardRestoreYRef.current = null;
    setDetailHorseNo(null);
    setRaceTab("CARD");
    setOddsView("NORMAL");
    setSortMode("HORSE_NO");
    setError(null);
  }, [raceKey]);

  useEffect(() => {
    if (!active) return;
    void load();
  }, [active, cacheRevision, raceKey]);

  useEffect(() => {
    if (!active) return;
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [active]);

  useEffect(() => {
    setOddsPage(0);
  }, [raceKey, selectedType, oddsView, selectedHorseNo]);

  useEffect(() => {
    if (!active || raceTab !== "ODDS") return;
    const selectedHorse = entries.find((entry) => entry.horseNo === selectedHorseNo) ?? null;
    const selection = oddsView === "HORSE"
      ? selectedType === "BRACKET_QUINELLA"
        ? selectedHorse?.gate ?? null
        : selectedHorse?.horseNo ?? null
      : null;
    if (oddsView === "HORSE" && selection == null) {
      setOdds([]);
      setOddsHasNext(false);
      return;
    }
    let cancelled = false;
    const offset = oddsPage * ODDS_PAGE_SIZE;
    void loadOddsRows(raceKey, selectedType, selection, ODDS_PAGE_SIZE + 1, offset)
      .then((rows) => {
        if (cancelled) return;
        setOdds(rows.slice(0, ODDS_PAGE_SIZE));
        setOddsHasNext(rows.length > ODDS_PAGE_SIZE);
      })
      .catch(() => {
        if (!cancelled) {
          setOdds([]);
          setOddsHasNext(false);
        }
      });
    return () => { cancelled = true; };
  }, [
    active,cacheRevision,raceKey,raceTab,selectedType,oddsView,selectedHorseNo,
    oddsPage,entries,latestObservedAt,
  ]);

  useEffect(() => {
    if (!active || !race || race.status === "OFFICIAL" || busy || autoCardRepairRaceKey.current === race.raceKey) return;
    autoCardRepairRaceKey.current = race.raceKey;
    setBusy("race");
    setError(null);
    void refreshRaceState(race)
      .then(load)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(null));
  }, [active, race, busy, load]);

  useEffect(() => {
    if (!active || !race || race.status !== "OFFICIAL" || !entries.length || autoOddsStarted.current) return;
    const start = raceStartEpoch(race);
    if (start != null && start <= Date.now()) return;
    const latestMs = latestObservedAt ? Date.parse(latestObservedAt) : 0;
    if (Number.isFinite(latestMs) && Date.now() - latestMs < 5 * 60 * 1000) return;
    autoOddsStarted.current = true;
    void refreshLatestOdds(race, entries).then(load).catch(() => undefined);
  }, [race, entries, latestObservedAt, load]);

  useEffect(() => {
    if (!active || raceTab !== "RESULT" || !race || results.length || busy || autoResultRaceKey.current === race.raceKey) return;
    const start = raceStartEpoch(race);
    if (start != null && start > Date.now()) return;
    autoResultRaceKey.current = race.raceKey;
    setBusy("result");
    setError(null);
    void refreshOfficialRaceResult(race)
      .then(load)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(null));
  }, [raceTab, race, results.length, busy, load]);

  const sortedEntries = useMemo(() => [...entries].sort((a,b) => {
    if (sortMode === "POPULARITY") return (a.popularity ?? 999) - (b.popularity ?? 999);
    return (a.horseNo ?? 999) - (b.horseNo ?? 999);
  }), [entries, sortMode]);

  const selectedHorse = entries.find((entry) => entry.horseNo === selectedHorseNo) ?? null;
  const detailHorse = entries.find((entry) => entry.horseNo === detailHorseNo) ?? null;

  const displayedOdds = odds;

  const currentIndex = dayRaces.findIndex((item) => item.raceKey === raceKey);
  const previousRace = currentIndex > 0 ? dayRaces[currentIndex - 1] : null;
  const nextRace = currentIndex >= 0 && currentIndex < dayRaces.length - 1 ? dayRaces[currentIndex + 1] : null;

  const refreshCard = async () => {
    if (!race || busy) return;
    setBusy("race"); setError(null);
    let cardError: unknown = null;
    try {
      await refreshRaceState(race);
    } catch (e) {
      cardError = e;
    }
    if (race.raceDate === localTodayIso()) {
      await refreshTodayVenueConditions(true).catch(() => undefined);
    }
    await load().catch(() => undefined);
    if (cardError) setError(cardError instanceof Error ? cardError.message : String(cardError));
    setBusy(null);
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

  const refreshResult = async () => {
    if (!race || busy) return;
    setBusy("result"); setError(null);
    try {
      await refreshOfficialRaceResult(race);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  const returnFromHorseOdds = useCallback(() => {
    const context = horseOddsReturnRef.current;
    if (!context) return false;
    horseOddsReturnRef.current = null;
    pendingCardRestoreYRef.current = context.scrollY;
    setRaceTab("CARD");
    setError(null);
    setDetailHorseNo(null);
    return true;
  }, []);

  const handleBack = useCallback(() => {
    if (returnFromHorseOdds()) return;
    (onBack ?? onOpenWeek)();
  }, [onBack, onOpenWeek, returnFromHorseOdds]);

  useEffect(() => {
    if (!active || !horseOddsReturnRef.current) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!returnFromHorseOdds()) return false;
      return true;
    });
    return () => subscription.remove();
  }, [active, raceTab, returnFromHorseOdds]);

  useEffect(() => {
    if (!active || raceTab !== "CARD") return;
    const y = pendingCardRestoreYRef.current;
    if (y == null) return;
    pendingCardRestoreYRef.current = null;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y, animated: false });
    });
  }, [active, raceTab]);

  const openHorseOdds = (horse: JraEntry) => {
    if (horse.horseNo == null) return;
    horseOddsReturnRef.current = { scrollY: cardScrollYRef.current, horseNo: horse.horseNo };
    setSelectedHorseNo(horse.horseNo);
    setOddsView("HORSE");
    const firstCombo = HORSE_RANK_TYPES.find((type) => availableTypes.includes(type)) ?? "QUINELLA";
    setSelectedType(firstCombo);
    setRaceTab("ODDS");
    setDetailHorseNo(null);
  };

  if (!race) {
    return <SafeAreaView edges={["top"]} style={styles.safeArea}><View style={styles.loading}><ActivityIndicator /></View></SafeAreaView>;
  }

  const status = raceStateLabel(race, results.length > 0);
  const isFuture = (raceStartEpoch(race) ?? Infinity) > Date.now();
  const snapshotCurrent = venueSnapshot?.sourceObservedDate === race.raceDate;
  const snapshotTrack = snapshotCurrent && venueSnapshot
    ? race.discipline === "OBSTACLE" || race.surface === "MIXED"
      ? [venueSnapshot.turfCondition && "芝" + venueSnapshot.turfCondition,
          venueSnapshot.dirtCondition && "ダ" + venueSnapshot.dirtCondition].filter(Boolean).join(" / ") || null
      : race.surface === "DIRT"
        ? venueSnapshot.dirtCondition
        : venueSnapshot.turfCondition
    : null;
  const displayWeather = race.weather ?? (snapshotCurrent ? venueSnapshot?.weather ?? null : null);
  const displayTrack = race.trackCondition ?? snapshotTrack;
  const conditionMissingText = venueSnapshot?.sourceObservedDate && !snapshotCurrent
    ? "当日値未取得（" + venueSnapshot.sourceObservedDate.slice(5).replace("-","/") + "時点）"
    : "未取得";

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.container}
        scrollEventThrottle={16}
        onScroll={(event) => {
          if (raceTab === "CARD") cardScrollYRef.current = event.nativeEvent.contentOffset.y;
        }}
      >
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.topSide} onPress={handleBack}><Text style={styles.backArrow}>←</Text></TouchableOpacity>
          <Text style={styles.topTitle}>{race.venue} {race.raceNo}R</Text>
          <View style={[styles.topSide, styles.topRight]}><Text style={styles.liveText}>● LIVE</Text></View>
        </View>

        <View style={styles.raceNavigator}>
          <TouchableOpacity
            style={[styles.raceNavSide, !previousRace && styles.disabled]}
            disabled={!previousRace}
            onPress={() => previousRace && onOpenRace(previousRace.raceKey)}
          >
            <Text style={styles.raceNavText}>‹ {previousRace ? previousRace.raceNo + "R" : "前R"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.raceNavCenter} onPress={onOpenWeek}>
            <Text style={styles.raceNavCenterText}>今週のレース</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.raceNavSide, !nextRace && styles.disabled]}
            disabled={!nextRace}
            onPress={() => nextRace && onOpenRace(nextRace.raceKey)}
          >
            <Text style={styles.raceNavText}>{nextRace ? nextRace.raceNo + "R" : "次R"} ›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.hero}>
          <View style={styles.rowBetween}>
            <View style={styles.flex1}>
              <View style={styles.inline}>
                <Text style={styles.heroTime}>{race.startTime ?? "--:--"}</Text>
                <Text style={styles.heroTitle}>{race.raceName ?? "レース名取得待ち"}</Text>
              </View>
              <Text style={styles.heroMeta}>
                {[race.raceClass, raceCourseLabel(race), displayWeather, displayTrack].filter(Boolean).join("　")}
              </Text>
            </View>
            <View style={styles.statusPill}><Text style={styles.statusText}>{status}</Text></View>
          </View>
        </View>

        <View style={styles.raceTabs}>
          {([
            ["CARD","出走表"],["ODDS","オッズ"],["INFO","レース情報"],["RESULT","結果"],
          ] as Array<[RaceTab,string]>).map(([tab,label]) => (
            <TouchableOpacity
              key={tab}
              style={[styles.raceTab, raceTab === tab && styles.raceTabActive]}
              onPress={() => {
                if (tab === "CARD" && horseOddsReturnRef.current) {
                  returnFromHorseOdds();
                  return;
                }
                setRaceTab(tab);
                setError(null);
              }}
            >
              <Text style={[styles.raceTabText, raceTab === tab && styles.raceTabTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {raceTab === "CARD" ? (
          <>
            <View style={styles.sortHeader}>
              <Text style={styles.sortLabel}>表示順</Text>
              <Text style={styles.sortCurrent}>表示中：{sortMode === "HORSE_NO" ? "馬番順" : "人気順"}</Text>
            </View>
            <View style={styles.sortTabs}>
              <TouchableOpacity style={[styles.sortTab, sortMode === "HORSE_NO" && styles.sortTabActive]} onPress={() => setSortMode("HORSE_NO")}>
                <Text style={[styles.sortTabText, sortMode === "HORSE_NO" && styles.sortTabTextActive]}>馬番順</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.sortTab, sortMode === "POPULARITY" && styles.sortTabActive]} onPress={() => setSortMode("POPULARITY")}>
                <Text style={[styles.sortTabText, sortMode === "POPULARITY" && styles.sortTabTextActive]}>人気順</Text>
              </TouchableOpacity>
              <View style={[styles.sortTab, styles.disabled]}>
                <Text style={styles.sortTabText}>AI予想順</Text>
                <Text style={styles.aiPending}>未接続</Text>
              </View>
            </View>

            {race.status !== "OFFICIAL" ? (
              <View style={styles.card}>
                <Text style={styles.muted}>{status === "データ修復中" ? "正式出馬表を自動修復中。" : "正式出馬表の公開待ち。"}</Text>
                <TouchableOpacity style={styles.inlineButton} onPress={() => void refreshCard()} disabled={busy != null}>
                  <Text style={styles.inlineButtonText}>{busy === "race" ? "修復中" : "出馬表を再取得"}</Text>
                </TouchableOpacity>
              </View>
            ) : !entries.length ? (
              <View style={styles.card}>
                <Text style={styles.muted}>出走馬データがない。出馬表を再取得する。</Text>
                <TouchableOpacity style={styles.inlineButton} onPress={() => void refreshCard()}>
                  <Text style={styles.inlineButtonText}>{busy === "race" ? "更新中" : "出馬表を更新"}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.entryList}>
                {sortedEntries.map((entry, index) => {
                  const latestWin = entry.horseNo == null ? null : latestWinByNo.get(entry.horseNo) ?? entry.winOdds;
                  const inactive = entry.entryStatus !== "ACTIVE";
                  const gate = entry.gate != null ? GATE_COLORS[entry.gate] : null;
                  return (
                    <TouchableOpacity
                      key={entry.horseName + ":" + entry.horseNo}
                      style={[styles.entryRow, index > 0 && styles.borderTop, inactive && styles.entryInactive]}
                      onPress={() => setDetailHorseNo(entry.horseNo)}
                    >
                      <View style={[
                        styles.horseNoBox,
                        gate ? { backgroundColor: gate.bg, borderColor: gate.border } : null,
                      ]}>
                        <Text style={[styles.horseNoLabel, gate ? { color: gate.fg } : null]}>馬番</Text>
                        <Text style={[styles.horseNoValue, gate ? { color: gate.fg } : null]}>{entry.horseNo ?? "-"}</Text>
                      </View>

                      {sortMode === "POPULARITY" && entry.popularity != null ? (
                        <View style={styles.rankBadge}><Text style={styles.rankBadgeText}>{entry.popularity}人気</Text></View>
                      ) : null}

                      <View style={styles.entryMain}>
                        <View style={styles.inline}>
                          <Text style={[styles.horseName, inactive && styles.strike]}>{entry.horseName}</Text>
                          {inactive ? (
                            <View style={styles.cancelPill}>
                              <Text style={styles.cancelPillText}>{entry.entryStatus === "SCRATCHED" ? "取消" : "除外"}</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.entryMeta}>
                          {[entry.sex && entry.age ? entry.sex + entry.age : null,
                            entry.carriedWeight != null ? entry.carriedWeight + "kg" : null,
                            entry.jockeyName].filter(Boolean).join("　")}
                        </Text>
                      </View>
                      <View style={styles.entryOdds}>
                        <Text style={styles.entryOddsValue}>{latestWin != null ? latestWin.toFixed(1) : "-"}</Text>
                        <Text style={styles.entryOddsPopularity}>{entry.popularity != null ? entry.popularity + "人気" : ""}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {(oddsPage > 0 || oddsHasNext) ? (
              <View style={styles.oddsPager}>
                <TouchableOpacity
                  style={[styles.oddsPagerButton, oddsPage === 0 && styles.disabled]}
                  disabled={oddsPage === 0}
                  onPress={() => setOddsPage((page) => Math.max(0, page - 1))}
                >
                  <Text style={styles.oddsPagerButtonText}>‹ 前</Text>
                </TouchableOpacity>
                <Text style={styles.oddsPagerText}>
                  {oddsPage * ODDS_PAGE_SIZE + 1}〜{oddsPage * ODDS_PAGE_SIZE + displayedOdds.length}件
                </Text>
                <TouchableOpacity
                  style={[styles.oddsPagerButton, !oddsHasNext && styles.disabled]}
                  disabled={!oddsHasNext}
                  onPress={() => setOddsPage((page) => page + 1)}
                >
                  <Text style={styles.oddsPagerButtonText}>次 ›</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        ) : null}

        {raceTab === "ODDS" ? (
          <>
            <View style={styles.oddsModeTabs}>
              <TouchableOpacity style={[styles.oddsModeTab, oddsView === "NORMAL" && styles.oddsModeTabActive]} onPress={() => setOddsView("NORMAL")}>
                <Text style={[styles.oddsModeText, oddsView === "NORMAL" && styles.oddsModeTextActive]}>通常オッズ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.oddsModeTab, oddsView === "HORSE" && styles.oddsModeTabActive]}
                onPress={() => {
                  setOddsView("HORSE");
                  if (!HORSE_RANK_TYPES.includes(selectedType)) {
                    setSelectedType(HORSE_RANK_TYPES.find((type) => availableTypes.includes(type)) ?? "QUINELLA");
                  }
                }}
              >
                <Text style={[styles.oddsModeText, oddsView === "HORSE" && styles.oddsModeTextActive]}>馬別ランキング</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.oddsStatus}>
              <Text style={styles.oddsStatusText}>
                最終取得 {formatClock(latestObservedAt)}{latestObservedAt ? "　" + freshnessText(latestObservedAt, nowMs) : ""}
              </Text>
              <TouchableOpacity
                style={styles.oddsStatusButton}
                onPress={() => void refreshOdds()}
                disabled={busy != null || race.status !== "OFFICIAL"}
              >
                <Text style={styles.oddsStatusButtonText}>{busy === "odds" ? "取得中" : "↻ 更新"}</Text>
              </TouchableOpacity>
            </View>

            {oddsView === "HORSE" ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horsePicker}>
                  {entries.filter((entry) => entry.entryStatus === "ACTIVE" && entry.horseNo != null).map((entry) => (
                    <TouchableOpacity
                      key={entry.horseNo}
                      style={[styles.horsePickerChip, selectedHorseNo === entry.horseNo && styles.horsePickerChipActive]}
                      onPress={() => setSelectedHorseNo(entry.horseNo)}
                    >
                      <Text style={[styles.horsePickerNo, selectedHorseNo === entry.horseNo && styles.horsePickerActiveText]}>{entry.horseNo}</Text>
                      <Text style={[styles.horsePickerName, selectedHorseNo === entry.horseNo && styles.horsePickerNameActive]} numberOfLines={1}>{entry.horseName}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={styles.horseOddsHeading}>
                  {selectedHorse ? `${selectedHorse.horseNo}番 ${selectedHorse.horseName} が絡む ${oddsBetTypeLabel(selectedType)}オッズランキング` : "対象馬を選択"}
                </Text>
              </>
            ) : null}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
              {(oddsView === "HORSE" ? HORSE_RANK_TYPES : TYPE_ORDER).map((type) => {
                const available = availableTypes.includes(type);
                return (
                  <TouchableOpacity
                    key={type}
                    disabled={!available}
                    style={[styles.typeChip, selectedType === type && styles.typeChipActive, !available && styles.disabled]}
                    onPress={() => setSelectedType(type)}
                  >
                    <Text style={[styles.typeText, selectedType === type && styles.typeTextActive]}>{oddsBetTypeLabel(type)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {displayedOdds.length ? (
              <View style={styles.oddsTable}>
                {displayedOdds.map((row, index) => (
                  <View key={[row.betType,row.selection1,row.selection2,row.selection3].join(":")} style={[styles.oddsRow, index > 0 && styles.borderTop]}>
                    {oddsView === "HORSE" ? <View style={styles.oddsRank}><Text style={styles.oddsRankText}>{oddsPage * ODDS_PAGE_SIZE + index + 1}</Text></View> : null}
                    <Text style={styles.selection}>{formatSelection(row)}</Text>
                    <Text style={styles.price}>{formatOdds(row)}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.muted}>{race.status === "OFFICIAL" ? "この条件のオッズはまだ取得していない。" : "正式出馬表の公開待ち。"}</Text>
              </View>
            )}
          </>
        ) : null}

        {raceTab === "INFO" ? (
          <View style={styles.infoTable}>
            <View style={styles.infoRow}><Text style={styles.infoKey}>発走</Text><Text style={styles.infoValue}>{race.startTime ?? "-"}</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoKey}>条件</Text><Text style={styles.infoValue}>{race.raceClass ?? "-"}</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoKey}>コース</Text><Text style={styles.infoValue}>{raceCourseLabel(race) || "-"}</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoKey}>天候</Text><Text style={styles.infoValue}>{displayWeather ?? conditionMissingText}</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoKey}>馬場</Text><Text style={styles.infoValue}>{displayTrack ?? conditionMissingText}</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoKey}>出走</Text><Text style={styles.infoValue}>{entries.filter((entry) => entry.entryStatus === "ACTIVE").length || "-"}頭</Text></View>
            <TouchableOpacity style={styles.cardRefresh} onPress={() => void refreshCard()} disabled={busy != null}>
              <Text style={styles.cardRefreshText}>{busy === "race" ? "更新中" : race.raceDate === localTodayIso() ? "出馬表・現在馬場を更新 ↻" : "出馬表を更新 ↻"}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {raceTab === "RESULT" ? (
          results.length ? (
            <>
              <View style={styles.resultHeader}>
                <Text style={styles.sectionTitle}>確定結果</Text>
                <TouchableOpacity onPress={() => void refreshResult()} disabled={busy != null}>
                  <Text style={styles.resultRefresh}>{busy === "result" ? "取得中" : "再取得 ↻"}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.resultTable}>
                {results.map((result, index) => {
                  const winOdds = result.horseNo != null ? latestWinByNo.get(result.horseNo) : null;
                  return (
                    <View key={result.horseName + ":" + result.finishRaw} style={[styles.resultRow, index > 0 && styles.borderTop]}>
                      <View style={styles.finishBox}><Text style={styles.finishText}>{resultStatusLabel(result)}</Text></View>
                      <View style={styles.resultHorseNo}>
                        <Text style={styles.resultHorseNoLabel}>馬番</Text>
                        <Text style={styles.resultHorseNoValue}>{result.horseNo ?? "-"}</Text>
                      </View>
                      <View style={styles.flex1}>
                        <Text style={styles.resultHorseName}>{result.horseName}</Text>
                        <Text style={styles.resultMeta}>
                          {[result.popularity != null ? result.popularity + "人気" : null, winOdds != null ? "単勝 " + winOdds.toFixed(1) : null].filter(Boolean).join("　")}
                        </Text>
                      </View>
                      <View style={styles.resultTimeBox}>
                        <Text style={styles.resultTime}>{result.finishTime ?? "-"}</Text>
                        <Text style={styles.resultSub}>{result.margin ? "着差 " + result.margin : ""}</Text>
                        <Text style={styles.resultSub}>
                          {race.discipline === "OBSTACLE"
                            ? result.average1f != null ? "平均1F " + result.average1f.toFixed(1) : ""
                            : result.last3f != null ? "上がり " + result.last3f.toFixed(1) : ""}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              <Text style={styles.payoutTitle}>払戻</Text>
              {payouts.length ? (
                <View style={styles.payoutTable}>
                  {payouts.map((payout, index) => (
                    <View key={payout.betType + ":" + payout.selection} style={[styles.payoutRow, index > 0 && styles.borderTop]}>
                      <Text style={styles.payoutType}>{oddsBetTypeLabel(payout.betType)}</Text>
                      <Text style={styles.payoutSelection}>{payout.selection}</Text>
                      <Text style={styles.payoutValue}>{payout.payoutYen != null ? payout.payoutYen.toLocaleString() + "円" : "-"}</Text>
                    </View>
                  ))}
                </View>
              ) : <View style={styles.card}><Text style={styles.muted}>払戻情報の取得待ち。</Text></View>}
            </>
          ) : (
            <View style={styles.resultEmpty}>
              {busy === "result" ? <ActivityIndicator /> : null}
              <Text style={styles.resultEmptyTitle}>{isFuture ? "結果はレース終了後に表示" : "確定結果を確認中"}</Text>
              <Text style={styles.resultEmptySub}>
                {isFuture
                  ? race.discipline === "OBSTACLE"
                    ? "確定後、着順・平均1F・払戻をここに表示する。"
                    : "確定後、着順・上がり3F・払戻をここに表示する。"
                  : "結果が公開済みなら取得して保存する。"}
              </Text>
              {!isFuture ? (
                <TouchableOpacity style={styles.resultButton} onPress={() => void refreshResult()} disabled={busy != null}>
                  <Text style={styles.resultButtonText}>{busy === "result" ? "取得中" : "結果を取得 ↻"}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )
        ) : null}
      </ScrollView>

      {detailHorse ? <HorseSheet horse={detailHorse} close={() => setDetailHorseNo(null)} openHorseOdds={openHorseOdds} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f4f6f8" },
  container: { padding: 16, paddingBottom: 28, gap: 12 },
  flex1: { flex: 1 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  topBar: { height: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topSide: { width: 72 },
  topRight: { alignItems: "flex-end" },
  backArrow: { color: "#111827", fontSize: 28, fontWeight: "800" },
  topTitle: { color: "#111827", fontSize: 22, fontWeight: "900" },
  liveText: { color: "#6b7280", fontSize: 11, fontWeight: "900" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  inline: { flexDirection: "row", alignItems: "center", gap: 7 },
  hero: { backgroundColor: "#111827", borderRadius: 20, padding: 16 },
  heroTime: { color: "#9ca3af", fontSize: 14, fontWeight: "900" },
  heroTitle: { color: "#fff", fontSize: 21, fontWeight: "900", flexShrink: 1 },
  heroMeta: { color: "#d1d5db", fontSize: 12, fontWeight: "800", marginTop: 7 },
  statusPill: { backgroundColor: "#374151", borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, marginLeft: 8 },
  statusText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  raceNavigator: { backgroundColor: "#fff", borderRadius: 16, padding: 4, flexDirection: "row", alignItems: "center" },
  raceNavSide: { width: 82, minHeight: 42, alignItems: "center", justifyContent: "center" },
  raceNavText: { color: "#111827", fontSize: 12, fontWeight: "900" },
  raceNavCenter: { flex: 1, minHeight: 42, backgroundColor: "#111827", borderRadius: 12, alignItems: "center", justifyContent: "center" },
  raceNavCenterText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  disabled: { opacity: 0.32 },
  raceTabs: { flexDirection: "row", gap: 6 },
  raceTab: { flex: 1, minHeight: 50, backgroundColor: "#e5e7eb", borderRadius: 13, alignItems: "center", justifyContent: "center" },
  raceTabActive: { backgroundColor: "#111827" },
  raceTabText: { color: "#4b5563", fontSize: 12, fontWeight: "900" },
  raceTabTextActive: { color: "#fff" },
  error: { backgroundColor: "#fee2e2", color: "#991b1b", borderRadius: 12, padding: 10, fontSize: 11 },
  sortHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sortLabel: { color: "#6b7280", fontSize: 11, fontWeight: "800" },
  sortCurrent: { color: "#111827", fontSize: 12, fontWeight: "900" },
  sortTabs: { flexDirection: "row", backgroundColor: "#e5e7eb", borderRadius: 14, padding: 4 },
  sortTab: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  sortTabActive: { backgroundColor: "#fff" },
  sortTabText: { color: "#6b7280", fontSize: 11, fontWeight: "900" },
  sortTabTextActive: { color: "#111827" },
  aiPending: { color: "#9ca3af", fontSize: 7, fontWeight: "800", marginTop: 1 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 15 },
  muted: { color: "#6b7280", fontSize: 12, lineHeight: 18 },
  inlineButton: { marginTop: 10, backgroundColor: "#111827", borderRadius: 12, paddingVertical: 10, alignItems: "center" },
  inlineButtonText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  entryList: { backgroundColor: "#fff", borderRadius: 17, paddingHorizontal: 12 },
  entryRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 },
  entryInactive: { backgroundColor: "#fafafa" },
  borderTop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb" },
  horseNoBox: { width: 45, height: 52, borderRadius: 10, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  horseNoLabel: { color: "#6b7280", fontSize: 7, fontWeight: "900" },
  horseNoValue: { color: "#111827", fontSize: 21, fontWeight: "900" },
  rankBadge: { backgroundColor: "#111827", borderRadius: 9, paddingHorizontal: 7, paddingVertical: 6 },
  rankBadgeText: { color: "#fff", fontSize: 9, fontWeight: "900" },
  entryMain: { flex: 1 },
  horseName: { color: "#111827", fontSize: 15, fontWeight: "900", flexShrink: 1 },
  strike: { textDecorationLine: "line-through", color: "#6b7280" },
  cancelPill: { backgroundColor: "#b91c1c", borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  cancelPillText: { color: "#fff", fontSize: 8, fontWeight: "900" },
  entryMeta: { color: "#6b7280", fontSize: 10, fontWeight: "700", marginTop: 4 },
  entryOdds: { width: 54, alignItems: "flex-end" },
  entryOddsValue: { color: "#111827", fontSize: 18, fontWeight: "900" },
  entryOddsPopularity: { color: "#6b7280", fontSize: 10, fontWeight: "800", marginTop: 2 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.36)" },
  bottomSheet: { backgroundColor: "#111827", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18 },
  sheetHandle: { width: 48, height: 4, borderRadius: 2, backgroundColor: "#4b5563", alignSelf: "center", marginBottom: 17 },
  sheetHorseNo: { width: 50, height: 58, borderRadius: 11, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  sheetHorseNoLabel: { color: "#9ca3af", fontSize: 8, fontWeight: "900" },
  sheetHorseNoValue: { color: "#fff", fontSize: 23, fontWeight: "900" },
  sheetNameBlock: { maxWidth: 220 },
  horseSheetName: { color: "#fff", fontSize: 19, fontWeight: "900" },
  horseSheetMeta: { color: "#d1d5db", fontSize: 11, fontWeight: "700", marginTop: 4 },
  closeText: { color: "#9ca3af", fontSize: 11, fontWeight: "800" },
  detailRows: { marginTop: 16 },
  detailRow: { flexDirection: "row", paddingVertical: 6 },
  detailKey: { width: 64, color: "#9ca3af", fontSize: 11, fontWeight: "800" },
  detailValue: { color: "#fff", fontSize: 13, fontWeight: "800", flex: 1 },
  horseOddsJump: { marginTop: 17, backgroundColor: "#fff", borderRadius: 15, paddingVertical: 14, alignItems: "center" },
  horseOddsJumpText: { color: "#111827", fontSize: 12, fontWeight: "900" },
  oddsStatus: { minHeight: 34, backgroundColor: "#fff", borderRadius: 11, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  oddsStatusText: { color: "#6b7280", fontSize: 10, fontWeight: "800" },
  oddsStatusButton: { paddingHorizontal: 8, paddingVertical: 7 },
  oddsStatusButtonText: { color: "#111827", fontSize: 10, fontWeight: "900" },
  oddsModeTabs: { flexDirection: "row", backgroundColor: "#e5e7eb", borderRadius: 14, padding: 4 },
  oddsModeTab: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  oddsModeTabActive: { backgroundColor: "#fff" },
  oddsModeText: { color: "#6b7280", fontSize: 11, fontWeight: "900" },
  oddsModeTextActive: { color: "#111827" },
  horsePicker: { gap: 7, paddingBottom: 2 },
  horsePickerChip: { minWidth: 80, maxWidth: 112, backgroundColor: "#e5e7eb", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  horsePickerChipActive: { backgroundColor: "#111827" },
  horsePickerNo: { color: "#111827", fontSize: 13, fontWeight: "900" },
  horsePickerActiveText: { color: "#fff" },
  horsePickerName: { color: "#6b7280", fontSize: 8, fontWeight: "700", marginTop: 2 },
  horsePickerNameActive: { color: "#d1d5db" },
  horseOddsHeading: { color: "#111827", fontSize: 12, fontWeight: "900" },
  typeRow: { gap: 7, paddingBottom: 2 },
  typeChip: { borderRadius: 999, backgroundColor: "#e5e7eb", paddingHorizontal: 13, paddingVertical: 8 },
  typeChipActive: { backgroundColor: "#111827" },
  typeText: { color: "#4b5563", fontSize: 11, fontWeight: "900" },
  typeTextActive: { color: "#fff" },
  oddsPager: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff", borderRadius: 13, padding: 7 },
  oddsPagerButton: { minWidth: 74, paddingVertical: 9, alignItems: "center" },
  oddsPagerButtonText: { color: "#111827", fontSize: 11, fontWeight: "900" },
  oddsPagerText: { color: "#6b7280", fontSize: 10, fontWeight: "800" },
  oddsTable: { backgroundColor: "#fff", borderRadius: 16, paddingHorizontal: 12 },
  oddsRow: { minHeight: 48, flexDirection: "row", alignItems: "center" },
  oddsRank: { width: 25, height: 25, borderRadius: 13, backgroundColor: "#eef2f7", alignItems: "center", justifyContent: "center", marginRight: 9 },
  oddsRankText: { color: "#6b7280", fontSize: 10, fontWeight: "900" },
  selection: { flex: 1, color: "#111827", fontSize: 14, fontWeight: "900" },
  price: { color: "#111827", fontSize: 15, fontWeight: "900" },
  infoTable: { backgroundColor: "#fff", borderRadius: 17, paddingHorizontal: 15 },
  infoRow: { flexDirection: "row", paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e5e7eb" },
  infoKey: { width: 76, color: "#6b7280", fontSize: 12, fontWeight: "800" },
  infoValue: { flex: 1, color: "#111827", fontSize: 13, fontWeight: "900" },
  cardRefresh: { marginVertical: 14, backgroundColor: "#111827", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  cardRefreshText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  resultHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: "#111827", fontSize: 18, fontWeight: "900" },
  resultRefresh: { color: "#6b7280", fontSize: 11, fontWeight: "900" },
  resultTable: { backgroundColor: "#fff", borderRadius: 17, paddingHorizontal: 12 },
  resultRow: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  finishBox: { minWidth: 34, height: 34, borderRadius: 10, backgroundColor: "#111827", paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  finishText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  resultHorseNo: { width: 38, alignItems: "center" },
  resultHorseNoLabel: { color: "#9ca3af", fontSize: 7, fontWeight: "800" },
  resultHorseNoValue: { color: "#111827", fontSize: 18, fontWeight: "900" },
  resultHorseName: { color: "#111827", fontSize: 13, fontWeight: "900" },
  resultMeta: { color: "#6b7280", fontSize: 9, fontWeight: "700", marginTop: 3 },
  resultTimeBox: { alignItems: "flex-end", minWidth: 78 },
  resultTime: { color: "#111827", fontSize: 12, fontWeight: "900" },
  resultSub: { color: "#9ca3af", fontSize: 8, marginTop: 2 },
  payoutTitle: { color: "#111827", fontSize: 18, fontWeight: "900", marginTop: 5 },
  payoutTable: { backgroundColor: "#fff", borderRadius: 17, paddingHorizontal: 12 },
  payoutRow: { minHeight: 48, flexDirection: "row", alignItems: "center" },
  payoutType: { width: 70, color: "#6b7280", fontSize: 11, fontWeight: "900" },
  payoutSelection: { flex: 1, color: "#111827", fontSize: 13, fontWeight: "900" },
  payoutValue: { color: "#111827", fontSize: 13, fontWeight: "900" },
  resultEmpty: { backgroundColor: "#fff", borderRadius: 18, padding: 26, alignItems: "center", gap: 7 },
  resultEmptyTitle: { color: "#111827", fontSize: 17, fontWeight: "900", textAlign: "center" },
  resultEmptySub: { color: "#6b7280", fontSize: 11, lineHeight: 17, textAlign: "center" },
  resultButton: { marginTop: 9, backgroundColor: "#111827", borderRadius: 13, paddingHorizontal: 18, paddingVertical: 11 },
  resultButtonText: { color: "#fff", fontSize: 11, fontWeight: "900" },
});
