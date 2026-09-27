import type { JraRace } from "../domain/live";

export function surfaceLabel(surface: JraRace["surface"]) {
  if (surface === "TURF") return "芝";
  if (surface === "DIRT") return "ダ";
  if (surface === "MIXED") return "芝/ダ";
  return null;
}

export function directionLabel(direction: JraRace["direction"]) {
  if (direction === "LEFT") return "左";
  if (direction === "RIGHT") return "右";
  return null;
}

export function raceCourseLabel(race: JraRace) {
  return [
    surfaceLabel(race.surface),
    race.distanceM != null ? race.distanceM.toLocaleString() + "m" : null,
    directionLabel(race.direction),
  ].filter(Boolean).join(" ");
}

export function raceStateLabel(race: JraRace, hasResult: boolean, nowMs = Date.now()) {
  if (hasResult) return "結果確定";
  const [y,m,d] = race.raceDate.split("-").map(Number);
  const [hh,mm] = (race.startTime ?? "").split(":").map(Number);
  const start = Number.isFinite(hh) && Number.isFinite(mm)
    ? new Date(y, (m || 1) - 1, d || 1, hh, mm).getTime()
    : null;
  if (race.status !== "OFFICIAL") {
    return start != null && start <= nowMs ? "データ修復中" : "出馬表取得待ち";
  }
  if (start != null && start <= nowMs) return "結果待ち";
  return "発走前";
}
