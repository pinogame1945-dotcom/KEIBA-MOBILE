import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { HomeScreen } from "./src/screens/HomeScreen";
import { TodayRacesScreen } from "./src/screens/TodayRacesScreen";
import { refreshDueRaceStates } from "./src/services/raceRefreshService";

type Route = "HOME" | "TODAY";

export default function App() {
  const [route, setRoute] = useState<Route>("HOME");

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

  return (
    <SafeAreaProvider>
      {route === "HOME"
        ? <HomeScreen onOpenToday={() => setRoute("TODAY")} />
        : <TodayRacesScreen onBack={() => setRoute("HOME")} />}
    </SafeAreaProvider>
  );
}
