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
  Image,
} from "react-native";
import { useAuth } from "../../src/context/AuthContext";
import { colors, fonts } from "../../src/theme/colors";

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError("Enter your email and password");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await login(email.trim(), password);
      // Navigation to (tabs) happens automatically in app/_layout.js once
      // AuthContext's onAuthStateChanged fires.
    } catch (e) {
      // Same generic message as web LoginPage.jsx — Firebase Email
      // Enumeration Protection makes a more specific hint unreliable
      // (see CLAUDE_HANDOVER.md 10a) — don't try to work around it here.
      setError("Incorrect email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        <Image
          source={require("../../assets/icon.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>myInvestorCircle</Text>
        <Text style={styles.subtitle}>Sign in to your circle</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={styles.button} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  logo: { width: 72, height: 72, alignSelf: "center", marginBottom: 16, borderRadius: 16 },
  title: { fontSize: 26, fontFamily: fonts.extrabold, color: colors.ink, textAlign: "center" },
  subtitle: { fontSize: 15, fontFamily: fonts.regular, color: colors.muted, textAlign: "center", marginTop: 6, marginBottom: 32 },
  form: { gap: 12 },
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
  error: { color: colors.loss, fontFamily: fonts.semibold, fontSize: 14 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 4,
  },
  buttonText: { color: "#fff", fontSize: 16, fontFamily: fonts.bold },
});
