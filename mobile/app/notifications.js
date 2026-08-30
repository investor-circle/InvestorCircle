import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getMyNotifications, markNotifRead, markAllNotifRead } from "../src/services/api/notificationsApi";
import { notifText, notifIcon, notifRecoId } from "../src/utils/notifications";
import { fmtDate } from "../src/utils/format";
import { colors, fonts } from "../src/theme/colors";

export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    const data = await getMyNotifications();
    if (mounted.current) setItems(data);
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

  const markAll = async () => {
    setItems((prev) => (prev || []).map((n) => ({ ...n, is_read: true })));
    await markAllNotifRead();
  };

  const onTap = async (n) => {
    if (!n.is_read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      markNotifRead(n.id);
    }
    const recoId = notifRecoId(n);
    if (recoId) router.push(`/reco/${recoId}`);
    else if (n.type?.startsWith("connection")) router.push("/network");
  };

  const unread = (items || []).filter((n) => !n.is_read).length;

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 40 }}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>Notifications</Text>
        <Pressable onPress={markAll} hitSlop={8} style={{ width: 40, alignItems: "flex-end" }}>
          {unread > 0 ? <Ionicons name="checkmark-done" size={22} color={colors.accent} /> : <View />}
        </Pressable>
      </View>

      {items === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => String(n.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          contentContainerStyle={items.length === 0 ? styles.emptyWrap : { paddingVertical: 8 }}
          renderItem={({ item }) => (
            <Pressable style={[styles.row, !item.is_read && styles.rowUnread]} onPress={() => onTap(item)}>
              <View style={[styles.iconWrap, !item.is_read && styles.iconWrapUnread]}>
                <Ionicons name={notifIcon(item.type)} size={17} color={item.is_read ? colors.muted : colors.accentInk} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.text, !item.is_read && styles.textUnread]}>{notifText(item)}</Text>
                <Text style={styles.date}>{fmtDate(item.created_at)}</Text>
              </View>
              {!item.is_read ? <View style={styles.dot} /> : null}
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={40} color={colors.line2} />
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptySub}>Likes, comments, connections and idea updates will appear here.</Text>
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
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  rowUnread: { backgroundColor: colors.accentSoft },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapUnread: { backgroundColor: "#fff" },
  text: { color: colors.inkSoft, fontFamily: fonts.medium, fontSize: 14, lineHeight: 19 },
  textUnread: { color: colors.ink, fontFamily: fonts.semibold },
  date: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, marginTop: 3 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  emptyWrap: { flexGrow: 1 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, paddingTop: 80 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 16, marginTop: 12 },
  emptySub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 19 },
});
