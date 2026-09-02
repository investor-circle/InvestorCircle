import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl, Alert } from "react-native";
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
  const mounted = useRef(true);

  const load = useCallback(async () => {
    const rows = await getPortfolioHoldings();
    if (!mounted.current) return;
    setHoldings(rows);

    // Dependent on the holdings (we need their tickers), so it follows —
    // but it must not delay showing them, hence a separate render.
    const syms = [...new Set((rows || []).map((h) => h?.sym).filter(Boolean))];
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
    getConsensusRecosAll()
      .then((rows) => {
        if (!mounted.current) return;
        const map = {};
        for (const entry of consensusByTicker(rows || [])) map[entry.ticker] = entry.consensus;
        setConsensus(map);
      })
      .catch(() => {
        /* a missing verdict just means no badge */
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
        const live = livePrices[String(h?.sym || "").toUpperCase()];
        return live?.close != null ? { ...h, price: live.close, _changePct: live.changePct } : h;
      }),
    [holdings, livePrices]
  );

  const totals = useMemo(() => portfolioTotals(priced), [priced]);

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
          data={priced}
          keyExtractor={(h) => String(h.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          contentContainerStyle={holdings.length === 0 ? styles.emptyWrap : { padding: 16 }}
          ListHeaderComponent={
            holdings.length > 0 ? (
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
