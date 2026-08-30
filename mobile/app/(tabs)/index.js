import { useCallback, useEffect, useRef, useState } from "react";
import { View, FlatList, StyleSheet, ActivityIndicator, RefreshControl, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import RecoCard from "../../src/components/RecoCard";
import GradientHero from "../../src/components/GradientHero";
import {
  getMyReceivedRecos,
  getPublicFeed,
  getNetworkEngagementFeed,
} from "../../src/services/api/recommendationsApi";
import { getMyConnections } from "../../src/services/api/connectionsApi";
import { getFeedConfigAndPrefs, getMyTrackedRecoIds } from "../../src/services/api/feedApi";
import { getMyNotifications } from "../../src/services/api/notificationsApi";
import {
  buildFeed,
  computeEffectiveFeedConfig,
  mapPublicReco,
  mapNetworkReco,
} from "../../src/utils/feed";
import { putReco } from "../../src/utils/recoStore";
import { debugLog } from "../../src/utils/logger";
import { colors, fonts } from "../../src/theme/colors";
import { withBoundary } from "../../src/components/ErrorBoundary";

// Progressive load: the user's own direct deliveries (received) come back
// fast, so we render those first (received-only merge) and paint the feed
// immediately, then fold in the public + network-engagement sources and
// re-rank once they resolve. This is what makes the Feed feel fast — the old
// version awaited ALL five endpoints (plus a sequential network-engagement
// call) before showing anything.
const settledOr = (r, fallback) => (r.status === "fulfilled" ? r.value : fallback);

async function loadFeedProgressive(onPartial) {
  const receivedP = getMyReceivedRecos();
  const publicP = getPublicFeed();
  const connsP = getMyConnections();
  const cfgP = getFeedConfigAndPrefs();
  const trackedP = getMyTrackedRecoIds();

  // First paint — received only, newest-first via scoreFeedRec.
  const received = await receivedP;
  debugLog(`feed: received=${received?.length ?? "null"}`);
  onPartial(buildFeed({ received, cfg: {} }));

  // Full merge once the remaining independent calls resolve. Use allSettled
  // so one failing source (e.g. a transient network blip on the public feed)
  // degrades to "that source missing" rather than collapsing the whole feed
  // back to received-only — the earlier cause of the feed showing only a
  // handful of ideas.
  const [publicR, connsR, cfgR, trackedR] = await Promise.allSettled([publicP, connsP, cfgP, trackedP]);
  const publicRaw = settledOr(publicR, []);
  const connections = settledOr(connsR, []);
  const feedCfg = settledOr(cfgR, { options: [], prefs: [] });
  const trackedIds = settledOr(trackedR, []);

  const cfg = computeEffectiveFeedConfig(feedCfg.options, feedCfg.prefs);
  const activeConns = (connections || []).filter((c) => c.status === "active");
  const contactIds = new Set(activeConns.map((c) => c.user_id));

  let networkRecos = [];
  if (cfg.src_network_engagement && activeConns.length > 0) {
    try {
      const networkRaw = await getNetworkEngagementFeed(activeConns.map((c) => c.user_id));
      networkRecos = (networkRaw || []).map(mapNetworkReco);
    } catch (_) {
      /* network-engagement is an enrichment, not required */
    }
  }

  // Per-source counts + which calls failed — this is what tells us whether a
  // short feed is "the server returned little" or "a source failed".
  debugLog(
    `feed sources: received=${received.length} public=${publicRaw.length}` +
      ` network=${networkRecos.length} activeConns=${activeConns.length}` +
      ` tracked=${trackedIds.length} cfg(public=${cfg.src_public !== false},network=${!!cfg.src_network_engagement})` +
      ` rejected=[${[
        publicR.status === "rejected" && "public",
        connsR.status === "rejected" && "conns",
        cfgR.status === "rejected" && "cfg",
        trackedR.status === "rejected" && "tracked",
      ]
        .filter(Boolean)
        .join(",")}]`
  );

  const merged = buildFeed({
    received,
    networkRecos,
    publicRecos: (publicRaw || []).map(mapPublicReco),
    cfg,
    trackedIds,
    contactIds,
  });
  debugLog(`feed: merged total=${merged.length}`);
  return merged;
}

function FeedScreen() {
  const router = useRouter();
  const [recos, setRecos] = useState(null); // null = initial loading
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [unread, setUnread] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Unread notification count — fetched off the feed's critical path (own
  // effect, not awaited by the feed load) so the badge never delays render.
  useEffect(() => {
    (async () => {
      const list = await getMyNotifications();
      if (mounted.current) setUnread(list.filter((n) => !n.is_read).length);
    })();
  }, []);

  const load = useCallback(async () => {
    try {
      const final = await loadFeedProgressive((partial) => {
        if (mounted.current) setRecos(partial);
      });
      if (mounted.current) {
        setRecos(final);
        setError(false);
      }
    } catch (e) {
      if (mounted.current) {
        setError(true);
        setRecos((prev) => prev ?? []);
      }
    }
  }, []);

  useEffect(() => {
    load();
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

  const hero = (
    <GradientHero
      eyebrow="Your Feed"
      title="What your circle is saying"
      subtitle={
        recos && recos.length > 0
          ? `Fresh recommendations · ${recos.length} idea${recos.length === 1 ? "" : "s"}`
          : "Recommendations from your circle & the platform"
      }
      icon="notifications-outline"
      badge={unread}
      onIconPress={() => router.push("/notifications")}
    />
  );

  if (recos === null) {
    return (
      <View style={styles.flex}>
        {hero}
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <FlatList
        data={recos}
        keyExtractor={(item) => String(item.deliveryId ?? item.id)}
        renderItem={({ item }) => <RecoCard reco={item} onPress={openReco} />}
        ListHeaderComponent={hero}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        initialNumToRender={6}
        windowSize={11}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{error ? "Couldn't load your feed" : "No ideas yet"}</Text>
            <Text style={styles.emptySubtitle}>
              {error
                ? "Check your connection and pull down to try again."
                : "Recommendations from your circle and across the platform will show up here."}
            </Text>
            {error ? (
              <Pressable style={styles.retry} onPress={onRefresh}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            ) : null}
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingTop: 60 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 17, marginBottom: 6 },
  emptySubtitle: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14, textAlign: "center", lineHeight: 20 },
  retry: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: { color: colors.accent, fontFamily: fonts.semibold, fontSize: 14 },
});

export default withBoundary(FeedScreen, "Feed");
