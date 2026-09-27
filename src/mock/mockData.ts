export type MockNotice = {
  id: string;
  kind: "TRACK" | "WEATHER" | "SCRATCH";
  venue: string;
  raceNo: number;
  title: string;
  detail: string;
  time: string;
};

export type MockHorse = {
  no: number;
  gate: number;
  name: string;
  sexAge: string;
  jockey: string;
  weight: string;
  body: string;
  trainer: string;
  sire: string;
  dam: string;
  damsire: string;
  odds: number | null;
  popularity: number | null;
  aiRank: number | null;
  status: "ACTIVE" | "SCRATCHED";
};

export type MockResult = {
  finish: number;
  horseNo: number;
  horseName: string;
  popularity: number;
  odds: number;
  time: string;
  margin: string;
};

export type MockPayout = {
  type: string;
  selection: string;
  payout: string;
};

export type MockRace = {
  id: string;
  raceDate: string;
  venue: string;
  raceNo: number;
  start: string;
  name: string;
  className: string;
  course: string;
  weather: string;
  track: string;
  status: "UPCOMING" | "CLOSED";
  horses: MockHorse[];
  results?: MockResult[];
  payouts?: MockPayout[];
};

export const raceDays = [
  { date: "2026-09-26", label: "9/26(土)", isToday: false },
  { date: "2026-09-27", label: "9/27(日)", isToday: true },
  { date: "2026-09-28", label: "9/28(月・祝)", isToday: false },
] as const;

export const notices: MockNotice[] = [
  { id: "n1", kind: "TRACK", venue: "中山", raceNo: 7, title: "馬場状態が変更", detail: "芝 良 → 稍重", time: "13:42" },
  { id: "n2", kind: "SCRATCH", venue: "阪神", raceNo: 10, title: "出走取消", detail: "8番 ブルーアーク", time: "12:58" },
  { id: "n3", kind: "WEATHER", venue: "中山", raceNo: 6, title: "天候が変更", detail: "曇 → 雨", time: "12:31" },
];

const commonHorses: MockHorse[] = [
  { no: 1, gate: 1, name: "アステルノヴァ", sexAge: "牡3", jockey: "戸崎圭太", weight: "57.0kg", body: "486kg (+4)", trainer: "国枝栄", sire: "キタサンブラック", dam: "ステラグレイス", damsire: "キングカメハメハ", odds: 3.4, popularity: 2, aiRank: 2, status: "ACTIVE" },
  { no: 2, gate: 2, name: "ミッドナイトベル", sexAge: "牝3", jockey: "横山武史", weight: "55.0kg", body: "452kg (-2)", trainer: "木村哲也", sire: "エピファネイア", dam: "ベルフルール", damsire: "ディープインパクト", odds: 5.8, popularity: 4, aiRank: 4, status: "ACTIVE" },
  { no: 3, gate: 3, name: "グランヴェール", sexAge: "牡4", jockey: "C.ルメール", weight: "58.0kg", body: "504kg (+2)", trainer: "堀宣行", sire: "ドゥラメンテ", dam: "ヴェルシーナ", damsire: "ディープインパクト", odds: 2.6, popularity: 1, aiRank: 1, status: "ACTIVE" },
  { no: 4, gate: 4, name: "サザンクロス", sexAge: "牡5", jockey: "菅原明良", weight: "58.0kg", body: "498kg (-6)", trainer: "田中博康", sire: "ロードカナロア", dam: "サザンフェアリー", damsire: "ハーツクライ", odds: 12.9, popularity: 6, aiRank: 5, status: "ACTIVE" },
  { no: 5, gate: 5, name: "ルージュレイン", sexAge: "牝4", jockey: "川田将雅", weight: "56.0kg", body: "470kg (0)", trainer: "中内田充正", sire: "モーリス", dam: "レインダンス", damsire: "ダンスインザダーク", odds: 4.9, popularity: 3, aiRank: 3, status: "ACTIVE" },
  { no: 6, gate: 6, name: "ノーブルリッジ", sexAge: "牡4", jockey: "丹内祐次", weight: "58.0kg", body: "512kg (+8)", trainer: "手塚貴久", sire: "ハーツクライ", dam: "ノーブルジュエル", damsire: "Smarty Jones", odds: 8.7, popularity: 5, aiRank: 6, status: "ACTIVE" },
  { no: 7, gate: 7, name: "レッドバレット", sexAge: "牡3", jockey: "岩田望来", weight: "57.0kg", body: "478kg (-4)", trainer: "友道康夫", sire: "サートゥルナーリア", dam: "レッドルージュ", damsire: "マンハッタンカフェ", odds: 18.4, popularity: 7, aiRank: 7, status: "ACTIVE" },
  { no: 8, gate: 8, name: "ブルーアーク", sexAge: "牡5", jockey: "坂井瑠星", weight: "58.0kg", body: "-", trainer: "矢作芳人", sire: "コントレイル", dam: "ブルームーン", damsire: "クロフネ", odds: null, popularity: null, aiRank: null, status: "SCRATCHED" },
];

const closedResults: MockResult[] = [
  { finish: 1, horseNo: 3, horseName: "グランヴェール", popularity: 1, odds: 2.6, time: "1:47.8", margin: "-" },
  { finish: 2, horseNo: 1, horseName: "アステルノヴァ", popularity: 2, odds: 3.4, time: "1:48.0", margin: "1 1/4" },
  { finish: 3, horseNo: 5, horseName: "ルージュレイン", popularity: 3, odds: 4.9, time: "1:48.2", margin: "1" },
  { finish: 4, horseNo: 2, horseName: "ミッドナイトベル", popularity: 4, odds: 5.8, time: "1:48.4", margin: "1 1/4" },
];

const closedPayouts: MockPayout[] = [
  { type: "単勝", selection: "3", payout: "260円" },
  { type: "馬連", selection: "1-3", payout: "680円" },
  { type: "ワイド", selection: "1-3", payout: "320円" },
  { type: "3連複", selection: "1-3-5", payout: "1,480円" },
];

export const races: MockRace[] = [
  { id: "sat-nak-10", raceDate: "2026-09-26", venue: "中山", raceNo: 10, start: "15:10", name: "茨城新聞杯", className: "2勝クラス", course: "芝 2,000m 右", weather: "晴", track: "良", status: "CLOSED", horses: commonHorses, results: closedResults, payouts: closedPayouts },
  { id: "sat-nak-11", raceDate: "2026-09-26", venue: "中山", raceNo: 11, start: "15:45", name: "秋風ステークス", className: "3勝クラス", course: "芝 1,600m 右外", weather: "晴", track: "良", status: "CLOSED", horses: commonHorses, results: closedResults, payouts: closedPayouts },
  { id: "sat-han-11", raceDate: "2026-09-26", venue: "阪神", raceNo: 11, start: "15:35", name: "大阪スポーツ杯", className: "OP", course: "ダ 1,400m 右", weather: "晴", track: "良", status: "CLOSED", horses: commonHorses, results: closedResults, payouts: closedPayouts },

  { id: "nak-6", raceDate: "2026-09-27", venue: "中山", raceNo: 6, start: "12:55", name: "3歳以上1勝クラス", className: "1勝クラス", course: "芝 1,800m 右", weather: "雨", track: "稍重", status: "CLOSED", horses: commonHorses, results: closedResults, payouts: closedPayouts },
  { id: "nak-7", raceDate: "2026-09-27", venue: "中山", raceNo: 7, start: "13:25", name: "九十九里特別", className: "2勝クラス", course: "芝 2,500m 右", weather: "雨", track: "稍重", status: "UPCOMING", horses: commonHorses },
  { id: "nak-8", raceDate: "2026-09-27", venue: "中山", raceNo: 8, start: "14:00", name: "3歳以上2勝クラス", className: "2勝クラス", course: "ダ 1,800m 右", weather: "雨", track: "重", status: "UPCOMING", horses: commonHorses },
  { id: "nak-9", raceDate: "2026-09-27", venue: "中山", raceNo: 9, start: "14:35", name: "木更津特別", className: "2勝クラス", course: "芝 1,600m 右外", weather: "雨", track: "稍重", status: "UPCOMING", horses: commonHorses },
  { id: "han-9", raceDate: "2026-09-27", venue: "阪神", raceNo: 9, start: "14:25", name: "夕月特別", className: "2勝クラス", course: "芝 2,000m 右", weather: "曇", track: "良", status: "UPCOMING", horses: commonHorses },
  { id: "han-10", raceDate: "2026-09-27", venue: "阪神", raceNo: 10, start: "15:00", name: "道頓堀ステークス", className: "3勝クラス", course: "芝 1,200m 右", weather: "曇", track: "良", status: "UPCOMING", horses: commonHorses },
  { id: "han-11", raceDate: "2026-09-27", venue: "阪神", raceNo: 11, start: "15:35", name: "神戸新聞杯", className: "G2", course: "芝 2,400m 右外", weather: "曇", track: "良", status: "UPCOMING", horses: commonHorses },

  { id: "mon-nak-9", raceDate: "2026-09-28", venue: "中山", raceNo: 9, start: "14:35", name: "鋸山特別", className: "2勝クラス", course: "ダ 1,800m 右", weather: "晴", track: "良", status: "UPCOMING", horses: commonHorses },
  { id: "mon-nak-10", raceDate: "2026-09-28", venue: "中山", raceNo: 10, start: "15:10", name: "内房ステークス", className: "3勝クラス", course: "ダ 1,800m 右", weather: "晴", track: "良", status: "UPCOMING", horses: commonHorses },
  { id: "mon-han-10", raceDate: "2026-09-28", venue: "阪神", raceNo: 10, start: "15:00", name: "ムーンライトH", className: "3勝クラス", course: "芝 2,000m 右", weather: "晴", track: "良", status: "UPCOMING", horses: commonHorses },
];

export const oddsByType = {
  "単勝": [["3", "2.6"], ["1", "3.4"], ["5", "4.9"], ["2", "5.8"], ["6", "8.7"], ["4", "12.9"], ["7", "18.4"]],
  "複勝": [["3", "1.3〜1.7"], ["1", "1.5〜2.0"], ["5", "1.8〜2.4"]],
  "枠連": [["1-3", "7.2"], ["3-5", "8.8"], ["2-3", "11.4"]],
  "馬連": [["1-3", "6.8"], ["3-5", "8.1"], ["2-3", "10.4"], ["1-5", "11.7"], ["3-6", "14.2"]],
  "ワイド": [["1-3", "2.6〜3.2"], ["3-5", "3.0〜3.8"], ["2-3", "3.7〜4.5"], ["1-5", "4.0〜4.9"]],
  "馬単": [["3-1", "10.8"], ["1-3", "12.4"], ["3-5", "13.6"], ["5-3", "17.1"]],
  "3連複": [["1-3-5", "14.8"], ["1-2-3", "19.4"], ["1-3-6", "22.1"], ["2-3-5", "24.6"]],
  "3連単": [["3-1-5", "48.2"], ["3-5-1", "55.6"], ["1-3-5", "61.4"], ["3-1-2", "66.8"]],
} as const;
