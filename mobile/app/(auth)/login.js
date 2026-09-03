import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useAuth } from "../../src/context/AuthContext";
import { pwValid, pwCheck, USERNAME_RE, requestPasswordReset } from "../../src/services/api/authApi";
import { fetchSignInMethodsForEmail } from "firebase/auth";
import { auth } from "../../src/config/firebase";
import { friendlyAuthError, googleOnlyAccountHint } from "../../src/utils/authErrors";
import { isGoogleSignInConfigured } from "../../src/services/googleAuth";
import { pendingReferral } from "../../src/services/referral";
import { track } from "../../src/services/analytics";
import GoogleSignInButton from "../../src/components/GoogleSignInButton";
import { colors, fonts, GRADIENT } from "../../src/theme/colors";

// Three modes, mirroring the web LoginPage: sign in, create account, forgot
// password. Validation rules (password shape, username shape) are the same
// ones the server enforces, so the UI fails fast with the same message
// rather than round-tripping to a 400.
const TABS = [
  ["login", "Sign in"],
  ["signup", "Create account"],
];

// The privacy policy is a legal document that must match the web's word for
// word, so it is READ from the web rather than copied into the app, where a
// second copy would quietly drift out of date. A Custom Tab, not
// Linking.openURL: Android would route our own https link straight back into
// this app (see the intent filter in app.json).
const PRIVACY_URL = "https://myinvestorcircle.com/#/privacy";
const openPrivacy = () => WebBrowser.openBrowserAsync(PRIVACY_URL).catch(() => {});

function Consent({ checked, onToggle, children }) {
  return (
    <Pressable
      style={styles.consentRow}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={[styles.checkbox, checked && styles.checkboxOn]}>
        {checked ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
      </View>
      <Text style={styles.consentText}>
        {children} <Text style={styles.consentStar}>*</Text>
      </Text>
    </Pressable>
  );
}

export default function LoginScreen() {
  const { login, signup } = useAuth();
  const [tab, setTab] = useState("login");

  // Someone who arrived through an invite link is here to JOIN, not to sign
  // in, so open on Create account and say who invited them — the same two
  // things the web's LoginPage does with its stored code. The lookup is
  // async (AsyncStorage), so unlike the web this cannot be the initial state;
  // switching tabs once it resolves would yank the form out from under
  // someone who started typing, hence the "untouched" guard below.
  const [referrer, setReferrer] = useState(null);
  const touched = useRef(false);
  useEffect(() => {
    let cancelled = false;
    pendingReferral().then((code) => {
      if (cancelled || !code) return;
      setReferrer(code);
      if (!touched.current) setTab("signup");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Consent is COLLECTED, not assumed. completeSignup() used to post
  // consentTerms/consentData as hardcoded `true` while the form never asked
  // for either — the account recorded an agreement its owner was never shown.
  // The web asks for both (LoginPage.jsx step 2) and does not create the
  // Firebase account until they are ticked; so does this now.
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentData, setConsentData] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = (next) => {
    touched.current = true; // an explicit choice outranks the invite default
    setTab(next);
    setError("");
    setNotice("");
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) return setError("Enter your email and password");
    setError("");
    setLoading(true);
    try {
      await login(email.trim(), password);
      // Same event name and `method` value the web sends, so one funnel
      // covers both clients rather than two that have to be unioned by hand.
      track("login", { method: "email" });
      // Navigation happens in app/_layout.js once onAuthStateChanged fires.
    } catch (e) {
      // If this email has no password sign-in method (the account was created
      // with Google), "incorrect password" is true but useless — there is no
      // password to get right. Give the targeted hint instead, mirroring the
      // web LoginPage's handleLogin.
      //
      // Best-effort by design: with Firebase's email-enumeration protection
      // enabled this returns [] and we fall through to the generic message,
      // which is the correct outcome rather than a bug to work around.
      let message = friendlyAuthError(e?.code);
      if (
        e?.code === "auth/user-not-found" ||
        e?.code === "auth/invalid-credential" ||
        e?.code === "auth/wrong-password"
      ) {
        try {
          const methods = await fetchSignInMethodsForEmail(auth, email.trim());
          const hint = googleOnlyAccountHint(methods, isGoogleSignInConfigured);
          if (hint) message = hint;
        } catch (_) {
          /* keep the generic message */
        }
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!firstName.trim()) return setError("First name is required.");
    if (!USERNAME_RE.test(username.trim()))
      return setError("Username must be 5–20 characters: lowercase letters, numbers or underscore.");
    if (!email.trim()) return setError("Email address is required.");
    if (!pwValid(password)) return setError("Password must be 6–25 characters with a letter and a number.");
    if (password !== confirmPassword) return setError("Passwords do not match.");
    if (!consentTerms || !consentData) return setError("Please accept both statements to continue.");

    setError("");
    setLoading(true);
    try {
      const res = await signup({ email, password, firstName, lastName, username, consentTerms, consentData });
      track("sign_up", { method: "email" });
      if (!res.ok) {
        setError(
          res.status === 409
            ? "That username is already taken."
            : "Account created, but saving your profile failed. You can finish setup in the app."
        );
      }
      // Signed-in either way — _layout.js routes onward.
    } catch (e) {
      const code = e?.code || "";
      setError(
        code.includes("email-already-in-use")
          ? "An account with that email already exists."
          : code.includes("invalid-email")
          ? "That email address doesn't look right."
          : "Sign up failed. Please check your details and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    if (!email.trim()) return setError("Enter your account email.");
    setError("");
    setLoading(true);
    await requestPasswordReset(email);
    track("password_reset_requested");
    setLoading(false);
    // Always the same confirmation — the server never reveals whether the
    // address exists (anti-enumeration), so neither does this screen.
    setNotice("If that email has an account, a reset link is on its way.");
  };

  const pw = pwCheck(password);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Image source={require("../../assets/icon.png")} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>myInvestorCircle</Text>
        <Text style={styles.subtitle}>
          {tab === "forgot" ? "Reset your password" : "Private investing with people you trust"}
        </Text>

        {referrer && tab !== "forgot" ? (
          <View style={styles.inviteBanner}>
            <Text style={styles.inviteEmoji}>🎁</Text>
            <Text style={styles.inviteText}>
              <Text style={styles.inviteStrong}>@{referrer}</Text> invited you. Create your account and
              you'll be connected automatically.
            </Text>
          </View>
        ) : null}

        {tab !== "forgot" ? (
          <View style={styles.seg}>
            {TABS.map(([id, label]) => {
              const active = tab === id;
              return (
                <Pressable key={id} style={[styles.segBtn, active && styles.segBtnActive]} onPress={() => reset(id)}>
                  <Text style={[styles.segText, active && styles.segTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={styles.form}>
          {tab === "signup" ? (
            <>
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
              <TextInput
                style={styles.input}
                placeholder="Username (5–20, a–z 0–9 _)"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                value={username}
                onChangeText={(t) => setUsername(t.toLowerCase())}
              />
            </>
          ) : null}

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          {tab !== "forgot" ? (
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={colors.muted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          ) : null}

          {tab === "signup" ? (
            <>
              <TextInput
                style={styles.input}
                placeholder="Confirm password"
                placeholderTextColor={colors.muted}
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
              {password.length > 0 ? (
                <Text style={styles.hint}>
                  {pw.length ? "✓" : "○"} 6–25 characters {"  "}
                  {pw.hasLetter ? "✓" : "○"} a letter {"  "}
                  {pw.hasNumber ? "✓" : "○"} a number
                </Text>
              ) : null}

              {/* Same two statements, in the same words, as the web's step 2.
                  Nothing is pre-ticked and the account is not created until
                  both are. */}
              <Consent checked={consentTerms} onToggle={() => setConsentTerms((v) => !v)}>
                I agree to the Terms of Service and{" "}
                <Text style={styles.consentLink} onPress={openPrivacy}>
                  Privacy Policy
                </Text>
              </Consent>
              <Consent checked={consentData} onToggle={() => setConsentData((v) => !v)}>
                I consent to myInvestorCircle storing and publicly displaying my investment ideas
              </Consent>
            </>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          <Pressable
            onPress={tab === "login" ? handleLogin : tab === "signup" ? handleSignup : handleForgot}
            disabled={loading}
          >
            <LinearGradient
              colors={GRADIENT.colors}
              start={GRADIENT.start}
              end={GRADIENT.end}
              style={[styles.button, loading && { opacity: 0.7 }]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>
                  {tab === "login" ? "Sign in" : tab === "signup" ? "Create account" : "Send reset link"}
                </Text>
              )}
            </LinearGradient>
          </Pressable>

          {/* Only when this build has OAuth client ids configured. The flag
              must gate the COMPONENT, not something inside it: the hook it
              uses throws during render without those ids, which would take
              the whole login screen down with it. Not offered in "forgot
              password" mode, where it makes no sense. */}
          {isGoogleSignInConfigured && tab !== "forgot" ? (
            <GoogleSignInButton disabled={loading} />
          ) : null}

          {tab === "login" ? (
            <Pressable onPress={() => reset("forgot")} style={styles.linkWrap}>
              <Text style={styles.link}>Forgot your password?</Text>
            </Pressable>
          ) : tab === "forgot" ? (
            <Pressable onPress={() => reset("login")} style={styles.linkWrap}>
              <Text style={styles.link}>Back to sign in</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 40 },
  logo: { width: 68, height: 68, alignSelf: "center", marginBottom: 14, borderRadius: 16 },
  title: { fontSize: 25, fontFamily: fonts.extrabold, color: colors.ink, textAlign: "center" },
  subtitle: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.muted,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 22,
  },
  consentRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 4 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.line2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  consentText: { flex: 1, color: colors.inkSoft, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 19 },
  consentLink: { color: colors.accentInk, fontFamily: fonts.bold, textDecorationLine: "underline" },
  consentStar: { color: colors.loss, fontFamily: fonts.bold },
  inviteBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.gainSoft,
    borderWidth: 1,
    borderColor: colors.gain,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  inviteEmoji: { fontSize: 18 },
  inviteText: { flex: 1, color: colors.ink, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  inviteStrong: { fontFamily: fonts.bold, color: colors.accentInk },
  seg: { flexDirection: "row", backgroundColor: colors.surface2, borderRadius: 12, padding: 3, gap: 3, marginBottom: 18 },
  segBtn: { flex: 1, height: 40, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  segBtnActive: { backgroundColor: colors.surface },
  segText: { color: colors.muted, fontFamily: fonts.bold, fontSize: 14 },
  segTextActive: { color: colors.accentInk },
  form: { gap: 12 },
  row: { flexDirection: "row", gap: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.ink,
    fontFamily: fonts.regular,
    fontSize: 16,
  },
  hint: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12 },
  error: { color: colors.loss, fontFamily: fonts.semibold, fontSize: 14 },
  notice: { color: colors.gain, fontFamily: fonts.semibold, fontSize: 14 },
  button: { borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 4 },
  buttonText: { color: "#fff", fontSize: 16, fontFamily: fonts.bold },
  linkWrap: { alignItems: "center", paddingVertical: 8 },
  link: { color: colors.accentInk, fontFamily: fonts.semibold, fontSize: 14 },
});
