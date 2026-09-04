import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { checkUsername, saveUsername } from "../services/api/profileApi";
import { colors, fonts } from "../theme/colors";
import { WEB_ORIGIN } from "../utils/links";

export { setupIncomplete } from "../utils/setup";

/**
 * Username + consent, required before the account can be used.
 *
 * WHY: the web has had this since setup stopped being a skippable nudge
 * (features/onboarding/Onboarding.jsx — MandatorySetupGate). The app did not,
 * and the hole it left is Google sign-in: that flow has no signup form, so it
 * produces an account with NO username and NO recorded consent, and the app
 * dropped straight into the feed with both missing.
 *
 * The condition that opens this lives in src/utils/setup.js — see there for
 * why it deliberately decides nothing from an unverified profile.
 */
const USERNAME_RE = /^[a-z0-9_]{5,20}$/;
// Read from the web rather than copied into the app: it is a legal document
// that has to match word for word, and a second copy would drift.
const PRIVACY_URL = `${WEB_ORIGIN}/#/privacy`;

export default function SetupGate({ profile, patchProfile }) {
  const [username, setUsername] = useState(profile?.username || "");
  const [status, setStatus] = useState("idle"); // idle | invalid | checking | available | taken
  const [terms, setTerms] = useState(!!profile?.consent_terms_accepted);
  const [data, setData] = useState(!!profile?.consent_data_accepted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // Someone who already has a username but is missing only consent must not
  // be asked to prove their own name is free — it is theirs.
  const keepingOwnName = !!profile?.username && username.trim().toLowerCase() === profile.username;

  useEffect(() => {
    const u = username.trim().toLowerCase();
    if (keepingOwnName) { setStatus("available"); return; }
    if (!u) { setStatus("idle"); return; }
    if (!USERNAME_RE.test(u)) { setStatus("invalid"); return; }
    setStatus("checking");
    const t = setTimeout(async () => {
      const free = await checkUsername(u, profile?.id);
      if (mounted.current) setStatus(free ? "available" : "taken");
    }, 500);
    return () => clearTimeout(t);
  }, [username, keepingOwnName, profile?.id]);

  const canContinue = status === "available" && terms && data && !busy;

  const submit = async () => {
    if (!canContinue) return;
    setBusy(true);
    setError("");
    const u = username.trim().toLowerCase();
    const err = await saveUsername(u, { terms, data });
    if (!mounted.current) return;
    setBusy(false);
    if (err) { setError(err); return; }
    // Reflect it locally so this gate closes immediately rather than waiting
    // for the next profile fetch.
    patchProfile({ username: u, consent_terms_accepted: true, consent_data_accepted: true });
  };

  return (
    <SafeAreaView style={styles.flex}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Just one more thing</Text>
          <Text style={styles.subtitle}>
            Pick the handle your ideas will be published under, and confirm you're okay with how
            myInvestorCircle works. You can fill in the rest of your profile any time.
          </Text>

          <Text style={styles.label}>Your username</Text>
          <View style={styles.unRow}>
            <Text style={styles.at}>@</Text>
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
          <Text
            style={[
              styles.hint,
              status === "taken" || status === "invalid" ? { color: colors.loss } : null,
              status === "available" ? { color: colors.gain } : null,
            ]}
          >
            {status === "invalid"
              ? "5–20 lowercase letters, numbers or underscores."
              : status === "taken"
              ? "That username is taken."
              : status === "checking"
              ? "Checking…"
              : status === "available"
              ? `@${username.trim().toLowerCase()} is yours.`
              : "5–20 lowercase letters, numbers or underscores."}
          </Text>

          <View style={{ gap: 12, marginTop: 20 }}>
            <Check checked={terms} onToggle={() => setTerms((v) => !v)}>
              I agree to the Terms of Service and{" "}
              <Text style={styles.link} onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL).catch(() => {})}>
                Privacy Policy
              </Text>
            </Check>
            <Check checked={data} onToggle={() => setData((v) => !v)}>
              I consent to myInvestorCircle storing and publicly displaying my investment ideas
            </Check>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.btn, !canContinue && styles.btnOff]}
            onPress={submit}
            disabled={!canContinue}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Agree & continue</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Check({ checked, onToggle, children }) {
  return (
    <Pressable
      style={styles.checkRow}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={[styles.box, checked && styles.boxOn]}>
        {checked ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
      </View>
      <Text style={styles.checkText}>
        {children} <Text style={styles.star}>*</Text>
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 24, paddingTop: 48 },
  title: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 22 },
  subtitle: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 22, marginTop: 8 },
  label: { color: colors.muted, fontFamily: fonts.bold, fontSize: 12, marginTop: 26, marginBottom: 7 },
  unRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  at: { color: colors.muted, fontFamily: fonts.bold, fontSize: 17 },
  input: {
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.surface,
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: colors.ink,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  hint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 7 },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  box: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.line2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkText: { flex: 1, color: colors.inkSoft, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 },
  link: { color: colors.accentInk, fontFamily: fonts.bold, textDecorationLine: "underline" },
  star: { color: colors.loss, fontFamily: fonts.bold },
  error: { color: colors.loss, fontFamily: fonts.semibold, fontSize: 13, marginTop: 14 },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
  },
  btnOff: { opacity: 0.45 },
  btnText: { color: "#fff", fontFamily: fonts.bold, fontSize: 15 },
});
