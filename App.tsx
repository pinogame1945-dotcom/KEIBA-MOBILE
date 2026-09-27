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

type PushRoute =
  | { type: "HOME" }
  | { type: "WEEK" }
  | { type: "RACE"; raceKey: string };

export default function App() {
  const nextRouteId = useRef(2);
  const [stack, setStack] = useState<ScreenRoute[]>([{ id: 1, type: "HOME" }]);
  const [cacheRevision, setCacheRevision] = useState(0);

  const current = stack[stack.length - 1];

  const bumpCache = useCallback(() => setCacheRevision((value) => value + 1), []);

  const runSync = useCallback(() => {
    void syncLiveCache().then(bumpCache).catch(() => undefined);
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
    let handled = false;
    setStack((prev) => {
      if (prev.length <= 1) return prev;
      handled = true;
      return prev.slice(0, -1);
    });
    return handled;
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", goBack);
    return () => subscription.remove();
  }, [goBack]);

  const push = useCallback((route: PushRoute) => {
    setStack((prev) => {
      const last = prev[prev.length - 1];
      if (route.type === "WEEK" && last.type === "WEEK") return prev;
      if (route.type === "RACE" && last.type === "RACE" && last.raceKey === route.raceKey) return prev;
      const next = { ...route, id: nextRouteId.current++ } as ScreenRoute;
      const combined = [...prev, next];
      return combined.length > 12 ? combined.slice(combined.length - 12) : combined;
    });
  }, []);

  const openWeek = useCallback(() => push({ type: "WEEK" }), [push]);

  const openRace = useCallback((raceKey: string) => {
    push({ type: "RACE", raceKey });
    void warmRaceData(raceKey).then(bumpCache).catch(() => undefined);
  }, [push, bumpCache]);

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
              <View key={route.id} style={[styles.screen, !active && styles.hidden]}>
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
  content: { flex: 1 },
  screen: { flex: 1 },
  hidden: { display: "none" },
});
