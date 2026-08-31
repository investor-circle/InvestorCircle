import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../src/context/AuthContext";
import { getFeedConfigAndPrefs, setFeedPref } from "../src/services/api/feedApi";
import { computeEffectiveFeedConfig } from "../src/utils/feed";
import { colors, fonts } from "../src/theme/colors";
import { withBoundary } from "../src/components/ErrorBoundary";

// Settings = profile name editing + the feed-source preferences the web app
// exposes on its Sharing page. Options are admin-defined (feed_config_options)
// — this renders whatever the server says is available rather than a
// hardcoded list, and options marked always_on / admin-disabled are shown as
// locked instead of being silently ignored.
function SettingsScreen() {
  const router = useRouter();
  const { profile, updateProfile } = useAuth();

  const [firstName, setFirstName] = useState(profile?.first_name || "");
  const [lastName, setLastName] = useState(profile?.last_name || "");
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState("");

  const [options, setOptions] = useState(null);
  const [prefs, setPrefs] = useState({});
  const [busyKey, setBusyKey] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      const { options: opts, prefs: rows } = await getFeedConfigAndPrefs();
      if (!mounted.current) return;
      setOptions(opts || []);
      const eff = computeEffectiveFeedConfig(opts, rows);
      setPrefs(eff);
    })();
    return () => {
      mounted.current = false;
    };
  }, []);

  const saveName = useCallback(async () => {
    setSavingName(true);
    setNameMsg("");
    const res = await updateProfile(firstName, lastName);
    if (!mounted.current) return;
    setSavingName(false);
    setNameMsg(res?.error ? res.error : "Saved");
  }, [firstName, lastName, updateProfile]);

  const togglePref = useCallback(async (key, next) => {
    setBusyKey(key);
    setPrefs((p) => ({ ...p, [key]: next })); // optimistic
    const ok = await setFeedPref(key, next);
    if (!mounted.current) return;
    if (!ok) setPrefs((p) => ({ ...p, [key]: !next })); // revert on failure
    setBusyKey(null);
  }, []);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 40 }}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>Your name</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="First name"
                placeholderTextColor={colors.muted}
                value={firstName}
                onChangeText={setFirstName}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Last name"
                placeholderTextColor={colors.muted}
                value={lastName}
                onChangeText={setLastName}
              />
            </View>
            {profile?.username ? <Text style={styles.readonly}>@{profile.username}</Text> : null}
            <Pressable style={[styles.saveBtn, savingName && { opacity: 0.7 }]} onPress={saveName} disabled={savingName}>
              {savingName ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save</Text>}
            </Pressable>
            {nameMsg ? (
              <Text style={[styles.msg, nameMsg === "Saved" ? { color: colors.gain } : { color: colors.loss }]}>
                {nameMsg}
              </Text>
            ) : null}
          </View>

          <Text style={styles.sectionTitle}>Feed sources</Text>
          <Text style={styles.sectionSub}>Choose what appears in your Feed.</Text>
          {options === null ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 16 }} />
          ) : options.length === 0 ? (
            <Text style={styles.empty}>Feed options aren't available right now.</Text>
          ) : (
            <View style={styles.card}>
              {options.map((o, i) => {
                const locked = !o.admin_enabled || o.always_on;
                return (
                  <View key={o.key} style={[styles.prefRow, i < options.length - 1 && styles.prefRowBorder]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.prefLabel}>{o.label || o.key}</Text>
                      {o.description ? <Text style={styles.prefDesc}>{o.description}</Text> : null}
                      {locked ? (
                        <Text style={styles.prefLocked}>
                          {!o.admin_enabled ? "Disabled by admin" : "Always on"}
                        </Text>
                      ) : null}
                    </View>
                    {busyKey === o.key ? (
                      <ActivityIndicator color={colors.accent} />
                    ) : (
                      <Switch
                        value={!!prefs[o.key]}
                        disabled={locked}
                        onValueChange={(v) => togglePref(o.key, v)}
                        trackColor={{ true: colors.accent, false: colors.line2 }}
                        thumbColor="#fff"
                      />
                    )}
                  </View>
                );
              })}
            </View>
          )}
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
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
  },
  topTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 17 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 15, marginTop: 8, marginBottom: 6 },
  sectionSub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginBottom: 8 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
  },
  row: { flexDirection: "row", gap: 10 },
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
  readonly: { color: colors.muted, fontFamily: fonts.medium, fontSize: 13, marginTop: 10 },
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: 11,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 12,
  },
  saveText: { color: "#fff", fontFamily: fonts.bold, fontSize: 15 },
  msg: { fontFamily: fonts.semibold, fontSize: 13, marginTop: 8, textAlign: "center" },
  prefRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  prefRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  prefLabel: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 14 },
  prefDesc: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 2, lineHeight: 17 },
  prefLocked: { color: colors.accentInk, fontFamily: fonts.semibold, fontSize: 11, marginTop: 3 },
  empty: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13 },
});

export default withBoundary(SettingsScreen, "Settings");
