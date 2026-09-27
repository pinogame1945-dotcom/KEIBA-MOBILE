export type MockNotice = {
  id: string;
  kind: "TRACK" | "WEATHER" | "SCRATCH";
  venue: string;
  raceNo: number;
  title: string;
  detail: string;
  time: string;
  important?: boolean;
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
  odds: number | null;
  popularity: number | null;
  status: "ACTIVE" | "SCRATCHED";
};

export type MockRace = {
  id: string;
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
};

export const notices: MockNotice[] = [
  {
    id: "n1",
    kind: "TRACK",
    venue: "中山",
    raceNo: 7,
    title: "馬場状態が変更",
    detail: "芝 良 → 稍重",
    time: "13:42",
    important: true,
  },
  {
    id: "n2",
    kind: "SCRATCH",
    venue: "阪神",
    raceNo: 10,
    title: "出走取消",
    detail: "8番 ブルーアーク",
    time: "12:58",
    important: true,
  },
  {
    id: "n3",
    kind: "WEATHER",
    venue: "中山",
    raceNo: 6,
    title: "天候が変更",
    detail: "曇 → 雨",
    time: "12:31",
  },
];

const commonHorses: MockHorse[] = [
  { no: 1, gate: 1, name: "アステルノヴァ", sexAge: "牡3", jockey: "戸崎圭太", weight: "57.0kg", body: "486kg (+4)", trainer: "国枝栄", sire: "キタサンブラック", dam: "ステラグレイス", odds: 3.4, popularity: 2, status: "ACTIVE" },
  { no: 2, gate: 2, name: "ミッドナイトベル", sexAge: "牝3", jockey: "横山武史", weight: "55.0kg", body: "452kg (-2)", trainer: "木村哲也", sire: "エピファネイア", dam: "ベルフルール", odds: 5.8, popularity: 4, status: "ACTIVE" },
  { no: 3, gate: 3, name: "グランヴェール", sexAge: "牡4", jockey: "C.ルメール", weight: "58.0kg", body: "504kg (+2)", trainer: "堀宣行", sire: "ドゥラメンテ", dam: "ヴェルシーナ", odds: 2.6, popularity: 1, status: "ACTIVE" },
  { no: 4, gate: 4, name: "サザンクロス", sexAge: "牡5", jockey: "菅原明良", weight: "58.0kg", body: "498kg (-6)", trainer: "田中博康", sire: "ロードカナロア", dam: "サザンフェアリー", odds: 12.9, popularity: 6, status: "ACTIVE" },
  { no: 5, gate: 5, name: "ルージュレイン", sexAge: "牝4", jockey: "川田将雅", weight: "56.0kg", body: "470kg (0)", trainer: "中内田充正", sire: "モーリス", dam: "レインダンス", odds: 4.9, popularity: 3, status: "ACTIVE" },
  { no: 6, gate: 6, name: "ノーブルリッジ", sexAge: "牡4", jockey: "丹内祐次", weight: "58.0kg", body: "512kg (+8)", trainer: "手塚貴久", sire: "ハーツクライ", dam: "ノーブルジュエル", odds: 8.7, popularity: 5, status: "ACTIVE" },
  { no: 7, gate: 7, name: "レッドバレット", sexAge: "牡3", jockey: "岩田望来", weight: "57.0kg", body: "478kg (-4)", trainer: "友道康夫", sire: "サートゥルナーリア", dam: "レッドルージュ", odds: 18.4, popularity: 7, status: "ACTIVE" },
  { no: 8, gate: 8, name: "ブルーアーク", sexAge: "牡5", jockey: "坂井瑠星", weight: "58.0kg", body: "-", trainer: "矢作芳人", sire: "コントレイル", dam: "ブルームーン", odds: null, popularity: null, status: "SCRATCHED" },
];

export const races: MockRace[] = [
  { id: "nak-6", venue: "中山", raceNo: 6, start: "12:55", name: "3歳以上1勝クラス", className: "1勝クラス", course: "芝 1,800m 右", weather: "雨", track: "稍重", status: "CLOSED", horses: commonHorses },
  { id: "nak-7", venue: "中山", raceNo: 7, start: "13:25", name: "九十九里特別", className: "2勝クラス", course: "芝 2,500m 右", weather: "雨", track: "稍重", status: "UPCOMING", horses: commonHorses },
  { id: "nak-8", venue: "中山", raceNo: 8, start: "14:00", name: "3歳以上2勝クラス", className: "2勝クラス", course: "ダ 1,800m 右", weather: "雨", track: "重", status: "UPCOMING", horses: commonHorses },
  { id: "nak-9", venue: "中山", raceNo: 9, start: "14:35", name: "木更津特別", className: "2勝クラス", course: "芝 1,600m 右外", weather: "雨", track: "稍重", status: "UPCOMING", horses: commonHorses },
  { id: "han-9", venue: "阪神", raceNo: 9, start: "14:25", name: "夕月特別", className: "2勝クラス", course: "芝 2,000m 右", weather: "曇", track: "良", status: "UPCOMING", horses: commonHorses },
  { id: "han-10", venue: "阪神", raceNo: 10, start: "15:00", name: "道頓堀ステークス", className: "3勝クラス", course: "芝 1,200m 右", weather: "曇", track: "良", status: "UPCOMING", horses: commonHorses.map((h) => h.no === 8 ? { ...h, status: "SCRATCHED", odds: null, popularity: null } : h) },
  { id: "han-11", venue: "阪神", raceNo: 11, start: "15:35", name: "神戸新聞杯", className: "G2", course: "芝 2,400m 右外", weather: "曇", track: "良", status: "UPCOMING", horses: commonHorses },
];

export const oddsByType = {
  "単勝": [
    ["3", "2.6"], ["1", "3.4"], ["5", "4.9"], ["2", "5.8"], ["6", "8.7"], ["4", "12.9"], ["7", "18.4"],
  ],
  "馬連": [
    ["1-3", "6.8"], ["3-5", "8.1"], ["2-3", "10.4"], ["1-5", "11.7"], ["3-6", "14.2"], ["1-2", "16.9"],
  ],
  "ワイド": [
    ["1-3", "2.6〜3.2"], ["3-5", "3.0〜3.8"], ["2-3", "3.7〜4.5"], ["1-5", "4.0〜4.9"], ["3-6", "5.1〜6.4"],
  ],
  "3連複": [
    ["1-3-5", "14.8"], ["1-2-3", "19.4"], ["1-3-6", "22.1"], ["2-3-5", "24.6"], ["3-5-6", "31.8"],
  ],
} as const;
