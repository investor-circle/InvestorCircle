import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Share } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { profileUrl } from "../../src/utils/links";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { getPublicProfile } from "../../src/services/api/peopleApi";
import { getInvestorIciBatch } from "../../src/services/api/trackingApi";
import { getOwnerCircles } from "../../src/services/api/groupsApi";
import { iciFromStatsRow } from "../../src/utils/ici";
import TrackButton from "../../src/components/TrackButton";
import { useAuth } from "../../src/context/AuthContext";
import Avatar from "../../src/components/Avatar";
import TrackRecordView from "../../src/components/TrackRecordView";
import { fetchProfileNavInfo } from "../../src/services/profileNav";
import { putReco } from "../../src/utils/recoStore";
import { colors, fonts, GRADIENT } from "../../src/theme/colors";
import { withBoundary } from "../../src/components/ErrorBoundary";

// Public investor profile — the same shareable profile the web app exposes
// at #/investor/:username, including the server-computed performance summary
// (live / realized) and the investor's ICI score.
//
// Performance numbers come from the API and are never recomputed here. The
// ICI score IS computed client-side, because that is how the web app does it
// too: the endpoint returns raw counts and src/utils/ici.js (a byte-identical
// copy of the web's computeIci) turns them into the score, so both clients
// produce the same number from the same inputs.
function InvestorProfileScreen() {
  const { username } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState(undefined); // undefined=loading, null=not found
  const [ici, setIci] = useState(null);
  // Circles this person owns, as the web shows on a public profile. `private`
  // only ever contains Circles the VIEWER is already in, so this cannot be
  // used to enumerate someone's private Circles — that filtering is the
  // server's (groups.js owner-circles), not this screen's.
  const [circles, setCircles] = useState({ public: [], private: [] });
  const [sebi, setSebi] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      const res = await getPublicProfile(username);
      if (!mounted.current) return;
      setData(res);

      // Second, dependent call: the ICI batch is keyed by uid, which only the
      // profile response can give us. Kept off the first paint so the profile
      // renders as soon as it arrives.
      const uid = res?.profile?.id;
      if (!uid) return;
      // Both are keyed by the uid the profile response just gave us and are
      // independent of each other, so they go together rather than in series.
      const [stats, owned, nav] = await Promise.all([
        getInvestorIciBatch([uid]),
        getOwnerCircles(uid).catch(() => ({ public: [], private: [] })),
        // Already fetched elsewhere for navigation; the badge it carries was
        // never rendered, so a SEBI-registered investor looked unregistered
        // everywhere in the app.
        fetchProfileNavInfo(uid).catch(() => null),
      ]);
      if (!mounted.current) return;
      const row = (stats || []).find((r) => String(r.uid) === String(uid));
      setIci(iciFromStatsRow(row));
      setCircles(owned);
      setSebi(!!nav?.isSebiApproved);
    })();
    return () => {
      mounted.current = false;
    };
  }, [username]);

  const profile = data?.profile;
  const live = data?.live;
  const realized = data?.realized;
  const summary = data?.summary;

  const shareProfile = useCallback(async () => {
    const uname = data?.profile?.username || (typeof username === "string" ? username : "");
    const url = profileUrl(uname);
    if (!uname) return;
    try {
      await Share.share({
        message: `${data?.profile?.full_name || "@" + uname}'s track record on myInvestorCircle — ${url}`,
        url,
      });
    } catch (_) {
      /* user dismissed the OS sheet */
    }
  }, [data?.profile?.username, data?.profile?.full_name, username]);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 40 }}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>Investor</Text>
        {/* The web has "Share this profile" (copy link / WhatsApp) on every
            public profile; the app had no way to share one at all. Same URL
            the web hands out, through the OS share sheet. */}
        <Pressable onPress={shareProfile} hitSlop={10} style={{ width: 40, alignItems: "flex-end" }}>
          <Ionicons name="share-social-outline" size={21} color={colors.accentInk} />
        </Pressable>
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
            <Avatar profile={profile} size={78} style={styles.heroAvatar} />
            <Text style={styles.name}>{profile.full_name || "Investor"}</Text>
            {profile.username ? <Text style={styles.username}>@{profile.username}</Text> : null}
            {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

            {/* Tracking is one-way, so it is offered to anyone except the
                viewer themselves — following your own profile is meaningless
                and the server would reject it anyway. */}
            {profile.id && String(profile.id) !== String(user?.uid) ? (
              <View style={{ marginTop: 12 }}>
                <TrackButton targetId={profile.id} />
              </View>
            ) : null}
          </LinearGradient>

          <TrackRecordView
            summary={summary}
            live={live}
            realized={realized}
            sectors={data?.sectors || []}
            recos={data?.recos || []}
            circles={circles}
            ici={ici}
            isSebiApproved={sebi}
            onOpenReco={(r) => {
              // Seed the hand-off cache so the detail screen opens from data
              // already in memory rather than re-fetching what this list has.
              putReco(r);
              router.push(`/reco/${r.id}`);
            }}
            onOpenCircle={(slug) => router.push(`/circle/s/${encodeURIComponent(slug)}`)}
          />

        </ScrollView>
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
  hero: { alignItems: "center", paddingTop: 28, paddingBottom: 26, paddingHorizontal: 24 },
  heroAvatar: { borderWidth: 2, borderColor: "rgba(255,255,255,0.55)", marginBottom: 10 },
  name: { color: "#fff", fontFamily: fonts.extrabold, fontSize: 21 },
  username: { color: "rgba(255,255,255,0.85)", fontFamily: fonts.medium, fontSize: 14, marginTop: 3 },
  bio: { color: "rgba(255,255,255,0.9)", fontFamily: fonts.regular, fontSize: 13, textAlign: "center", marginTop: 10, lineHeight: 19 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 16, marginTop: 12 },
});

export default withBoundary(InvestorProfileScreen, "Investor profile");
