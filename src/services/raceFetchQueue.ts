import { getLiveDb } from "../storage/liveDb";

export type RaceFetchItem = {
  url: string;
  status: "PENDING" | "FETCHING" | "RETRY" | "DONE" | "FAILED";
  attempts: number;
  raceDate: string | null;
  venue: string | null;
  raceNo: number | null;
  lastError: string | null;
};

export type RaceFetchStats = {
  total: number;
  pending: number;
  fetching: number;
  retry: number;
  done: number;
  failed: number;
};
export type RaceFetchRunState = "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED";

async function statsFromDb(): Promise<RaceFetchStats> {
  const db = await getLiveDb();
  const row = await db.getFirstAsync<{
    total: number | null; pending: number | null; fetching: number | null;
    retry: number | null; done: number | null; failed: number | null;
  }>(
    `SELECT COUNT(*) AS total,
      SUM(CASE WHEN status='PENDING' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status='FETCHING' THEN 1 ELSE 0 END) AS fetching,
      SUM(CASE WHEN status='RETRY' THEN 1 ELSE 0 END) AS retry,
      SUM(CASE WHEN status='DONE' THEN 1 ELSE 0 END) AS done,
      SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) AS failed
     FROM race_fetch_queue`,
  );
  return {
    total: Number(row?.total ?? 0),
    pending: Number(row?.pending ?? 0),
    fetching: Number(row?.fetching ?? 0),
    retry: Number(row?.retry ?? 0),
    done: Number(row?.done ?? 0),
    failed: Number(row?.failed ?? 0),
  };
}

export async function prepareRaceFetchRun(targetFingerprint: string) {
  const db = await getLiveDb();
  const [state, target, stats] = await Promise.all([
    db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key='race_fetch_state'"),
    db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key='race_fetch_target'"),
    statsFromDb(),
  ]);
  const sameTarget = target?.value === targetFingerprint;
  const resume = sameTarget && stats.total > 0 && (
    state?.value === "RUNNING" || state?.value === "FAILED" || state?.value === "PARTIAL" ||
    stats.pending > 0 || stats.fetching > 0 || stats.retry > 0
  );

  if (resume) {
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        "UPDATE race_fetch_queue SET status='PENDING',attempts=0,last_error=NULL,updated_at=CURRENT_TIMESTAMP " +
        "WHERE status IN ('FETCHING','RETRY','FAILED')",
      );
      await db.runAsync(
        "INSERT INTO meta(key,value) VALUES('race_fetch_state','RUNNING') " +
        "ON CONFLICT(key) DO UPDATE SET value='RUNNING'",
      );
    });
    return { resumed: true };
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM race_fetch_queue");
    await db.runAsync(
      "INSERT INTO meta(key,value) VALUES('race_fetch_state','RUNNING') " +
      "ON CONFLICT(key) DO UPDATE SET value='RUNNING'",
    );
    await db.runAsync(
      "INSERT INTO meta(key,value) VALUES('race_fetch_target',?) " +
      "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      targetFingerprint,
    );
    await db.runAsync(
      "INSERT INTO meta(key,value) VALUES('race_fetch_started_at',?) " +
      "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      new Date().toISOString(),
    );
    await db.runAsync("DELETE FROM meta WHERE key='race_fetch_error'");
  });
  return { resumed: false };
}

export async function enqueueRaceFetchUrl(input: {
  url: string;
  targetFingerprint: string;
  raceDate?: string | null;
  venue?: string | null;
  raceNo?: number | null;
}) {
  const db = await getLiveDb();
  await db.runAsync(
    `INSERT INTO race_fetch_queue(
      url,target_fingerprint,status,attempts,race_date,venue,race_no,last_error,updated_at
    ) VALUES(?,?,'PENDING',0,?,?,?,NULL,CURRENT_TIMESTAMP)
    ON CONFLICT(url) DO UPDATE SET
      target_fingerprint=excluded.target_fingerprint,
      race_date=COALESCE(excluded.race_date,race_fetch_queue.race_date),
      venue=COALESCE(excluded.venue,race_fetch_queue.venue),
      race_no=COALESCE(excluded.race_no,race_fetch_queue.race_no),
      updated_at=CURRENT_TIMESTAMP`,
    input.url,input.targetFingerprint,input.raceDate ?? null,input.venue ?? null,input.raceNo ?? null,
  );
}

export async function claimNextRaceFetchItem(): Promise<RaceFetchItem | null> {
  const db = await getLiveDb();
  const row = await db.getFirstAsync<{
    url: string; status: RaceFetchItem["status"]; attempts: number;
    raceDate: string | null; venue: string | null; raceNo: number | null; lastError: string | null;
  }>(
    `SELECT url,status,attempts,race_date AS raceDate,venue,race_no AS raceNo,last_error AS lastError
     FROM race_fetch_queue
     WHERE status IN ('PENDING','RETRY') AND attempts<3
     ORDER BY attempts,CASE WHEN race_no IS NULL THEN 1 ELSE 0 END,race_date,venue,race_no,url
     LIMIT 1`,
  );
  if (!row) return null;

  const changed = await db.runAsync(
    `UPDATE race_fetch_queue
     SET status='FETCHING',attempts=attempts+1,last_error=NULL,updated_at=CURRENT_TIMESTAMP
     WHERE url=? AND status IN ('PENDING','RETRY')`,
    row.url,
  );
  if (Number(changed.changes ?? 0) === 0) return claimNextRaceFetchItem();

  return {
    url: row.url,
    status: "FETCHING",
    attempts: Number(row.attempts ?? 0) + 1,
    raceDate: row.raceDate ?? null,
    venue: row.venue ?? null,
    raceNo: row.raceNo == null ? null : Number(row.raceNo),
    lastError: null,
  };
}

export async function markRaceFetchDone(url: string) {
  const db = await getLiveDb();
  await db.runAsync(
    "UPDATE race_fetch_queue SET status='DONE',last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE url=?",
    url,
  );
}

export async function markRaceFetchFailed(url: string, attempts: number, error: unknown) {
  const db = await getLiveDb();
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
  await db.runAsync(
    "UPDATE race_fetch_queue SET status=?,last_error=?,updated_at=CURRENT_TIMESTAMP WHERE url=?",
    attempts >= 3 ? "FAILED" : "RETRY", message, url,
  );
}

export async function getRaceFetchStats() {
  return statsFromDb();
}

export async function findRaceFetchUrl(raceDate: string, venue: string, raceNo: number) {
  const db = await getLiveDb();
  return db.getFirstAsync<{ url: string; lastError: string | null }>(
    `SELECT url,last_error AS lastError FROM race_fetch_queue
     WHERE race_date=? AND venue=? AND race_no=?
     ORDER BY CASE status WHEN 'DONE' THEN 0 WHEN 'PENDING' THEN 1 WHEN 'RETRY' THEN 2 ELSE 3 END,
       attempts,url
     LIMIT 1`,
    raceDate,venue,raceNo,
  );
}

export async function finishRaceFetchRun(state: RaceFetchRunState, error?: string | null) {
  const db = await getLiveDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "INSERT INTO meta(key,value) VALUES('race_fetch_state',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      state,
    );
    if (state === "COMPLETED") {
      await db.runAsync(
        "INSERT INTO meta(key,value) VALUES('race_fetch_completed_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        new Date().toISOString(),
      );
      await db.runAsync("DELETE FROM meta WHERE key='race_fetch_error'");
    } else if (error) {
      await db.runAsync(
        "INSERT INTO meta(key,value) VALUES('race_fetch_error',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        error.slice(0, 500),
      );
    }
  });
}
