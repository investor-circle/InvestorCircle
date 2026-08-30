import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  getMyConnections,
  acceptConnection,
  rejectConnection,
  removeConnection,
} from "../src/services/api/connectionsApi";
import { initialsOf } from "../src/utils/format";
import { colors, fonts, GRADIENT } from "../src/theme/colors";

const TABS = [
  { id: "connections", label: "Connections" },
  { id: "requests", label: "Requests" },
];

export default function NetworkScreen() {
  const router = useRouter();
  const [tab, setTab] = useState("connections");
  const [rows, setRows] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState({}); // connectionId -> true while a mutation runs
  const mounted = useRef(true);

  const load = useCallback(async () => {
    const data = await getMyConnections();
    if (mounted.current) setRows(data);
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

  const all = rows || [];
  const active = all.filter((c) => c.status === "active");
  const incoming = all.filter((c) => c.status === "pending" && c.direction === "received");
  const outgoing = all.filter((c) => c.status === "pending" && c.direction === "sent");
  const list = tab === "connections" ? active : [...incoming, ...outgoing];

  const withBusy = (id, fn) => async () => {
    setBusy((b) => ({ ...b, [id]: true }));
    await fn();
    if (mounted.current) {
      setBusy((b) => ({ ...b, [id]: false }));
      await load();
    }
  };

  const renderItem = ({ item }) => {
    const isIncoming = item.status === "pending" && item.direction === "received";
    const isOutgoing = item.status === "pending" && item.direction === "sent";
    return (
      <View style={styles.row}>
        <LinearGradient colors={GRADIENT.colors} start={GRADIENT.start} end={GRADIENT.end} style={styles.avatar}>
          <Text style={styles.avatarText}>{initialsOf(item.name)}</Text>
        </LinearGradient>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name || "Investor"}
          </Text>
          {item.username ? (
            <Text style={styles.username} numberOfLines={1}>
              @{item.username}
            </Text>
          ) : null}
        </View>

        {busy[item.connection_id] ? (
          <ActivityIndicator color={colors.accent} />
        ) : isIncoming ? (
          <View style={styles.actionsRow}>
            <Pressable style={styles.acceptBtn} onPress={withBusy(item.connection_id, () => acceptConnection(item.connection_id))}>
              <Text style={styles.acceptText}>Accept</Text>
            </Pressable>
            <Pressable style={styles.rejectBtn} onPress={withBusy(item.connection_id, () => rejectConnection(item.connection_id))}>
              <Ionicons name="close" size={18} color={colors.muted} />
            </Pressable>
          </View>
        ) : isOutgoing ? (
          <Text style={styles.pendingTag}>Requested</Text>
        ) : (
          <Pressable style={styles.removeBtn} onPress={withBusy(item.connection_id, () => removeConnection(item.connection_id))}>
            <Ionicons name="person-remove-outline" size={18} color={colors.muted} />
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 40 }}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>Your network</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => {
          const activeTab = tab === t.id;
          const count = t.id === "connections" ? active.length : incoming.length;
          return (
            <Pressable key={t.id} style={[styles.tab, activeTab && styles.tabActive]} onPress={() => setTab(t.id)}>
              <Text style={[styles.tabText, activeTab && styles.tabTextActive]}>
                {t.label}
                {count > 0 ? ` · ${count}` : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {rows === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(c) => String(c.connection_id)}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          contentContainerStyle={list.length === 0 ? styles.emptyWrap : { paddingVertical: 8 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={40} color={colors.line2} />
              <Text style={styles.emptyTitle}>
                {tab === "connections" ? "No connections yet" : "No pending requests"}
              </Text>
              <Text style={styles.emptySub}>
                {tab === "connections"
                  ? "Connect with other investors to see their ideas in your feed."
                  : "Connection requests will appear here."}
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
  tabs: { flexDirection: "row", gap: 8, padding: 16 },
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
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontFamily: fonts.extrabold, fontSize: 15 },
  name: { color: colors.ink, fontFamily: fonts.bold, fontSize: 15 },
  username: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, marginTop: 1 },
  actionsRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  acceptBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  acceptText: { color: "#fff", fontFamily: fonts.bold, fontSize: 13 },
  rejectBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  pendingTag: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 13 },
  emptyWrap: { flexGrow: 1 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, paddingTop: 80 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 16, marginTop: 12 },
  emptySub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 19 },
});
