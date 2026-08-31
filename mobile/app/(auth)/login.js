import { useState } from "react";
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
import { useAuth } from "../../src/context/AuthContext";
import { pwValid, pwCheck, USERNAME_RE, requestPasswordReset } from "../../src/services/api/authApi";
import { isGoogleSignInConfigured } from "../../src/services/googleAuth";
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

export default function LoginScreen() {
  const { login, signup } = useAuth();
  const [tab, setTab] = useState("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = (next) => {
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
      // Navigation happens in app/_layout.js once onAuthStateChanged fires.
    } catch (e) {
      // Same generic message as the web LoginPage — Firebase's email
      // enumeration protection makes a specific hint unreliable.
      setError("Incorrect email or password");
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

    setError("");
    setLoading(true);
    try {
      const res = await signup({ email, password, firstName, lastName, username });
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
