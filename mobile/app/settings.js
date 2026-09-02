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
import { saveProfileEdit, uploadAvatar } from "../src/services/api/profileApi";
import { pickAndCompressAvatar } from "../src/services/avatarImage";
import Avatar from "../src/components/Avatar";
import { setCachedAvatar } from "../src/services/avatarCache";
import {
  profileToForm,
  buildProfilePayload,
  validateProfile,
  isSebiStatus,
  REG_STATUSES,
  REG_LABELS,
} from "../src/utils/profile";
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
  const { profile, patchProfile } = useAuth();

  // One form object rather than a state variable per field: profile-edit-save
  // is a whole-record write, so the payload must always carry every field
  // (see src/utils/profile.js). Keeping them together makes that natural.
  const [form, setForm] = useState(() => profileToForm(profile));
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState("");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState("");
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  // Re-seed once the profile arrives (it can be null on first render).
  useEffect(() => {
    if (profile) setForm(profileToForm(profile));
  }, [profile]);

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
    const problem = validateProfile(form);
    if (problem) {
      setNameMsg(problem);
      return;
    }
    setSavingName(true);
    setNameMsg("");
    try {
      const saved = await saveProfileEdit(buildProfilePayload(form));
      if (!mounted.current) return;
      // Reflect the server's own row back into context so the rest of the app
      // (avatar initials, display name) updates without a reload.
      if (saved) patchProfile(saved);
      setNameMsg("Saved");
    } catch (e) {
      if (mounted.current) setNameMsg(e?.message || "Could not save");
    } finally {
      if (mounted.current) setSavingName(false);
    }
  }, [form, patchProfile]);

  // Picture upload is its own action, not part of the profile save: it writes
  // a different column through a different endpoint, and making someone press
  // Save afterwards to keep a picture they just chose would be surprising.
  const changePhoto = useCallback(async () => {
    setAvatarMsg("");
    const picked = await pickAndCompressAvatar();
    if (picked.cancelled) return;
    if (picked.error) {
      setAvatarMsg(picked.error);
      return;
    }
    setAvatarBusy(true);
    try {
      const url = await uploadAvatar(picked.dataUrl);
      if (!mounted.current) return;
      // Reflect it into context immediately so every avatar in the app —
      // and the web, on its next load — shows the new picture.
      patchProfile({ avatar_url: url });
      // Seed the shared cache too: everywhere else in the app renders this
      // user by uid (feed cards, member lists), so without this their own
      // new picture would not appear on their own ideas until the cache
      // next refreshed.
      setCachedAvatar(profile?.id, url);
      setAvatarMsg("Photo updated");
    } catch (e) {
      if (mounted.current) setAvatarMsg(e?.message || "Could not upload image");
    } finally {
      if (mounted.current) setAvatarBusy(false);
    }
  }, [patchProfile, profile?.id]);

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
          <Text style={styles.sectionTitle}>Your profile</Text>
          <View style={styles.card}>
            <View style={styles.photoRow}>
              <Avatar profile={profile} size={64} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Pressable onPress={changePhoto} disabled={avatarBusy}>
                  {avatarBusy ? (
                    <ActivityIndicator color={colors.accent} style={{ alignSelf: "flex-start" }} />
                  ) : (
                    <Text style={styles.photoLink}>
                      {profile?.avatar_url ? "Change photo" : "Add a photo"}
                    </Text>
                  )}
                </Pressable>
                <Text style={styles.photoHint}>Square, up to 8MB. It's resized before upload.</Text>
                {avatarMsg ? (
                  <Text
                    style={[
                      styles.photoMsg,
                      avatarMsg === "Photo updated" ? { color: colors.gain } : { color: colors.loss },
                    ]}
                  >
                    {avatarMsg}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="First name"
                placeholderTextColor={colors.muted}
                value={form.firstName}
                onChangeText={set("firstName")}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Last name"
                placeholderTextColor={colors.muted}
                value={form.lastName}
                onChangeText={set("lastName")}
              />
            </View>
            {profile?.username ? <Text style={styles.readonly}>@{profile.username}</Text> : null}

            <Text style={styles.fieldLabel}>Bio</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="A line about how you invest"
              placeholderTextColor={colors.muted}
              value={form.bio}
              onChangeText={set("bio")}
              multiline
              maxLength={500}
            />
            <Text style={styles.counter}>{form.bio.length}/500</Text>

            <Text style={styles.fieldLabel}>Links</Text>
            {[
              ["twitter", "X / Twitter URL"],
              ["linkedin", "LinkedIn URL"],
              ["telegram", "Telegram URL"],
              ["instagram", "Instagram URL"],
            ].map(([key, ph]) => (
              <TextInput
                key={key}
                style={styles.input}
                placeholder={ph}
                placeholderTextColor={colors.muted}
                value={form[key]}
                onChangeText={set(key)}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            ))}

            <Text style={styles.fieldLabel}>You are</Text>
            <View style={styles.chips}>
              {REG_STATUSES.map((st) => {
                const on = form.registrationStatus === st;
                return (
                  <Pressable
                    key={st}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => set("registrationStatus")(st)}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{REG_LABELS[st]}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* SEBI details only apply to a registered status. Changing to one
                puts the account back into review server-side, so say that
                rather than letting the badge silently disappear. */}
            {isSebiStatus(form.registrationStatus) ? (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="SEBI registration number"
                  placeholderTextColor={colors.muted}
                  value={form.sebiNum}
                  onChangeText={set("sebiNum")}
                  autoCapitalize="characters"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Valid till (YYYY-MM-DD)"
                  placeholderTextColor={colors.muted}
                  value={form.sebiTill}
                  onChangeText={set("sebiTill")}
                  autoCapitalize="none"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Firm name"
                  placeholderTextColor={colors.muted}
                  value={form.sebiFirm}
                  onChangeText={set("sebiFirm")}
                />
                <Text style={styles.note}>
                  Changing your registration status sends it for verification again.
                </Text>
              </>
            ) : null}
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
  photoRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 },
  photoLink: { color: colors.accentInk, fontFamily: fonts.bold, fontSize: 14 },
  photoHint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, marginTop: 3, lineHeight: 15 },
  photoMsg: { fontFamily: fonts.semibold, fontSize: 12, marginTop: 5 },
  fieldLabel: { color: colors.muted, fontFamily: fonts.bold, fontSize: 12, marginTop: 14, marginBottom: 6 },
  multiline: { minHeight: 78, textAlignVertical: "top", paddingTop: 10 },
  counter: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, textAlign: "right", marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.bg,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 12 },
  chipTextOn: { color: "#fff" },
  note: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16, marginTop: 8 },
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
