import { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import RecoCard from "../../src/components/RecoCard";
import { getMyReceivedRecos } from "../../src/services/api/recommendationsApi";
import { colors } from "../../src/theme/colors";

export default function FeedScreen() {
  const [recos, setRecos] = useState(null); // null = initial loading
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    const data = await getMyReceivedRecos();
    setRecos(data);
    if (data.length === 0) {
      // getMyReceivedRecos() degrades to [] on both "no data" and
      // "infra/auth failure" (see callApi) — can't distinguish here, so
      // an empty result is treated as a valid empty state, not an error.
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

  if (recos === null) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Text style={styles.heading}>Feed</Text>
      <FlatList
        data={recos}
        keyExtractor={(item) => String(item.deliveryId ?? item.id)}
        renderItem={({ item }) => <RecoCard reco={item} />}
        contentContainerStyle={recos.length === 0 ? styles.emptyContainer : { paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No ideas yet</Text>
            <Text style={styles.emptySubtitle}>
              Recommendations shared with you by your circle will show up here.
            </Text>
          </View>
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
});
