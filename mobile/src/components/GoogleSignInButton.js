import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Modal, TextInput } from "react-native";
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
 *
 * Also hosts the account-link prompt: when the chosen Google email already
 * has an email/password account, Firebase refuses to merge them silently, so
 * we ask for that account's password and link the two — matching the web
 * app, and leaving the user with one profile rather than two.
 */
export default function GoogleSignInButton({ disabled }) {
  const { available, busy, error, signIn, linkPending, linkAccount, cancelLink } = useGoogleSignIn();
  const [password, setPassword] = useState("");

  // Never keep a typed password around after the prompt closes.
  useEffect(() => {
    if (!linkPending) setPassword("");
  }, [linkPending]);

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
        {busy && !linkPending ? (
          <ActivityIndicator color={colors.ink} />
        ) : (
          <>
            <Ionicons name="logo-google" size={18} color={colors.ink} />
            <Text style={styles.btnText}>Continue with Google</Text>
          </>
        )}
      </Pressable>

      {error && !linkPending ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={!!linkPending} animationType="slide" transparent onRequestClose={cancelLink}>
        <Pressable style={styles.backdrop} onPress={cancelLink} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <Text style={styles.title}>Connect your Google account</Text>
          <Text style={styles.body}>
            <Text style={styles.email}>{linkPending?.email}</Text> already has a myInvestorCircle account with a
            password. Enter that password once and we'll connect the two, so you can use either from now on.
          </Text>

          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Your existing password"
            placeholderTextColor={colors.muted}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            autoFocus
            onSubmitEditing={() => password && linkAccount(password)}
            returnKeyType="go"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.primary, (!password || busy) && styles.primaryOff]}
            onPress={() => linkAccount(password)}
            disabled={!password || busy}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Connect accounts</Text>}
          </Pressable>

          <Pressable onPress={cancelLink} style={styles.cancel} disabled={busy}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>

          <Text style={styles.note}>
            Forgot it? Cancel, then use "Forgot your password?" to reset it first.
          </Text>
        </View>
      </Modal>
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

  backdrop: { flex: 1, backgroundColor: "rgba(13,14,30,0.5)" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 30,
    paddingTop: 8,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line2, alignSelf: "center", marginBottom: 14 },
  title: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 18, marginBottom: 8 },
  body: { color: colors.inkSoft, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, marginBottom: 14 },
  email: { fontFamily: fonts.bold, color: colors.ink },
  input: {
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.ink,
    fontFamily: fonts.semibold,
    fontSize: 15,
    backgroundColor: colors.bg,
  },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 14,
  },
  primaryOff: { opacity: 0.55 },
  primaryText: { color: "#fff", fontFamily: fonts.bold, fontSize: 15 },
  cancel: { alignItems: "center", paddingVertical: 12 },
  cancelText: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 14 },
  note: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, textAlign: "center", lineHeight: 17 },
});
