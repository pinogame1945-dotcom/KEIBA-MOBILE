import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Props = {
  active: "HOME" | "RACES";
  onHome: () => void;
  onRaces: () => void;
};

export function BottomNav({ active, onHome, onRaces }: Props) {
  return (
    <SafeAreaView edges={["bottom"]} style={styles.safe}>
      <View style={styles.row}>
        <TouchableOpacity style={styles.item} onPress={onHome}>
          <Text style={[styles.label, active === "HOME" && styles.active]}>ホーム</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.item} onPress={onRaces}>
          <Text style={[styles.label, active === "RACES" && styles.active]}>レース</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#d1d5db",
  },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
  },
  item: {
    flex: 1,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    color: "#9ca3af",
    fontSize: 14,
    fontWeight: "800",
  },
  active: {
    color: "#111827",
    fontWeight: "900",
  },
});
