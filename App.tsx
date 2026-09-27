import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, BackHandler, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomNav } from "./src/components/BottomNav";
import { HomeScreen } from "./src/screens/HomeScreen";
import { RaceCardScreen } from "./src/screens/RaceCardScreen";
import { WeekRacesScreen } from "./src/screens/WeekRacesScreen";
import { syncLiveCache, warmRaceData } from "./src/services/liveSyncService";

type ScreenRoute =
  | { id: number; type: "HOME" }
  | { id: number; type: "WEEK" }
  | { id: number; type: "RACE"; raceKey: string };

export default function App() {
  const nextRouteId = useRef(2);
  const [stack, setStack] = useState<ScreenRoute[]>([{ id: 1, type: "HOME" }]);
  const [cacheRevision, setCacheRevision] = useState(0);

  const current = stack[stack.length - 1];

  const bumpCache = useCallback(() => setCacheRevision((value) => value + 1), []);

  const runSync = useCallback(() => {
    void syncLiveCache(bumpCache).then(bumpCache).catch(() => undefined);
  }, [bumpCache]);

  useEffect(() => {
    runSync();
    const timer = setInterval(runSync, 60 * 1000);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") runSync();
    });
    return () => {
      clearInterval(timer);
      appState.remove();
    };
  }, [runSync]);

  const goBack = useCallback(() => {
    if (stack.length <= 1) return false;
    setStack((prev) => prev.length > 1 ? prev.slice(0, -1) : prev);
    return true;
  }, [stack.length]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", goBack);
    return () => subscription.remove();
  }, [goBack]);

  const openWeek = useCallback(() => {
    setStack((prev) => {
      const existingWeek = prev.map((route) => route.type).lastIndexOf("WEEK");
      if (existingWeek >= 0) return prev.slice(0, existingWeek + 1);

      const parent = prev[prev.length - 1]?.type === "RACE" ? prev.slice(0, -1) : prev;
      return [...parent, { id: nextRouteId.current++, type: "WEEK" }];
    });
  }, []);

  const openRace = useCallback((raceKey: string) => {
    setStack((prev) => {
      const last = prev[prev.length - 1];
      if (last?.type === "RACE" && last.raceKey === raceKey) return prev;
      const next: ScreenRoute = { id: nextRouteId.current++, type: "RACE", raceKey };

      // Previous/next race navigation replaces the current race route instead
      // of pushing another history entry. The parent WEEK/HOME route is preserved.
      if (last?.type === "RACE") return [...prev.slice(0, -1), next];
      return [...prev, next];
    });
    void warmRaceData(raceKey, bumpCache).then(bumpCache).catch(() => undefined);
  }, [bumpCache]);

  const openHomeRoot = useCallback(() => {
    setStack([{ id: nextRouteId.current++, type: "HOME" }]);
  }, []);

  const openWeekRoot = useCallback(() => {
    setStack([{ id: nextRouteId.current++, type: "WEEK" }]);
  }, []);

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <View style={styles.content}>
          {stack.map((route, index) => {
            const active = index === stack.length - 1;
            return (
              <View
                key={route.id}
                pointerEvents={active ? "auto" : "none"}
                style={[styles.screen, active ? styles.activeScreen : styles.hidden]}
              >
                {route.type === "HOME" ? (
                  <HomeScreen
                    active={active}
                    cacheRevision={cacheRevision}
                    onOpenWeek={openWeek}
                    onOpenRace={openRace}
                  />
                ) : route.type === "WEEK" ? (
                  <WeekRacesScreen
                    active={active}
                    cacheRevision={cacheRevision}
                    onBack={stack.length > 1 ? goBack : undefined}
                    onOpenRace={openRace}
                  />
                ) : (
                  <RaceCardScreen
                    active={active}
                    cacheRevision={cacheRevision}
                    raceKey={route.raceKey}
                    onBack={goBack}
                    onOpenWeek={openWeek}
                    onOpenRace={openRace}
                    onMutation={bumpCache}
                  />
                )}
              </View>
            );
          })}
        </View>
        <BottomNav
          active={current.type === "HOME" ? "HOME" : "RACES"}
          onHome={openHomeRoot}
          onRaces={openWeekRoot}
        />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f6f8" },
  content: { flex: 1, position: "relative" },
  screen: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  activeScreen: { opacity: 1, zIndex: 1 },
  hidden: { opacity: 0, zIndex: 0 },
});
