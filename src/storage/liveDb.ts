import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

let dbPromise: Promise<SQLiteDatabase> | null = null;

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS races (
  race_key TEXT PRIMARY KEY,
  canonical_race_id TEXT,
  race_date TEXT NOT NULL,
  venue TEXT NOT NULL,
  race_no INTEGER NOT NULL,
  race_name TEXT,
  race_class TEXT,
  start_time TEXT,
  discipline TEXT NOT NULL,
  surface TEXT,
  distance_m INTEGER,
  direction TEXT,
  weather TEXT,
  track_condition TEXT,
  source_url TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  status TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_races_date_venue ON races(race_date, venue, race_no);

CREATE TABLE IF NOT EXISTS entries (
  race_key TEXT NOT NULL,
  canonical_horse_id TEXT,
  gate INTEGER,
  horse_no INTEGER,
  horse_name TEXT NOT NULL,
  entry_status TEXT NOT NULL,
  sex TEXT,
  age INTEGER,
  coat_color TEXT,
  carried_weight REAL,
  jockey_name TEXT,
  trainer_name TEXT,
  body_weight INTEGER,
  body_weight_diff INTEGER,
  win_odds REAL,
  popularity INTEGER,
  sire TEXT,
  dam TEXT,
  damsire TEXT,
  PRIMARY KEY (race_key, horse_name),
  FOREIGN KEY (race_key) REFERENCES races(race_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT NOT NULL UNIQUE,
  race_key TEXT NOT NULL,
  race_date TEXT NOT NULL,
  venue TEXT NOT NULL,
  race_no INTEGER NOT NULL,
  kind TEXT NOT NULL,
  horse_no INTEGER,
  horse_name TEXT,
  previous_value TEXT,
  next_value TEXT,
  observed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notices_date ON notices(race_date, observed_at DESC);

CREATE TABLE IF NOT EXISTS race_fetch_queue (
  url TEXT PRIMARY KEY,
  target_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  race_date TEXT,
  venue TEXT,
  race_no INTEGER,
  last_error TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_race_fetch_queue_target_status
  ON race_fetch_queue(target_fingerprint,status,race_date,venue,race_no);

CREATE TABLE IF NOT EXISTS odds_current (
  race_key TEXT NOT NULL,
  bet_type TEXT NOT NULL,
  selection_1 INTEGER NOT NULL,
  selection_2 INTEGER NOT NULL DEFAULT -1,
  selection_3 INTEGER NOT NULL DEFAULT -1,
  odds REAL,
  odds_min REAL,
  odds_max REAL,
  observed_at TEXT NOT NULL,
  source_url TEXT,
  PRIMARY KEY (race_key, bet_type, selection_1, selection_2, selection_3)
);

CREATE TABLE IF NOT EXISTS odds_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  race_key TEXT NOT NULL,
  bet_type TEXT NOT NULL,
  selection_1 INTEGER NOT NULL,
  selection_2 INTEGER NOT NULL DEFAULT -1,
  selection_3 INTEGER NOT NULL DEFAULT -1,
  odds REAL,
  odds_min REAL,
  odds_max REAL,
  observed_at TEXT NOT NULL,
  source_url TEXT,
  checkpoint TEXT,
  UNIQUE (race_key, bet_type, selection_1, selection_2, selection_3, observed_at)
);

CREATE TABLE IF NOT EXISTS odds_actions (
  race_key TEXT NOT NULL,
  bet_type TEXT NOT NULL,
  path TEXT NOT NULL,
  cname TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (race_key, bet_type)
);

CREATE TABLE IF NOT EXISTS race_results (
  race_key TEXT NOT NULL,
  finish_position INTEGER,
  finish_raw TEXT NOT NULL,
  horse_no INTEGER,
  horse_name TEXT NOT NULL,
  finish_time TEXT,
  margin TEXT,
  last_3f REAL,
  average_1f REAL,
  popularity INTEGER,
  result_status TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  PRIMARY KEY (race_key, horse_name)
);
CREATE INDEX IF NOT EXISTS idx_race_results_race_finish ON race_results(race_key, finish_position);

CREATE TABLE IF NOT EXISTS payouts (
  race_key TEXT NOT NULL,
  bet_type TEXT NOT NULL,
  selection TEXT NOT NULL,
  payout_yen INTEGER,
  popularity INTEGER,
  observed_at TEXT NOT NULL,
  PRIMARY KEY (race_key, bet_type, selection)
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export async function getLiveDb() {
  if (!dbPromise) {
    dbPromise = openDatabaseAsync("keiba-mobile-live.db").then(async (db) => {
      await db.execAsync(SCHEMA);
      const resultColumns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(race_results)");
      if (!resultColumns.some((column) => column.name === "average_1f")) {
        await db.execAsync("ALTER TABLE race_results ADD COLUMN average_1f REAL");
      }
      return db;
    });
  }
  return dbPromise;
}
