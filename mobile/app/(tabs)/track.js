import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import RecoListScreen from "../../src/components/RecoListScreen";
import GradientHero from "../../src/components/GradientHero";
import { getMyMadeRecos } from "../../src/services/api/recommendationsApi";
import { getMyTrackedRecos } from "../../src/services/api/engagementApi";
import { mapTrackedReco } from "../../src/utils/feed";
import { useAuth } from "../../src/context/AuthContext";
import { colors, fonts } from "../../src/theme/colors";
import { withBoundary } from "../../src/components/ErrorBoundary";

// Track = the user's own posted ideas ("Made by me") and the ideas they've
// tracked/invested in — the two personal lists from the web app, surfaced as
// a segmented control. Both reuse RecoCard via the shared RecoListScreen.
const TABS = [
  { id: "made", label: "Made by me" },
  { id: "tracked", label: "Tracked" },
];

function TrackScreen() {
  const { profile } = useAuth();
  const [tab, setTab] = useState("made");

  // getMyMadeRecos returns server-mapped rows without a byName (they're the
  // caller's own) — stamp the caller's name so RecoCard shows it, not "Unknown".
  const loader = useCallback(async () => {
    if (tab === "made") {
      const rows = await getMyMadeRecos();
      const myName = profile?.full_name || "You";
      return rows.map((r) => ({ ...r, byName: r.byName || myName }));
    }
    const rows = await getMyTrackedRecos();
    return rows.map(mapTrackedReco);
  }, [tab, profile?.full_name]);

  const subHeader = (
    <View style={styles.tabs}>
      {TABS.map((t) => {
        const active = tab === t.id;
        return (
          <Pressable
            key={t.id}
            style={[styles.tab, active && styles.tabActive]}
            onPress={() => setTab(t.id)}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <RecoListScreen
      hero={<GradientHero eyebrow="Track" title="My Recommendations" subtitle="Ideas you've posted and tracked" />}
      subHeader={subHeader}
      loader={loader}
      emptyTitle={tab === "made" ? "You haven't posted any ideas yet" : "You're not tracking any ideas yet"}
      emptySubtitle={
        tab === "made"
          ? "Ideas you recommend to your circle will show up here."
          : "Ideas you track from your feed will show up here."
      }
    />
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.bg },
  tab: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tabActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  tabText: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 14 },
  tabTextActive: { color: "#fff" },
});

export default withBoundary(TrackScreen, "Track");
