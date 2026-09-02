import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getTickerRecos, getDailyPrices } from "../../src/services/api/consensusApi";
import { computeConsensus, computeTrend, consensusColor } from "../../src/utils/consensus";
import Sparkline from "../../src/components/Sparkline";
import { fmt, fmtDate } from "../../src/utils/format";
import Avatar from "../../src/components/Avatar";
import { primeAvatars } from "../../src/services/avatarCache";
import { debugLog } from "../../src/utils/logger";
import { colors, fonts } from "../../src/theme/colors";
import { withBoundary } from "../../src/components/ErrorBoundary";

/**
 * Market consensus for one ticker — "what does everyone think about INFY".
 *
 * Mirrors the web's SecurityQuickPanel: a bull/bear gauge, the consensus
 * trend over the last six months, the latest price, and every public idea
 * behind the verdict. The aggregation uses the verbatim-ported
 * computeConsensus/computeTrend, so the number here matches the web's for the
 * same ideas.
 */
function TickerConsensusScreen() {
  const { symbol } = useLocalSearchParams();
  const router = useRouter();
  const ticker = String(symbol || "").toUpperCase();
  const [recos, setRecos] = useState(null);
  const [price, setPrice] = useState(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    // Independent calls: the ideas and the live price don't depend on each
    // other, so they go together rather than one after the other.
    const [rows, prices] = await Promise.all([getTickerRecos(ticker), getDailyPrices([ticker])]);
    if (!mounted.current) return;
    setRecos(rows);
    setPrice((prices || []).find((p) => String(p.ticker).toUpperCase() === ticker) || null);
    primeAvatars((rows || []).map((r) => r.from));
    debugLog(`consensus ${ticker}: ideas=${rows?.length ?? 0} price=${prices?.length ? "yes" : "no"}`);
  }, [ticker]);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const cons = computeConsensus(recos || []);
  const trend = computeTrend(recos || []);
  const tint = consensusColor(cons, colors);
  const assetName = (recos || []).find((r) => r.asset_name)?.asset_name;

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 40 }}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          {ticker}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {recos === null ? (
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

          {cons.total === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="stats-chart-outline" size={40} color={colors.line2} />
              <Text style={styles.emptyTitle}>No public ideas yet</Text>
              <Text style={styles.emptySub}>
                Once people share ideas on {ticker}, the consensus shows up here.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Market consensus</Text>
                <Text style={[styles.verdict, { color: tint }]}>{cons.label}</Text>
                <Text style={styles.basis}>
                  from {cons.total} idea{cons.total === 1 ? "" : "s"}
                </Text>

                {/* Proportional bar: bullish, neutral, bearish. */}
                <View style={styles.bar}>
                  {cons.bullPct > 0 ? (
                    <View style={{ flex: cons.bullPct, backgroundColor: colors.gain }} />
                  ) : null}
                  {cons.neutralPct > 0 ? (
                    <View style={{ flex: cons.neutralPct, backgroundColor: colors.line2 }} />
                  ) : null}
                  {cons.bearPct > 0 ? (
                    <View style={{ flex: cons.bearPct, backgroundColor: colors.loss }} />
                  ) : null}
                </View>
                <View style={styles.legend}>
                  <Text style={[styles.legendItem, { color: colors.gain }]}>{cons.bullPct}% buy</Text>
                  <Text style={[styles.legendItem, { color: colors.muted }]}>{cons.neutralPct}% hold</Text>
                  <Text style={[styles.legendItem, { color: colors.loss }]}>{cons.bearPct}% sell</Text>
                </View>
              </View>

              {trend.length >= 2 ? (
                <View style={styles.card}>
                  <View style={styles.trendHead}>
                    <Text style={styles.cardLabel}>Consensus trend</Text>
                    <Text style={[styles.trendNow, { color: tint }]}>{trend[trend.length - 1]}%</Text>
                  </View>
                  <Text style={styles.basis}>Share of ideas that were Buy, by month</Text>
                  <Sparkline values={trend} color={tint} height={52} style={{ marginTop: 12 }} />
                </View>
              ) : null}

              <Text style={styles.sectionTitle}>
                {cons.total} idea{cons.total === 1 ? "" : "s"} on {ticker}
              </Text>
              {(recos || []).map((r) => (
                <Pressable
                  key={String(r.id)}
                  style={styles.ideaRow}
                  onPress={() => router.push(`/reco/${r.id}`)}
                >
                  <Avatar profile={r} uid={r.from} name={r.full_name} size={34} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.ideaName} numberOfLines={1}>
                      {r.full_name || r.username || "Investor"}
                    </Text>
                    <Text style={styles.ideaMeta} numberOfLines={1}>
                      {fmtDate(r.created_at)}
                      {r.conviction ? ` · ${r.conviction} conviction` : ""}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.tag,
                      r.recommendation_type === "Buy"
                        ? { color: colors.gain, backgroundColor: colors.gainSoft }
                        : r.recommendation_type === "Sell"
                        ? { color: colors.loss, backgroundColor: colors.lossSoft }
                        : { color: colors.muted, backgroundColor: colors.surface2 },
                    ]}
                  >
                    {r.recommendation_type || "Hold"}
                  </Text>
                </Pressable>
              ))}
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
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
  },
  cardLabel: { color: colors.muted, fontFamily: fonts.bold, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 },
  verdict: { fontFamily: fonts.extrabold, fontSize: 22, marginTop: 6 },
  basis: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  bar: { flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden", marginTop: 14, backgroundColor: colors.line },
  legend: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  legendItem: { fontFamily: fonts.semibold, fontSize: 12 },
  trendHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  trendNow: { fontFamily: fonts.extrabold, fontSize: 18 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 15, marginTop: 22, marginBottom: 8 },
  ideaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  ideaName: { color: colors.ink, fontFamily: fonts.bold, fontSize: 14 },
  ideaMeta: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, marginTop: 1 },
  tag: {
    fontFamily: fonts.bold,
    fontSize: 11,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  empty: { alignItems: "center", paddingHorizontal: 30, paddingTop: 60 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 16, marginTop: 12 },
  emptySub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 19 },
});

export default withBoundary(TickerConsensusScreen, "TickerConsensus");
