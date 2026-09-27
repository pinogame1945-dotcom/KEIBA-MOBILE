export type RaceScheduleCandidate = {
  raceKey: string;
  raceDate: string;
  fetchedAt: string;
};

export function selectActiveSchedule<T extends RaceScheduleCandidate>(
  rows: T[],
): T | null {
  if (!rows.length) return null;
  return [...rows].sort((a,b) =>
    b.raceDate.localeCompare(a.raceDate) ||
    b.fetchedAt.localeCompare(a.fetchedAt) ||
    b.raceKey.localeCompare(a.raceKey)
  )[0] ?? null;
}

export function earliestScheduleDate(
  rows: Array<Pick<RaceScheduleCandidate,"raceDate">>,
): string | null {
  if (!rows.length) return null;
  return rows.reduce(
    (earliest,row) => row.raceDate < earliest ? row.raceDate : earliest,
    rows[0].raceDate,
  );
}
