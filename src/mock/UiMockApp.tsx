import { useMemo, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { notices, oddsByType, races, type MockHorse, type MockRace } from "./mockData";

type Page = "HOME" | "RACES" | "RACE";
type OddsTab = keyof typeof oddsByType;

const venueOrder = ["中山", "阪神"];

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
      <View style={[styles.topSide, styles.topRight]}><Text style={styles.liveDot}>●</Text><Text style={styles.liveText}> LIVE</Text></View>
    </View>
  );
}

function Home({ openRaces, openRace }: { openRaces: () => void; openRace: (race: MockRace) => void }) {
  const nextRace = races.find((race) => race.status === "UPCOMING") ?? races[0];
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

      <View style={styles.noticePanel}>
        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionHeading}>お知らせ</Text>
          <Text style={styles.sectionHint}>重要な変更だけ</Text>
        </View>
        {notices.map((notice, index) => (
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
      </View>

      <TouchableOpacity style={styles.nextRaceCard} onPress={() => openRace(nextRace)}>
        <View style={styles.sectionHeadingRow}>
          <Text style={styles.nextLabel}>NEXT RACE</Text>
          <Pill dark>{nextRace.start} 発走</Pill>
        </View>
        <View style={styles.nextMain}>
          <View>
            <Text style={styles.nextRaceNo}>{nextRace.venue} {nextRace.raceNo}R</Text>
            <Text style={styles.nextRaceName}>{nextRace.name}</Text>
            <Text style={styles.nextMeta}>{nextRace.course}　{nextRace.weather} / {nextRace.track}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.racesButton} onPress={openRaces}>
        <View>
          <Text style={styles.racesButtonTitle}>今日のレース</Text>
          <Text style={styles.racesButtonSub}>開催一覧・出走表・馬情報・最新オッズ</Text>
        </View>
        <Text style={styles.chevronDark}>›</Text>
      </TouchableOpacity>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>現在の取得状態</Text>
        <View style={styles.infoGrid}>
          <View style={styles.infoCell}><Text style={styles.infoValue}>2</Text><Text style={styles.infoLabel}>競馬場</Text></View>
          <View style={styles.infoCell}><Text style={styles.infoValue}>7</Text><Text style={styles.infoLabel}>レース</Text></View>
          <View style={styles.infoCell}><Text style={styles.infoValue}>13:42</Text><Text style={styles.infoLabel}>最終更新</Text></View>
        </View>
      </View>
    </ScrollView>
  );
}

function Races({ back, openRace }: { back: () => void; openRace: (race: MockRace) => void }) {
  const [venue, setVenue] = useState("中山");
  const visible = races.filter((race) => race.venue === venue);
  return (
    <View style={styles.flex1}>
      <ScrollView contentContainerStyle={styles.page}>
        <TopBar title="今日のレース" back={back} />
        <View style={styles.venueTabs}>
          {venueOrder.map((item) => (
            <TouchableOpacity key={item} onPress={() => setVenue(item)} style={[styles.venueTab, venue === item && styles.venueTabActive]}>
              <Text style={[styles.venueTabText, venue === item && styles.venueTabTextActive]}>{item}</Text>
              <Text style={[styles.venueCount, venue === item && styles.venueCountActive]}>{races.filter((r) => r.venue === item).length}R</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.weatherStrip}>
          <View>
            <Text style={styles.weatherVenue}>{venue}</Text>
            <Text style={styles.weatherText}>{venue === "中山" ? "雨 / 芝 稍重 / ダ 重" : "曇 / 芝 良 / ダ 良"}</Text>
          </View>
          <Text style={styles.weatherUpdated}>13:42 更新</Text>
        </View>

        {visible.map((race) => (
          <TouchableOpacity key={race.id} style={styles.raceCard} onPress={() => openRace(race)}>
            <View style={styles.raceNoBlock}>
              <Text style={styles.raceNo}>{race.raceNo}R</Text>
              <Text style={styles.raceStart}>{race.start}</Text>
            </View>
            <View style={styles.flex1}>
              <View style={styles.inline}>
                <Text style={styles.raceName}>{race.name}</Text>
                {race.className === "G2" ? <Pill>G2</Pill> : null}
              </View>
              <Text style={styles.raceMeta}>{race.course}</Text>
              <Text style={styles.raceCondition}>{race.weather} / {race.track}</Text>
            </View>
            <Text style={styles.chevronDark}>›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function HorseSheet({ horse, close }: { horse: MockHorse; close: () => void }) {
  return (
    <View style={styles.horseSheet}>
      <View style={styles.sectionHeadingRow}>
        <View style={styles.inline}>
          <View style={styles.numberCircle}><Text style={styles.numberCircleText}>{horse.no}</Text></View>
          <Text style={styles.horseSheetName}>{horse.name}</Text>
        </View>
        <TouchableOpacity onPress={close}><Text style={styles.closeText}>閉じる ×</Text></TouchableOpacity>
      </View>
      <Text style={styles.horseSheetMeta}>{horse.sexAge}　{horse.weight}　{horse.body}</Text>
      <View style={styles.detailRows}>
        <View style={styles.detailRow}><Text style={styles.detailKey}>騎手</Text><Text style={styles.detailValue}>{horse.jockey}</Text></View>
        <View style={styles.detailRow}><Text style={styles.detailKey}>調教師</Text><Text style={styles.detailValue}>{horse.trainer}</Text></View>
        <View style={styles.detailRow}><Text style={styles.detailKey}>父</Text><Text style={styles.detailValue}>{horse.sire}</Text></View>
        <View style={styles.detailRow}><Text style={styles.detailKey}>母</Text><Text style={styles.detailValue}>{horse.dam}</Text></View>
      </View>
    </View>
  );
}

function Race({ race, back }: { race: MockRace; back: () => void }) {
  const [horse, setHorse] = useState<MockHorse | null>(null);
  const [oddsTab, setOddsTab] = useState<OddsTab>("単勝");
  const active = race.horses.filter((h) => h.status === "ACTIVE");
  const oddsRows = oddsByType[oddsTab];

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <TopBar title={race.venue + " " + race.raceNo + "R"} back={back} />

      <View style={styles.raceHero}>
        <View style={styles.sectionHeadingRow}>
          <View>
            <Text style={styles.raceHeroTime}>{race.start} 発走</Text>
            <Text style={styles.raceHeroName}>{race.name}</Text>
          </View>
          <Pill dark>{race.className}</Pill>
        </View>
        <Text style={styles.raceHeroMeta}>{race.course}</Text>
        <View style={styles.conditionRow}>
          <View style={styles.conditionChip}><Text style={styles.conditionKey}>天候</Text><Text style={styles.conditionValue}>{race.weather}</Text></View>
          <View style={styles.conditionChip}><Text style={styles.conditionKey}>馬場</Text><Text style={styles.conditionValue}>{race.track}</Text></View>
          <View style={styles.conditionChip}><Text style={styles.conditionKey}>頭数</Text><Text style={styles.conditionValue}>{active.length}頭</Text></View>
        </View>
      </View>

      <View style={styles.sectionHeadingRow}>
        <Text style={styles.sectionHeading}>出走表</Text>
        <Text style={styles.sectionHint}>馬をタップで詳細</Text>
      </View>

      <View style={styles.cardFlat}>
        {race.horses.map((item, index) => (
          <TouchableOpacity
            key={item.no}
            style={[styles.horseRow, index > 0 && styles.borderTop, item.status === "SCRATCHED" && styles.horseRowInactive]}
            onPress={() => setHorse(item)}
          >
            <View style={[styles.gateBox, { opacity: item.status === "SCRATCHED" ? 0.5 : 1 }]}><Text style={styles.gateText}>{item.gate}</Text></View>
            <Text style={styles.horseNo}>{item.no}</Text>
            <View style={styles.flex1}>
              <View style={styles.inline}>
                <Text style={[styles.horseName, item.status === "SCRATCHED" && styles.strike]}>{item.name}</Text>
                {item.status === "SCRATCHED" ? <Text style={styles.scratchLabel}>取消</Text> : null}
              </View>
              <Text style={styles.horseMeta}>{item.sexAge}　{item.weight}　{item.jockey}</Text>
            </View>
            <View style={styles.horseOdds}>
              <Text style={styles.horseOddsValue}>{item.odds != null ? item.odds.toFixed(1) : "-"}</Text>
              <Text style={styles.horseOddsSub}>{item.popularity != null ? item.popularity + "人気" : ""}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {horse ? <HorseSheet horse={horse} close={() => setHorse(null)} /> : null}

      <View style={[styles.sectionHeadingRow, { marginTop: 18 }]}>
        <Text style={styles.sectionHeading}>最新オッズ</Text>
        <View style={styles.inline}><Text style={styles.liveDot}>●</Text><Text style={styles.oddsUpdated}> 13:44:18</Text></View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.oddsTabs}>
        {(Object.keys(oddsByType) as OddsTab[]).map((tab) => (
          <TouchableOpacity key={tab} onPress={() => setOddsTab(tab)} style={[styles.oddsTab, oddsTab === tab && styles.oddsTabActive]}>
            <Text style={[styles.oddsTabText, oddsTab === tab && styles.oddsTabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.cardFlat}>
        {oddsRows.map(([selection, price], index) => (
          <View key={selection} style={[styles.oddsRow, index > 0 && styles.borderTop]}>
            <View style={styles.oddsRank}><Text style={styles.oddsRankText}>{index + 1}</Text></View>
            <Text style={styles.oddsSelection}>{selection}</Text>
            <Text style={styles.oddsPrice}>{price}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.latestButton}>
        <Text style={styles.latestButtonText}>最新オッズを取得 ↻</Text>
      </TouchableOpacity>
    </ScrollView>
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

  noticePanel: { backgroundColor: "#fff", borderRadius: 18, padding: 15 },
  noticeRow: { flexDirection: "row", gap: 11, paddingVertical: 12 },
  noticeIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: "#111827", alignItems: "center", justifyContent: "center" },
  noticeIconDanger: { backgroundColor: "#b91c1c" },
  noticeIconText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  noticeRace: { color: "#6b7280", fontSize: 11, fontWeight: "800" },
  noticeTime: { color: "#9ca3af", fontSize: 10 },
  noticeTitle: { marginTop: 3, fontSize: 14, fontWeight: "900", color: "#111827" },
  noticeDetail: { marginTop: 2, fontSize: 13, color: "#4b5563", fontWeight: "700" },
  borderTop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb" },

  nextRaceCard: { backgroundColor: "#111827", borderRadius: 20, padding: 17 },
  nextLabel: { color: "#9ca3af", fontSize: 11, fontWeight: "900", letterSpacing: 1.1 },
  nextMain: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  nextRaceNo: { color: "#fff", fontSize: 15, fontWeight: "900" },
  nextRaceName: { color: "#fff", fontSize: 21, fontWeight: "900", marginTop: 4 },
  nextMeta: { color: "#d1d5db", fontSize: 12, marginTop: 6 },
  chevron: { color: "#fff", fontSize: 34, fontWeight: "300" },
  chevronDark: { color: "#9ca3af", fontSize: 28, fontWeight: "300" },

  racesButton: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#fff", borderRadius: 18, padding: 17 },
  racesButtonTitle: { color: "#111827", fontSize: 18, fontWeight: "900" },
  racesButtonSub: { marginTop: 4, color: "#6b7280", fontSize: 11 },

  infoCard: { backgroundColor: "#e9edf2", borderRadius: 18, padding: 15 },
  infoTitle: { color: "#6b7280", fontSize: 11, fontWeight: "800", marginBottom: 10 },
  infoGrid: { flexDirection: "row" },
  infoCell: { flex: 1 },
  infoValue: { fontSize: 17, fontWeight: "900", color: "#111827" },
  infoLabel: { marginTop: 1, fontSize: 10, color: "#6b7280" },

  pill: { backgroundColor: "#eef2f7", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  pillDark: { backgroundColor: "#374151" },
  pillText: { color: "#374151", fontWeight: "900", fontSize: 10 },
  pillTextDark: { color: "#fff" },

  venueTabs: { flexDirection: "row", backgroundColor: "#e5e7eb", borderRadius: 14, padding: 4 },
  venueTab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 11 },
  venueTabActive: { backgroundColor: "#fff" },
  venueTabText: { color: "#6b7280", fontSize: 15, fontWeight: "900" },
  venueTabTextActive: { color: "#111827" },
  venueCount: { marginTop: 1, color: "#9ca3af", fontSize: 9, fontWeight: "700" },
  venueCountActive: { color: "#6b7280" },

  weatherStrip: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#111827", borderRadius: 16, padding: 14 },
  weatherVenue: { color: "#fff", fontSize: 15, fontWeight: "900" },
  weatherText: { marginTop: 2, color: "#d1d5db", fontSize: 11, fontWeight: "700" },
  weatherUpdated: { color: "#9ca3af", fontSize: 10 },

  raceCard: { backgroundColor: "#fff", borderRadius: 16, padding: 13, flexDirection: "row", alignItems: "center", gap: 10 },
  raceNoBlock: { width: 48, alignItems: "center" },
  raceNo: { fontSize: 18, fontWeight: "900", color: "#111827" },
  raceStart: { marginTop: 2, color: "#6b7280", fontSize: 11, fontWeight: "700" },
  raceName: { color: "#111827", fontSize: 15, fontWeight: "900", flexShrink: 1 },
  raceMeta: { marginTop: 4, color: "#4b5563", fontSize: 11, fontWeight: "700" },
  raceCondition: { marginTop: 2, color: "#9ca3af", fontSize: 10 },

  raceHero: { backgroundColor: "#111827", borderRadius: 20, padding: 17 },
  raceHeroTime: { color: "#9ca3af", fontSize: 11, fontWeight: "800" },
  raceHeroName: { color: "#fff", fontSize: 22, fontWeight: "900", marginTop: 3 },
  raceHeroMeta: { color: "#d1d5db", marginTop: 7, fontSize: 12, fontWeight: "700" },
  conditionRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  conditionChip: { flex: 1, backgroundColor: "#1f2937", borderRadius: 12, padding: 9 },
  conditionKey: { color: "#9ca3af", fontSize: 9, fontWeight: "800" },
  conditionValue: { color: "#fff", fontSize: 13, fontWeight: "900", marginTop: 2 },

  cardFlat: { backgroundColor: "#fff", borderRadius: 16, paddingHorizontal: 12 },
  horseRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 },
  horseRowInactive: { opacity: 0.48 },
  gateBox: { width: 28, height: 28, borderRadius: 8, backgroundColor: "#e5e7eb", alignItems: "center", justifyContent: "center" },
  gateText: { fontSize: 12, fontWeight: "900", color: "#374151" },
  horseNo: { width: 22, fontSize: 15, fontWeight: "900", color: "#111827", textAlign: "center" },
  horseName: { fontSize: 14, fontWeight: "900", color: "#111827" },
  strike: { textDecorationLine: "line-through" },
  scratchLabel: { color: "#b91c1c", fontSize: 10, fontWeight: "900" },
  horseMeta: { marginTop: 3, color: "#6b7280", fontSize: 10, fontWeight: "700" },
  horseOdds: { width: 46, alignItems: "flex-end" },
  horseOddsValue: { color: "#111827", fontSize: 16, fontWeight: "900" },
  horseOddsSub: { color: "#9ca3af", fontSize: 9, marginTop: 1 },

  horseSheet: { backgroundColor: "#111827", borderRadius: 18, padding: 15 },
  numberCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  numberCircleText: { fontWeight: "900", color: "#111827" },
  horseSheetName: { color: "#fff", fontSize: 18, fontWeight: "900" },
  closeText: { color: "#9ca3af", fontSize: 11, fontWeight: "800" },
  horseSheetMeta: { marginTop: 8, color: "#d1d5db", fontSize: 11, fontWeight: "700" },
  detailRows: { marginTop: 10 },
  detailRow: { flexDirection: "row", paddingVertical: 5 },
  detailKey: { width: 58, color: "#9ca3af", fontSize: 11, fontWeight: "700" },
  detailValue: { color: "#fff", fontSize: 12, fontWeight: "800" },

  oddsUpdated: { color: "#6b7280", fontSize: 10, fontWeight: "700" },
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

  latestButton: { backgroundColor: "#fff", borderRadius: 15, alignItems: "center", paddingVertical: 14 },
  latestButtonText: { color: "#111827", fontWeight: "900", fontSize: 13 },
});
