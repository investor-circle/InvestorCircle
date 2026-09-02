import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { getSuggestedPeople, markOnboardingStep } from "../src/services/api/peopleApi";
import { getInvestorIciBatch } from "../src/services/api/trackingApi";
import { iciMapFromStats } from "../src/utils/ici";
import TrackButton from "../src/components/TrackButton";
import IciBadge from "../src/components/IciBadge";
import { initialsOf } from "../src/utils/format";
import Avatar from "../src/components/Avatar";
import { debugLog } from "../src/utils/logger";
import { colors, fonts, GRADIENT } from "../src/theme/colors";
import { withBoundary } from "../src/components/ErrorBoundary";

/**
 * "People worth following" — the mobile counterpart of the web's Discover
 * onboarding step.
 *
 * The endpoint already excludes anyone the user tracks or is connected to, so
 * every row is actionable. Each shows an ICI score, because "why this person"
 * is the question the list has to answer; a bare list of names gives someone
 * with no network nothing to judge on.
 *
 * Tracking rather than connecting, deliberately: tracking is one-way and
 * takes effect immediately, so a new user's feed fills up on this screen
 * instead of after someone else accepts a request.
 */
function SuggestedPeopleScreen() {
  const router = useRouter();
  const [people, setPeople] = useState(null);
  const [ici, setIci] = useState({});
  const [tracked, setTracked] = useState({});
  const mounted = useRef(true);

  const load = useCallback(async () => {
    const rows = await getSuggestedPeople();
    if (!mounted.current) return;
    setPeople(rows);

    // Dependent: the batch is keyed by uid, which only the list can supply.
    const uids = (rows || []).map((p) => p.id).filter(Boolean);
    if (!uids.length) return;
    const stats = await getInvestorIciBatch(uids);
    if (!mounted.current) return;
    setIci(iciMapFromStats(stats));
    debugLog(`suggested: people=${rows.length} scored=${Object.keys(iciMapFromStats(stats)).length}`);
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  // Marking the step done is fire-and-forget: it only stops the card being
  // offered again, so a failure must not block leaving the screen.
  const finish = useCallback(() => {
    markOnboardingStep("discover").catch(() => {});
    router.back();
  }, [router]);

  const trackedCount = Object.values(tracked).filter(Boolean).length;

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.topbar}>
        <Pressable onPress={finish} hitSlop={10} style={{ width: 40 }}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>People to follow</Text>
        <Pressable onPress={finish} hitSlop={10}>
          <Text style={styles.skip}>{trackedCount > 0 ? "Done" : "Skip"}</Text>
        </Pressable>
      </View>

      {people === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={people}
          keyExtractor={(p, i) => String(p.id ?? i)}
          contentContainerStyle={people.length === 0 ? styles.emptyWrap : { paddingBottom: 24 }}
          ListHeaderComponent={
            people.length > 0 ? (
              <LinearGradient
                colors={GRADIENT.colors}
                start={GRADIENT.start}
                end={GRADIENT.end}
                style={styles.hero}
              >
                <Text style={styles.heroTitle}>Fill your feed</Text>
                <Text style={styles.heroSub}>
                  Tracking an investor brings their ideas into your feed straight away — no request, no
                  waiting for them to accept.
                </Text>
              </LinearGradient>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => item.username && router.push(`/investor/${encodeURIComponent(item.username)}`)}
              disabled={!item.username}
            >
              <Avatar profile={item} name={item.name || item.full_name} size={42} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name || item.full_name || item.username || "Investor"}
                </Text>
                <View style={styles.metaRow}>
                  {ici[item.id] ? <IciBadge ici={ici[item.id]} size="sm" /> : null}
                  {item.username ? (
                    <Text style={styles.sub} numberOfLines={1}>
                      @{item.username}
                    </Text>
                  ) : null}
                </View>
              </View>
              <TrackButton
                targetId={item.id}
                initialTracking={false}
                compact
                onChange={(now) => setTracked((t) => ({ ...t, [item.id]: now }))}
              />
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={40} color={colors.line2} />
              <Text style={styles.emptyTitle}>No suggestions right now</Text>
              <Text style={styles.emptySub}>
                You're already following everyone we'd suggest. Search for people from Discover.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
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
  skip: { color: colors.accentInk, fontFamily: fonts.bold, fontSize: 14 },
  hero: { padding: 20, margin: 16, borderRadius: 16 },
  heroTitle: { color: "#fff", fontFamily: fonts.extrabold, fontSize: 20 },
  heroSub: { color: "rgba(255,255,255,0.9)", fontFamily: fonts.regular, fontSize: 13, marginTop: 6, lineHeight: 19 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.inkSoft, fontFamily: fonts.bold, fontSize: 14 },
  name: { color: colors.ink, fontFamily: fonts.bold, fontSize: 15 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 3 },
  sub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, flexShrink: 1 },
  emptyWrap: { flexGrow: 1 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 16, marginTop: 12 },
  emptySub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 19 },
});

export default withBoundary(SuggestedPeopleScreen, "SuggestedPeople");
