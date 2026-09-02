import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import RecoCard from "../../src/components/RecoCard";
import { primeAvatars } from "../../src/services/avatarCache";
import { getCircleIdeas, requestJoinCircle } from "../../src/services/api/groupsApi";
import { mapCircleReco } from "../../src/utils/feed";
import { putReco } from "../../src/utils/recoStore";
import { colors, fonts } from "../../src/theme/colors";
import { withBoundary } from "../../src/components/ErrorBoundary";

// Ideas shared with one Circle, newest-activity-first (server-ordered).
function CircleDetailScreen() {
  const { id, name } = useLocalSearchParams();
  const router = useRouter();
  const [ideas, setIdeas] = useState(null);
  // null ideas + denied = a Circle you found but cannot see into.
  const [denied, setDenied] = useState(false);
  const [joinState, setJoinState] = useState(null); // null | "sending" | "sent" | error string
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    const rows = await getCircleIdeas(id);
    if (!mounted.current) return;
    if (rows === null) {
      setDenied(true);
      setIdeas([]);
      return;
    }
    setDenied(false);
    const mapped = rows.map(mapCircleReco);
    setIdeas(mapped);
    primeAvatars(mapped.map((r) => r.from));
  }, [id]);

  const requestJoin = useCallback(async () => {
    setJoinState("sending");
    const res = await requestJoinCircle(id);
    if (!mounted.current) return;
    // A pending request is a success from the user's point of view — they
    // have asked, and asking twice changes nothing.
    setJoinState(res?.error ? res.error : "sent");
  }, [id]);

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

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 40 }}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          {name || "Circle"}
        </Text>
        <Pressable
          onPress={() => router.push(`/circle/manage?id=${encodeURIComponent(id)}`)}
          hitSlop={10}
          style={{ width: 40, alignItems: "flex-end" }}
        >
          <Ionicons name="settings-outline" size={21} color={colors.accentInk} />
        </Pressable>
      </View>

      {ideas === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={ideas}
          keyExtractor={(r) => String(r.id)}
          renderItem={({ item }) => <RecoCard reco={item} onPress={openReco} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          contentContainerStyle={ideas.length === 0 ? styles.emptyWrap : { paddingVertical: 12 }}
          initialNumToRender={6}
          windowSize={11}
          ListEmptyComponent={
            denied ? (
              <View style={styles.empty}>
                <Ionicons name="lock-closed-outline" size={40} color={colors.line2} />
                <Text style={styles.emptyTitle}>You're not in this Circle</Text>
                <Text style={styles.emptySub}>
                  Ask to join and the Circle's owner can approve you. They'll see your request in the
                  Circle's settings.
                </Text>

                {joinState === "sent" ? (
                  <View style={styles.sentRow}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.gain} />
                    <Text style={styles.sentText}>Request sent</Text>
                  </View>
                ) : (
                  <Pressable
                    style={[styles.joinBtn, joinState === "sending" && { opacity: 0.7 }]}
                    onPress={requestJoin}
                    disabled={joinState === "sending"}
                  >
                    {joinState === "sending" ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.joinText}>Ask to join</Text>
                    )}
                  </Pressable>
                )}

                {joinState && joinState !== "sent" && joinState !== "sending" ? (
                  <Text style={styles.joinErr}>
                    {joinState === "not_authorized"
                      ? "This Circle isn't accepting requests."
                      : "Couldn't send the request — try again."}
                  </Text>
                ) : null}
              </View>
            ) : (
              <View style={styles.empty}>
                <Ionicons name="bulb-outline" size={40} color={colors.line2} />
                <Text style={styles.emptyTitle}>No ideas in this Circle yet</Text>
                <Text style={styles.emptySub}>Ideas shared with this Circle will appear here.</Text>
              </View>
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  joinBtn: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 12,
    marginTop: 18,
    minWidth: 140,
    alignItems: "center",
  },
  joinText: { color: "#fff", fontFamily: fonts.bold, fontSize: 14 },
  sentRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 18 },
  sentText: { color: colors.gain, fontFamily: fonts.bold, fontSize: 14 },
  joinErr: { color: colors.loss, fontFamily: fonts.semibold, fontSize: 12, marginTop: 10, textAlign: "center" },
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
  topTitle: { flex: 1, textAlign: "center", color: colors.ink, fontFamily: fonts.bold, fontSize: 17 },
  emptyWrap: { flexGrow: 1 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, paddingTop: 80 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 16, marginTop: 12 },
  emptySub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: "center", marginTop: 6 },
});

export default withBoundary(CircleDetailScreen, "Circle");
