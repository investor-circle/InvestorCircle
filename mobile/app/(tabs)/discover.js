import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import GradientHero from "../../src/components/GradientHero";
import RecoCard from "../../src/components/RecoCard";
import { getPublicFeed, getMyReceivedRecos } from "../../src/services/api/recommendationsApi";
import { getMyConnections } from "../../src/services/api/connectionsApi";
import { getMyTrackedRecoIds } from "../../src/services/api/feedApi";
import { mapPublicReco } from "../../src/utils/feed";
import { rankTrending } from "../../src/utils/trending";
import { rankWhatYouMissed } from "../../src/utils/whatYouMissed";
import { putReco } from "../../src/utils/recoStore";
import { primeAvatars } from "../../src/services/avatarCache";
import { primeReactions } from "../../src/services/reactionStore";
import { debugLog } from "../../src/utils/logger";
import { colors, fonts } from "../../src/theme/colors";
import { withBoundary } from "../../src/components/ErrorBoundary";

// Pulse — the web app's discovery surface, not a flat public list.
// "Trending on MIC" ranks the public feed with the web's own rankTrending();
// "What you missed" ranks the caller's own received ideas with
// rankWhatYouMissed(). Both algorithms are ported verbatim (see
// src/utils/trending.js), so mobile and web surface the same ideas.
const settled = (r, fallback) => (r.status === "fulfilled" ? r.value : fallback);

async function loadPulse() {
  const [pubR, recvR, connR, trackedR] = await Promise.allSettled([
    getPublicFeed(),
    getMyReceivedRecos(),
    getMyConnections(),
    getMyTrackedRecoIds(),
  ]);

  // Drop null/id-less rows before ranking. trending.js guards against these
  // itself; whatYouMissed.js does not (it filters on `!r.hidden` directly),
  // and both files are verbatim ports of the web app's, so the guard belongs
  // here rather than as a silent fork of a file we need to keep in sync.
  const usable = (rows) => (rows || []).filter((r) => r && r.id != null);

  const publicRecos = usable(settled(pubR, [])).map(mapPublicReco);
  const received = usable(settled(recvR, []));
  const connections = settled(connR, []) || [];
  const trackedIds = settled(trackedR, []) || [];

  const contactIds = new Set(connections.filter((c) => c.status === "active").map((c) => c.user_id));
  const tracked = new Set((trackedIds || []).map(String));
  // rankWhatYouMissed checks membership with .has() on whatever it's given;
  // ids arrive as both numbers and strings depending on endpoint.
  const trackedSet = { has: (id) => tracked.has(String(id)) };

  const trending = rankTrending(publicRecos, { contactIds });
  const missed = rankWhatYouMissed(received, { tracked: trackedSet, contactIds });

  debugLog(`pulse: public=${publicRecos.length} trending=${trending.length} received=${received.length} missed=${missed.length}`);
  return { trending, missed, publicRecos };
}

function PulseScreen() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const d = await loadPulse();
      if (mounted.current) {
        setData(d);
        setError(false);
      }
      primeAvatars([...d.trending, ...d.missed].map((r) => r.from));
      primeReactions([...d.trending, ...d.missed].map((r) => r.id));
    } catch (e) {
      if (mounted.current) {
        setError(true);
        setData((p) => p ?? { trending: [], missed: [], publicRecos: [] });
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openReco = useCallback(
    (reco) => {
      putReco(reco);
      router.push(`/reco/${reco.id}`);
    },
    [router]
  );

  const openProfile = useCallback(
    (username) => router.push(`/investor/${encodeURIComponent(username)}`),
    [router]
  );

  const hero = (
    <GradientHero eyebrow="Pulse" title="Your daily investment dose" subtitle="What's moving across your circle & the platform" />
  );

  if (data === null) {
    return (
      <View style={styles.flex}>
        {hero}
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </View>
    );
  }

  const { trending, missed, publicRecos } = data;
  const nothing = trending.length === 0 && missed.length === 0 && publicRecos.length === 0;
  const shown = new Set([...trending, ...missed].map((x) => String(x.idea?.id ?? x.id)));
  const rest = publicRecos.filter((r) => !shown.has(String(r.id)));

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {hero}

        {/* Market Insights lives on its own screen — it aggregates every
            public idea by stock, which is a different question from Pulse's
            "what moved recently", but the same intent, so this is where
            people look for it. */}
        <Pressable style={styles.insightsLink} onPress={() => router.push("/market")}>
          <View style={styles.insightsIcon}>
            <Ionicons name="stats-chart" size={17} color={colors.accentInk} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.insightsTitle}>Market Insights</Text>
            <Text style={styles.insightsSub}>Consensus and conviction across every stock</Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={colors.muted} />
        </Pressable>

        {nothing ? (
          <View style={styles.empty}>
            <Ionicons name={error ? "cloud-offline-outline" : "pulse-outline"} size={40} color={colors.line2} />
            <Text style={styles.emptyTitle}>{error ? "Couldn't load Pulse" : "Nothing moving yet"}</Text>
            <Text style={styles.emptySub}>
              {error
                ? "Pull down to try again."
                : "As ideas are shared and start moving, the highlights show up here."}
            </Text>
          </View>
        ) : null}

        {missed.length > 0 ? (
          <Section
            icon="eye-off-outline"
            title="What you missed"
            sub="Ideas from your circle that moved recently"
          >
            {missed.map((m) => (
              <RankedCard key={String(m.idea?.id ?? m.id)} item={m} onPress={openReco} onOpenProfile={openProfile} />
            ))}
          </Section>
        ) : null}

        {trending.length > 0 ? (
          <Section icon="trending-up-outline" title="Trending on MIC" sub="Gaining attention across the platform">
            {trending.map((t) => (
              <RankedCard key={String(t.idea?.id ?? t.id)} item={t} onPress={openReco} onOpenProfile={openProfile} />
            ))}
          </Section>
        ) : null}

        {/* Everything else, so Pulse is never emptier than the old plain
            list — minus whatever the ranked sections already showed above,
            which would otherwise appear twice on the same screen. */}
        {rest.length > 0 ? (
          <Section icon="globe-outline" title="Latest public ideas" sub="Newest across the platform">
            {rest.slice(0, 20).map((r) => (
              <RecoCard key={String(r.id)} reco={r} onPress={openReco} onOpenProfile={openProfile} />
            ))}
          </Section>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// The ranking functions return {idea, creator, reason, score}; unwrap to the
// reco the card expects, and surface the human-readable reason they chose it.
//
// The two modules deliberately shape `reason` differently: whatYouMissed.js
// returns a plain string ("From your connection"), trending.js returns
// {icon, text} ({icon:'🔥', text:'3 investors liked it this week'}). Render
// both rather than assuming one — this is the multi-caller data-shape trap
// that CLAUDE.md's incident note is about.
function reasonOf(reason) {
  if (!reason) return null;
  if (typeof reason === "string") return { icon: null, text: reason };
  if (typeof reason.text === "string") return { icon: reason.icon || null, text: reason.text };
  return null;
}

function RankedCard({ item, onPress, onOpenProfile }) {
  const reco = item?.idea || item;
  if (!reco) return null;
  const reason = reasonOf(item?.reason);
  return (
    <View>
      {reason ? (
        <View style={styles.reasonRow}>
          {reason.icon ? (
            <Text style={styles.reasonIcon}>{reason.icon}</Text>
          ) : (
            <Ionicons name="sparkles" size={12} color={colors.accentInk} />
          )}
          <Text style={styles.reasonText} numberOfLines={1}>
            {reason.text}
          </Text>
        </View>
      ) : null}
      <RecoCard reco={reco} onPress={onPress} onOpenProfile={onOpenProfile} />
    </View>
  );
}

function Section({ icon, title, sub, children }) {
  return (
    <View style={{ marginTop: 18 }}>
      <View style={styles.sectionHead}>
        <Ionicons name={icon} size={17} color={colors.accentInk} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {sub ? <Text style={styles.sectionSub}>{sub}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  insightsLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 16,
  },
  insightsIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  insightsTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 14.5 },
  insightsSub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 16 },
  sectionSub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 1 },
  reasonRow: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 20, marginBottom: 4 },
  reasonIcon: { fontSize: 11 },
  reasonText: { color: colors.accentInk, fontFamily: fonts.semibold, fontSize: 11, flex: 1 },
  empty: { alignItems: "center", justifyContent: "center", paddingHorizontal: 40, paddingTop: 50 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 16, marginTop: 12 },
  emptySub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 19 },
});

export default withBoundary(PulseScreen, "Pulse");
