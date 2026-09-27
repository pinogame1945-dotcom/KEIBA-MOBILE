export type RaceStatus = "SCHEDULED" | "OFFICIAL";
export type RaceLifecycleStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED" | "ABANDONED";
export type RaceScheduleStatus = "ACTIVE" | "RESCHEDULED";

export type JraRace = {
  raceKey: string;
  canonicalRaceId: string | null;
  raceDate: string;
  scheduledDate: string;
  actualDate: string | null;
  raceStatus: RaceLifecycleStatus;
  scheduleStatus: RaceScheduleStatus;
  supersededByRaceKey: string | null;
  venue: string;
  raceNo: number;
  raceName: string | null;
  raceClass: string | null;
  startTime: string | null;
  discipline: "FLAT" | "OBSTACLE";
  surface: "TURF" | "DIRT" | "MIXED" | null;
  distanceM: number | null;
  direction: "LEFT" | "RIGHT" | null;
  weather: string | null;
  trackCondition: string | null;
  sourceUrl: string;
  fetchedAt: string;
  status: RaceStatus;
};

export type EntryStatus = "ACTIVE" | "SCRATCHED" | "EXCLUDED";

export type JraEntry = {
  raceKey: string;
  canonicalHorseId: string | null;
  gate: number | null;
  horseNo: number | null;
  horseName: string;
  entryStatus: EntryStatus;
  sex: string | null;
  age: number | null;
  coatColor: string | null;
  carriedWeight: number | null;
  jockeyName: string | null;
  trainerName: string | null;
  bodyWeight: number | null;
  bodyWeightDiff: number | null;
  winOdds: number | null;
  popularity: number | null;
  sire: string | null;
  dam: string | null;
  damsire: string | null;
};

export type JraRaceCard = {
  race: JraRace;
  entries: JraEntry[];
  officialNumbered: boolean;
};

export type NoticeKind =
  | "TRACK_CHANGED"
  | "WEATHER_CHANGED"
  | "START_TIME_CHANGED"
  | "SCRATCHED"
  | "EXCLUDED"
  | "MEETING_RESCHEDULED"
  | "MEETING_CANCELLED"
  | "RACE_CANCELLED";

export type RaceNotice = {
  id: number;
  raceKey: string;
  raceDate: string;
  venue: string;
  raceNo: number;
  kind: NoticeKind;
  horseNo: number | null;
  horseName: string | null;
  previousValue: string | null;
  nextValue: string | null;
  observedAt: string;
};

export type OddsBetType =
  | "WIN"
  | "PLACE"
  | "BRACKET_QUINELLA"
  | "QUINELLA"
  | "WIDE"
  | "EXACTA"
  | "TRIO"
  | "TRIFECTA";

export type OddsRow = {
  raceKey: string;
  betType: OddsBetType;
  selection1: number | null;
  selection2: number | null;
  selection3: number | null;
  odds: number | null;
  oddsMin: number | null;
  oddsMax: number | null;
  observedAt: string;
  sourceUrl: string | null;
};

export type ScheduleRace = {
  raceDate: string;
  venue: string;
  raceNo: number;
  raceName: string | null;
  startTime: string | null;
  discipline: "FLAT" | "OBSTACLE";
  surface: "TURF" | "DIRT" | "MIXED" | null;
  distanceM: number | null;
  sourceUrl: string;
};

export type ScheduleDisruption = {
  raceDate: string;
  venue: string;
  scope: "MEETING" | "RACE";
  raceNo: number | null;
  kind: "CANCELLED" | "ABANDONED";
  sourceUrl: string;
};

export type ScheduleMeeting = {
  raceDate: string;
  venue: string;
  meetingNo: number;
  meetingDay: number;
  races: ScheduleRace[];
};

export type ScheduleTarget = {
  fetchedAt: string;
  dates: string[];
  meetings: ScheduleMeeting[];
  disruptions: ScheduleDisruption[];
  sourceUrls: string[];
  fingerprint: string;
};

export type VenueConditionSnapshot = {
  raceDate: string;
  venue: string;
  weather: string | null;
  turfCondition: string | null;
  dirtCondition: string | null;
  sourceObservedLabel: string | null;
  sourceObservedDate: string | null;
  fetchedAt: string;
  sourceUrl: string;
};


export type JraRaceResult = {
  raceKey: string;
  finishPosition: number | null;
  finishRaw: string;
  horseNo: number | null;
  horseName: string;
  finishTime: string | null;
  margin: string | null;
  last3f: number | null;
  average1f: number | null;
  popularity: number | null;
  resultStatus: "FINISHED" | "SCRATCHED" | "EXCLUDED" | "DISQUALIFIED" | "DNF" | "UNKNOWN";
};

export type JraPayout = {
  raceKey: string;
  betType: OddsBetType;
  selection: string;
  payoutYen: number | null;
  popularity: number | null;
};
