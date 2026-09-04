import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Share, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Updates from "expo-updates";
import { getLogs, clearLogs, formatLogs } from "../src/utils/logger";
import { getMarks, formatRequestStats, sinceStart } from "../src/utils/perf";
import { API_ORIGIN, pendingRequests } from "../src/services/api";
import { isAnalyticsAvailable } from "../src/services/analytics";
import { useAuth } from "../src/context/AuthContext";
import { colors, fonts } from "../src/theme/colors";
import { withBoundary } from "../src/components/ErrorBoundary";

// On-device diagnostics. The app runs on a physical phone with no adb access,
// so this screen is the way real runtime behaviour gets back to a developer:
// it shows the captured log (see src/utils/logger.js — console output,
// uncaught errors, unhandled rejections, and deliberate debugLog() markers
// such as the Feed's per-source counts), and copies it to the clipboard.
function DebugScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [logs, setLogs] = useState([]);

  const [marks, setMarks] = useState([]);
  const [pending, setPending] = useState([]);
  const [stats, setStats] = useState("");

  const refresh = useCallback(() => {
    setLogs(getLogs());
    setMarks(getMarks());
    setPending(pendingRequests());
    setStats(formatRequestStats());
  }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, [refresh]);

  const env = [
    `app: ${Constants.expoConfig?.version ?? "?"} (${Constants.expoConfig?.slug ?? "?"})`,
    // Which JS this device is actually running. With over-the-air updates a
    // phone can be on a different build of the JS than the APK shipped with,
    // and "did my fix reach the device?" is otherwise unanswerable.
    `update: ${Updates.isEmbeddedLaunch ? "embedded (as built)" : `OTA ${Updates.updateId?.slice(0, 8) ?? "?"}`}` +
      `${Updates.channel ? ` · channel ${Updates.channel}` : ""}`,
    `runtimeVersion: ${Updates.runtimeVersion ?? "?"}`,
    // A crash report is close to useless without the device it came from:
    // most Android bugs that survive testing are specific to a manufacturer
    // skin or an OS version.
    `device: ${Device.manufacturer ?? "?"} ${Device.modelName ?? "?"} · Android ${Device.osVersion ?? "?"} (API ${Platform.Version})`,
    `api: ${API_ORIGIN}`,
    `uid: ${user?.uid ?? "(signed out)"}`,
    `profile: ${profile?.full_name ?? "—"}`,
    // Whether this BUILD can report. Analytics degrades silently by design,
    // so without a line here "no events in GA4" is indistinguishable from
    // "nobody used the app".
    `analytics: ${isAnalyticsAvailable() ? "on" : "unavailable in this build"}`,
    `uptime: ${Math.round(sinceStart() / 1000)}s`,
  ].join("\n");

  const startup = marks.length
    ? marks.map((m) => `  +${m.at}ms  ${m.name}`).join("\n")
    : "  (no marks recorded)";

  const waiting = pending.length
    ? pending.map((p) => `  ${Math.round(p.waitingMs / 1000)}s  ${p.label}`).join("\n")
    : "  (nothing in flight)";

  // One block, so a report is a single paste rather than four.
  const report = [
    env,
    "",
    "STARTUP TIMELINE",
    startup,
    "",
    "REQUESTS IN FLIGHT (a stuck screen is usually here)",
    waiting,
    "",
    "REQUEST STATS (slowest first)",
    stats,
    "",
    "LOG",
    formatLogs(),
  ].join("\n");

  const copyAll = async () => {
    await Clipboard.setStringAsync(report);
    Alert.alert("Copied", "Diagnostics copied to clipboard — paste them into the chat.");
  };

  const [updateMsg, setUpdateMsg] = useState("");
  const checkForUpdate = async () => {
    setUpdateMsg("Checking…");
    try {
      const res = await Updates.checkForUpdateAsync();
      if (!res.isAvailable) {
        setUpdateMsg("Already up to date.");
        return;
      }
      setUpdateMsg("Downloading…");
      await Updates.fetchUpdateAsync();
      // Reloading is the point: an update that is downloaded but not applied
      // looks exactly like no update at all.
      await Updates.reloadAsync();
    } catch (e) {
      // Expected, and worth saying plainly, in a build made before updates
      // were enabled or when running from a dev server.
      setUpdateMsg(`Updates unavailable here: ${e?.message || e}`);
    }
  };

  // Clipboard is fine for a short log and hopeless for a long one: pasting
  // 400 lines into a chat box on a phone is its own ordeal. Share hands the
  // whole report straight to any app that takes text.
  const shareAll = async () => {
    try {
      await Share.share({ message: report });
    } catch (_) {
      /* user dismissed the OS sheet */
    }
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
        <Pressable style={styles.btn} onPress={shareAll}>
          <Ionicons name="share-outline" size={16} color="#fff" />
          <Text style={styles.btnText}>Share</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={copyAll}>
          <Ionicons name="copy-outline" size={16} color={colors.inkSoft} />
          <Text style={[styles.btnText, { color: colors.inkSoft }]}>Copy</Text>
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

        <Pressable style={[styles.btn, styles.btnGhost, { alignSelf: "flex-start" }]} onPress={checkForUpdate}>
          <Ionicons name="cloud-download-outline" size={16} color={colors.inkSoft} />
          <Text style={[styles.btnText, { color: colors.inkSoft }]}>Check for update</Text>
        </Pressable>
        {updateMsg ? <Text style={styles.updateMsg}>{updateMsg}</Text> : null}

        <Text style={styles.section}>Startup timeline</Text>
        <Text style={styles.mono}>{startup}</Text>

        {pending.length > 0 ? (
          <>
            <Text style={styles.section}>Waiting on</Text>
            <Text style={[styles.mono, { color: "#9a6a16" }]}>{waiting}</Text>
          </>
        ) : null}

        <Text style={styles.section}>Requests (slowest first)</Text>
        <Text style={styles.mono}>{stats}</Text>

        <Text style={styles.section}>Log</Text>
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
  section: { color: colors.ink, fontFamily: fonts.bold, fontSize: 12, marginTop: 18, marginBottom: 6 },
  mono: { color: colors.inkSoft, fontSize: 11, lineHeight: 16 },
  updateMsg: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12, marginTop: 8 },
});

// Wrapped like every other page: this screen now reads native modules
// (device info, update state), and the one screen you open BECAUSE the app is
// misbehaving is the worst possible one to crash.
export default withBoundary(DebugScreen, "Diagnostics");
