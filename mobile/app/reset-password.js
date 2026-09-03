import { useCallback, useEffect, useRef, useState } from "react";
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { auth } from "../src/config/firebase";
import { pwValid, pwCheck } from "../src/services/api/authApi";
import { colors, fonts } from "../src/theme/colors";
import { withBoundary } from "../src/components/ErrorBoundary";

/**
 * Choose a new password, from the link api/reset.py emails out.
 *
 * WHY THIS SCREEN EXISTS: the Android intent filter claims every link to
 * myinvestorcircle.com (app.json, autoVerify, no path restriction), and the
 * reset link is `https://myinvestorcircle.com/?mode=resetPassword&oobCode=…`.
 * So on any phone with the app installed, tapping the reset email opened the
 * app — which did not understand the link and did nothing. Password reset was
 * unreachable from that phone entirely, including for people who only use the
 * web app. The app had taken over the link without being a destination for it.
 *
 * Mirrors src/features/auth/ResetPasswordPage.jsx: same Firebase calls, same
 * password rules, same messages for an expired or already-used link.
 *
 * Deliberately reachable while SIGNED OUT — resetting a password is what you
 * do when you cannot sign in — so it sits outside the (auth) group and the
 * root layout's redirect skips it.
 */
function ResetPasswordScreen() {
  const router = useRouter();
  const { oobCode } = useLocalSearchParams();
  const code = String(oobCode || "");

  // The code is verified BEFORE showing the form. Otherwise someone types a
  // new password twice, presses the button, and only then learns the link
  // expired — and the link is single-use, so that is a wasted round trip
  // through their inbox.
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    if (!code) {
      setChecking(false);
      setError("This reset link is incomplete. Please request a new one.");
      return;
    }
    verifyPasswordResetCode(auth, code)
      .then((addr) => {
        if (!mounted.current) return;
        setEmail(addr || "");
        setChecking(false);
      })
      .catch((e) => {
        if (!mounted.current) return;
        setChecking(false);
        setError(linkError(e?.code));
      });
  }, [code]);

  const submit = useCallback(async () => {
    if (!pwValid(newPw)) return setError("Password must be 6–25 characters with a letter and a number.");
    if (newPw !== confirmPw) return setError("Passwords do not match.");
    setError("");
    setBusy(true);
    try {
      await confirmPasswordReset(auth, code, newPw);
      if (mounted.current) setDone(true);
    } catch (e) {
      if (mounted.current) setError(linkError(e?.code));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [code, newPw, confirmPw]);

  const rules = pwCheck(newPw);
  const blocked = !!error && (checking || (!email && !done));

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.badge}>
            <Text style={styles.badgeEmoji}>🔐</Text>
          </View>
          <Text style={styles.title}>
            {done ? "Password updated" : blocked ? "Link no longer valid" : "Choose a new password"}
          </Text>
          <Text style={styles.subtitle}>
            {done
              ? "You can now sign in with your new password."
              : blocked
              ? error
              : email
              ? `For ${email}`
              : "Enter a new password for your myInvestorCircle account."}
          </Text>

          {checking ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 28 }} />
          ) : done || blocked ? (
            <Pressable style={styles.primaryBtn} onPress={() => router.replace("/(auth)/login")}>
              <Text style={styles.primaryText}>{done ? "Sign in" : "Back to sign in"}</Text>
            </Pressable>
          ) : (
            <View style={styles.form}>
              <View style={styles.pwRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="New password"
                  placeholderTextColor={colors.muted}
                  value={newPw}
                  onChangeText={setNewPw}
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable onPress={() => setShowPw((s) => !s)} hitSlop={10} style={styles.eye}>
                  <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={20} color={colors.muted} />
                </Pressable>
              </View>
              <TextInput
                style={styles.input}
                placeholder="Confirm new password"
                placeholderTextColor={colors.muted}
                value={confirmPw}
                onChangeText={setConfirmPw}
                secureTextEntry={!showPw}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <View style={styles.rules}>
                {[
                  [rules.length, "6–25 characters"],
                  [rules.hasLetter, "Contains a letter"],
                  [rules.hasNumber, "Contains a number"],
                ].map(([ok, label]) => (
                  <View key={label} style={styles.ruleRow}>
                    <Ionicons
                      name={ok ? "checkmark-circle" : "ellipse-outline"}
                      size={15}
                      color={ok ? colors.gain : colors.muted}
                    />
                    <Text style={[styles.ruleText, ok && { color: colors.ink }]}>{label}</Text>
                  </View>
                ))}
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable style={[styles.primaryBtn, busy && { opacity: 0.7 }]} onPress={submit} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Update password</Text>}
              </Pressable>

              <Pressable onPress={() => router.replace("/(auth)/login")} style={styles.backLink}>
                <Text style={styles.backText}>Back to sign in</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Same wording as the web's ResetPasswordPage — a reset link is single-use
// and time-limited, and "expired or already used" is the one failure people
// actually hit, so it must not be hidden behind a generic message.
function linkError(code) {
  if (code === "auth/invalid-action-code" || code === "auth/expired-action-code") {
    return "This reset link has expired or has already been used. Please request a new one.";
  }
  if (code === "auth/weak-password") return "Password must be at least 6 characters.";
  if (code === "auth/user-disabled") return "This account is not active. Please contact support.";
  return "Something went wrong. Please try again, or request a new reset link.";
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 24, paddingTop: 40, alignItems: "center" },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  badgeEmoji: { fontSize: 26 },
  title: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 21, textAlign: "center" },
  subtitle: {
    color: colors.muted,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 6,
    maxWidth: 340,
  },
  form: { width: "100%", maxWidth: 420, marginTop: 24, gap: 12 },
  pwRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  eye: { padding: 4 },
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
  rules: { gap: 6, marginTop: 2 },
  ruleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  ruleText: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12.5 },
  error: { color: colors.loss, fontFamily: fonts.semibold, fontSize: 13, lineHeight: 19 },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 11,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 10,
    minWidth: 220,
  },
  primaryText: { color: "#fff", fontFamily: fonts.bold, fontSize: 15 },
  backLink: { alignItems: "center", paddingVertical: 12 },
  backText: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 13 },
});

export default withBoundary(ResetPasswordScreen, "Reset password");
