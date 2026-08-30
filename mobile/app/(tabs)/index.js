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
import {
  buildFeed,
  computeEffectiveFeedConfig,
  mapPublicReco,
  mapNetworkReco,
} from "../../src/utils/feed";
import { putReco } from "../../src/utils/recoStore";
import { colors, fonts } from "../../src/theme/colors";

// Progressive load: the user's own direct deliveries (received) come back
// fast, so we render those first (received-only merge) and paint the feed
// immediately, then fold in the public + network-engagement sources and
// re-rank once they resolve. This is what makes the Feed feel fast — the old
// version awaited ALL five endpoints (plus a sequential network-engagement
// call) before showing anything.
async function loadFeedProgressive(onPartial) {
  const receivedP = getMyReceivedRecos();
  const publicP = getPublicFeed();
  const connsP = getMyConnections();
  const cfgP = getFeedConfigAndPrefs();
  const trackedP = getMyTrackedRecoIds();

  // First paint — received only, newest-first via scoreFeedRec.
  const received = await receivedP;
  onPartial(buildFeed({ received, cfg: {} }));

  // Full merge once the remaining independent calls resolve.
  const [publicRaw, connections, feedCfg, trackedIds] = await Promise.all([publicP, connsP, cfgP, trackedP]);
  const cfg = computeEffectiveFeedConfig(feedCfg.options, feedCfg.prefs);
  const activeConns = (connections || []).filter((c) => c.status === "active");
  const contactIds = new Set(activeConns.map((c) => c.user_id));

  let networkRecos = [];
  if (cfg.src_network_engagement && activeConns.length > 0) {
    const networkRaw = await getNetworkEngagementFeed(activeConns.map((c) => c.user_id));
    networkRecos = networkRaw.map(mapNetworkReco);
  }

  return buildFeed({
    received,
    networkRecos,
    publicRecos: (publicRaw || []).map(mapPublicReco),
    cfg,
    trackedIds,
    contactIds,
  });
}

export default function FeedScreen() {
  const router = useRouter();
  const [recos, setRecos] = useState(null); // null = initial loading
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
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
        removeClippedSubviews
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
