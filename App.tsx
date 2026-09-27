import { useEffect, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomNav } from "./src/components/BottomNav";
import { HomeScreen } from "./src/screens/HomeScreen";
import { RaceCardScreen } from "./src/screens/RaceCardScreen";
import { WeekRacesScreen } from "./src/screens/WeekRacesScreen";
import { refreshDueRaceStates } from "./src/services/raceRefreshService";

type Route = "HOME" | "RACES";

export default function App() {
  const [route, setRoute] = useState<Route>("HOME");
  const [selectedRaceKey, setSelectedRaceKey] = useState<string | null>(null);

  useEffect(() => {
    const refreshDue = () => { void refreshDueRaceStates().catch(() => undefined); };
    refreshDue();
    const timer = setInterval(refreshDue, 60 * 1000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshDue();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  const openHome = () => {
    setSelectedRaceKey(null);
    setRoute("HOME");
  };

  const openWeek = () => {
    setSelectedRaceKey(null);
    setRoute("RACES");
  };

  const openRace = (raceKey: string) => {
    setRoute("RACES");
    setSelectedRaceKey(raceKey);
  };

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <View style={styles.content}>
          {selectedRaceKey ? (
            <RaceCardScreen raceKey={selectedRaceKey} onOpenWeek={openWeek} onOpenRace={openRace} />
          ) : route === "HOME" ? (
            <HomeScreen onOpenWeek={openWeek} onOpenRace={openRace} />
          ) : (
            <WeekRacesScreen onOpenRace={openRace} />
          )}
        </View>
        <BottomNav active={route} onHome={openHome} onRaces={openWeek} />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f6f8" },
  content: { flex: 1 },
});
