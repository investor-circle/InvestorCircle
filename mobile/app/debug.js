import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import { getLogs, clearLogs, formatLogs } from "../src/utils/logger";
import { API_ORIGIN } from "../src/services/api";
import { useAuth } from "../src/context/AuthContext";
import { colors, fonts } from "../src/theme/colors";

// On-device diagnostics. The app runs on a physical phone with no adb access,
// so this screen is the way real runtime behaviour gets back to a developer:
// it shows the captured log (see src/utils/logger.js — console output,
// uncaught errors, unhandled rejections, and deliberate debugLog() markers
// such as the Feed's per-source counts), and copies it to the clipboard.
export default function DebugScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [logs, setLogs] = useState([]);

  const refresh = useCallback(() => setLogs(getLogs()), []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, [refresh]);

  const env = [
    `app: ${Constants.expoConfig?.version ?? "?"} (${Constants.expoConfig?.slug ?? "?"})`,
    `api: ${API_ORIGIN}`,
    `uid: ${user?.uid ?? "(signed out)"}`,
    `profile: ${profile?.full_name ?? "—"}`,
  ].join("\n");

  const copyAll = async () => {
    await Clipboard.setStringAsync(`${env}\n\n${formatLogs()}`);
    Alert.alert("Copied", "Diagnostics copied to clipboard — paste them into the chat.");
  };

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 40 }}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>Diagnostics</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.btn} onPress={copyAll}>
          <Ionicons name="copy-outline" size={16} color="#fff" />
          <Text style={styles.btnText}>Copy all</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.btnGhost]}
          onPress={async () => {
            await clearLogs();
            refresh();
          }}
        >
          <Text style={[styles.btnText, { color: colors.inkSoft }]}>Clear</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.env}>{env}</Text>
        {logs.length === 0 ? (
          <Text style={styles.empty}>No log entries captured yet.</Text>
        ) : (
          logs.map((e, i) => (
            <Text key={i} style={[styles.line, LEVEL_STYLE[e.level]]}>
              [{e.t.slice(11, 19)}] {e.msg}
            </Text>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const LEVEL_STYLE = {
  error: { color: colors.loss },
  fatal: { color: colors.loss, fontFamily: fonts.bold },
  warn: { color: "#9a6a16" },
  debug: { color: colors.accentInk },
};

const styles = StyleSheet.create({
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
  actions: { flexDirection: "row", gap: 10, padding: 16, paddingBottom: 8 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  btnGhost: { backgroundColor: colors.surface2 },
  btnText: { color: "#fff", fontFamily: fonts.bold, fontSize: 13 },
  body: { paddingHorizontal: 16, paddingBottom: 32 },
  env: { color: colors.inkSoft, fontFamily: fonts.medium, fontSize: 12, marginBottom: 12 },
  empty: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13 },
  line: { color: colors.inkSoft, fontSize: 11, lineHeight: 16, marginBottom: 2 },
});
