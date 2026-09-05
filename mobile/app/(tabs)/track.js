import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import RecoListScreen from "../../src/components/RecoListScreen";
import AppHeader from "../../src/components/AppHeader";
import { getMyMadeRecos, getMyReceivedRecos } from "../../src/services/api/recommendationsApi";
import { getMyTrackedRecos } from "../../src/services/api/engagementApi";
import { mapTrackedReco } from "../../src/utils/feed";
import { seedTracked } from "../../src/services/trackStore";
import { useAuth } from "../../src/context/AuthContext";
import { colors, fonts } from "../../src/theme/colors";
import { withBoundary } from "../../src/components/ErrorBoundary";

// Track = the user's own posted ideas ("Made by me") and the ideas they've
// tracked/invested in — the two personal lists from the web app, surfaced as
// a segmented control. Both reuse RecoCard via the shared RecoListScreen.
// Received is the web's third list and was missing here: those ideas
// appeared in the Feed mixed with public and network ones, so there was no
// way to see just what people had sent YOU. It is also where a delivered
// idea can be dismissed, which only makes sense against that list.
const TABS = [
  { id: "received", label: "Received" },
  { id: "made", label: "Created" },
  { id: "tracked", label: "Tracked" },
];

const EMPTY = {
  received: [
    "Nothing shared with you yet",
    "Ideas people send you directly, or share with a Circle you're in, land here.",
  ],
  made: ["You haven't posted any ideas yet", "Ideas you recommend to your circle will show up here."],
  tracked: ["You're not tracking any ideas yet", "Ideas you track from your feed will show up here."],
};

function TrackScreen() {
  const { profile } = useAuth();
  const [tab, setTab] = useState("received");

  // getMyMadeRecos returns server-mapped rows without a byName (they're the
  // caller's own) — stamp the caller's name so RecoCard shows it, not "Unknown".
  const loader = useCallback(async () => {
    if (tab === "received") {
      // Hidden deliveries are dismissed, not deleted — the same rows the Feed
      // filters out, filtered out here for the same reason.
      // No mapper: the server already returns these in card shape, which is
      // why buildFeed() consumes them as-is. Hidden deliveries are dismissed,
      // not deleted, so they are filtered out here for the same reason the
      // Feed filters them out.
      const rows = await getMyReceivedRecos();
      return (rows || []).filter((r) => r && r.id != null && !r.hidden);
    }
    if (tab === "made") {
      const rows = await getMyMadeRecos();
      const myName = profile?.full_name || "You";
      // Stamp the caller's uid too, for the same reason as the name: these
      // rows have no author fields (they ARE the caller's), so without it
      // the card could not look up their own profile picture.
      return rows.map((r) => ({ ...r, byName: r.byName || myName, from: r.from || profile?.id }));
    }
    const rows = await getMyTrackedRecos();
    const mapped = rows.map(mapTrackedReco);
    // This list IS every tracked idea, so seed the store directly rather
    // than round-tripping through getMyTrackedRecoIds again.
    const ids = mapped.map((r) => r.id);
    seedTracked(ids, ids);
    return mapped;
  }, [tab, profile?.full_name, profile?.id]);

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
      header={<AppHeader title="My Ideas" />}
      subHeader={subHeader}
      loader={loader}
      emptyTitle={EMPTY[tab][0]}
      emptySubtitle={EMPTY[tab][1]}
    />
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.bg },
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
  tabText: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 13 },
  tabTextActive: { color: "#fff" },
});

export default withBoundary(TrackScreen, "Track");
