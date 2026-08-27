import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../../src/theme/colors";

// Placeholder for Discover/Pulse — network engagement + public feed
// (getNetworkEngagementFeed / getPublicFeed in recommendationsApi.js are
// already wired up; this screen wires the UI on top in the next pass).
export default function DiscoverScreen() {
  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.center}>
        <Text style={styles.title}>Discover</Text>
        <Text style={styles.subtitle}>Pulse and public ideas from across the platform — coming next.</Text>
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
