import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AppHeader from "../../src/components/AppHeader";
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
  trackedTickers,
} from "../../src/utils/trackedSummary";
import { deriveTrackedActivity, getSeenCommentCounts, saveSeenCommentCounts } from "../../src/utils/trackedActivity";
import { useAuth } from "../../src/context/AuthContext";
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

  const contactIds = new Set(connections.filter((c) => c.status === "accepted").map((c) => c.user_id));
  const tracked = new Set((trackedIds || []).map(String));
  // rankWhatYouMissed checks membership with .has() on whatever it's given;
  // ids arrive as both numbers and strings depending on endpoint.
  const trackedSet = { has: (id) => tracked.has(String(id)) };

  // Merged pool for "Fresh Ideas" and "What You Missed" — direct deliveries
  // plus public platform recos, deduped by id. Mirrors the web's allFeedRecos
  // (Discovery.jsx HomeFeed): both widgets are fed this pool there, not the
  // narrower received-only list. Feeding rankWhatYouMissed just `received`
  // (as mobile used to) silently dropped any missed-worthy idea that only
  // reached the viewer through the public feed, and made "Fresh Ideas" a
  // strict subset of what web shows for the same account.
  const seenIds = new Set(received.map((r) => r.id));
  const allFeedRecos = [...received, ...publicRecos.filter((r) => !seenIds.has(r.id))];

  const trending = rankTrending(publicRecos, { contactIds });
  const missed = rankWhatYouMissed(allFeedRecos, { tracked: trackedSet, contactIds });

  // Fresh Ideas from your Circle — the newest ideas that reached you, not a
  // ranked selection. "What's new from people I follow" is a different
  // question from "what's moving", which is what the two widgets below answer.
  const fresh = allFeedRecos
    .filter((r) => !r.hidden)
    .sort((a, b) => new Date(b.date || b.created_at || 0) - new Date(a.date || a.created_at || 0))
    .slice(0, 5);

  const trackedList = usable(settled(myTrackedR, [])).map(mapTrackedReco);

  // Reuses the trackedIds call already made above for ranking — the track
  // icon on every card here is seeded from it rather than a second request.
  seedTracked(trackedIds, [...publicRecos, ...received].map((r) => r.id));

  debugLog(`pulse: public=${publicRecos.length} trending=${trending.length} received=${received.length} missed=${missed.length} fresh=${fresh.length} tracked=${trackedList.length}`);
  // allFeedRecos also feeds My Tracked's "reinforced" activity category
  // (deriveTrackedActivity) — the same pool web's TrackedSummaryWidget uses
  // for the identical join (a different creator's new post on a tracked
  // ticker).
  return { trending, missed, publicRecos, fresh, trackedList, allFeedRecos };
}

// Quick-jump pills at the top of Pulse — tapping one scrolls straight to
// that widget. Added because widgets used to blend into one long scroll
// with no way to tell where one ends and the next begins short of reading
// every card; this gives the same "which section am I looking at" clarity
// a native app's segmented tab bar gives, without turning Pulse into a
// paged/swipeable view (the web keeps all 4 widgets in one static stack —
// see Discovery.jsx's comment rejecting a 2-column layout as "busier").
const WIDGET_META = {
  fresh: { label: "Fresh", icon: "sparkles", tint: colors.accent, tintSoft: colors.accentSoft },
  trending: { label: "Trending", icon: "flame", tint: "#e8792b", tintSoft: "#fdeee1" },
  missed: { label: "Missed", icon: "eye-off", tint: "#2b7de8", tintSoft: "#e6f0fd" },
  tracked: { label: "Tracked", icon: "bookmark", tint: colors.gain, tintSoft: colors.gainSoft },
};

function PulseScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const mounted = useRef(true);
  const scrollRef = useRef(null);
  const offsets = useRef({});
  const recordOffset = (key) => (e) => {
    offsets.current[key] = e.nativeEvent.layout.y;
  };
  const jumpTo = (key) => {
    const y = offsets.current[key];
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  };

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
        setData((p) => p ?? { trending: [], missed: [], publicRecos: [], fresh: [], trackedList: [], allFeedRecos: [] });
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

  const header = <AppHeader title="Pulse" />;

  if (data === null) {
    return (
      <SafeAreaView style={styles.flex} edges={["top"]}>
        {header}
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const { trending, missed, fresh, trackedList, allFeedRecos } = data;
  const nothing = trending.length === 0 && missed.length === 0 && fresh.length === 0 && trackedList.length === 0;

  // Only offer a jump pill for a widget that actually has something to show —
  // an empty section still renders (its empty state), but isn't worth a tap.
  const jumpTargets = [
    fresh.length > 0 && "fresh",
    trending.length > 0 && "trending",
    missed.length > 0 && "missed",
    trackedList.length > 0 && "tracked",
  ].filter(Boolean);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      {header}
      {jumpTargets.length > 1 ? (
        <View style={styles.jumpBar}>
          {jumpTargets.map((key) => {
            const meta = WIDGET_META[key];
            return (
              <Pressable key={key} style={[styles.jumpPill, { backgroundColor: meta.tintSoft }]} onPress={() => jumpTo(key)}>
                <Ionicons name={meta.icon} size={13} color={meta.tint} />
                <Text style={[styles.jumpPillText, { color: meta.tint }]}>{meta.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
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

        {/* Widget order and titles mirror the web's Pulse column exactly
            (features/discovery/Discovery.jsx: Fresh Ideas from your Circle →
            Trending on MIC → What You Missed → My Tracked) — mobile used to
            run My Tracked second and swap Trending/What You Missed, which
            made "what's new" answer a different question on each client. */}
        {fresh.length > 0 ? (
          <Section
            onLayout={recordOffset("fresh")}
            meta={WIDGET_META.fresh}
            title="Fresh Ideas from your Circle"
            sub="The newest ideas shared with you"
            noTopDivider
          >
            {fresh.map((r) => (
              <RecoCard key={String(r.id)} reco={r} onPress={openReco} onOpenProfile={openProfile} onOpenTicker={openTicker} />
            ))}
          </Section>
        ) : null}

        {trending.length > 0 ? (
          <Section onLayout={recordOffset("trending")} meta={WIDGET_META.trending} title="Trending on MIC" sub="Gaining attention across the platform">
            {trending.map((t) => (
              <RankedCard key={String(t.idea?.id ?? t.id)} item={t} onPress={openReco} onOpenProfile={openProfile} onOpenTicker={openTicker} />
            ))}
          </Section>
        ) : null}

        {missed.length > 0 ? (
          <Section
            onLayout={recordOffset("missed")}
            meta={WIDGET_META.missed}
            title="What You Missed"
            sub="Ideas from your circle that moved recently"
          >
            {missed.map((m) => (
              <RankedCard key={String(m.idea?.id ?? m.id)} item={m} onPress={openReco} onOpenProfile={openProfile} onOpenTicker={openTicker} />
            ))}
          </Section>
        ) : null}

        <View onLayout={recordOffset("tracked")}>
          <MyTrackedWidget
            list={trackedList}
            allRecos={allFeedRecos}
            userId={profile?.id}
            onViewAll={() => router.push("/track")}
            onOpenActivity={openReco}
          />
        </View>

        {/* Pulse is a curated highlight reel, not the whole feed — this is
            the way out to everything, the same as the web's "See full feed"
            link at the bottom of its Pulse widgets. */}
        <Pressable style={styles.fullFeedLink} onPress={() => router.push("/feed")}>
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
function MyTrackedWidget({ list, allRecos, userId, onViewAll, onOpenActivity }) {
  const [mode, setMode] = useState("yesterday");
  const [daily, setDaily] = useState(null);
  const [seenCommentCounts, setSeenCommentCounts] = useState({});
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

  // Same "seen comment count" snapshot the web keeps (trackedActivity.js),
  // just backed by AsyncStorage instead of localStorage: read it once to
  // know what's NEW, then overwrite it with the current counts so the same
  // comments don't show as new again next visit.
  const commentCountKey = useMemo(() => list.map((r) => `${r.id}:${r.commentCount}`).join(","), [list]);
  useEffect(() => {
    if (!list.length) return;
    let cancelled = false;
    // Read BEFORE overwrite, not concurrently with it — saving first would
    // stamp the snapshot with today's counts before this pass ever compares
    // against yesterday's, so every comment would look "not new" forever.
    getSeenCommentCounts(userId).then((counts) => {
      if (cancelled || !mounted.current) return;
      setSeenCommentCounts(counts);
      saveSeenCommentCounts(userId, list);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentCountKey, userId]);

  const sum = useMemo(() => summariseTracked(list, mode === "yesterday" ? daily : null), [list, daily, mode]);

  // Same activity feed as the web's My Tracked (trackedActivity.js), shown
  // below the split for BOTH modes — exit signals, movers, new comments,
  // reinforcement from a different creator on a tracked ticker.
  const activity = useMemo(
    () => deriveTrackedActivity(list, allRecos, { mode, seenCommentCounts, dailyPrices: daily }),
    [list, allRecos, mode, seenCommentCounts, daily]
  );

  if (!list.length) {
    return (
      <Section meta={WIDGET_META.tracked} title="My Tracked" sub="Ideas you're following">
        <View style={styles.trackedEmpty}>
          <Text style={styles.trackedEmptyTitle}>Track ideas, watch them move</Text>
          <Text style={styles.trackedEmptySub}>
            Tap the bookmark on any idea to track it — its daily moves show up here.
          </Text>
        </View>
      </Section>
    );
  }

  // Same split the web's donut draws over the SAME total (Discovery.jsx
  // TrackedSummaryWidget) — rendered here as a bar, not a true ring: a real
  // donut needs react-native-svg, a native dependency that would force a
  // fresh EAS build before this reaches any installed app. Revisit once a
  // build is due for other reasons. Labels match the web verbatim: "Up
  // today"/"Down today" in yesterday mode, "In the money"/"Out of money" in
  // tracking mode — mobile previously invented its own wording here.
  const segments =
    mode === "yesterday"
      ? [
          { n: sum.up, color: colors.gain, label: "Up today", value: sum.up },
          { n: sum.down, color: colors.loss, label: "Down today", value: sum.down },
        ]
      : [
          { n: sum.inMoney, color: colors.gain, label: "In the money", value: sum.inMoney },
          { n: sum.outMoney, color: colors.loss, label: "Out of money", value: sum.outMoney },
        ];

  return (
    <Section meta={WIDGET_META.tracked} title="My Tracked" sub="Ideas you're following">
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

        {/* Bar: the "up"/"in the money" share fills from the left, the
            "down"/"out of money" share from the right — so each segment's
            row below sits directly under its own end of the bar, and the
            down/out-of-money count reads on the extreme right, matching
            the row it belongs to. */}
        <View style={styles.splitBar}>
          {segments.map((seg, i) =>
            seg.n > 0 ? <View key={i} style={{ flex: seg.n, backgroundColor: seg.color }} /> : null
          )}
        </View>
        {segments.map((seg, i) => (
          <View key={i} style={[styles.legendRow, { backgroundColor: `${seg.color}1a` }, i > 0 && { marginTop: 6 }]}>
            <Text style={[styles.legendRowLabel, { color: seg.color }]}>{seg.label}</Text>
            <Text style={[styles.legendRowValue, { color: seg.color }]}>{seg.value}</Text>
          </View>
        ))}
        {mode === "yesterday" && sum.noData > 0 ? (
          <Text style={styles.noDataNote}>{sum.noData} more without price history yet</Text>
        ) : null}

        {/* Same activity cards as the web, same headlines, same order:
            exit signals, then movers, then new comments, then reinforced —
            shown for both modes. */}
        {activity.length ? (
          <View style={styles.activityWrap}>
            {activity.map((item) => (
              <TrackedActivityRow key={`${item.type}:${item.idea.id}`} item={item} onPress={() => onOpenActivity?.(item.idea)} />
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

// Icon + colour per activity type/direction — same mapping as the web's
// TRACKED_ACTIVITY_ICON + iconColor/iconBg logic in Discovery.jsx.
const ACTIVITY_ICON = { exit: "flag", mover: "trending-up", comment: "chatbubble-outline", reinforced: "people-outline" };

function TrackedActivityRow({ item, onPress }) {
  const isDownMover = item.type === "mover" && item.direction === "down";
  const tint = item.type === "exit" || isDownMover ? colors.loss : item.type === "mover" ? colors.gain : colors.accentInk;
  const tintSoft = item.type === "exit" || isDownMover ? colors.lossSoft : item.type === "mover" ? colors.gainSoft : colors.accentSoft;
  return (
    <Pressable style={styles.activityRow} onPress={onPress}>
      <View style={[styles.activityIcon, { backgroundColor: tintSoft }]}>
        <Ionicons name={ACTIVITY_ICON[item.type] || "ellipse"} size={12} color={tint} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.activityHeadline}>{item.headline}</Text>
        {item.date ? <Text style={styles.activityDate}>{formatActivityDate(item.date)}</Text> : null}
      </View>
    </Pressable>
  );
}

function formatActivityDate(d) {
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

// Widgets used to run straight into one another with just 18px of margin and
// a same-weight icon+title row, so where "My Tracked" ended and "Trending on
// MIC" began was not obvious on a quick scroll (reported directly against
// this screen). A full-width divider plus a colour-badged icon gives every
// widget a clear start, the way a native settings/grouped list breaks
// sections rather than just adding whitespace.
function Section({ meta, title, sub, children, noTopDivider, onLayout }) {
  const tint = meta?.tint || colors.accentInk;
  const tintSoft = meta?.tintSoft || colors.accentSoft;
  return (
    <View style={styles.section} onLayout={onLayout}>
      {/* Divider tinted per widget — a quick colour cue (reinforced by the
          matching icon badge below and the jump pill above) that a new
          section has started, not just more whitespace. */}
      {!noTopDivider ? <View style={[styles.sectionDivider, { backgroundColor: tintSoft }]} /> : null}
      <View style={styles.sectionHead}>
        <View style={[styles.sectionIconBadge, { backgroundColor: tintSoft }]}>
          <Ionicons name={meta?.icon ? `${meta.icon}-outline` : "ellipse-outline"} size={15} color={tint} />
        </View>
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
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    marginTop: 7,
  },
  legendRowLabel: { fontFamily: fonts.semibold, fontSize: 12.5 },
  legendRowValue: { fontFamily: fonts.extrabold, fontSize: 15 },
  noDataNote: { color: colors.muted, fontFamily: fonts.regular, fontSize: 10.5, marginTop: 6, paddingLeft: 2 },
  activityWrap: { marginTop: 14, borderTopWidth: 1, borderTopColor: colors.line },
  activityRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 9 },
  activityIcon: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", marginTop: 1, flexShrink: 0 },
  activityHeadline: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 12.5, lineHeight: 17 },
  activityDate: { color: colors.muted, fontFamily: fonts.regular, fontSize: 10.5, marginTop: 1 },
  viewAll: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingTop: 14 },
  viewAllText: { color: colors.accentInk, fontFamily: fonts.bold, fontSize: 13 },
  trackedEmpty: { paddingHorizontal: 16, paddingBottom: 4 },
  trackedEmptyTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 14 },
  trackedEmptySub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
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
  jumpBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
  },
  jumpPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 20,
  },
  jumpPillText: { fontFamily: fonts.bold, fontSize: 12 },
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  section: { marginTop: 28 },
  sectionDivider: { height: 8, backgroundColor: colors.surface2, marginBottom: 20 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, marginBottom: 12 },
  sectionIconBadge: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 16.5 },
  sectionSub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 1 },
  reasonRow: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 20, marginBottom: 4 },
  reasonIcon: { fontSize: 11 },
  reasonText: { color: colors.accentInk, fontFamily: fonts.semibold, fontSize: 11, flex: 1 },
  empty: { alignItems: "center", justifyContent: "center", paddingHorizontal: 40, paddingTop: 50 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 16, marginTop: 12 },
  emptySub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 19 },
});

export default withBoundary(PulseScreen, "Pulse");
