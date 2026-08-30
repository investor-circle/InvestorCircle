import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getMyGroups } from "../src/services/api/groupsApi";
import { colors, fonts } from "../src/theme/colors";
import { withBoundary } from "../src/components/ErrorBoundary";

// Circles the caller belongs to. Tapping one opens its shared ideas.
function CirclesScreen() {
  const router = useRouter();
  const [groups, setGroups] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    const data = await getMyGroups();
    if (mounted.current) setGroups(data);
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

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 40 }}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>Your Circles</Text>
        <View style={{ width: 40 }} />
      </View>

      {groups === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => String(g.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          contentContainerStyle={groups.length === 0 ? styles.emptyWrap : { padding: 16 }}
          renderItem={({ item }) => {
            const memberCount = (item.members || []).filter((m) => m.status === "active").length;
            return (
              <Pressable
                style={styles.card}
                onPress={() => router.push(`/circle/${item.id}?name=${encodeURIComponent(item.name || "Circle")}`)}
              >
                <View style={[styles.swatch, { backgroundColor: item.color || colors.accent }]}>
                  <Ionicons name="people" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {item.circle_type === "public" ? "Public Circle" : "Private Circle"}
                    {memberCount ? ` · ${memberCount} member${memberCount === 1 ? "" : "s"}` : ""}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="albums-outline" size={40} color={colors.line2} />
              <Text style={styles.emptyTitle}>No Circles yet</Text>
              <Text style={styles.emptySub}>
                Circles are private groups where you share ideas with a chosen set of investors.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
  },
  topTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 17 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  swatch: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  name: { color: colors.ink, fontFamily: fonts.bold, fontSize: 15 },
  meta: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  emptyWrap: { flexGrow: 1 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, paddingTop: 80 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 16, marginTop: 12 },
  emptySub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 19 },
});

export default withBoundary(CirclesScreen, "Circles");
