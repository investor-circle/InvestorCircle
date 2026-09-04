import { useCallback, useEffect, useRef, useState } from "react";
import { circleUrl } from "../../src/utils/links";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Share,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  getMyGroups,
  getCircleEligibleMembers,
  getCircleJoinRequests,
  reviewCircleJoinRequest,
  addGroupMembers,
  removeGroupMember,
  updateCircleSettings,
  deleteGroup,
  exitGroup,
  regenerateCircleInviteLink,
} from "../../src/services/api/groupsApi";
import { useAuth } from "../../src/context/AuthContext";
import Avatar from "../../src/components/Avatar";
import { primeAvatars } from "../../src/services/avatarCache";
import { colors, fonts } from "../../src/theme/colors";
import { withBoundary } from "../../src/components/ErrorBoundary";

// Manage one Circle: members, pending join requests, name/description, and
// the destructive actions. Owner-only controls are hidden for non-owners, and
// the server independently enforces every one of them.
function ManageCircleScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  const [group, setGroup] = useState(null);
  const [eligible, setEligible] = useState([]);
  const [requests, setRequests] = useState([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState("");
  const mounted = useRef(true);

  const isOwner = !!group && !!user?.uid && group.created_by === user.uid;
  // Public Circles are joinable from a shareable link. The web offers copy +
  // regenerate to the owner (Groups.jsx doRegenerateInvite); mobile had the
  // API wrapper but no way to reach it, so a leaked link could not be killed
  // from the phone.
  const isPublicCircle = (group?.circle_type || group?.type) === "public";
  const inviteLink = group?.slug ? circleUrl(group.slug) : null;

  const shareInvite = useCallback(async () => {
    if (!inviteLink) return;
    try {
      await Share.share({ message: inviteLink, url: inviteLink });
    } catch (_) {
      /* user dismissed the sheet */
    }
  }, [inviteLink]);

  // Not memoised: it closes over `run`, which is redefined every render, so a
  // useCallback here would capture a stale copy for no benefit.
  const regenerateInvite = () => {
    Alert.alert(
      "Get a new invite link?",
      "The current link stops working immediately. Anyone who already joined stays a member.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Regenerate",
          style: "destructive",
          onPress: () => run("invite", () => regenerateCircleInviteLink(id), "New link created"),
        },
      ]
    );
  };

  const load = useCallback(async () => {
    const groups = await getMyGroups();
    const g = (groups || []).find((x) => String(x.id) === String(id)) || null;
    if (!mounted.current) return;
    setGroup(g);
    setName(g?.name || "");
    setDescription(g?.description || "");

    // Eligible members and join requests are owner-scoped on the server; for
    // a non-owner these simply come back empty rather than erroring.
    const [elig, reqs] = await Promise.all([getCircleEligibleMembers(id), getCircleJoinRequests(id)]);
    if (!mounted.current) return;
    setEligible(elig || []);
    setRequests(reqs || []);
    primeAvatars([
      ...(g?.members || []).map((m) => m.user_id),
      ...(elig || []).map((p) => p.id),
      ...(reqs || []).map((r) => r.user_id ?? r.id),
    ]);
  }, [id]);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const run = async (key, fn, okMsg) => {
    setBusy(key);
    setMsg("");
    const ok = await fn();
    if (!mounted.current) return;
    setBusy(null);
    setMsg(ok ? okMsg || "Saved" : "That didn't work — try again.");
    if (ok) load();
  };

  const confirmDestructive = (title, body, onYes) =>
    Alert.alert(title, body, [
      { text: "Cancel", style: "cancel" },
      { text: title.startsWith("Delete") ? "Delete" : "Leave", style: "destructive", onPress: onYes },
    ]);

  const members = (group?.members || []).filter((m) => m.status === "active");

  if (group === null) {
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
          Manage Circle
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {msg ? <Text style={styles.msg}>{msg}</Text> : null}

          {/* Pending join requests (public Circles, owner only) */}
          {requests.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Join requests · {requests.length}</Text>
              <View style={styles.card}>
                {requests.map((r, i) => (
                  <View key={String(r.id)} style={[styles.row, i < requests.length - 1 && styles.rowBorder]}>
                    <Avatar uid={r.user_id ?? r.id} name={r.full_name || r.name} size={34} />
                    <Text style={styles.rowName} numberOfLines={1}>
                      {r.full_name || r.name || r.username || "Investor"}
                    </Text>
                    {busy === `req-${r.id}` ? (
                      <ActivityIndicator color={colors.accent} />
                    ) : (
                      <View style={styles.actions}>
                        <Pressable
                          style={styles.approveBtn}
                          onPress={() => run(`req-${r.id}`, () => reviewCircleJoinRequest(r.id, true), "Approved")}
                        >
                          <Text style={styles.approveText}>Approve</Text>
                        </Pressable>
                        <Pressable
                          style={styles.iconBtn}
                          onPress={() => run(`req-${r.id}`, () => reviewCircleJoinRequest(r.id, false), "Rejected")}
                        >
                          <Ionicons name="close" size={18} color={colors.muted} />
                        </Pressable>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {/* Invite link — public Circles only */}
          {isPublicCircle && inviteLink ? (
            <>
              <Text style={styles.sectionTitle}>Invite link</Text>
              <View style={styles.card}>
                <Text style={styles.inviteLink} numberOfLines={2}>
                  {inviteLink}
                </Text>
                <View style={styles.inviteActions}>
                  <Pressable style={styles.approveBtn} onPress={shareInvite}>
                    <Text style={styles.approveText}>Share link</Text>
                  </Pressable>
                  {isOwner ? (
                    busy === "invite" ? (
                      <ActivityIndicator color={colors.accent} />
                    ) : (
                      <Pressable style={styles.iconBtn} onPress={regenerateInvite}>
                        <Ionicons name="refresh-outline" size={18} color={colors.muted} />
                      </Pressable>
                    )
                  ) : null}
                </View>
              </View>
            </>
          ) : null}

          {/* Current members */}
          <Text style={styles.sectionTitle}>Members · {members.length}</Text>
          <View style={styles.card}>
            {members.length === 0 ? (
              <Text style={styles.empty}>No members yet.</Text>
            ) : (
              members.map((m, i) => (
                <View key={String(m.user_id)} style={[styles.row, i < members.length - 1 && styles.rowBorder]}>
                  <Avatar uid={m.user_id} name={m.name} size={34} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {m.name || "Investor"}
                    </Text>
                    {m.role ? <Text style={styles.rowMeta}>{m.role}</Text> : null}
                  </View>
                  {isOwner && m.user_id !== user?.uid ? (
                    busy === `rm-${m.user_id}` ? (
                      <ActivityIndicator color={colors.accent} />
                    ) : (
                      <Pressable
                        style={styles.iconBtn}
                        onPress={() => run(`rm-${m.user_id}`, () => removeGroupMember(id, m.user_id), "Removed")}
                      >
                        <Ionicons name="person-remove-outline" size={18} color={colors.muted} />
                      </Pressable>
                    )
                  ) : null}
                </View>
              ))
            )}
          </View>

          {/* Add members — server-computed eligibility */}
          {isOwner ? (
            <>
              <Text style={styles.sectionTitle}>Add members</Text>
              <View style={styles.card}>
                {eligible.length === 0 ? (
                  <Text style={styles.empty}>Nobody eligible to add right now.</Text>
                ) : (
                  eligible.map((p, i) => (
                    <View key={String(p.id)} style={[styles.row, i < eligible.length - 1 && styles.rowBorder]}>
                      <Avatar uid={p.id} name={p.full_name} size={34} />
                      <Text style={styles.rowName} numberOfLines={1}>
                        {p.full_name || p.username || "Investor"}
                      </Text>
                      {busy === `add-${p.id}` ? (
                        <ActivityIndicator color={colors.accent} />
                      ) : (
                        <Pressable
                          style={styles.approveBtn}
                          onPress={() => run(`add-${p.id}`, () => addGroupMembers(id, [p.id]), "Added")}
                        >
                          <Text style={styles.approveText}>Add</Text>
                        </Pressable>
                      )}
                    </View>
                  ))
                )}
              </View>
            </>
          ) : null}

          {/* Settings (owner only) */}
          {isOwner ? (
            <>
              <Text style={styles.sectionTitle}>Settings</Text>
              <View style={styles.card}>
                <Text style={styles.label}>Name</Text>
                <TextInput style={styles.input} value={name} onChangeText={setName} placeholderTextColor={colors.muted} />
                <Text style={[styles.label, { marginTop: 12 }]}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  placeholderTextColor={colors.muted}
                />
                <Pressable
                  style={styles.saveBtn}
                  onPress={() => run("settings", () => updateCircleSettings(id, name.trim(), description.trim()))}
                  disabled={busy === "settings"}
                >
                  {busy === "settings" ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save</Text>}
                </Pressable>
              </View>
            </>
          ) : null}

          {/* Destructive */}
          <Text style={styles.sectionTitle}>Danger zone</Text>
          {isOwner ? (
            <Pressable
              style={styles.dangerBtn}
              onPress={() =>
                confirmDestructive("Delete this Circle?", "Members lose access to its shared ideas. This can't be undone.", async () => {
                  const ok = await deleteGroup(id);
                  if (ok && mounted.current) router.back();
                })
              }
            >
              <Ionicons name="trash-outline" size={17} color={colors.loss} />
              <Text style={styles.dangerText}>Delete Circle</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.dangerBtn}
              onPress={() =>
                confirmDestructive("Leave this Circle?", "You'll stop seeing ideas shared with it.", async () => {
                  const ok = await exitGroup(id);
                  if (ok && mounted.current) router.back();
                })
              }
            >
              <Ionicons name="exit-outline" size={17} color={colors.loss} />
              <Text style={styles.dangerText}>Leave Circle</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
  topTitle: { flex: 1, textAlign: "center", color: colors.ink, fontFamily: fonts.bold, fontSize: 17 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 15, marginTop: 18, marginBottom: 8 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  inviteLink: { color: colors.inkSoft, fontFamily: fonts.regular, fontSize: 13, marginBottom: 10 },
  inviteActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowName: { flex: 1, color: colors.ink, fontFamily: fonts.semibold, fontSize: 14 },
  rowMeta: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 1 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  approveBtn: { backgroundColor: colors.accent, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 7 },
  approveText: { color: "#fff", fontFamily: fonts.bold, fontSize: 12 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  empty: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, paddingVertical: 10 },
  label: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 13, marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.surface,
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 11,
    color: colors.ink,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  textarea: { minHeight: 70, textAlignVertical: "top" },
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: 11,
    paddingVertical: 12,
    alignItems: "center",
    marginVertical: 12,
  },
  saveText: { color: "#fff", fontFamily: fonts.bold, fontSize: 15 },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.lossSoft,
    borderRadius: 12,
    paddingVertical: 14,
  },
  dangerText: { color: colors.loss, fontFamily: fonts.bold, fontSize: 15 },
  msg: { color: colors.accentInk, fontFamily: fonts.semibold, fontSize: 13, marginBottom: 8, textAlign: "center" },
});

export default withBoundary(ManageCircleScreen, "Manage Circle");
