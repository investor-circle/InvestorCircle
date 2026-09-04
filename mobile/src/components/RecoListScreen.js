import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import RecoCard from "./RecoCard";
import { putReco } from "../utils/recoStore";
import { primeAvatars } from "../services/avatarCache";
import { primeReactions } from "../services/reactionStore";
import { colors, fonts } from "../theme/colors";

/**
 * Shared reco-list screen used by Discover and Track — one place for the
 * loading / empty / error / pull-to-refresh behaviour, the FlatList perf
 * props, and card→detail navigation.
 *
 * @param hero        element rendered as the scrolling list header (GradientHero)
 * @param loader      async () => reco[]  (already composed/sorted by caller)
 * @param subHeader   optional element rendered between hero and list (e.g. tabs)
 * @param emptyTitle / emptySubtitle  copy for the genuine empty state
 */
export default function RecoListScreen({ hero, loader, subHeader, emptyTitle, emptySubtitle }) {
  const router = useRouter();
  const [recos, setRecos] = useState(null);
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
      const data = await loader();
      if (!mounted.current) return;
      setRecos(data);
      setError(false);
      // After the list is set, never before — the pictures arrive behind it.
      primeAvatars((data || []).map((r) => r.from));
      // Which of these the caller has already liked — same hydration the web
      // does after every feed load (App.jsx -> getReactionsBatch).
      primeReactions((data || []).map((r) => r.id));
    } catch (e) {
      if (!mounted.current) return;
      setError(true);
      setRecos((prev) => prev ?? []);
    }
  }, [loader]);

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

  const openProfile = useCallback(
    (username) => router.push(`/investor/${encodeURIComponent(username)}`),
    [router]
  );

  const openTicker = useCallback(
    (symbol) => router.push(`/ticker/${encodeURIComponent(symbol)}`),
    [router]
  );

  if (recos === null) {
    return (
      <View style={styles.flex}>
        {hero}
        {subHeader}
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
        renderItem={({ item }) => <RecoCard reco={item} onPress={openReco} onOpenProfile={openProfile} onOpenTicker={openTicker} />}
        ListHeaderComponent={
          <>
            {hero}
            {subHeader}
          </>
        }
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        initialNumToRender={6}
        windowSize={11}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{error ? "Couldn't load" : emptyTitle}</Text>
            <Text style={styles.emptySubtitle}>
              {error ? "Check your connection and pull down to try again." : emptySubtitle}
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 40 },
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
