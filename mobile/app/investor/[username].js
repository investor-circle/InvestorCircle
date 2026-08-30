import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { getPublicProfile } from "../../src/services/api/peopleApi";
import { initialsOf } from "../../src/utils/format";
import { colors, fonts, GRADIENT } from "../../src/theme/colors";
import { withBoundary } from "../../src/components/ErrorBoundary";

// Public investor profile — the same shareable profile the web app exposes
// at #/investor/:username, including the server-computed performance summary
// (live / realized). Read-only: all numbers come from the API, none are
// recomputed here (ICI and P&L are sensitive business calculations).
function InvestorProfileScreen() {
  const { username } = useLocalSearchParams();
  const router = useRouter();
  const [data, setData] = useState(undefined); // undefined=loading, null=not found
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      const res = await getPublicProfile(username);
      if (mounted.current) setData(res);
    })();
    return () => {
      mounted.current = false;
    };
  }, [username]);

  const profile = data?.profile;
  const live = data?.live;
  const realized = data?.realized;
  const summary = data?.summary;

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 40 }}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>Investor</Text>
        <View style={{ width: 40 }} />
      </View>

      {data === undefined ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : !profile ? (
        <View style={styles.center}>
          <Ionicons name="person-outline" size={40} color={colors.line2} />
          <Text style={styles.emptyTitle}>Profile not found</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          <LinearGradient colors={GRADIENT.colors} start={GRADIENT.start} end={GRADIENT.end} style={styles.hero}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initialsOf(profile.full_name)}</Text>
            </View>
            <Text style={styles.name}>{profile.full_name || "Investor"}</Text>
            {profile.username ? <Text style={styles.username}>@{profile.username}</Text> : null}
            {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
          </LinearGradient>

          {summary ? (
            <View style={styles.statGrid}>
              <Stat label="Ideas" value={summary.total} />
              <Stat label="Active" value={summary.active} />
              <Stat label="Closed" value={summary.closed} />
              <Stat label="Years" value={summary.years_history} />
            </View>
          ) : null}

          {live ? (
            <Section title="Live ideas">
              <Row label="Active" value={String(live.count)} />
              <Row label="In profit" value={String(live.in_profit)} valueColor={colors.gain} />
              <Row label="In loss" value={String(live.in_loss)} valueColor={colors.loss} />
              <Row
                label="Avg return"
                value={`${Number(live.avg_return).toFixed(1)}%`}
                valueColor={live.avg_return >= 0 ? colors.gain : colors.loss}
              />
            </Section>
          ) : null}

          {realized ? (
            <Section title="Closed ideas">
              <Row label="Closed" value={String(realized.count)} />
              <Row label="Wins" value={String(realized.win_count)} valueColor={colors.gain} />
              <Row label="Losses" value={String(realized.loss_count)} valueColor={colors.loss} />
              <Row label="Hit rate" value={`${Number(realized.hit_rate_pct).toFixed(0)}%`} />
            </Section>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value ?? "—"}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function Row({ label, value, valueColor }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
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
  hero: { alignItems: "center", paddingTop: 28, paddingBottom: 26, paddingHorizontal: 24 },
  avatar: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarText: { color: "#fff", fontFamily: fonts.extrabold, fontSize: 26 },
  name: { color: "#fff", fontFamily: fonts.extrabold, fontSize: 21 },
  username: { color: "rgba(255,255,255,0.85)", fontFamily: fonts.medium, fontSize: 14, marginTop: 3 },
  bio: { color: "rgba(255,255,255,0.9)", fontFamily: fonts.regular, fontSize: 13, textAlign: "center", marginTop: 10, lineHeight: 19 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, paddingTop: 16 },
  stat: {
    width: "25%",
    alignItems: "center",
    paddingVertical: 10,
  },
  statValue: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 19 },
  statLabel: { color: colors.muted, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", marginTop: 4 },
  section: { paddingHorizontal: 16, paddingTop: 18 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 15, marginBottom: 8 },
  sectionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 },
  rowLabel: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 13 },
  rowValue: { color: colors.ink, fontFamily: fonts.bold, fontSize: 15 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 16, marginTop: 12 },
});

export default withBoundary(InvestorProfileScreen, "Investor profile");
