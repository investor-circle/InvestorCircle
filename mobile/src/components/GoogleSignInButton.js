import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useGoogleSignIn } from "../services/googleAuth";
import { colors, fonts } from "../theme/colors";

/**
 * "Continue with Google", separated from LoginScreen for one specific
 * reason: useGoogleSignIn() throws during render when this build has no
 * OAuth client ids configured (see the note on that hook). Hooks can't be
 * called conditionally, so the guard has to be a component boundary — the
 * caller renders this only when isGoogleSignInConfigured is true, and in a
 * build where it is false this component is never mounted and the hook is
 * never reached. Email/password sign-in is then completely unaffected.
 */
export default function GoogleSignInButton({ disabled }) {
  const { available, busy, error, signIn } = useGoogleSignIn();

  return (
    <>
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      <Pressable
        style={[styles.btn, (busy || !available) && { opacity: 0.7 }]}
        onPress={signIn}
        disabled={busy || disabled || !available}
      >
        {busy ? (
          <ActivityIndicator color={colors.ink} />
        ) : (
          <>
            <Ionicons name="logo-google" size={18} color={colors.ink} />
            <Text style={styles.btnText}>Continue with Google</Text>
          </>
        )}
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18, marginBottom: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.line },
  dividerText: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 12 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 12,
  },
  btnText: { color: colors.ink, fontFamily: fonts.bold, fontSize: 15 },
  error: { color: colors.loss, fontFamily: fonts.semibold, fontSize: 13, textAlign: "center", marginTop: 10 },
});
