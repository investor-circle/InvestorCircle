import { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import RecoCard from "./RecoCard";
import { colors } from "../theme/colors";

/**
 * Shared reco-list screen used by Feed, Discover and Track — one place for
 * the loading / empty / error / pull-to-refresh behaviour and the FlatList
 * performance props, so the three list screens stay consistent.
 *
 * @param title       header text
 * @param loader      async () => reco[]  (already composed/sorted by caller)
 * @param emptyTitle / emptySubtitle  copy for the genuine empty state
 * @param renderItem  optional custom row (defaults to <RecoCard/>)
 * @param ListHeader  optional element rendered above the list (e.g. sub-tabs)
 */
export default function RecoListScreen({ title, loader, emptyTitle, emptySubtitle, renderItem, ListHeader }) {
  const [recos, setRecos] = useState(null); // null = initial loading
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await loader();
      setRecos(data);
      setError(false);
    } catch (e) {
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

  if (recos === null) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Text style={styles.heading}>{title}</Text>
      {ListHeader}
      <FlatList
        data={recos}
        keyExtractor={(item) => String(item.deliveryId ?? item.id)}
        renderItem={renderItem || (({ item }) => <RecoCard reco={item} />)}
        contentContainerStyle={recos.length === 0 ? styles.emptyContainer : { paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        initialNumToRender={8}
        windowSize={11}
        removeClippedSubviews
        ListEmptyComponent={
          error ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Couldn't load</Text>
              <Text style={styles.emptySubtitle}>Check your connection and pull down to try again.</Text>
              <Pressable style={styles.retry} onPress={onRefresh}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{emptyTitle}</Text>
              <Text style={styles.emptySubtitle}>{emptySubtitle}</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  heading: { color: colors.text, fontSize: 24, fontWeight: "700", paddingHorizontal: 16, paddingVertical: 12 },
  emptyContainer: { flexGrow: 1 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: "600", marginBottom: 6 },
  emptySubtitle: { color: colors.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  retry: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: { color: colors.accent, fontSize: 14, fontWeight: "600" },
});
