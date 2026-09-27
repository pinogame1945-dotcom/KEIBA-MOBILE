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
  if (race.discipline === "OBSTACLE") {
    return ["障害", race.distanceM != null ? race.distanceM.toLocaleString() + "m" : null]
      .filter(Boolean).join(" ");
  }
  return [
    surfaceLabel(race.surface),
    race.distanceM != null ? race.distanceM.toLocaleString() + "m" : null,
    directionLabel(race.direction),
  ].filter(Boolean).join(" ");
}

function shortDate(iso: string | null) {
  if (!iso) return null;
  const [,m,d] = iso.split("-");
  return m && d ? Number(m) + "/" + Number(d) : iso;
}

export function raceStateLabel(race: JraRace, hasResult: boolean, nowMs = Date.now()) {
  if (race.scheduleStatus === "RESCHEDULED") {
    return race.actualDate ? "順延 → " + shortDate(race.actualDate) : "順延";
  }
  if (race.raceStatus === "CANCELLED") return "開催中止";
  if (race.raceStatus === "ABANDONED") return "競走取りやめ";
  if (hasResult || race.raceStatus === "COMPLETED") return "結果確定";
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
