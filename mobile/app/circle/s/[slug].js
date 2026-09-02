import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Avatar from "../../../src/components/Avatar";
import { primeAvatars } from "../../../src/services/avatarCache";
import { getCircleBySlug, requestJoinCircle } from "../../../src/services/api/groupsApi";
import { colors, fonts } from "../../../src/theme/colors";
import { withBoundary } from "../../../src/components/ErrorBoundary";

/**
 * A Circle opened from its shareable link.
 *
 * This is the destination of the invite links the web app hands out
 * (`#/circle/:slug`) and that the Manage screen can now share from the phone.
 * Those links carry a SLUG; the app's own Circle route takes a group id, so
 * following one previously landed on a screen that tried to load a Circle
 * whose id was actually a slug and found nothing.
 *
 * What a viewer may see is the server's decision, not this screen's: a
 * private Circle 404s for anyone who is not already a member, and the invite
 * code comes back only for members. So "not found" and "not allowed" look the
 * same from here, deliberately — a private Circle should not confirm its own
 * existence to a stranger.
 */
function CircleBySlugScreen() {
  const { slug } = useLocalSearchParams();
  const router = useRouter();
  const [circle, setCircle] = useState(undefined); // undefined = loading, null = not visible
  const [joinState, setJoinState] = useState(null); // null | "sending" | "sent" | error string
  const mounted = useRef(true);

  const load = useCallback(async () => {
    const c = await getCircleBySlug(String(slug || ""));
    if (!mounted.current) return;
    setCircle(c);
    if (c?.my_join_request_status === "pending") setJoinState("sent");
    primeAvatars([c?.created_by, ...(c?.members || []).map((m) => m.user_id)]);
  }, [slug]);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const requestJoin = useCallback(async () => {
    if (!circle?.id) return;
    setJoinState("sending");
    // The invite code is what lets a link-holder join a public Circle without
    // waiting for approval; the server decides which applies.
    const res = await requestJoinCircle(circle.id, circle.invite_code || undefined);
    if (!mounted.current) return;
    if (res?.error) {
      setJoinState(res.error);
      return;
    }
    setJoinState("sent");
    load();
  }, [circle?.id, circle?.invite_code, load]);

  if (circle === undefined) {
    return (
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 40 }}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          {circle?.name || "Circle"}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {!circle ? (
        <View style={styles.empty}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.line2} />
          <Text style={styles.emptyTitle}>This Circle isn't available</Text>
          <Text style={styles.emptySub}>
            The link may be out of date, or the Circle may be private. Ask whoever shared it for a
            fresh invite.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View style={styles.card}>
            <Text style={styles.name}>{circle.name}</Text>
            {circle.description ? <Text style={styles.desc}>{circle.description}</Text> : null}
            <Text style={styles.meta}>
              {circle.member_count} member{circle.member_count === 1 ? "" : "s"}
              {circle.circle_type === "public" ? " · Public Circle" : " · Private Circle"}
            </Text>

            <Pressable
              style={styles.ownerRow}
              onPress={() =>
                circle.owner_username &&
                router.push(`/investor/${encodeURIComponent(circle.owner_username)}`)
              }
              disabled={!circle.owner_username}
            >
              <Avatar
                uid={circle.created_by}
                profile={{ avatar_url: circle.owner_avatar_url }}
                name={circle.owner_name}
                size={32}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.ownerName} numberOfLines={1}>
                  {circle.owner_name || "Investor"}
                </Text>
                <Text style={styles.ownerMeta}>Owner</Text>
              </View>
              {circle.owner_username ? (
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              ) : null}
            </Pressable>
          </View>

          {circle.is_member ? (
            <Pressable
              style={styles.primaryBtn}
              onPress={() =>
                router.push(`/circle/${encodeURIComponent(circle.id)}?name=${encodeURIComponent(circle.name)}`)
              }
            >
              <Text style={styles.primaryText}>Open this Circle's ideas</Text>
            </Pressable>
          ) : joinState === "sent" ? (
            <View style={styles.sentRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.gain} />
              <Text style={styles.sentText}>
                {circle.my_join_request_status === "pending"
                  ? "Request sent — the owner will review it"
                  : "Request sent"}
              </Text>
            </View>
          ) : (
            <>
              <Pressable
                style={[styles.primaryBtn, joinState === "sending" && { opacity: 0.7 }]}
                onPress={requestJoin}
                disabled={joinState === "sending"}
              >
                {joinState === "sending" ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>Join this Circle</Text>
                )}
              </Pressable>
              {joinState && joinState !== "sending" ? (
                <Text style={styles.err}>Couldn't join — the invite may have been regenerated.</Text>
              ) : null}
            </>
          )}

          {circle.members?.length ? (
            <>
              <Text style={styles.sectionTitle}>Members</Text>
              <View style={styles.card}>
                {circle.members.map((m, i) => (
                  <View
                    key={String(m.user_id)}
                    style={[styles.row, i < circle.members.length - 1 && styles.rowBorder]}
                  >
                    <Avatar uid={m.user_id} profile={m} name={m.name} size={32} />
                    <Text style={styles.rowName} numberOfLines={1}>
                      {m.name || m.username || "Investor"}
                    </Text>
                    {m.role === "admin" ? <Text style={styles.roleTag}>admin</Text> : null}
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
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
  topTitle: { flex: 1, textAlign: "center", color: colors.ink, fontFamily: fonts.extrabold, fontSize: 17 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  name: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 20 },
  desc: { color: colors.inkSoft, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, marginTop: 6 },
  meta: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 8 },
  ownerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  ownerName: { color: colors.ink, fontFamily: fonts.bold, fontSize: 14 },
  ownerMeta: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 1 },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontFamily: fonts.bold, fontSize: 15 },
  err: { color: colors.loss, fontFamily: fonts.regular, fontSize: 12, marginTop: 8, textAlign: "center" },
  sentRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 12 },
  sentText: { color: colors.gain, fontFamily: fonts.semibold, fontSize: 14 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 15, marginTop: 22, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowName: { flex: 1, color: colors.ink, fontFamily: fonts.semibold, fontSize: 14 },
  roleTag: { color: colors.muted, fontFamily: fonts.bold, fontSize: 11 },
  empty: { alignItems: "center", paddingHorizontal: 34, paddingTop: 70 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 16, marginTop: 12 },
  emptySub: {
    color: colors.muted,
    fontFamily: fonts.regular,
    fontSize: 13,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 19,
  },
});

export default withBoundary(CircleBySlugScreen, "CircleBySlug");
