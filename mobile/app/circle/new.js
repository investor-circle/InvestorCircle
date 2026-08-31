import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { createGroup } from "../../src/services/api/groupsApi";
import { getMyConnections } from "../../src/services/api/connectionsApi";
import { initialsOf } from "../../src/utils/format";
import { colors, fonts } from "../../src/theme/colors";
import { withBoundary } from "../../src/components/ErrorBoundary";

// Create a Circle. Members are picked from the caller's active connections;
// the server re-validates every id against its own eligibility rules, so this
// list is a convenience, not the authority.
const SWATCHES = ["#6d5df5", "#cf52d8", "#15924e", "#c2453d", "#9a6a16", "#0ea5e9"];

function NewCircleScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [circleType, setCircleType] = useState("private");
  const [color, setColor] = useState(SWATCHES[0]);
  const [connections, setConnections] = useState([]);
  const [selected, setSelected] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      const conns = await getMyConnections();
      if (mounted.current) setConnections((conns || []).filter((c) => c.status === "active"));
    })();
    return () => {
      mounted.current = false;
    };
  }, []);

  const submit = async () => {
    if (!name.trim()) return setError("Give your Circle a name.");
    setError("");
    setSaving(true);
    const memberIds = Object.keys(selected).filter((id) => selected[id]);
    const res = await createGroup({
      name: name.trim(),
      color,
      memberIds,
      circleType,
      description: description.trim(),
    });
    if (!mounted.current) return;
    setSaving(false);
    if (res.ok) router.back();
    else setError(res.error === "not_authorized" ? "You're not allowed to create a Circle." : "Couldn't create. Try again.");
  };

  const memberCount = Object.values(selected).filter(Boolean).length;

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>New Circle</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="Deep Value India"
            placeholderTextColor={colors.muted}
            value={name}
            onChangeText={setName}
          />

          <Text style={[styles.label, { marginTop: 16 }]}>Description</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="What is this Circle about?"
            placeholderTextColor={colors.muted}
            multiline
            value={description}
            onChangeText={setDescription}
          />

          <Text style={[styles.label, { marginTop: 16 }]}>Type</Text>
          <View style={styles.seg}>
            {[
              ["private", "Private", "Only members see its ideas"],
              ["public", "Public", "Discoverable, others can request to join"],
            ].map(([id, lbl]) => {
              const active = circleType === id;
              return (
                <Pressable key={id} style={[styles.segBtn, active && styles.segBtnActive]} onPress={() => setCircleType(id)}>
                  <Text style={[styles.segText, active && styles.segTextActive]}>{lbl}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>
            {circleType === "private"
              ? "Private: ideas are shared only between members."
              : "Public: discoverable, and people can request to join."}
          </Text>

          <Text style={[styles.label, { marginTop: 16 }]}>Colour</Text>
          <View style={styles.swatchRow}>
            {SWATCHES.map((c) => (
              <Pressable
                key={c}
                style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchOn]}
                onPress={() => setColor(c)}
              >
                {color === c ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
              </Pressable>
            ))}
          </View>

          <Text style={[styles.label, { marginTop: 18 }]}>
            Members {memberCount > 0 ? `· ${memberCount} selected` : ""}
          </Text>
          {connections.length === 0 ? (
            <Text style={styles.hint}>You have no connections yet — you can add members later.</Text>
          ) : (
            connections.map((c) => (
              <Pressable
                key={String(c.user_id)}
                style={styles.checkRow}
                onPress={() => setSelected((s) => ({ ...s, [c.user_id]: !s[c.user_id] }))}
              >
                <Ionicons
                  name={selected[c.user_id] ? "checkbox" : "square-outline"}
                  size={22}
                  color={selected[c.user_id] ? colors.accent : colors.muted}
                />
                <View style={styles.miniAvatar}>
                  <Text style={styles.miniAvatarText}>{initialsOf(c.name)}</Text>
                </View>
                <Text style={styles.checkLabel} numberOfLines={1}>
                  {c.name || c.username || "Investor"}
                </Text>
              </Pressable>
            ))
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={[styles.submit, saving && { opacity: 0.7 }]} onPress={submit} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Create Circle</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
  },
  topTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 17 },
  label: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 13, marginBottom: 7 },
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
  textarea: { minHeight: 80, textAlignVertical: "top" },
  seg: { flexDirection: "row", backgroundColor: colors.surface2, borderRadius: 12, padding: 3, gap: 3 },
  segBtn: { flex: 1, height: 40, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  segBtnActive: { backgroundColor: colors.surface },
  segText: { color: colors.muted, fontFamily: fonts.bold, fontSize: 14 },
  segTextActive: { color: colors.accentInk },
  hint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 6 },
  swatchRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  swatch: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  swatchOn: { borderWidth: 2, borderColor: colors.ink },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  checkLabel: { flex: 1, color: colors.ink, fontFamily: fonts.semibold, fontSize: 14 },
  miniAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  miniAvatarText: { color: colors.inkSoft, fontFamily: fonts.bold, fontSize: 10 },
  error: { color: colors.loss, fontFamily: fonts.semibold, fontSize: 13, marginTop: 12 },
  submit: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 20,
  },
  submitText: { color: "#fff", fontFamily: fonts.bold, fontSize: 16 },
});

export default withBoundary(NewCircleScreen, "New Circle");
