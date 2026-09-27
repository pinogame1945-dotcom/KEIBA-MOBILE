import { useMemo, useState } from "react";
import {
  Modal,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  notices,
  oddsByType,
  raceDays,
  races,
  type MockHorse,
  type MockRace,
} from "./mockData";

type Page = "HOME" | "RACES" | "RACE";
type OddsTab = keyof typeof oddsByType;
type RaceTab = "出走表" | "オッズ" | "レース情報" | "結果";
type SortMode = "馬番順" | "人気順" | "AI予想順";

const gateColors: Record<number, { bg: string; fg: string }> = {
  1: { bg: "#ffffff", fg: "#111827" },
  2: { bg: "#171717", fg: "#ffffff" },
  3: { bg: "#e53935", fg: "#ffffff" },
  4: { bg: "#3157c8", fg: "#ffffff" },
  5: { bg: "#f4d03f", fg: "#111827" },
  6: { bg: "#28965a", fg: "#ffffff" },
  7: { bg: "#e68a2e", fg: "#ffffff" },
  8: { bg: "#e990b5", fg: "#111827" },
};

function Pill({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <View style={[styles.pill, dark && styles.pillDark]}>
      <Text style={[styles.pillText, dark && styles.pillTextDark]}>{children}</Text>
    </View>
  );
}

function TopBar({ title, back }: { title: string; back?: () => void }) {
  return (
    <View style={styles.topBar}>
      <View style={styles.topSide}>
        {back ? <TouchableOpacity onPress={back}><Text style={styles.backText}>←</Text></TouchableOpacity> : null}
      </View>
      <Text style={styles.topTitle}>{title}</Text>
      <View style={[styles.topSide, styles.topRight]}>
        <Text style={styles.liveDot}>●</Text><Text style={styles.liveText}> LIVE</Text>
      </View>
    </View>
  );
}

function Home({ openRaces, openRace }: { openRaces: () => void; openRace: (race: MockRace) => void }) {
  const today = "2026-09-27";
  const nextRace = races.find((race) => race.raceDate === today && race.status === "UPCOMING") ?? races[0];
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <TopBar title="KEIBA" />

      <View style={styles.dateRow}>
        <View>
          <Text style={styles.dateMain}>9月27日 日曜日</Text>
          <Text style={styles.dateSub}>JRA 開催中</Text>
        </View>
        <TouchableOpacity style={styles.refreshMini}><Text style={styles.refreshMiniText}>更新 ↻</Text></TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.weekCard} onPress={openRaces}>
        <View style={styles.sectionHeadingRow}>
          <View>
            <Text style={styles.weekCardTitle}>今週のレース</Text>
            <Text style={styles.weekCardSub}>土・日・祝日の開催をまとめて確認</Text>
          </View>
          <Text style={styles.chevronDark}>›</Text>
        </View>
        <View style={styles.dayMiniRow}>
          {raceDays.map((day) => (
            <View key={day.date} style={[styles.dayMini, day.isToday && styles.dayMiniToday]}>
              <Text style={[styles.dayMiniText, day.isToday && styles.dayMiniTextToday]}>{day.label}</Text>
              {day.isToday ? <Text style={styles.todayMini}>今日</Text> : null}
            </View>
          ))}
        </View>
        <Text style={styles.weekVenueText}>今日の開催　中山・阪神</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.nextRaceCard} onPress={() => openRace(nextRace)}>
        <View style={styles.sectionHeadingRow}>
          <Text style={styles.nextLabel}>NEXT RACE</Text>
          <Pill dark>{nextRace.start} 発走</Pill>
        </View>
        <View style={styles.nextMain}>
          <View style={styles.flex1}>
            <Text style={styles.nextRaceNo}>{nextRace.venue} {nextRace.raceNo}R</Text>
            <Text style={styles.nextRaceName}>{nextRace.name}</Text>
            <Text style={styles.nextMeta}>{nextRace.course}　{nextRace.weather} / {nextRace.track}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.noticePanel}>
        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionHeading}>お知らせ</Text>
          <Text style={styles.sectionHint}>重要な変更</Text>
        </View>
        {notices.slice(0, 2).map((notice, index) => (
          <View key={notice.id} style={[styles.noticeRow, index > 0 && styles.borderTop]}>
            <View style={[styles.noticeIcon, notice.kind === "SCRATCH" && styles.noticeIconDanger]}>
              <Text style={styles.noticeIconText}>{notice.kind === "TRACK" ? "馬" : notice.kind === "WEATHER" ? "天" : "取"}</Text>
            </View>
            <View style={styles.flex1}>
              <View style={styles.inline}>
                <Text style={styles.noticeRace}>{notice.venue} {notice.raceNo}R</Text>
                <Text style={styles.noticeTime}>{notice.time}</Text>
              </View>
              <Text style={styles.noticeTitle}>{notice.title}</Text>
              <Text style={styles.noticeDetail}>{notice.detail}</Text>
            </View>
          </View>
        ))}
        <TouchableOpacity style={styles.moreNotice}><Text style={styles.moreNoticeText}>すべてのお知らせを見る</Text></TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function Races({ back, openRace }: { back: () => void; openRace: (race: MockRace) => void }) {
  const [date, setDate] = useState("2026-09-27");
  const dayRaces = races.filter((race) => race.raceDate === date);
  const venues = Array.from(new Set(dayRaces.map((race) => race.venue)));
  const [venue, setVenue] = useState("中山");
  const effectiveVenue = venues.includes(venue) ? venue : venues[0];
  const visible = dayRaces.filter((race) => race.venue === effectiveVenue);
  const nextId = visible.find((race) => race.status === "UPCOMING")?.id ?? null;

  const chooseDate = (nextDate: string) => {
    setDate(nextDate);
    const firstVenue = races.find((race) => race.raceDate === nextDate)?.venue;
    if (firstVenue) setVenue(firstVenue);
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <TopBar title="今週のレース" back={back} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayTabs}>
        {raceDays.map((day) => (
          <TouchableOpacity key={day.date} onPress={() => chooseDate(day.date)} style={[styles.dayTab, date === day.date && styles.dayTabActive]}>
            <Text style={[styles.dayTabText, date === day.date && styles.dayTabTextActive]}>{day.label}</Text>
            {day.isToday ? <Text style={[styles.todayBadge, date === day.date && styles.todayBadgeActive]}>今日</Text> : null}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.venueTabs}>
        {venues.map((item) => (
          <TouchableOpacity key={item} onPress={() => setVenue(item)} style={[styles.venueTab, effectiveVenue === item && styles.venueTabActive]}>
            <Text style={[styles.venueTabText, effectiveVenue === item && styles.venueTabTextActive]}>{item}</Text>
            {date === "2026-09-27" && item === "中山" ? <Text style={styles.changeDot}>● 変更あり</Text> : null}
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.weatherStrip}>
        <View>
          <Text style={styles.weatherVenue}>{effectiveVenue}</Text>
          <Text style={styles.weatherText}>
            {date === "2026-09-27" && effectiveVenue === "中山" ? "雨 / 芝 稍重 / ダ 重" : "晴 / 芝 良 / ダ 良"}
          </Text>
        </View>
        <Text style={styles.weatherUpdated}>最終更新 13:42</Text>
      </View>

      {visible.map((race) => {
        const isNext = race.id === nextId;
        const isClosed = race.status === "CLOSED";
        return (
          <TouchableOpacity
            key={race.id}
            style={[styles.raceCard, isNext && styles.raceCardNext, isClosed && styles.raceCardClosed]}
            onPress={() => openRace(race)}
          >
            <View style={styles.raceNoBlock}>
              <Text style={[styles.raceNo, isClosed && styles.mutedText]}>{race.raceNo}R</Text>
              <Text style={styles.raceStart}>{race.start}</Text>
              {isNext ? <Text style={styles.nextBadge}>NEXT</Text> : isClosed ? <Text style={styles.closedBadge}>終了</Text> : null}
            </View>
            <View style={styles.flex1}>
              <View style={styles.inline}>
                <Text style={[styles.raceName, isClosed && styles.mutedText]}>{race.name}</Text>
                {race.className === "G2" ? <Pill>G2</Pill> : null}
              </View>
              <Text style={styles.raceMeta}>{race.className}　{race.course}</Text>
              <Text style={styles.raceCondition}>{race.weather} / {race.track}</Text>
            </View>
            <Text style={styles.chevronDark}>›</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function HorseSheet({ horse, close }: { horse: MockHorse; close: () => void }) {
  const gate = gateColors[horse.gate] ?? gateColors[1];
  return (
    <Modal transparent animationType="slide" visible onRequestClose={close}>
      <View style={styles.modalRoot}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={close} />
        <View style={styles.bottomSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sectionHeadingRow}>
            <View style={styles.inline}>
              <View style={[styles.sheetHorseNo, { borderColor: gate.bg }]}>
                <Text style={styles.sheetHorseNoLabel}>馬番</Text>
                <Text style={styles.sheetHorseNoValue}>{horse.no}</Text>
              </View>
              <View>
                <Text style={styles.horseSheetName}>{horse.name}</Text>
                <Text style={styles.horseSheetMeta}>{horse.sexAge}　{horse.weight}　{horse.body}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={close}><Text style={styles.closeText}>閉じる ×</Text></TouchableOpacity>
          </View>
          <View style={styles.detailRows}>
            <View style={styles.detailRow}><Text style={styles.detailKey}>騎手</Text><Text style={styles.detailValue}>{horse.jockey}</Text></View>
            <View style={styles.detailRow}><Text style={styles.detailKey}>調教師</Text><Text style={styles.detailValue}>{horse.trainer}</Text></View>
            <View style={styles.detailRow}><Text style={styles.detailKey}>父</Text><Text style={styles.detailValue}>{horse.sire}</Text></View>
            <View style={styles.detailRow}><Text style={styles.detailKey}>母父</Text><Text style={styles.detailValue}>{horse.damsire}</Text></View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Race({ race, back }: { race: MockRace; back: () => void }) {
  const [horse, setHorse] = useState<MockHorse | null>(null);
  const [raceTab, setRaceTab] = useState<RaceTab>("出走表");
  const [sortMode, setSortMode] = useState<SortMode>("馬番順");
  const [oddsTab, setOddsTab] = useState<OddsTab>("単勝");

  const sortedHorses = [...race.horses].sort((a, b) => {
    if (sortMode === "人気順") return (a.popularity ?? 999) - (b.popularity ?? 999);
    if (sortMode === "AI予想順") return (a.aiRank ?? 999) - (b.aiRank ?? 999);
    return a.no - b.no;
  });

  return (
    <View style={styles.flex1}>
      <ScrollView contentContainerStyle={styles.page}>
        <TopBar title={race.venue + " " + race.raceNo + "R"} back={back} />

        <View style={styles.compactHero}>
          <View style={styles.sectionHeadingRow}>
            <View style={styles.flex1}>
              <View style={styles.inline}>
                <Text style={styles.compactRaceTime}>{race.start}</Text>
                <Text style={styles.compactRaceName}>{race.name}</Text>
              </View>
              <Text style={styles.compactRaceMeta}>{race.className}　{race.course}　{race.weather} / {race.track}</Text>
            </View>
            <Pill dark>{race.status === "CLOSED" ? "終了" : "発走前"}</Pill>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.raceTabs}>
          {(["出走表", "オッズ", "レース情報", "結果"] as RaceTab[]).map((tab) => (
            <TouchableOpacity key={tab} onPress={() => setRaceTab(tab)} style={[styles.raceTab, raceTab === tab && styles.raceTabActive]}>
              <Text style={[styles.raceTabText, raceTab === tab && styles.raceTabTextActive]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {raceTab === "出走表" ? (
          <>
            <View style={styles.sortHeader}>
              <Text style={styles.sortHeaderTitle}>表示順</Text>
              <Text style={styles.sortNow}>表示中：{sortMode}</Text>
            </View>
            <View style={styles.sortTabs}>
              {(["馬番順", "人気順", "AI予想順"] as SortMode[]).map((mode) => (
                <TouchableOpacity key={mode} onPress={() => setSortMode(mode)} style={[styles.sortTab, sortMode === mode && styles.sortTabActive]}>
                  <Text style={[styles.sortTabText, sortMode === mode && styles.sortTabTextActive]}>{mode}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.cardFlat}>
              {sortedHorses.map((item, index) => {
                const gate = gateColors[item.gate] ?? gateColors[1];
                const rankLabel = sortMode === "AI予想順"
                  ? item.aiRank != null ? `AI ${item.aiRank}位` : null
                  : sortMode === "人気順"
                    ? item.popularity != null ? `${item.popularity}人気` : null
                    : null;
                return (
                  <TouchableOpacity
                    key={item.no}
                    style={[styles.horseRow, index > 0 && styles.borderTop, item.status === "SCRATCHED" && styles.horseRowScratched]}
                    onPress={() => setHorse(item)}
                  >
                    {item.status === "SCRATCHED" ? <View style={styles.cancelBand}><Text style={styles.cancelBandText}>取消</Text></View> : null}
                    <View style={[styles.horseNumberBox, { borderLeftColor: gate.bg }]}>
                      <Text style={styles.horseNumberLabel}>馬番</Text>
                      <Text style={styles.horseNumberValue}>{item.no}</Text>
                    </View>
                    {rankLabel ? <View style={styles.rankBadge}><Text style={styles.rankBadgeText}>{rankLabel}</Text></View> : null}
                    <View style={styles.flex1}>
                      <Text style={[styles.horseName, item.status === "SCRATCHED" && styles.strike]}>{item.name}</Text>
                      <Text style={styles.horseMeta}>{item.sexAge}　{item.weight}　{item.jockey}</Text>
                    </View>
                    <View style={styles.horseOdds}>
                      <Text style={styles.horseOddsValue}>{item.odds != null ? item.odds.toFixed(1) : "-"}</Text>
                      <Text style={styles.horseOddsSub}>{item.popularity != null ? item.popularity + "人気" : ""}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : null}

        {raceTab === "オッズ" ? (
          <>
            <View style={styles.oddsFreshness}>
              <View>
                <Text style={styles.oddsFreshLabel}>最新オッズ</Text>
                <Text style={styles.oddsFreshTime}>最終取得 13:44:18</Text>
              </View>
              <TouchableOpacity style={styles.refreshOddsButton}><Text style={styles.refreshOddsText}>更新 ↻</Text></TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.oddsTabs}>
              {(Object.keys(oddsByType) as OddsTab[]).map((tab) => (
                <TouchableOpacity key={tab} onPress={() => setOddsTab(tab)} style={[styles.oddsTab, oddsTab === tab && styles.oddsTabActive]}>
                  <Text style={[styles.oddsTabText, oddsTab === tab && styles.oddsTabTextActive]}>{tab}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.cardFlat}>
              {oddsByType[oddsTab].map(([selection, price], index) => (
                <View key={selection} style={[styles.oddsRow, index > 0 && styles.borderTop]}>
                  <View style={styles.oddsRank}><Text style={styles.oddsRankText}>{index + 1}</Text></View>
                  <Text style={styles.oddsSelection}>{selection}</Text>
                  <Text style={styles.oddsPrice}>{price}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {raceTab === "レース情報" ? (
          <View style={styles.infoPanel}>
            <View style={styles.infoRow}><Text style={styles.infoKey}>発走</Text><Text style={styles.infoValue}>{race.start}</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoKey}>条件</Text><Text style={styles.infoValue}>{race.className}</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoKey}>コース</Text><Text style={styles.infoValue}>{race.course}</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoKey}>天候</Text><Text style={styles.infoValue}>{race.weather}</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoKey}>馬場</Text><Text style={styles.infoValue}>{race.track}</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoKey}>出走</Text><Text style={styles.infoValue}>{race.horses.filter((h) => h.status === "ACTIVE").length}頭</Text></View>
          </View>
        ) : null}

        {raceTab === "結果" ? (
          race.results ? (
            <>
              <View style={styles.resultHeader}>
                <Text style={styles.sectionHeading}>確定結果</Text>
                <Text style={styles.sectionHint}>着順・人気・タイム</Text>
              </View>
              <View style={styles.cardFlat}>
                {race.results.map((result, index) => (
                  <View key={result.horseNo} style={[styles.resultRow, index > 0 && styles.borderTop]}>
                    <View style={styles.finishBox}><Text style={styles.finishText}>{result.finish}</Text></View>
                    <View style={styles.resultHorseNo}><Text style={styles.resultHorseNoLabel}>馬番</Text><Text style={styles.resultHorseNoValue}>{result.horseNo}</Text></View>
                    <View style={styles.flex1}>
                      <Text style={styles.resultHorseName}>{result.horseName}</Text>
                      <Text style={styles.resultMeta}>{result.popularity}人気　単勝 {result.odds.toFixed(1)}</Text>
                    </View>
                    <View style={styles.resultTimeBox}><Text style={styles.resultTime}>{result.time}</Text><Text style={styles.resultMargin}>{result.margin}</Text></View>
                  </View>
                ))}
              </View>
              <Text style={styles.payoutTitle}>払戻</Text>
              <View style={styles.cardFlat}>
                {race.payouts?.map((payout, index) => (
                  <View key={payout.type} style={[styles.payoutRow, index > 0 && styles.borderTop]}>
                    <Text style={styles.payoutType}>{payout.type}</Text>
                    <Text style={styles.payoutSelection}>{payout.selection}</Text>
                    <Text style={styles.payoutValue}>{payout.payout}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <View style={styles.emptyResult}>
              <Text style={styles.emptyResultTitle}>結果はレース終了後に表示</Text>
              <Text style={styles.emptyResultSub}>確定後、着順と払戻をここに表示する。</Text>
            </View>
          )
        ) : null}
      </ScrollView>

      {horse ? <HorseSheet horse={horse} close={() => setHorse(null)} /> : null}
    </View>
  );
}

export function UiMockApp() {
  const [page, setPage] = useState<Page>("HOME");
  const [race, setRace] = useState<MockRace | null>(null);

  const openRace = (next: MockRace) => {
    setRace(next);
    setPage("RACE");
  };

  const body = useMemo(() => {
    if (page === "HOME") return <Home openRaces={() => setPage("RACES")} openRace={openRace} />;
    if (page === "RACES") return <Races back={() => setPage("HOME")} openRace={openRace} />;
    if (race) return <Race race={race} back={() => setPage("RACES")} />;
    return <Home openRaces={() => setPage("RACES")} openRace={openRace} />;
  }, [page, race]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6f8" },
  flex1: { flex: 1 },
  page: { padding: 16, paddingBottom: 44, gap: 12 },
  topBar: { height: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topSide: { width: 72 },
  topRight: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center" },
  topTitle: { fontSize: 18, fontWeight: "900", color: "#111827", letterSpacing: 0.5 },
  backText: { fontSize: 26, fontWeight: "700", color: "#111827" },
  liveDot: { color: "#ef4444", fontSize: 9 },
  liveText: { color: "#6b7280", fontSize: 11, fontWeight: "800" },
  dateRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dateMain: { fontSize: 24, fontWeight: "900", color: "#111827" },
  dateSub: { marginTop: 2, color: "#6b7280", fontSize: 12, fontWeight: "700" },
  refreshMini: { backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  refreshMiniText: { fontSize: 12, fontWeight: "800", color: "#374151" },
  sectionHeadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionHeading: { fontSize: 17, fontWeight: "900", color: "#111827" },
  sectionHint: { fontSize: 11, color: "#9ca3af", fontWeight: "700" },
  inline: { flexDirection: "row", alignItems: "center", gap: 7 },
  borderTop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb" },

  weekCard: { backgroundColor: "#fff", borderRadius: 20, padding: 17 },
  weekCardTitle: { color: "#111827", fontSize: 20, fontWeight: "900" },
  weekCardSub: { marginTop: 3, color: "#6b7280", fontSize: 11 },
  dayMiniRow: { flexDirection: "row", gap: 6, marginTop: 14 },
  dayMini: { flex: 1, backgroundColor: "#eef2f7", borderRadius: 12, paddingVertical: 9, alignItems: "center" },
  dayMiniToday: { backgroundColor: "#111827" },
  dayMiniText: { fontSize: 11, fontWeight: "900", color: "#4b5563" },
  dayMiniTextToday: { color: "#fff" },
  todayMini: { marginTop: 2, color: "#9ca3af", fontSize: 8, fontWeight: "800" },
  weekVenueText: { marginTop: 11, color: "#4b5563", fontSize: 11, fontWeight: "800" },

  nextRaceCard: { backgroundColor: "#111827", borderRadius: 20, padding: 17 },
  nextLabel: { color: "#9ca3af", fontSize: 11, fontWeight: "900", letterSpacing: 1.1 },
  nextMain: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  nextRaceNo: { color: "#fff", fontSize: 15, fontWeight: "900" },
  nextRaceName: { color: "#fff", fontSize: 21, fontWeight: "900", marginTop: 4 },
  nextMeta: { color: "#d1d5db", fontSize: 12, marginTop: 6 },
  chevron: { color: "#fff", fontSize: 34, fontWeight: "300" },
  chevronDark: { color: "#9ca3af", fontSize: 28, fontWeight: "300" },

  noticePanel: { backgroundColor: "#fff", borderRadius: 18, padding: 15 },
  noticeRow: { flexDirection: "row", gap: 11, paddingVertical: 12 },
  noticeIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: "#111827", alignItems: "center", justifyContent: "center" },
  noticeIconDanger: { backgroundColor: "#b91c1c" },
  noticeIconText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  noticeRace: { color: "#6b7280", fontSize: 11, fontWeight: "800" },
  noticeTime: { color: "#9ca3af", fontSize: 10 },
  noticeTitle: { marginTop: 3, fontSize: 14, fontWeight: "900", color: "#111827" },
  noticeDetail: { marginTop: 2, fontSize: 13, color: "#4b5563", fontWeight: "700" },
  moreNotice: { paddingTop: 10, alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb" },
  moreNoticeText: { color: "#6b7280", fontSize: 11, fontWeight: "800" },

  pill: { backgroundColor: "#eef2f7", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  pillDark: { backgroundColor: "#374151" },
  pillText: { color: "#374151", fontWeight: "900", fontSize: 10 },
  pillTextDark: { color: "#fff" },

  dayTabs: { gap: 8 },
  dayTab: { minWidth: 108, backgroundColor: "#e5e7eb", borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, alignItems: "center" },
  dayTabActive: { backgroundColor: "#111827" },
  dayTabText: { color: "#4b5563", fontSize: 12, fontWeight: "900" },
  dayTabTextActive: { color: "#fff" },
  todayBadge: { marginTop: 2, color: "#6b7280", fontSize: 8, fontWeight: "900" },
  todayBadgeActive: { color: "#9ca3af" },

  venueTabs: { flexDirection: "row", backgroundColor: "#e5e7eb", borderRadius: 14, padding: 4 },
  venueTab: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: 11 },
  venueTabActive: { backgroundColor: "#fff" },
  venueTabText: { color: "#6b7280", fontSize: 15, fontWeight: "900" },
  venueTabTextActive: { color: "#111827" },
  changeDot: { color: "#b91c1c", fontSize: 8, fontWeight: "900", marginTop: 2 },

  weatherStrip: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#111827", borderRadius: 16, padding: 14 },
  weatherVenue: { color: "#fff", fontSize: 15, fontWeight: "900" },
  weatherText: { marginTop: 2, color: "#d1d5db", fontSize: 11, fontWeight: "700" },
  weatherUpdated: { color: "#9ca3af", fontSize: 10 },

  raceCard: { backgroundColor: "#fff", borderRadius: 16, padding: 13, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: "transparent" },
  raceCardNext: { borderColor: "#111827", borderWidth: 2 },
  raceCardClosed: { opacity: 0.52 },
  raceNoBlock: { width: 52, alignItems: "center" },
  raceNo: { fontSize: 18, fontWeight: "900", color: "#111827" },
  raceStart: { marginTop: 2, color: "#6b7280", fontSize: 11, fontWeight: "700" },
  nextBadge: { marginTop: 4, backgroundColor: "#111827", color: "#fff", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, fontSize: 8, fontWeight: "900" },
  closedBadge: { marginTop: 4, color: "#6b7280", fontSize: 8, fontWeight: "900" },
  raceName: { color: "#111827", fontSize: 15, fontWeight: "900", flexShrink: 1 },
  raceMeta: { marginTop: 4, color: "#4b5563", fontSize: 11, fontWeight: "700" },
  raceCondition: { marginTop: 2, color: "#9ca3af", fontSize: 10 },
  mutedText: { color: "#6b7280" },

  compactHero: { backgroundColor: "#111827", borderRadius: 16, padding: 13 },
  compactRaceTime: { color: "#9ca3af", fontSize: 11, fontWeight: "900" },
  compactRaceName: { color: "#fff", fontSize: 18, fontWeight: "900", flexShrink: 1 },
  compactRaceMeta: { color: "#d1d5db", fontSize: 11, fontWeight: "700", marginTop: 5 },

  raceTabs: { gap: 7 },
  raceTab: { backgroundColor: "#e5e7eb", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  raceTabActive: { backgroundColor: "#111827" },
  raceTabText: { color: "#4b5563", fontSize: 12, fontWeight: "900" },
  raceTabTextActive: { color: "#fff" },

  sortHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sortHeaderTitle: { color: "#6b7280", fontSize: 11, fontWeight: "800" },
  sortNow: { color: "#111827", fontSize: 12, fontWeight: "900" },
  sortTabs: { flexDirection: "row", backgroundColor: "#e5e7eb", borderRadius: 13, padding: 4 },
  sortTab: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10 },
  sortTabActive: { backgroundColor: "#fff" },
  sortTabText: { color: "#6b7280", fontSize: 11, fontWeight: "800" },
  sortTabTextActive: { color: "#111827", fontWeight: "900" },

  cardFlat: { backgroundColor: "#fff", borderRadius: 16, paddingHorizontal: 12 },
  horseRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, position: "relative" },
  horseRowScratched: { backgroundColor: "#fafafa" },
  cancelBand: { position: "absolute", top: 0, bottom: 0, left: -12, width: 5, backgroundColor: "#b91c1c", borderRadius: 2 },
  cancelBandText: { display: "none" },
  horseNumberBox: { width: 42, borderLeftWidth: 6, paddingLeft: 6 },
  horseNumberLabel: { color: "#9ca3af", fontSize: 8, fontWeight: "800" },
  horseNumberValue: { color: "#111827", fontSize: 20, fontWeight: "900", marginTop: -1 },
  rankBadge: { backgroundColor: "#111827", borderRadius: 9, paddingHorizontal: 7, paddingVertical: 6 },
  rankBadgeText: { color: "#fff", fontSize: 9, fontWeight: "900" },
  horseName: { fontSize: 14, fontWeight: "900", color: "#111827" },
  strike: { textDecorationLine: "line-through", color: "#6b7280" },
  horseMeta: { marginTop: 3, color: "#6b7280", fontSize: 10, fontWeight: "700" },
  horseOdds: { width: 48, alignItems: "flex-end" },
  horseOddsValue: { color: "#111827", fontSize: 16, fontWeight: "900" },
  horseOddsSub: { color: "#6b7280", fontSize: 10, marginTop: 1, fontWeight: "700" },

  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.34)" },
  bottomSheet: { backgroundColor: "#111827", borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18, paddingBottom: 34 },
  sheetHandle: { width: 46, height: 4, borderRadius: 2, backgroundColor: "#4b5563", alignSelf: "center", marginBottom: 16 },
  sheetHorseNo: { width: 46, borderLeftWidth: 6, paddingLeft: 7 },
  sheetHorseNoLabel: { color: "#9ca3af", fontSize: 8, fontWeight: "800" },
  sheetHorseNoValue: { color: "#fff", fontSize: 22, fontWeight: "900" },
  horseSheetName: { color: "#fff", fontSize: 18, fontWeight: "900" },
  horseSheetMeta: { color: "#d1d5db", fontSize: 11, fontWeight: "700", marginTop: 3 },
  closeText: { color: "#9ca3af", fontSize: 11, fontWeight: "800" },
  detailRows: { marginTop: 16 },
  detailRow: { flexDirection: "row", paddingVertical: 6 },
  detailKey: { width: 58, color: "#9ca3af", fontSize: 11, fontWeight: "700" },
  detailValue: { color: "#fff", fontSize: 12, fontWeight: "800" },

  oddsFreshness: { backgroundColor: "#111827", borderRadius: 16, padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  oddsFreshLabel: { color: "#9ca3af", fontSize: 10, fontWeight: "800" },
  oddsFreshTime: { color: "#fff", fontSize: 16, fontWeight: "900", marginTop: 2 },
  refreshOddsButton: { backgroundColor: "#374151", paddingHorizontal: 13, paddingVertical: 9, borderRadius: 11 },
  refreshOddsText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  oddsTabs: { gap: 7, paddingBottom: 2 },
  oddsTab: { backgroundColor: "#e5e7eb", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  oddsTabActive: { backgroundColor: "#111827" },
  oddsTabText: { color: "#4b5563", fontWeight: "800", fontSize: 12 },
  oddsTabTextActive: { color: "#fff" },
  oddsRow: { flexDirection: "row", alignItems: "center", minHeight: 48 },
  oddsRank: { width: 25, height: 25, borderRadius: 13, backgroundColor: "#eef2f7", alignItems: "center", justifyContent: "center" },
  oddsRankText: { fontSize: 10, fontWeight: "900", color: "#6b7280" },
  oddsSelection: { flex: 1, marginLeft: 10, fontSize: 14, fontWeight: "900", color: "#111827" },
  oddsPrice: { fontSize: 15, fontWeight: "900", color: "#111827" },

  infoPanel: { backgroundColor: "#fff", borderRadius: 16, paddingHorizontal: 14 },
  infoRow: { flexDirection: "row", paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e5e7eb" },
  infoKey: { width: 76, color: "#6b7280", fontSize: 12, fontWeight: "800" },
  infoValue: { flex: 1, color: "#111827", fontSize: 13, fontWeight: "900" },

  resultHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  resultRow: { flexDirection: "row", alignItems: "center", minHeight: 64, gap: 8 },
  finishBox: { width: 32, height: 32, borderRadius: 10, backgroundColor: "#111827", alignItems: "center", justifyContent: "center" },
  finishText: { color: "#fff", fontSize: 15, fontWeight: "900" },
  resultHorseNo: { width: 38, alignItems: "center" },
  resultHorseNoLabel: { color: "#9ca3af", fontSize: 7, fontWeight: "800" },
  resultHorseNoValue: { color: "#111827", fontSize: 17, fontWeight: "900" },
  resultHorseName: { color: "#111827", fontSize: 13, fontWeight: "900" },
  resultMeta: { color: "#6b7280", fontSize: 9, fontWeight: "700", marginTop: 3 },
  resultTimeBox: { alignItems: "flex-end" },
  resultTime: { color: "#111827", fontSize: 12, fontWeight: "900" },
  resultMargin: { color: "#9ca3af", fontSize: 9, marginTop: 2 },
  payoutTitle: { marginTop: 6, color: "#111827", fontSize: 17, fontWeight: "900" },
  payoutRow: { flexDirection: "row", alignItems: "center", minHeight: 46 },
  payoutType: { width: 58, color: "#6b7280", fontSize: 11, fontWeight: "800" },
  payoutSelection: { flex: 1, color: "#111827", fontSize: 13, fontWeight: "900" },
  payoutValue: { color: "#111827", fontSize: 13, fontWeight: "900" },
  emptyResult: { backgroundColor: "#fff", borderRadius: 16, padding: 24, alignItems: "center" },
  emptyResultTitle: { color: "#111827", fontSize: 15, fontWeight: "900" },
  emptyResultSub: { marginTop: 5, color: "#6b7280", fontSize: 11, textAlign: "center" },
});
