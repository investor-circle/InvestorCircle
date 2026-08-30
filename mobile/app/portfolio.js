import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getPortfolioHoldings } from "../src/services/api/portfolioApi";
import { fmt, fmtPct } from "../src/utils/format";
import { colors, fonts } from "../src/theme/colors";
import { withBoundary } from "../src/components/ErrorBoundary";

// Read-only holdings view. Value/cost/P&L are computed here purely for
// display from the server's own sh/cost/price fields — the same arithmetic
// the web portfolio table does. (Adding/importing holdings stays on web for
// now; CAS/PAN import is a desktop-file flow.)
function PortfolioScreen() {
  const router = useRouter();
  const [holdings, setHoldings] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    const rows = await getPortfolioHoldings();
    if (mounted.current) setHoldings(rows);
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

  const totals = useMemo(() => {
    const rows = holdings || [];
    let value = 0;
    let cost = 0;
    rows.forEach((h) => {
      const sh = Number(h.sh) || 0;
      value += sh * (Number(h.price) || 0);
      cost += sh * (Number(h.cost) || 0);
    });
    return { value, cost, pnl: value - cost, pct: cost > 0 ? (value - cost) / cost : 0 };
  }, [holdings]);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 40 }}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>Portfolio</Text>
        <View style={{ width: 40 }} />
      </View>

      {holdings === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={holdings}
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
            return (
              <View style={styles.card}>
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
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.value}>{fmt(value)}</Text>
                  <Text style={[styles.pct, { color: up ? colors.gain : colors.loss }]}>
                    {up ? "▲" : "▼"} {fmtPct(pct)}
                  </Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="briefcase-outline" size={40} color={colors.line2} />
              <Text style={styles.emptyTitle}>No holdings yet</Text>
              <Text style={styles.emptySub}>
                Add holdings (or import a CAS statement) on the web app and they'll appear here.
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
});

export default withBoundary(PortfolioScreen, "Portfolio");
