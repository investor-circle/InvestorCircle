import { useEffect, useRef, useState } from "react";
import { View, Text, Image, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { unlockWithBiometrics } from "../services/appLock";
import { colors, fonts } from "../theme/colors";

/**
 * The full-screen cover shown while the app is locked (see
 * services/appLock.js for what "locked" means and why). Prompts
 * automatically on mount/re-mount — every time this screen appears is a
 * moment someone should be asked to prove they're the phone's owner, not a
 * moment to wait for a tap first.
 */
export default function AppLockScreen({ onUnlocked }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const attempt = async () => {
    setBusy(true);
    setFailed(false);
    const ok = await unlockWithBiometrics();
    if (!mounted.current) return;
    setBusy(false);
    if (ok) onUnlocked();
    else setFailed(true);
  };

  // Once, on mount — a re-render (e.g. AppState flicker) must not re-fire
  // the OS prompt on top of one already showing.
  useEffect(() => {
    attempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.flex}>
      <View style={styles.center}>
        <Image source={require("../../assets/mic-logo.png")} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>myInvestorCircle</Text>
        <View style={styles.badge}>
          <Ionicons name="finger-print" size={30} color={colors.accent} />
        </View>
        <Text style={styles.sub}>
          {busy ? "Waiting for verification…" : failed ? "Couldn't verify — try again." : "Locked for your security"}
        </Text>
        <Pressable style={[styles.btn, busy && { opacity: 0.7 }]} onPress={attempt} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Unlock</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  logo: { width: 64, height: 64, marginBottom: 10 },
  title: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 19, marginBottom: 28 },
  badge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  sub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13.5, marginBottom: 24, textAlign: "center" },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 36,
    alignItems: "center",
    minWidth: 160,
  },
  btnText: { color: "#fff", fontFamily: fonts.bold, fontSize: 15 },
});
