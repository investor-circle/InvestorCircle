import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Share } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getTickerRecos, getTickerViews, getDailyPrices } from "../../src/services/api/consensusApi";
import { getMyConnections } from "../../src/services/api/connectionsApi";
import { getMyTracking } from "../../src/services/api/trackingApi";
import { researchBreakdown, viewBreakdownFromCounts, pageSections } from "../../src/utils/securityInsights";
import { LayerSummary, ResearchSection, ViewsSection } from "../../src/components/SecuritySections";
import { fmt } from "../../src/utils/format";
import { primeAvatars } from "../../src/services/avatarCache";
import { debugLog } from "../../src/utils/logger";
import { colors, fonts } from "../../src/theme/colors";
import { withBoundary } from "../../src/components/ErrorBoundary";
import { securityUrl } from "../../src/utils/links";

const EMPTY_SUMMARY = { total: 0, positive: 0, neutral: 0, negative: 0, contributors: 0 };

/**
 * The Security Page — two separate layers for one ticker:
 *
 *   Verified Research  ("what does verified research say?")   Buy / Hold / Sell
 *   Market Views       ("what are independent participants saying?")
 *                                                             Positive / Neutral / Negative
 *
 * Kept completely apart (separate endpoints, separate figures, no combined
 * score); a layer with no data is not rendered at all. MIC organises and
 * presents both — it issues no recommendation of its own. Mirrors the web's
 * SecurityIntelligencePage; the figures come from the same securityInsights
 * helpers (a byte-identical copy), so both clients agree.
 */
function SecurityScreen() {
  const { symbol } = useLocalSearchParams();
  const router = useRouter();
  const ticker = String(symbol || "").toUpperCase();
  const [recos, setRecos] = useState(null); // Verified Research only
  const [viewData, setViewData] = useState(null); // { summary, views, stances, hasMore }
  const [price, setPrice] = useState(null);
  const [circleIds, setCircleIds] = useState(null); // Set of ids, or null until known
  const [loadingMore, setLoadingMore] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    // Independent calls — research, Market Views, the price and the viewer's
    // Circle don't depend on each other, so they go together.
    const [rows, views, prices, conns, tracking] = await Promise.all([
      getTickerRecos(ticker),
      getTickerViews(ticker),
      getDailyPrices([ticker]),
      getMyConnections().catch(() => []),
      getMyTracking().catch(() => []),
    ]);
    if (!mounted.current) return;
    setRecos(rows);
    setViewData(views);
    setPrice((prices || []).find((p) => String(p.ticker).toUpperCase() === ticker) || null);
    const ids = new Set();
    (conns || []).filter((c) => c.status === "accepted").forEach((c) => c.user_id && ids.add(String(c.user_id)));
    (tracking || []).forEach((t) => (typeof t === "string" ? ids.add(t) : t?.id && ids.add(String(t.id))));
    setCircleIds(ids);
    primeAvatars([...(rows || []), ...(views.views || [])].map((r) => r.from));
    debugLog(`security ${ticker}: research=${rows?.length ?? 0} views=${views?.summary?.total ?? 0}`);
  }, [ticker]);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const loadMoreViews = useCallback(async () => {
    if (loadingMore || !viewData) return;
    setLoadingMore(true);
    const more = await getTickerViews(ticker, { offset: viewData.views.length });
    if (!mounted.current) return;
    setViewData((d) => ({ ...d, views: [...d.views, ...more.views], hasMore: more.hasMore }));
    primeAvatars(more.views.map((r) => r.from));
    setLoadingMore(false);
  }, [loadingMore, viewData, ticker]);

  const loading = recos === null || viewData === null;
  const summary = viewData?.summary || EMPTY_SUMMARY;
  const avail = pageSections({ research: (recos || []).length, views: summary.total });
  const researchB = avail.hasResearch ? researchBreakdown(recos, (r) => r.from) : null;
  const viewsB = avail.hasViews ? viewBreakdownFromCounts(summary) : null;
  const assetName = (recos || []).find((r) => r.asset_name)?.asset_name || (viewData?.views || []).find((r) => r.asset_name)?.asset_name;

  // Same shareable link the web's Stock Insights page hands out — a recipient
  // without the app lands on the same public page regardless of which client
  // shared it.
  const onShare = async () => {
    const url = securityUrl(ticker);
    if (!url) return;
    try {
      await Share.share({ message: `${assetName || ticker} on myInvestorCircle — ${url}`, url });
    } catch (_) {
      /* user dismissed the OS sheet */
    }
  };

  const openReco = (r) => router.push(`/reco/${r.id}`);
  const openProfile = (username) => router.push(`/investor/${encodeURIComponent(username)}`);

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 40 }}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          {ticker}
        </Text>
        <Pressable onPress={onShare} hitSlop={10} style={{ width: 40, alignItems: "flex-end" }}>
          <Ionicons name="share-social-outline" size={21} color={colors.accentInk} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36 }}>
          {assetName ? <Text style={styles.assetName}>{assetName}</Text> : null}

          {price?.close != null ? (
            <View style={styles.priceRow}>
              <Text style={styles.price}>{fmt(price.close)}</Text>
              {price.changePct != null ? (
                <Text style={[styles.change, { color: price.changePct >= 0 ? colors.gain : colors.loss }]}>
                  {price.changePct >= 0 ? "▲" : "▼"} {Math.abs(price.changePct).toFixed(2)}%
                </Text>
              ) : null}
              {price.date ? <Text style={styles.priceDate}>as of {price.date}</Text> : null}
            </View>
          ) : null}

          {!avail.hasAny ? (
            <View style={styles.empty}>
              <Ionicons name="stats-chart-outline" size={40} color={colors.line2} />
              <Text style={styles.emptyTitle}>No public research or Market Views yet</Text>
              <Text style={styles.emptySub}>
                Once members publish research or share a view on {ticker}, it shows up here.
              </Text>
            </View>
          ) : (
            <>
              <LayerSummary research={researchB} views={viewsB} />

              {avail.hasResearch ? (
                <ResearchSection ticker={ticker} recos={recos} onOpenReco={openReco} onOpenProfile={openProfile} />
              ) : null}

              {avail.hasViews ? (
                <ViewsSection
                  ticker={ticker}
                  summary={summary}
                  views={viewData.views}
                  stances={viewData.stances}
                  circleIds={circleIds}
                  signedIn
                  hasMore={viewData.hasMore}
                  loadingMore={loadingMore}
                  onLoadMore={loadMoreViews}
                  onOpenReco={openReco}
                  onOpenProfile={openProfile}
                />
              ) : null}
            </>
          )}
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
  topTitle: { flex: 1, textAlign: "center", color: colors.ink, fontFamily: fonts.extrabold, fontSize: 17 },
  assetName: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 15 },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 6, flexWrap: "wrap" },
  price: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 24 },
  change: { fontFamily: fonts.bold, fontSize: 14 },
  priceDate: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11 },
  empty: { alignItems: "center", paddingHorizontal: 30, paddingTop: 60 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 16, marginTop: 12, textAlign: "center" },
  emptySub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 19 },
});

export default withBoundary(SecurityScreen, "Security");
