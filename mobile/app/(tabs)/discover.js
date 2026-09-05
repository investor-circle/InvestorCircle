import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import GradientHero from "../../src/components/GradientHero";
import RecoCard from "../../src/components/RecoCard";
import { getPublicFeed, getMyReceivedRecos } from "../../src/services/api/recommendationsApi";
import { getMyConnections } from "../../src/services/api/connectionsApi";
import { getMyTrackedRecoIds } from "../../src/services/api/feedApi";
import { mapPublicReco } from "../../src/utils/feed";
import { rankTrending } from "../../src/utils/trending";
import { rankWhatYouMissed } from "../../src/utils/whatYouMissed";
import { putReco } from "../../src/utils/recoStore";
import { primeAvatars } from "../../src/services/avatarCache";
import { primeReactions } from "../../src/services/reactionStore";
import { seedTracked } from "../../src/services/trackStore";
import { getMyTrackedRecos } from "../../src/services/api/engagementApi";
import { getDailyPrices } from "../../src/services/api/consensusApi";
import {
  byTicker,
  mapTrackedReco,
  summariseTracked,
  topMovers,
  trackedTickers,
} from "../../src/utils/trackedSummary";
import { debugLog } from "../../src/utils/logger";
import { colors, fonts } from "../../src/theme/colors";
import { withBoundary } from "../../src/components/ErrorBoundary";

// Pulse — the web app's discovery surface, not a flat public list.
// "Trending on MIC" ranks the public feed with the web's own rankTrending();
// "What you missed" ranks the caller's own received ideas with
// rankWhatYouMissed(). Both algorithms are ported verbatim (see
// src/utils/trending.js), so mobile and web surface the same ideas.
const settled = (r, fallback) => (r.status === "fulfilled" ? r.value : fallback);

async function loadPulse() {
  const [pubR, recvR, connR, trackedR, myTrackedR] = await Promise.allSettled([
    getPublicFeed(),
    getMyReceivedRecos(),
    getMyConnections(),
    getMyTrackedRecoIds(),
    // The AUTHORITATIVE tracked list, not the ids filtered against the feed
    // pool. The web's widget makes the same call for the reason its comment
    // gives: the in-memory pool is direct deliveries plus a slice of the
    // public feed, so an idea tracked from a profile, a Circle, or one that
    // has aged out of the feed window is genuinely tracked and silently
    // missing from any count derived that way.
    getMyTrackedRecos(),
  ]);

  // Drop null/id-less rows before ranking. trending.js guards against these
  // itself; whatYouMissed.js does not (it filters on `!r.hidden` directly),
  // and both files are verbatim ports of the web app's, so the guard belongs
  // here rather than as a silent fork of a file we need to keep in sync.
  const usable = (rows) => (rows || []).filter((r) => r && r.id != null);

  const publicRecos = usable(settled(pubR, [])).map(mapPublicReco);
  const received = usable(settled(recvR, []));
  const connections = settled(connR, []) || [];
  const trackedIds = settled(trackedR, []) || [];

  const contactIds = new Set(connections.filter((c) => c.status === "active").map((c) => c.user_id));
  const tracked = new Set((trackedIds || []).map(String));
  // rankWhatYouMissed checks membership with .has() on whatever it's given;
  // ids arrive as both numbers and strings depending on endpoint.
  const trackedSet = { has: (id) => tracked.has(String(id)) };

  const trending = rankTrending(publicRecos, { contactIds });
  const missed = rankWhatYouMissed(received, { tracked: trackedSet, contactIds });

  // Fresh Ideas from your Circle — the newest ideas that reached you, not a
  // ranked selection. "What's new from people I follow" is a different
  // question from "what's moving", which is what the two widgets below answer.
  const fresh = received
    .filter((r) => !r.hidden)
    .sort((a, b) => new Date(b.date || b.created_at || 0) - new Date(a.date || a.created_at || 0))
    .slice(0, 5);

  const trackedList = usable(settled(myTrackedR, [])).map(mapTrackedReco);

  // Reuses the trackedIds call already made above for ranking — the track
  // icon on every card here is seeded from it rather than a second request.
  seedTracked(trackedIds, [...publicRecos, ...received].map((r) => r.id));

  debugLog(`pulse: public=${publicRecos.length} trending=${trending.length} received=${received.length} missed=${missed.length} fresh=${fresh.length} tracked=${trackedList.length}`);
  return { trending, missed, publicRecos, fresh, trackedList };
}

function PulseScreen() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const d = await loadPulse();
      if (mounted.current) {
        setData(d);
        setError(false);
      }
      primeAvatars([...d.trending, ...d.missed].map((r) => r.from));
      primeReactions([...d.trending, ...d.missed].map((r) => r.id));
    } catch (e) {
      if (mounted.current) {
        setError(true);
        setData((p) => p ?? { trending: [], missed: [], publicRecos: [] });
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openReco = useCallback(
    (reco) => {
      putReco(reco);
      router.push(`/reco/${reco.id}`);
    },
    [router]
  );

  const openProfile = useCallback(
    (username) => router.push(`/investor/${encodeURIComponent(username)}`),
    [router]
  );

  const openTicker = useCallback(
    (symbol) => router.push(`/ticker/${encodeURIComponent(symbol)}`),
    [router]
  );

  const hero = (
    <GradientHero
      eyebrow="Pulse"
      title="Your daily investment dose"
      subtitle="What's moving across your circle & the platform"
      icon="search"
      onIconPress={() => router.push("/search")}
    />
  );

  if (data === null) {
    return (
      <View style={styles.flex}>
        {hero}
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </View>
    );
  }

  const { trending, missed, publicRecos, fresh, trackedList } = data;
  const nothing = trending.length === 0 && missed.length === 0 && publicRecos.length === 0;
  const shown = new Set([...trending, ...missed].map((x) => String(x.idea?.id ?? x.id)));
  const rest = publicRecos.filter((r) => !shown.has(String(r.id)));

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {hero}

        {/* Market Insights lives on its own screen — it aggregates every
            public idea by stock, which is a different question from Pulse's
            "what moved recently", but the same intent, so this is where
            people look for it. */}
        <Pressable style={styles.insightsLink} onPress={() => router.push("/market")}>
          <View style={styles.insightsIcon}>
            <Ionicons name="stats-chart" size={17} color={colors.accentInk} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.insightsTitle}>Market Insights</Text>
            <Text style={styles.insightsSub}>Consensus and conviction across every stock</Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={colors.muted} />
        </Pressable>

        {nothing ? (
          <View style={styles.empty}>
            <Ionicons name={error ? "cloud-offline-outline" : "pulse-outline"} size={40} color={colors.line2} />
            <Text style={styles.emptyTitle}>{error ? "Couldn't load Pulse" : "Nothing moving yet"}</Text>
            <Text style={styles.emptySub}>
              {error
                ? "Pull down to try again."
                : "As ideas are shared and start moving, the highlights show up here."}
            </Text>
          </View>
        ) : null}

        {fresh.length > 0 ? (
          <Section
            icon="sparkles-outline"
            title="Fresh from your Circle"
            sub="The newest ideas shared with you"
          >
            {fresh.map((r) => (
              <RecoCard key={String(r.id)} reco={r} onPress={openReco} onOpenProfile={openProfile} onOpenTicker={openTicker} />
            ))}
          </Section>
        ) : null}

        <MyTrackedWidget list={trackedList} onViewAll={() => router.push("/track")} />

        {missed.length > 0 ? (
          <Section
            icon="eye-off-outline"
            title="What you missed"
            sub="Ideas from your circle that moved recently"
          >
            {missed.map((m) => (
              <RankedCard key={String(m.idea?.id ?? m.id)} item={m} onPress={openReco} onOpenProfile={openProfile} onOpenTicker={openTicker} />
            ))}
          </Section>
        ) : null}

        {trending.length > 0 ? (
          <Section icon="trending-up-outline" title="Trending on MIC" sub="Gaining attention across the platform">
            {trending.map((t) => (
              <RankedCard key={String(t.idea?.id ?? t.id)} item={t} onPress={openReco} onOpenProfile={openProfile} onOpenTicker={openTicker} />
            ))}
          </Section>
        ) : null}

        {/* Everything else, so Pulse is never emptier than the old plain
            list — minus whatever the ranked sections already showed above,
            which would otherwise appear twice on the same screen. */}
        {rest.length > 0 ? (
          <Section icon="globe-outline" title="Latest public ideas" sub="Newest across the platform">
            {rest.slice(0, 20).map((r) => (
              <RecoCard key={String(r.id)} reco={r} onPress={openReco} onOpenProfile={openProfile} onOpenTicker={openTicker} />
            ))}
          </Section>
        ) : null}

        {/* Pulse is a curated highlight reel, not the whole feed — this is
            the way out to everything, the same as the web's "See full feed"
            link at the bottom of its Pulse widgets. */}
        <Pressable style={styles.fullFeedLink} onPress={() => router.push("/")}>
          <Text style={styles.fullFeedText}>See full feed</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.accentInk} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// The ranking functions return {idea, creator, reason, score}; unwrap to the
// reco the card expects, and surface the human-readable reason they chose it.
//
// The two modules deliberately shape `reason` differently: whatYouMissed.js
// returns a plain string ("From your connection"), trending.js returns
// {icon, text} ({icon:'🔥', text:'3 investors liked it this week'}). Render
// both rather than assuming one — this is the multi-caller data-shape trap
// that CLAUDE.md's incident note is about.
function reasonOf(reason) {
  if (!reason) return null;
  if (typeof reason === "string") return { icon: null, text: reason };
  if (typeof reason.text === "string") return { icon: reason.icon || null, text: reason.text };
  return null;
}

function RankedCard({ item, onPress, onOpenProfile, onOpenTicker }) {
  const reco = item?.idea || item;
  if (!reco) return null;
  const reason = reasonOf(item?.reason);
  return (
    <View>
      {reason ? (
        <View style={styles.reasonRow}>
          {reason.icon ? (
            <Text style={styles.reasonIcon}>{reason.icon}</Text>
          ) : (
            <Ionicons name="sparkles" size={12} color={colors.accentInk} />
          )}
          <Text style={styles.reasonText} numberOfLines={1}>
            {reason.text}
          </Text>
        </View>
      ) : null}
      <RecoCard reco={reco} onPress={onPress} onOpenProfile={onOpenProfile} onOpenTicker={onOpenTicker} />
    </View>
  );
}

/**
 * My Tracked — what happened to the ideas you're following.
 *
 * Two modes, and they answer deliberately different questions (see
 * src/utils/trackedSummary.js for why "since yesterday" is NOT an in/out-of-
 * money delta). Only the "yesterday" mode needs prices, so that request is
 * made lazily on first switch rather than on every Pulse load — Pulse's
 * first paint is the thing this screen is judged on.
 */
function MyTrackedWidget({ list, onViewAll }) {
  const [mode, setMode] = useState("yesterday");
  const [daily, setDaily] = useState(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const tickerKey = useMemo(() => trackedTickers(list).join(","), [list]);
  useEffect(() => {
    if (mode !== "yesterday" || !tickerKey) return;
    let cancelled = false;
    getDailyPrices(tickerKey.split(","))
      .then((rows) => {
        if (!cancelled && mounted.current) setDaily(byTicker(rows));
      })
      // Pricing being unavailable degrades to the neutral "no data" segment;
      // it must never blank the widget.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mode, tickerKey]);

  const sum = useMemo(() => summariseTracked(list, mode === "yesterday" ? daily : null), [list, daily, mode]);
  const movers = useMemo(
    () => (mode === "yesterday" ? topMovers(list, daily, 3) : []),
    [list, daily, mode]
  );

  if (!list.length) {
    return (
      <Section icon="bookmark-outline" title="My Tracked" sub="Ideas you're following">
        <View style={styles.trackedEmpty}>
          <Text style={styles.trackedEmptyTitle}>Track ideas, watch them move</Text>
          <Text style={styles.trackedEmptySub}>
            Tap the bookmark on any idea to track it — its daily moves show up here.
          </Text>
        </View>
      </Section>
    );
  }

  const segments =
    mode === "yesterday"
      ? [
          { n: sum.up, color: colors.gain, label: `${sum.up} up` },
          { n: sum.down, color: colors.loss, label: `${sum.down} down` },
          { n: sum.noData, color: colors.line2, label: `${sum.noData} flat` },
        ]
      : [
          { n: sum.inMoney, color: colors.gain, label: `${sum.inMoney} in profit` },
          { n: sum.outMoney, color: colors.loss, label: `${sum.outMoney} behind` },
        ];

  return (
    <Section icon="bookmark-outline" title="My Tracked" sub="Ideas you're following">
      <View style={styles.trackedCard}>
        <View style={styles.modeRow}>
          {[
            ["yesterday", "Since yesterday"],
            ["tracking", "Since tracking"],
          ].map(([id, label]) => (
            <Pressable
              key={id}
              style={[styles.modeBtn, mode === id && styles.modeBtnOn]}
              onPress={() => setMode(id)}
            >
              <Text style={[styles.modeText, mode === id && styles.modeTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.trackedHead}>
          <Text style={styles.trackedTotal}>{sum.total}</Text>
          <Text style={styles.trackedTotalLabel}>
            idea{sum.total === 1 ? "" : "s"} tracked
          </Text>
        </View>

        <View style={styles.splitBar}>
          {segments.map((seg, i) =>
            seg.n > 0 ? <View key={i} style={{ flex: seg.n, backgroundColor: seg.color }} /> : null
          )}
        </View>
        <View style={styles.splitLegend}>
          {segments.map((seg, i) => (
            <Text key={i} style={[styles.legendText, { color: seg.color }]}>
              {seg.label}
            </Text>
          ))}
        </View>

        {movers.length ? (
          <View style={styles.moversWrap}>
            <Text style={styles.moversLabel}>Biggest moves</Text>
            {movers.map(({ reco, changePct }) => (
              <View key={String(reco.id)} style={styles.moverRow}>
                <Text style={styles.moverTicker} numberOfLines={1}>
                  {reco.ticker || reco.assetName}
                </Text>
                <Text
                  style={[styles.moverPct, { color: changePct >= 0 ? colors.gain : colors.loss }]}
                >
                  {changePct >= 0 ? "+" : ""}
                  {Number(changePct).toFixed(2)}%
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <Pressable style={styles.viewAll} onPress={onViewAll}>
          <Text style={styles.viewAllText}>View all tracked</Text>
          <Ionicons name="chevron-forward" size={15} color={colors.accentInk} />
        </Pressable>
      </View>
    </Section>
  );
}

function Section({ icon, title, sub, children }) {
  return (
    <View style={{ marginTop: 18 }}>
      <View style={styles.sectionHead}>
        <Ionicons name={icon} size={17} color={colors.accentInk} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {sub ? <Text style={styles.sectionSub}>{sub}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  trackedCard: { paddingHorizontal: 16 },
  modeRow: { flexDirection: "row", gap: 3, backgroundColor: colors.surface2, borderRadius: 9, padding: 3 },
  modeBtn: { flex: 1, paddingVertical: 7, borderRadius: 7, alignItems: "center" },
  modeBtnOn: { backgroundColor: colors.surface },
  modeText: { color: colors.muted, fontFamily: fonts.bold, fontSize: 12 },
  modeTextOn: { color: colors.accentInk },
  trackedHead: { flexDirection: "row", alignItems: "baseline", gap: 7, marginTop: 14 },
  trackedTotal: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 26 },
  trackedTotalLabel: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13 },
  splitBar: {
    flexDirection: "row",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    marginTop: 10,
    backgroundColor: colors.surface2,
  },
  splitLegend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 7 },
  legendText: { fontFamily: fonts.semibold, fontSize: 12 },
  moversWrap: { marginTop: 14, gap: 6 },
  moversLabel: { color: colors.muted, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.4 },
  moverRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  moverTicker: { flex: 1, color: colors.ink, fontFamily: fonts.semibold, fontSize: 13.5 },
  moverPct: { fontFamily: fonts.extrabold, fontSize: 13 },
  viewAll: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingTop: 14 },
  viewAllText: { color: colors.accentInk, fontFamily: fonts.bold, fontSize: 13 },
  trackedEmpty: { paddingHorizontal: 16, paddingBottom: 4 },
  trackedEmptyTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 14 },
  trackedEmptySub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  insightsLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 16,
  },
  insightsIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  fullFeedLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 22,
    marginHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentSoft,
  },
  fullFeedText: { color: colors.accentInk, fontFamily: fonts.bold, fontSize: 14 },
  insightsTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 14.5 },
  insightsSub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 16 },
  sectionSub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 1 },
  reasonRow: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 20, marginBottom: 4 },
  reasonIcon: { fontSize: 11 },
  reasonText: { color: colors.accentInk, fontFamily: fonts.semibold, fontSize: 11, flex: 1 },
  empty: { alignItems: "center", justifyContent: "center", paddingHorizontal: 40, paddingTop: 50 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 16, marginTop: 12 },
  emptySub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 19 },
});

export default withBoundary(PulseScreen, "Pulse");
