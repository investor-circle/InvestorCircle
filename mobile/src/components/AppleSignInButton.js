import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Modal, TextInput } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useAppleSignIn } from "../services/appleAuth";
import { colors, fonts } from "../theme/colors";

/**
 * "Sign in with Apple", separated from LoginScreen for the same reason as
 * GoogleSignInButton: the caller renders this only when it makes sense to
 * (iOS, tab !== "forgot"), and useAppleSignIn() itself resolves `available`
 * to false everywhere the native module isn't present, so mounting this on
 * Android — or in a build made before the native module exists — is safe
 * and simply renders nothing.
 *
 * Uses Apple's own AppleAuthenticationButton (ASAuthorizationAppleIDButton)
 * rather than a custom-styled Pressable: Apple's Human Interface Guidelines
 * require the approved title/logo/color/proportions for this exact button,
 * and App Store review checks for it.
 */
export default function AppleSignInButton({ disabled }) {
  const { available, busy, error, signIn, linkPending, linkAccount, cancelLink } = useAppleSignIn();
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!linkPending) setPassword("");
  }, [linkPending]);

  if (!available) return null;

  return (
    <>
      {/* AppleAuthenticationButton renders its own internal touch target —
          wrapped in a View so the busy/disabled dimming and the tap-blocking
          overlay match GoogleSignInButton's treatment exactly. */}
      <View style={styles.btnWrap}>
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={12}
          style={styles.btn}
          onPress={signIn}
        />
        {busy || disabled ? (
          <View style={styles.overlay} pointerEvents="auto">
            {busy && !linkPending ? <ActivityIndicator color="#fff" /> : null}
          </View>
        ) : null}
      </View>

      {error && !linkPending ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={!!linkPending} animationType="slide" transparent onRequestClose={cancelLink}>
        <Pressable style={styles.backdrop} onPress={cancelLink} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <Text style={styles.title}>Connect your Apple account</Text>
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
  btnWrap: { marginTop: 12, height: 48 },
  btn: { width: "100%", height: 48 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  error: { color: colors.loss, fontFamily: fonts.semibold, fontSize: 13, textAlign: "center", marginTop: 10 },

  backdrop: { flex: 1, backgroundColor: "rgba(13,14,30,0.5)" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 30,
    paddingTop: 8,
    // See AddHoldingModal.js's sheet style for why: capped and centered so
    // this doesn't stretch edge-to-edge on iPad.
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
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
