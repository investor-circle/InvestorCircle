import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Share } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../src/context/AuthContext";
import { getPublicProfile } from "../src/services/api/peopleApi";
import { getInvestorIciBatch } from "../src/services/api/trackingApi";
import { getOwnerCircles } from "../src/services/api/groupsApi";
import { fetchProfileNavInfo } from "../src/services/profileNav";
import { iciFromStatsRow } from "../src/utils/ici";
import { profileUrl } from "../src/utils/links";
import { putReco } from "../src/utils/recoStore";
import Avatar from "../src/components/Avatar";
import TrackRecordView from "../src/components/TrackRecordView";
import { colors, fonts, GRADIENT } from "../src/theme/colors";
import { withBoundary } from "../src/components/ErrorBoundary";

/**
 * Your own track record.
 *
 * WHY IT EXISTS: the app could show any OTHER investor's track record and not
 * your own. The Profile tab was a menu — name, avatar, links, sign out — so
 * there was no way to see your ICI score, your scorecard, or the list of
 * calls behind them from inside the app, and nothing linked to your public
 * profile. On the web this is a primary page.
 *
 * It reads the SAME public endpoint as everyone else's, deliberately: what
 * you see here is exactly what a visitor sees, so there is no gap between
 * your view of your record and theirs. The only additions are the ones that
 * only make sense for the owner — share, and a route into editing.
 */
function MyTrackRecordScreen() {
  const router = useRouter();
  const { profile: me } = useAuth();
  const username = me?.username || "";

  const [data, setData] = useState(undefined); // undefined = loading
  const [ici, setIci] = useState(null);
  const [circles, setCircles] = useState({ public: [], private: [] });
  const [sebi, setSebi] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (!username) {
      setData(null);
      return undefined;
    }
    (async () => {
      const res = await getPublicProfile(username);
      if (!mounted.current) return;
      setData(res);

      const uid = res?.profile?.id || me?.id;
      if (!uid) return;
      const [stats, owned, nav] = await Promise.all([
        getInvestorIciBatch([uid]),
        getOwnerCircles(uid).catch(() => ({ public: [], private: [] })),
        fetchProfileNavInfo(uid).catch(() => null),
      ]);
      if (!mounted.current) return;
      setIci(iciFromStatsRow((stats || []).find((r) => String(r.uid) === String(uid))));
      setCircles(owned);
      setSebi(!!nav?.isSebiApproved);
    })();
    return () => {
      mounted.current = false;
    };
  }, [username, me?.id]);

  const share = useCallback(async () => {
    const url = profileUrl(username);
    if (!username) return;
    try {
      await Share.share({ message: `My investment track record on myInvestorCircle — ${url}`, url });
    } catch (_) {
      /* user dismissed the OS sheet */
    }
  }, [username]);

  const profile = data?.profile;

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 40 }}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>Track record</Text>
        <Pressable
          onPress={share}
          hitSlop={10}
          disabled={!username}
          style={{ width: 40, alignItems: "flex-end", opacity: username ? 1 : 0.35 }}
        >
          <Ionicons name="share-social-outline" size={21} color={colors.accentInk} />
        </Pressable>
      </View>

      {!username ? (
        // The setup gate normally guarantees a username, so this is the
        // narrow case of a profile that hasn't loaded rather than a state to
        // design around — but a blank screen would be worse than saying so.
        <View style={styles.center}>
          <Ionicons name="person-circle-outline" size={40} color={colors.line2} />
          <Text style={styles.emptyTitle}>Set a username first</Text>
          <Text style={styles.emptySub}>
            Your track record is published at your username, so you need one before it exists.
          </Text>
          <Pressable style={styles.cta} onPress={() => router.push("/settings")}>
            <Text style={styles.ctaText}>Go to settings</Text>
          </Pressable>
        </View>
      ) : data === undefined ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 36 }}>
          <LinearGradient colors={GRADIENT.colors} start={GRADIENT.start} end={GRADIENT.end} style={styles.hero}>
            <Avatar profile={profile || me} size={78} style={styles.heroAvatar} />
            <Text style={styles.name}>{profile?.full_name || me?.full_name || "—"}</Text>
            <Text style={styles.username}>@{username}</Text>
            {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
            <Pressable style={styles.editBtn} onPress={() => router.push("/settings")}>
              <Ionicons name="create-outline" size={14} color="#fff" />
              <Text style={styles.editText}>{profile?.bio ? "Edit profile" : "Add a bio"}</Text>
            </Pressable>
          </LinearGradient>

          {/* Exactly what a visitor sees, from the same endpoint. */}
          <TrackRecordView
            summary={data?.summary}
            live={data?.live}
            realized={data?.realized}
            sectors={data?.sectors || []}
            recos={data?.recos || []}
            circles={circles}
            ici={ici}
            isSebiApproved={sebi}
            onOpenReco={(r) => {
              putReco(r);
              router.push(`/reco/${r.id}`);
            }}
            onOpenCircle={(slug) => router.push(`/circle/s/${encodeURIComponent(slug)}`)}
          />

          {!data?.recos?.length ? (
            <View style={styles.emptyIdeas}>
              <Text style={styles.emptyTitle}>No public ideas yet</Text>
              <Text style={styles.emptySub}>
                Your track record fills in as you post public ideas. Every call stays on the
                record — that is what makes the score mean something.
              </Text>
              <Pressable style={styles.cta} onPress={() => router.push("/new")}>
                <Text style={styles.ctaText}>Post an idea</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

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
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 8 },
  hero: {
    alignItems: "center",
    paddingTop: 26,
    paddingBottom: 26,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroAvatar: { borderWidth: 2, borderColor: "rgba(255,255,255,0.55)", marginBottom: 10 },
  name: { color: "#fff", fontFamily: fonts.extrabold, fontSize: 22 },
  username: { color: "rgba(255,255,255,0.85)", fontFamily: fonts.medium, fontSize: 14, marginTop: 3 },
  bio: {
    color: "rgba(255,255,255,0.9)",
    fontFamily: fonts.regular,
    fontSize: 13,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 19,
    paddingHorizontal: 28,
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  editText: { color: "#fff", fontFamily: fonts.bold, fontSize: 12.5 },
  emptyIdeas: { alignItems: "center", padding: 28, gap: 8 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 15, marginTop: 6 },
  emptySub: {
    color: colors.muted,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  cta: {
    marginTop: 10,
    backgroundColor: colors.accent,
    borderRadius: 11,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  ctaText: { color: "#fff", fontFamily: fonts.bold, fontSize: 14 },
});

export default withBoundary(MyTrackRecordScreen, "Track record");
