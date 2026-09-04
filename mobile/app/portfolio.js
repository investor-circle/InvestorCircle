import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  ScrollView,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  getPortfolioHoldings,
  addPortfolioHolding,
  deletePortfolioHolding,
} from "../src/services/api/portfolioApi";
import AddHoldingModal from "../src/components/AddHoldingModal";
import { deleteAllPortfolioHoldings } from "../src/services/api/portfolioApi";
import { getDailyPrices, getConsensusRecosAll } from "../src/services/api/consensusApi";
import { consensusByTicker, consensusColor } from "../src/utils/consensus";
import { getMyConnections } from "../src/services/api/connectionsApi";
import { byTicker } from "../src/utils/trackedSummary";
import {
  buildHoldingsData,
  opportunitySignals,
  assetClassOptions,
  filterHoldings,
  holdingPriceIdentifier,
  SIGNAL_LABEL,
} from "../src/utils/portfolioSignals";
import { portfolioTotals } from "../src/utils/portfolio";
import { fmt, fmtPct } from "../src/utils/format";
import { colors, fonts } from "../src/theme/colors";
import { withBoundary } from "../src/components/ErrorBoundary";

// Holdings view with manual add/delete. Value/cost/P&L are computed here
// purely for display from the server's own sh/cost/price fields — the same
// arithmetic the web portfolio table does (portfolioTotals).
//
// CAS statement import lives on its own screen (app/portfolio-import.js) and
// uses the same server-side parser as the web app.
function PortfolioScreen() {
  const router = useRouter();
  const [holdings, setHoldings] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  // Latest close per ticker, keyed upper-case. Overlays the stored price so
  // the portfolio reflects the most recent nightly run without waiting for
  // the holdings themselves to be rewritten. Failure is not an error — it
  // degrades to the stored price, same as the web.
  const [livePrices, setLivePrices] = useState({});
  // What the circle thinks about each holding — the web's Portfolio
  // Intelligence view (consensus-all + computeConsensus). Off the critical
  // path: holdings render first and the verdicts fill in behind them, so a
  // slow or failed consensus call never delays the portfolio itself.
  const [consensus, setConsensus] = useState({});
  // The raw ideas behind each ticker, not just the computed verdict: the
  // signal cards need them (recency for "emerging", the circle subset for
  // "diverging"), which a consensus summary has already thrown away.
  const [recosByTicker, setRecosByTicker] = useState({});
  const [circleIds, setCircleIds] = useState([]);
  // Filters — signal tab, asset class, free text. Deliberately NOT persisted:
  // a filter you set last week and forgot is how a portfolio appears to have
  // lost holdings.
  const [signal, setSignal] = useState("all");
  const [assetClass, setAssetClass] = useState("all");
  const [search, setSearch] = useState("");
  const mounted = useRef(true);

  const load = useCallback(async () => {
    const rows = await getPortfolioHoldings();
    if (!mounted.current) return;
    setHoldings(rows);

    // Dependent on the holdings (we need their tickers), so it follows —
    // but it must not delay showing them, hence a separate render.
    // A mutual fund is priced by ISIN rather than by symbol, so asking for
    // symbols alone would return nothing for every fund in the portfolio.
    const syms = [...new Set((rows || []).map(holdingPriceIdentifier).filter(Boolean))];
    if (!syms.length) return;
    const prices = await getDailyPrices(syms);
    if (!mounted.current) return;
    const map = {};
    for (const p of prices || []) {
      if (p?.ticker && p.close != null) map[String(p.ticker).toUpperCase()] = p;
    }
    setLivePrices(map);
  }, []);

  // Independent of the holdings fetch (it returns every idea, not just the
  // ones held), so it runs alongside rather than after it.
  useEffect(() => {
    // Independent of each other and of the holdings fetch, so all three run
    // together rather than in series.
    Promise.allSettled([getConsensusRecosAll(), getMyConnections()]).then(([ideasR, connR]) => {
      if (!mounted.current) return;
      if (ideasR.status === "fulfilled") {
        const verdicts = {};
        const rows = {};
        for (const entry of consensusByTicker(ideasR.value || [])) {
          verdicts[entry.ticker] = entry.consensus;
          rows[entry.ticker] = entry.recos;
        }
        setConsensus(verdicts);
        setRecosByTicker(rows);
      }
      if (connR.status === "fulfilled") {
        setCircleIds((connR.value || []).map((c) => c.user_id).filter(Boolean));
      }
    });
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

  // Holdings with the live close applied where we have one, so the summary
  // and the rows agree rather than one being fresher than the other.
  const priced = useMemo(
    () =>
      (holdings || []).map((h) => {
        const live = livePrices[holdingPriceIdentifier(h)];
        return live?.close != null ? { ...h, price: live.close, _changePct: live.changePct } : h;
      }),
    [holdings, livePrices]
  );

  const totals = useMemo(() => portfolioTotals(priced), [priced]);

  // The daily snapshot the signal cards read, keyed the way buildHoldingsData
  // expects (ticker + asset class, not ticker alone — see trackedSummary.js).
  const dailyPrices = useMemo(
    () => byTicker(Object.values(livePrices)),
    [livePrices]
  );
  const holdingsData = useMemo(
    () => buildHoldingsData(holdings || [], recosByTicker, circleIds, dailyPrices),
    [holdings, recosByTicker, circleIds, dailyPrices]
  );
  const signals = useMemo(() => opportunitySignals(holdingsData), [holdingsData]);
  const classes = useMemo(() => assetClassOptions(holdingsData), [holdingsData]);
  const visible = useMemo(
    () => filterHoldings(holdingsData, { signal, assetClass, search }),
    [holdingsData, signal, assetClass, search]
  );
  const filtering = signal !== "all" || assetClass !== "all" || !!search.trim();

  const confirmDeleteAll = useCallback(() => {
    Alert.alert(
      "Remove all holdings?",
      "This deletes every holding in your portfolio. It cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete all",
          style: "destructive",
          onPress: async () => {
            const ok = await deleteAllPortfolioHoldings();
            if (!mounted.current) return;
            if (ok) {
              setHoldings([]);
              setLivePrices({});
            } else {
              Alert.alert("Couldn't delete", "Please try again.");
            }
          },
        },
      ]
    );
  }, []);

  // Optimistic add: show the row immediately, then reconcile with the server
  // so a server-side normalization (holdingFields) wins over what we guessed.
  const addHolding = useCallback(async (holding) => {
    const ok = await addPortfolioHolding(holding);
    if (!ok) return false;
    if (mounted.current) setHoldings((p) => [...(p || []), holding]);
    load();
    return true;
  }, [load]);

  const confirmDelete = useCallback(
    (holding) => {
      Alert.alert(
        "Remove holding",
        `Remove ${holding.sym} from your portfolio? This doesn't affect any ideas you've shared.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              // Optimistic removal, restored if the server rejects it.
              const prev = holdings || [];
              setHoldings(prev.filter((h) => String(h.id) !== String(holding.id)));
              const ok = await deletePortfolioHolding(holding.id);
              if (!ok && mounted.current) {
                setHoldings(prev);
                Alert.alert("Couldn't remove", "That holding is still there — please try again.");
              }
            },
          },
        ]
      );
    },
    [holdings]
  );

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 40 }}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>Portfolio</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Pressable onPress={() => router.push("/portfolio-import")} hitSlop={10}>
            <Ionicons name="cloud-upload-outline" size={21} color={colors.accent} />
          </Pressable>
          <Pressable onPress={() => setAdding(true)} hitSlop={10}>
            <Ionicons name="add" size={26} color={colors.accent} />
          </Pressable>
        </View>
      </View>

      {holdings === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(h) => String(h.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          contentContainerStyle={holdings.length === 0 ? styles.emptyWrap : { padding: 16 }}
          ListHeaderComponent={
            holdings.length > 0 ? (
              <>
              <View style={styles.summary}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Current value</Text>
                  <Text style={styles.summaryValue}>{fmt(totals.value)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Invested</Text>
                  <Text style={styles.summarySub}>{fmt(totals.cost)}</Text>
                </View>
                <View style={[styles.summaryRow, { marginBottom: 0 }]}>
                  <Text style={styles.summaryLabel}>Unrealised P&L</Text>
                  <Text style={[styles.summaryValue, { color: totals.pnl >= 0 ? colors.gain : colors.loss }]}>
                    {fmt(totals.pnl)} ({fmtPct(totals.pct)})
                  </Text>
                </View>
              </View>

              {/* Opportunity Signals — at most four, one per category, never
                  the same holding twice (see portfolioSignals.js). */}
              {signals.length ? (
                <>
                  <Text style={styles.sectionLabel}>Opportunity signals</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.signalRail}
                  >
                    {signals.map(({ kind, holding }) => {
                      const tint =
                        kind === "diverging"
                          ? "#92400e"
                          : kind === "mover" && holding.dailyChangePct < 0
                          ? colors.loss
                          : kind === "mover"
                          ? colors.gain
                          : colors.accentInk;
                      return (
                        <Pressable
                          key={kind}
                          style={styles.signalCard}
                          onPress={() =>
                            router.push(`/ticker/${encodeURIComponent(String(holding.sym).toUpperCase())}`)
                          }
                        >
                          <Text style={[styles.signalKind, { color: tint }]}>
                            {SIGNAL_LABEL[kind].toUpperCase()}
                          </Text>
                          <Text style={styles.signalSym} numberOfLines={1}>
                            {holding.sym}
                          </Text>
                          <Text style={[styles.signalStat, { color: tint }]}>
                            {kind === "mover"
                              ? `${holding.dailyChangePct >= 0 ? "+" : ""}${Number(
                                  holding.dailyChangePct
                                ).toFixed(2)}% today`
                              : kind === "diverging"
                              ? `Circle ${holding.circle.bullPct}% vs ${holding.community.bullPct}%`
                              : `${holding.community.bullPct}% ${holding.community.label}`}
                          </Text>
                          <Text style={styles.signalMeta} numberOfLines={1}>
                            {holding.community.total} idea
                            {holding.community.total === 1 ? "" : "s"}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </>
              ) : null}

              {/* Filters. The asset-class row only appears when the portfolio
                  actually holds more than one class — a single-class filter
                  is a control that can only ever do nothing. */}
              <View style={styles.searchRow}>
                <Ionicons name="search" size={15} color={colors.muted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Filter holdings"
                  placeholderTextColor={colors.muted}
                  value={search}
                  onChangeText={setSearch}
                  autoCorrect={false}
                />
                {search ? (
                  <Pressable onPress={() => setSearch("")} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={colors.muted} />
                  </Pressable>
                ) : null}
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {[
                  ["all", "All"],
                  ["bullish", "Bullish"],
                  ["bearish", "Bearish"],
                  ["neutral", "Neutral"],
                ].map(([v, l]) => (
                  <Pressable
                    key={v}
                    style={[styles.chip, signal === v && styles.chipOn]}
                    onPress={() => setSignal(v)}
                  >
                    <Text style={[styles.chipText, signal === v && styles.chipTextOn]}>{l}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              {classes.length > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  {["all", ...classes].map((c) => (
                    <Pressable
                      key={c}
                      style={[styles.chip, assetClass === c && styles.chipOn]}
                      onPress={() => setAssetClass(c)}
                    >
                      <Text style={[styles.chipText, assetClass === c && styles.chipTextOn]}>
                        {c === "all" ? "All types" : c}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}

              {filtering ? (
                <Text style={styles.countLine}>
                  Showing {visible.length} of {holdingsData.length}
                </Text>
              ) : null}
              </>
            ) : null
          }
          renderItem={({ item }) => {
            const sh = Number(item.sh) || 0;
            const value = sh * (Number(item.price) || 0);
            const cost = sh * (Number(item.cost) || 0);
            const pct = cost > 0 ? (value - cost) / cost : 0;
            const up = pct >= 0;
            const cons = consensus[String(item.sym || "").toUpperCase()];
            return (
              <Pressable
                style={styles.card}
                onPress={() => item.sym && router.push(`/ticker/${encodeURIComponent(String(item.sym).toUpperCase())}`)}
                onLongPress={() => confirmDelete(item)}
                delayLongPress={350}
                android_ripple={{ color: colors.line }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.sym} numberOfLines={1}>
                    {item.sym}
                  </Text>
                  <Text style={styles.hname} numberOfLines={1}>
                    {item.name || item.type}
                  </Text>
                  <Text style={styles.qty}>
                    {sh} × {fmt(item.cost)}
                  </Text>
                  {cons && cons.total > 0 ? (
                    <View style={styles.consRow}>
                      <View style={[styles.consDot, { backgroundColor: consensusColor(cons, colors) }]} />
                      <Text style={[styles.consText, { color: consensusColor(cons, colors) }]}>
                        {cons.label}
                      </Text>
                      <Text style={styles.consCount}>
                        · {cons.total} idea{cons.total === 1 ? "" : "s"}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.value}>{fmt(value)}</Text>
                  <Text style={[styles.pct, { color: up ? colors.gain : colors.loss }]}>
                    {up ? "▲" : "▼"} {fmtPct(pct)}
                  </Text>
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            // Two different empties: a portfolio with nothing in it, and one
            // whose holdings are all filtered out. Showing "add a holding" to
            // someone who has twenty but typed a bad filter would be wrong.
            filtering && holdingsData.length > 0 ? (
              <View style={styles.noMatch}>
                <Ionicons name="funnel-outline" size={34} color={colors.line2} />
                <Text style={styles.noMatchTitle}>No holdings match these filters</Text>
                <Pressable
                  onPress={() => {
                    setSignal("all");
                    setAssetClass("all");
                    setSearch("");
                  }}
                >
                  <Text style={styles.clearLink}>Clear filters</Text>
                </Pressable>
              </View>
            ) : (
            <View style={styles.empty}>
              <Ionicons name="briefcase-outline" size={40} color={colors.line2} />
              <Text style={styles.emptyTitle}>No holdings yet</Text>
              <Text style={styles.emptySub}>
                Tap + to add a holding, or import a CAS statement from your broker.
              </Text>
              <Pressable style={styles.emptyBtn} onPress={() => setAdding(true)}>
                <Ionicons name="add" size={17} color="#fff" />
                <Text style={styles.emptyBtnText}>Add a holding</Text>
              </Pressable>
              <Pressable style={styles.emptyLink} onPress={() => router.push("/portfolio-import")}>
                <Text style={styles.emptyLinkText}>Import a CAS statement</Text>
              </Pressable>
            </View>
            )
          }
        />
      )}

      {holdings && holdings.length > 0 ? (
        <View style={styles.footerBar}>
          <Text style={styles.hintBar}>Tap a holding for market consensus · long-press to remove it.</Text>
          <Pressable onPress={confirmDeleteAll} hitSlop={8}>
            <Text style={styles.deleteAll}>Remove all holdings</Text>
          </Pressable>
        </View>
      ) : null}

      <AddHoldingModal visible={adding} onClose={() => setAdding(false)} onAdded={addHolding} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    color: colors.muted,
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: 4,
    marginBottom: 8,
  },
  signalRail: { gap: 10, paddingRight: 4, paddingBottom: 4 },
  signalCard: {
    width: 152,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 13,
    padding: 12,
  },
  signalKind: { fontFamily: fonts.bold, fontSize: 9, letterSpacing: 0.5 },
  signalSym: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 16, marginTop: 5 },
  signalStat: { fontFamily: fonts.bold, fontSize: 12, marginTop: 3 },
  signalMeta: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, marginTop: 4 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.surface,
    borderRadius: 11,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, paddingVertical: 9, color: colors.ink, fontFamily: fonts.regular, fontSize: 14 },
  chips: { gap: 7, paddingTop: 10, paddingRight: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 12 },
  chipTextOn: { color: "#fff" },
  countLine: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 12 },
  noMatch: { alignItems: "center", paddingVertical: 34, gap: 8 },
  noMatchTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 14.5 },
  clearLink: { color: colors.accentInk, fontFamily: fonts.bold, fontSize: 13.5, paddingTop: 4 },
  consRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  consDot: { width: 7, height: 7, borderRadius: 4 },
  consText: { fontFamily: fonts.bold, fontSize: 11 },
  consCount: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11 },
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
  summary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  summaryLabel: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 13 },
  summaryValue: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 17 },
  summarySub: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 15 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  sym: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 15 },
  hname: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 1 },
  qty: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 4 },
  value: { color: colors.ink, fontFamily: fonts.bold, fontSize: 15 },
  pct: { fontFamily: fonts.bold, fontSize: 13, marginTop: 3 },
  emptyWrap: { flexGrow: 1 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, paddingTop: 80 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 16, marginTop: 12 },
  emptySub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 19 },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 11,
    marginTop: 18,
  },
  emptyBtnText: { color: "#fff", fontFamily: fonts.bold, fontSize: 14 },
  emptyLink: { paddingVertical: 12 },
  emptyLinkText: { color: colors.accentInk, fontFamily: fonts.semibold, fontSize: 13 },
  footerBar: { alignItems: "center", paddingBottom: 6 },
  deleteAll: { color: colors.loss, fontFamily: fonts.semibold, fontSize: 12, paddingVertical: 8 },
  hintBar: {
    color: colors.muted,
    fontFamily: fonts.regular,
    fontSize: 11,
    textAlign: "center",
    paddingVertical: 8,
  },
});

export default withBoundary(PortfolioScreen, "Portfolio");
