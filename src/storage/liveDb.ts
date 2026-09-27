import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

let dbPromise: Promise<SQLiteDatabase> | null = null;

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS races (
  race_key TEXT PRIMARY KEY,
  canonical_race_id TEXT,
  race_date TEXT NOT NULL,
  scheduled_date TEXT,
  actual_date TEXT,
  race_status TEXT NOT NULL DEFAULT 'SCHEDULED',
  schedule_status TEXT NOT NULL DEFAULT 'ACTIVE',
  superseded_by_race_key TEXT,
  archived_at TEXT,
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
CREATE INDEX IF NOT EXISTS idx_races_canonical_schedule ON races(canonical_race_id, schedule_status, race_date);

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

CREATE TABLE IF NOT EXISTS venue_conditions (
  race_date TEXT NOT NULL,
  venue TEXT NOT NULL,
  weather TEXT,
  turf_condition TEXT,
  dirt_condition TEXT,
  source_observed_label TEXT,
  source_observed_date TEXT,
  fetched_at TEXT NOT NULL,
  source_url TEXT NOT NULL,
  PRIMARY KEY (race_date, venue)
);

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
  invalidated_at TEXT,
  invalidated_reason TEXT,
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

let writeTail: Promise<void> = Promise.resolve();

async function addColumnIfMissing(
  db: SQLiteDatabase,
  table: string,
  column: string,
  sql: string,
) {
  const columns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(" + table + ")");
  if (!columns.some((item) => item.name === column)) await db.execAsync(sql);
}

export async function getLiveDb() {
  if (!dbPromise) {
    dbPromise = openDatabaseAsync("keiba-mobile-live.db").then(async (db) => {
      await db.execAsync(SCHEMA);
      await addColumnIfMissing(db,"race_results","average_1f","ALTER TABLE race_results ADD COLUMN average_1f REAL");
      await addColumnIfMissing(db,"races","scheduled_date","ALTER TABLE races ADD COLUMN scheduled_date TEXT");
      await addColumnIfMissing(db,"races","actual_date","ALTER TABLE races ADD COLUMN actual_date TEXT");
      await addColumnIfMissing(db,"races","race_status","ALTER TABLE races ADD COLUMN race_status TEXT NOT NULL DEFAULT 'SCHEDULED'");
      await addColumnIfMissing(db,"races","schedule_status","ALTER TABLE races ADD COLUMN schedule_status TEXT NOT NULL DEFAULT 'ACTIVE'");
      await addColumnIfMissing(db,"races","superseded_by_race_key","ALTER TABLE races ADD COLUMN superseded_by_race_key TEXT");
      await addColumnIfMissing(db,"races","archived_at","ALTER TABLE races ADD COLUMN archived_at TEXT");
      await addColumnIfMissing(db,"odds_history","invalidated_at","ALTER TABLE odds_history ADD COLUMN invalidated_at TEXT");
      await addColumnIfMissing(db,"odds_history","invalidated_reason","ALTER TABLE odds_history ADD COLUMN invalidated_reason TEXT");
      await db.execAsync(
        "CREATE INDEX IF NOT EXISTS idx_races_canonical_schedule ON races(canonical_race_id,schedule_status,race_date)",
      );
      await db.execAsync(
        "UPDATE races SET scheduled_date=COALESCE(scheduled_date,race_date) WHERE scheduled_date IS NULL",
      );
      await db.execAsync(
        "UPDATE races SET race_status='COMPLETED',actual_date=COALESCE(actual_date,race_date) " +
        "WHERE EXISTS(SELECT 1 FROM race_results rr WHERE rr.race_key=races.race_key)",
      );
      return db;
    });
  }
  return dbPromise;
}


/**
 * Serializes every LIVE database mutation on the single Expo SQLite connection.
 * Network/parser work may stay concurrent, but writes must never overlap transactions.
 */
export async function withLiveDbWrite<T>(
  work: (db: Awaited<ReturnType<typeof getLiveDb>>) => Promise<T>,
): Promise<T> {
  const previous = writeTail.catch(() => undefined);
  let release!: () => void;
  writeTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await work(await getLiveDb());
  } finally {
    release();
  }
}

export async function withLiveDbTransaction<T>(
  work: (db: Awaited<ReturnType<typeof getLiveDb>>) => Promise<T>,
): Promise<T> {
  return withLiveDbWrite(async (db) => {
    let result!: T;
    await db.withTransactionAsync(async () => {
      result = await work(db);
    });
    return result;
  });
}
