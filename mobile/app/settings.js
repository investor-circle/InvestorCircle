import { useCallback, useEffect, useRef, useState } from "react";
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
import { useAuth } from "../src/context/AuthContext";
import {
  saveProfileEdit,
  uploadAvatar,
  checkUsername,
  saveUsername,
  getRegOptions,
} from "../src/services/api/profileApi";
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
import { colors, fonts } from "../src/theme/colors";
import { withBoundary } from "../src/components/ErrorBoundary";

// Settings = profile editing — name, username, bio, links, registration
// status. Feed-source preferences are NOT part of this screen: the web's
// equivalent (ProfileEditModal, src/features/profile/Profile.jsx) has no
// such section — those toggles live only on the web's separate Sharing
// page, which mobile does not have a screen for — so a "Feed sources" block
// here would be a mobile-only addition the web's own Edit Profile disagrees
// with, not a parity feature.
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
  // Username is edited on its own, not as part of the profile record: it goes
  // through a different endpoint with its own availability check, exactly as
  // on the web (Profile.jsx saves it separately from dbSaveProfileEdit).
  const [username, setUsername] = useState(profile?.username || "");
  const [unStatus, setUnStatus] = useState("idle"); // idle|invalid|checking|available|taken
  const [unMsg, setUnMsg] = useState("");
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  // Re-seed once the profile arrives (it can be null on first render).
  useEffect(() => {
    if (profile) setForm(profileToForm(profile));
  }, [profile]);

  useEffect(() => {
    if (profile?.username) setUsername(profile.username);
  }, [profile?.username]);

  // Debounced availability check, mirroring the web's. The caller's own id is
  // excluded so their CURRENT username reads as available to them rather than
  // as taken by themselves.
  useEffect(() => {
    const u = username.trim().toLowerCase();
    if (!u || u === (profile?.username || "")) { setUnStatus("idle"); return; }
    if (!USERNAME_RE.test(u)) { setUnStatus("invalid"); return; }
    setUnStatus("checking");
    const t = setTimeout(async () => {
      const ok = await checkUsername(u, profile?.id);
      if (mounted.current) setUnStatus(ok ? "available" : "taken");
    }, 500);
    return () => clearTimeout(t);
  }, [username, profile?.username, profile?.id]);

  const submitUsername = useCallback(async () => {
    const u = username.trim().toLowerCase();
    if (unStatus !== "available") return;
    setUnMsg("");
    const err = await saveUsername(u);
    if (!mounted.current) return;
    if (err) { setUnMsg(err); return; }
    patchProfile({ username: u });
    setUnStatus("idle");
    setUnMsg("Username updated");
  }, [username, unStatus, patchProfile]);

  // Registration statuses come from the server (registration_status_options),
  // as they do on the web. They were hardcoded here, which worked but meant a
  // status added or relabelled server-side would never appear on the phone.
  // The local constants stay as the offline fallback and as the source of the
  // SEBI/self-directed distinction the form branches on.
  const [regOptions, setRegOptions] = useState(null);
  const [sebiMsg, setSebiMsg] = useState("");

  useEffect(() => {
    getRegOptions()
      .then(({ options: opts, verifyMessage }) => {
        if (!mounted.current) return;
        if (opts?.length) setRegOptions(opts);
        if (verifyMessage) setSebiMsg(verifyMessage);
      })
      .catch(() => {});
  }, []);

  // Server list when we have one, local constants when we don't.
  const regChoices = regOptions
    ? regOptions.map((o) => ({ code: o.code, label: o.label }))
    : REG_STATUSES.map((code) => ({ code, label: REG_LABELS[code] }));

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
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

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
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
            <Text style={styles.fieldLabel}>Username</Text>
            {/* Once set, a username cannot be changed — matching the web
                (ProfileEditModal shows a read-only "@handle" plus "cannot be
                changed once set" once username is set, and only offers an
                editable input for someone who has never had one). Mobile
                previously left this editable unconditionally. */}
            {profile?.username ? (
              <View style={styles.unRow}>
                <Text style={styles.unAt}>@</Text>
                <Text style={styles.readonly}>{profile.username}</Text>
              </View>
            ) : (
              <>
                <View style={styles.unRow}>
                  <Text style={styles.unAt}>@</Text>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="yourname"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={username}
                    onChangeText={(v) => setUsername(v.toLowerCase())}
                  />
                </View>
                {unStatus === "invalid" ? (
                  <Text style={styles.unBad}>5–20 lowercase letters, numbers or underscores.</Text>
                ) : unStatus === "taken" ? (
                  <Text style={styles.unBad}>That username is taken.</Text>
                ) : unStatus === "checking" ? (
                  <Text style={styles.unHint}>Checking…</Text>
                ) : unStatus === "available" ? (
                  <Pressable style={styles.unSave} onPress={submitUsername}>
                    <Text style={styles.unSaveText}>Save @{username.trim().toLowerCase()}</Text>
                  </Pressable>
                ) : null}
                {unMsg ? <Text style={styles.unHint}>{unMsg}</Text> : null}
                <Text style={styles.unHint}>Choose carefully — your username cannot be changed once set.</Text>
              </>
            )}

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
              {regChoices.map(({ code, label }) => {
                const on = form.registrationStatus === code;
                return (
                  <Pressable
                    key={code}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => set("registrationStatus")(code)}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {sebiMsg && isSebiStatus(form.registrationStatus) ? (
              <Text style={styles.unHint}>{sebiMsg}</Text>
            ) : null}

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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Same rule the server enforces (USERNAME_RE in api/_lib/handlers/lookups.js);
// mirrored here so the form can say what's wrong before a round-trip.
const USERNAME_RE = /^[a-z0-9_]{5,20}$/;

const styles = StyleSheet.create({
  unRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  unAt: { color: colors.muted, fontFamily: fonts.bold, fontSize: 16 },
  unBad: { color: colors.loss, fontFamily: fonts.regular, fontSize: 12, marginTop: 6 },
  unHint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 6 },
  unSave: {
    alignSelf: "flex-start",
    marginTop: 8,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  unSaveText: { color: "#fff", fontFamily: fonts.bold, fontSize: 13 },
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
