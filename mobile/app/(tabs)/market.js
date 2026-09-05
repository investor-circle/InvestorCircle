import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getConsensusRecosPublic } from "../../src/services/api/consensusApi";
import { getMyConnections } from "../../src/services/api/connectionsApi";
import { computeTrend, consensusColor } from "../../src/utils/consensus";
import { buildTickerList, featuredTickers, sectorOptions, lastActivityAt } from "../../src/utils/marketInsights";
import { fmtDate } from "../../src/utils/format";
import Sparkline from "../../src/components/Sparkline";
import AppHeader from "../../src/components/AppHeader";
import { colors, fonts } from "../../src/theme/colors";
import { withBoundary } from "../../src/components/ErrorBoundary";

/**
 * Market Insights — "what does the platform generally think", by stock.
 *
 * The web's MarketIntelligencePage, ported: the same four featured cards, the
 * same three tabs, the same sector/search/sort filters, and the same ranking.
 * All of the ranking lives in src/utils/marketInsights.js so the two clients
 * cannot drift into disagreeing about the same ideas — see the reasoning
 * recorded there.
 *
 * The one deliberate difference is layout. The web puts a detail panel beside
 * the list on desktop; there is no room for that here, so a row expands in
 * place (which is what the web itself does on a narrow screen) and the full
 * per-ticker view stays where it already was on mobile: the ticker screen,
 * one tap away.
 */
const TABS = [
  ["all", "All"],
  ["circle", "My Circle"],
  ["community", "Community"],
];
const SORTS = [
  ["strength", "Consensus"],
  ["recent", "Recent"],
  ["investors", "Investors"],
  ["alpha", "A–Z"],
];

function MarketScreen() {
  const router = useRouter();
  const [recos, setRecos] = useState(null); // null = loading
  const [circleIds, setCircleIds] = useState([]);
  const [tab, setTab] = useState("all");
  const [sector, setSector] = useState("all");
  const [sortBy, setSortBy] = useState("strength");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [visible, setVisible] = useState(15);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    // Independent calls, so fired together rather than one after the other —
    // the connection list only decides the My Circle tab and must not hold up
    // the page (see the note in CLAUDE.md about serialised loads).
    Promise.allSettled([getConsensusRecosPublic(), getMyConnections()]).then(([r, c]) => {
      if (!mounted.current) return;
      setRecos(r.status === "fulfilled" ? r.value : []);
      // getMyConnections() rows carry the OTHER person's id as `user_id`
      // (see api/_lib/handlers/connections.js) — there is no bare `id` field
      // on a connection row at all, so this always collected an empty list
      // and the "My Circle" tab had nobody in it to filter by. buildTickerList
      // then had nothing to show, and the featured-card rail — computed FROM
      // that tab's ticker list — silently disappeared along with it.
      if (c.status === "fulfilled") {
        setCircleIds(
          (c.value || [])
            .filter((x) => x.status === "accepted")
            .map((x) => x.user_id)
            .filter(Boolean)
        );
      }
    });
    return () => {
      mounted.current = false;
    };
  }, []);

  // Reset pagination whenever the result set changes shape, as the web does —
  // otherwise a filter that narrows to 3 stocks still claims "showing 15".
  useEffect(() => {
    setVisible(15);
  }, [tab, sector, sortBy, search]);

  const tickers = useMemo(
    () => buildTickerList(recos || [], { circleIds, tab, sector, search, sortBy }),
    [recos, circleIds, tab, sector, search, sortBy]
  );
  const featured = useMemo(() => featuredTickers(tickers), [tickers]);
  const sectors = useMemo(() => sectorOptions(recos || []), [recos]);

  // No bespoke event here: an event only one client sends cannot be compared
  // across channels, which is the whole point. The ticker screen is already
  // reported as a page_view by the central screen tracker in app/_layout.js.
  const openTicker = useCallback(
    (ticker) => router.push(`/ticker/${encodeURIComponent(ticker)}`),
    [router]
  );

  const header = (
    <View>
      <Text style={styles.pageSub}>
        Market sentiment and investor conviction across stocks and sectors.
      </Text>

      {/* Featured cards — a horizontal rail rather than the web's grid: four
          cards side by side on a phone would be unreadable, and a rail keeps
          them scannable without burying the list below them. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        {[
          ["Strongest Consensus", "locate-outline", featured.strongest],
          ["Highest Conviction", "flash-outline", featured.highConviction],
          ["Most Discussed", "chatbubbles-outline", featured.mostDiscussed],
          ["Most Divided", "git-compare-outline", featured.mostDivided],
        ].map(([label, icon, item]) =>
          item ? (
            <Pressable key={label} style={styles.featCard} onPress={() => openTicker(item.ticker)}>
              <View style={styles.featHead}>
                <Ionicons name={icon} size={13} color={colors.accentInk} />
                <Text style={styles.featLabel}>{label.toUpperCase()}</Text>
              </View>
              <Text style={styles.featTicker}>{item.ticker}</Text>
              <Text style={[styles.featCons, { color: consensusColor(item.tabCons, colors) }]}>
                {item.tabCons.bullPct > item.tabCons.bearPct ? "+" : ""}
                {item.tabCons.bullPct}% {item.tabCons.label}
              </Text>
              <Sparkline
                values={computeTrend(item.filteredRecos)}
                color={consensusColor(item.tabCons, colors)}
                height={26}
              />
              <Text style={styles.featMeta}>
                {item.filteredRecos.length} investor{item.filteredRecos.length !== 1 ? "s" : ""}
                {lastActivityAt(item.filteredRecos)
                  ? ` · ${fmtDate(new Date(lastActivityAt(item.filteredRecos)))}`
                  : ""}
              </Text>
            </Pressable>
          ) : null
        )}
      </ScrollView>

      <View style={styles.seg}>
        {TABS.map(([v, l]) => (
          <Pressable
            key={v}
            style={[styles.segBtn, tab === v && styles.segBtnOn]}
            onPress={() => setTab(v)}
          >
            <Text style={[styles.segText, tab === v && styles.segTextOn]}>{l}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search" size={15} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search stocks…"
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        {search ? (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {SORTS.map(([v, l]) => (
          <Pressable
            key={v}
            style={[styles.chip, sortBy === v && styles.chipOn]}
            onPress={() => setSortBy(v)}
          >
            <Text style={[styles.chipText, sortBy === v && styles.chipTextOn]}>{l}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {sectors.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {sectors.map((s) => (
            <Pressable
              key={s}
              style={[styles.chip, sector === s && styles.chipOn]}
              onPress={() => setSector(s)}
            >
              <Text style={[styles.chipText, sector === s && styles.chipTextOn]}>
                {s === "all" ? "All sectors" : s}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {recos !== null && tickers.length > 0 ? (
        <Text style={styles.count}>
          Showing {Math.min(visible, tickers.length)} of {tickers.length} stock
          {tickers.length !== 1 ? "s" : ""}
        </Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <AppHeader title="Insights" />

      {recos === null ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={tickers.slice(0, visible)}
          keyExtractor={(t) => t.ticker}
          ListHeaderComponent={header}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TickerRow
              t={item}
              open={expanded === item.ticker}
              onToggle={() => setExpanded((p) => (p === item.ticker ? null : item.ticker))}
              onOpen={() => openTicker(item.ticker)}
            />
          )}
          ListFooterComponent={
            tickers.length > visible ? (
              <Pressable style={styles.more} onPress={() => setVisible((v) => v + 15)}>
                <Text style={styles.moreText}>Show more</Text>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {search || sector !== "all" || tab === "circle"
                ? "No stocks match these filters yet."
                : "No public ideas to read a consensus from yet."}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

function TickerRow({ t, open, onToggle, onOpen }) {
  const c = t.community;
  const arrow = c.bullPct > c.bearPct ? "↑" : c.bearPct > c.bullPct ? "↓" : "→";
  const tint = consensusColor(c, colors);

  return (
    <View style={[styles.row, open && styles.rowOpen]}>
      <Pressable onPress={onToggle} style={styles.rowHead}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.rowTicker}>{t.ticker}</Text>
          <Text style={styles.rowName} numberOfLines={1}>
            {t.name}
          </Text>
          {t.sector ? <Text style={styles.rowSector}>{t.sector}</Text> : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[styles.rowCons, { color: tint }]}>
            {arrow} {c.label}
          </Text>
          <Text style={styles.rowMeta}>
            {t.filteredRecos.length} investor{t.filteredRecos.length !== 1 ? "s" : ""}
          </Text>
          {/* Strength gauge — direction-agnostic by design, so it is tinted
              by which side leads rather than by its own magnitude. */}
          <View style={styles.gaugeRow}>
            <View style={styles.gaugeTrack}>
              <View style={[styles.gaugeFill, { width: `${t.tabCons.strength}%`, backgroundColor: tint }]} />
            </View>
            <Text style={styles.gaugeNum}>{t.tabCons.strength}</Text>
          </View>
        </View>
      </Pressable>

      {open ? (
        <View style={styles.expand}>
          <View style={styles.splitRow}>
            <Split label="Bullish" pct={c.bullPct} color={colors.gain} />
            <Split label="Bearish" pct={c.bearPct} color={colors.loss} />
            <Split label="Neutral" pct={c.neutralPct} color={colors.muted} />
          </View>
          {t.circle.total > 0 ? (
            <Text style={styles.circleLine}>
              Your circle: <Text style={{ color: consensusColor(t.circle, colors) }}>{t.circle.label}</Text> ·{" "}
              {t.circle.total} idea{t.circle.total !== 1 ? "s" : ""}
            </Text>
          ) : (
            <Text style={styles.circleLine}>Nobody in your circle has posted on this yet.</Text>
          )}
          <Sparkline values={computeTrend(t.filteredRecos)} color={tint} height={40} />
          <Pressable style={styles.openBtn} onPress={onOpen}>
            <Text style={styles.openBtnText}>See every idea on {t.ticker}</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.accentInk} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Split({ label, pct, color }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.splitPct, { color }]}>{pct}%</Text>
      <Text style={styles.splitLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  pageSub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  rail: { gap: 10, paddingRight: 4, paddingBottom: 4 },
  featCard: {
    width: 150,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 13,
    padding: 12,
  },
  featHead: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 5 },
  featLabel: { color: colors.muted, fontFamily: fonts.bold, fontSize: 9, letterSpacing: 0.5, flex: 1 },
  featTicker: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 16 },
  featCons: { fontFamily: fonts.bold, fontSize: 11.5, marginTop: 2, marginBottom: 6 },
  featMeta: { color: colors.muted, fontFamily: fonts.regular, fontSize: 10.5, marginTop: 4 },
  seg: {
    flexDirection: "row",
    backgroundColor: colors.surface2,
    borderRadius: 11,
    padding: 3,
    gap: 3,
    marginTop: 16,
  },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: "center" },
  segBtnOn: { backgroundColor: colors.surface },
  segText: { color: colors.muted, fontFamily: fonts.bold, fontSize: 13 },
  segTextOn: { color: colors.accentInk },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.surface,
    borderRadius: 11,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, paddingVertical: 10, color: colors.ink, fontFamily: fonts.regular, fontSize: 14 },
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
  count: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 14, marginBottom: 6 },
  row: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 13,
    marginBottom: 9,
    overflow: "hidden",
  },
  rowOpen: { borderColor: colors.accent },
  rowHead: { flexDirection: "row", gap: 12, padding: 14 },
  rowTicker: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 15 },
  rowName: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 1 },
  rowSector: { color: colors.muted, fontFamily: fonts.regular, fontSize: 10.5, marginTop: 1 },
  rowCons: { fontFamily: fonts.bold, fontSize: 12.5 },
  rowMeta: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, marginTop: 2 },
  gaugeRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 5 },
  gaugeTrack: { width: 42, height: 5, borderRadius: 3, backgroundColor: colors.line, overflow: "hidden" },
  gaugeFill: { height: "100%" },
  gaugeNum: { color: colors.muted, fontFamily: fonts.bold, fontSize: 9.5 },
  expand: { paddingHorizontal: 14, paddingBottom: 14, gap: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 },
  splitRow: { flexDirection: "row", gap: 10 },
  splitPct: { fontFamily: fonts.extrabold, fontSize: 17 },
  splitLabel: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, marginTop: 1 },
  circleLine: { color: colors.inkSoft, fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 18 },
  openBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingTop: 4 },
  openBtnText: { color: colors.accentInk, fontFamily: fonts.bold, fontSize: 13 },
  more: {
    alignItems: "center",
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: 12,
    marginTop: 4,
  },
  moreText: { color: colors.inkSoft, fontFamily: fonts.bold, fontSize: 14 },
  empty: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: "center", marginTop: 28 },
});

export default withBoundary(MarketScreen, "Market Insights");
