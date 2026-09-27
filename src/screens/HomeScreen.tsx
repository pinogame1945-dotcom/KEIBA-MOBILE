import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const sections = [
  { title: "お知らせ", body: "馬場変更・天候・出走取消などをここに集約" },
  { title: "今日のレース", body: "開催・出走表・馬情報" },
  { title: "予想", body: "正式モデル＋最新オッズで実戦判断" },
  { title: "結果", body: "レース結果と予想結果を確認" },
] as const;

export function HomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>KEIBA</Text>
        <Text style={styles.subtitle}>MOBILE / 実戦専用</Text>

        <View style={styles.grid}>
          {sections.map((section) => (
            <View key={section.title} style={styles.card}>
              <Text style={styles.cardTitle}>{section.title}</Text>
              <Text style={styles.cardBody}>{section.body}</Text>
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f4f4f4",
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 1,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 24,
    fontSize: 13,
    color: "#666",
  },
  grid: {
    gap: 12,
  },
  card: {
    borderRadius: 16,
    backgroundColor: "#fff",
    padding: 18,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 6,
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 20,
    color: "#555",
  },
});
