import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../../src/theme/colors";

// Placeholder for Track/Tracking — ideas the user has marked invested, plus
// their own posted recommendations ("Made by me"). getMyMadeRecos() is
// already wired up in recommendationsApi.js.
export default function TrackScreen() {
  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.center}>
        <Text style={styles.title}>Track</Text>
        <Text style={styles.subtitle}>Your tracked and posted ideas — coming next.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  title: { color: colors.text, fontSize: 20, fontWeight: "700", marginBottom: 8 },
  subtitle: { color: colors.textMuted, fontSize: 14, textAlign: "center" },
});
