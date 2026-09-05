import { memo, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import IciBadge, { IciBreakdown } from "./IciBadge";
import { fmt, fmtDate, fmtPct } from "../utils/format";
import { colors, fonts } from "../theme/colors";

// Search / filter / sort over the ideas list — the same three controls and
// the same fields (ticker + asset_name search, asset_class filter, date/
// return sort) as the web's Profile.jsx track record page.
const IDEA_SORTS = [
  { value: "date_desc", label: "Recent" },
  { value: "date_asc", label: "Oldest" },
  { value: "ret_desc", label: "Return: high to low" },
  { value: "ret_asc", label: "Return: low to high" },
];

/**
 * Everything below the hero on a track record: credibility, the live and
 * closed scorecards, sector distribution, and the ideas history.
 *
 * WHY IT IS SHARED: the app shows a track record in two places — somebody
 * else's (app/investor/[username].js) and your own (app/track-record.js) —
 * and they are the same page with a different owner. Building them
 * separately is how the two drift into disagreeing about the same investor.
 *
 * It also closes three gaps against the web. The endpoint already returned
 * `sectors` and `recos`, and the app read neither: a profile showed aggregate
 * counts with no sector breakdown and no list of the actual ideas behind the
 * numbers. And the SEBI badge — fetched for navigation, never displayed —
 * meant a registered investor looked unregistered everywhere on mobile.
 *
 * Presentational only: every number arrives computed (the server's, or
 * computeIci's) and nothing is derived here beyond formatting.
 */
function TrackRecordView({
  summary,
  live,
  realized,
  sectors = [],
  recos = [],
  circles = { public: [], private: [] },
  ici,
  isSebiApproved = false,
  onOpenReco,
  onOpenCircle,
}) {
  const ownedCircles = [...(circles.public || []), ...(circles.private || [])];

  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [assetClass, setAssetClass] = useState("all");
  const [sort, setSort] = useState("date_desc");

  const assetClasses = useMemo(
    () => ["all", ...new Set(recos.map((r) => r.asset_class).filter(Boolean))],
    [recos]
  );

  const visibleRecos = useMemo(() => {
    let rows = [...recos];
    if (assetClass !== "all") rows = rows.filter((r) => r.asset_class === assetClass);
    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => `${r.ticker || ""} ${r.asset_name || ""}`.toLowerCase().includes(q));
    }
    rows.sort((a, b) => {
      if (sort === "date_asc") return new Date(a.created_at) - new Date(b.created_at);
      if (sort === "ret_desc") return Number(b.return_pct || 0) - Number(a.return_pct || 0);
      if (sort === "ret_asc") return Number(a.return_pct || 0) - Number(b.return_pct || 0);
      return new Date(b.created_at) - new Date(a.created_at);
    });
    return rows;
  }, [recos, assetClass, query, sort]);

  return (
    <>
      {isSebiApproved ? (
        <View style={styles.sebiRow}>
          <Ionicons name="shield-checkmark" size={15} color={colors.accentInk} />
          <Text style={styles.sebiText}>SEBI registered</Text>
        </View>
      ) : null}

      {ici ? (
        <View style={styles.iciCard}>
          <Text style={styles.iciEyebrow}>CREDIBILITY (ICI) SCORE</Text>
          {/* The lead figure on this page — everything else here is evidence
              for this one number, so it gets the ring treatment rather than
              a chip the same size as a status pill. */}
          <IciBadge ici={ici} size="xl" />
          <Text style={styles.iciSub}>
            Based on {ici.total} public idea{ici.total === 1 ? "" : "s"}
          </Text>
          <IciBreakdown ici={ici} />
        </View>
      ) : null}

      {summary ? (
        <View style={styles.statGrid}>
          <Stat label="Ideas" value={summary.total} />
          <Stat label="Active" value={summary.active} />
          <Stat label="Closed" value={summary.closed} />
          <Stat label="Years" value={summary.years_history} />
        </View>
      ) : null}

      {live && live.count > 0 ? (
        <Section title="Live ideas">
          <Row label="Active" value={String(live.count)} />
          <Row label="In profit" value={String(live.in_profit)} valueColor={colors.gain} />
          <Row label="In loss" value={String(live.in_loss)} valueColor={colors.loss} />
          <Row
            label="Avg return"
            value={`${Number(live.avg_return).toFixed(1)}%`}
            valueColor={live.avg_return >= 0 ? colors.gain : colors.loss}
          />
        </Section>
      ) : null}

      {realized && realized.count > 0 ? (
        <Section title="Closed ideas">
          <Row label="Closed" value={String(realized.count)} />
          <Row label="Wins" value={String(realized.win_count)} valueColor={colors.gain} />
          <Row label="Losses" value={String(realized.loss_count)} valueColor={colors.loss} />
          <Row label="Hit rate" value={`${Number(realized.hit_rate_pct).toFixed(0)}%`} />
          <Row
            label="Median return"
            value={`${Number(realized.median_return).toFixed(1)}%`}
            valueColor={realized.median_return >= 0 ? colors.gain : colors.loss}
          />
        </Section>
      ) : null}

      {/* Sector distribution. The bar is share of ideas, not performance —
          how spread out someone's calls are is the question this answers,
          and the win column next to it says how those calls went. */}
      {/* Sector Performance — the same two per-sector rates the web shows
          (Profile.jsx: Active Success % = active_in_profit/active_count,
          Closed Hit Rate % = closed_wins/closed_count), not a return figure.
          Mobile used to show only idea counts and a closed win fraction —
          the active-ideas success rate, the number the web leads with per
          sector, was missing entirely. */}
      {sectors.length ? (
        <Section title="Sector Performance">
          <View style={styles.sectorLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.gain }]} />
              <Text style={styles.legendLabel}>Active success %</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
              <Text style={styles.legendLabel}>Closed hit rate %</Text>
            </View>
          </View>
          {sectors.slice(0, 8).map((s) => {
            const ap = s.active_count ? Math.round((s.active_in_profit / s.active_count) * 100) : null;
            const cp = s.closed_count ? Math.round((s.closed_wins / s.closed_count) * 100) : null;
            return (
              <View key={s.sector} style={styles.sectorRow}>
                <View style={styles.sectorHead}>
                  <Text style={styles.sectorName} numberOfLines={1}>
                    {s.sector}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {ap != null ? (
                      <Text style={[styles.sectorRate, { color: colors.gain }]}>{ap}%</Text>
                    ) : null}
                    {cp != null ? (
                      <Text style={[styles.sectorRate, { color: colors.accentInk }]}>{cp}%</Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.sectorBars}>
                  {ap != null ? (
                    <View style={styles.sectorTrack}>
                      <View style={[styles.sectorFill, { width: `${Math.max(ap, 4)}%`, backgroundColor: colors.gain }]} />
                    </View>
                  ) : null}
                  {cp != null ? (
                    <View style={styles.sectorTrack}>
                      <View style={[styles.sectorFill, { width: `${Math.max(cp, 4)}%`, backgroundColor: colors.accent }]} />
                    </View>
                  ) : null}
                </View>
                <Text style={styles.sectorCount}>
                  {s.total_recs} idea{s.total_recs === 1 ? "" : "s"}
                </Text>
              </View>
            );
          })}
        </Section>
      ) : null}

      {ownedCircles.length ? (
        <Section title="Circles">
          {ownedCircles.map((c) => (
            <Pressable
              key={String(c.id)}
              style={styles.circleRow}
              onPress={() => c.slug && onOpenCircle?.(c.slug)}
              disabled={!c.slug}
            >
              <View style={[styles.circleDot, c.color ? { backgroundColor: c.color } : null]} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.circleName} numberOfLines={1}>
                  {c.name}
                </Text>
                <Text style={styles.circleMeta} numberOfLines={1}>
                  {c.member_count} member{c.member_count === 1 ? "" : "s"}
                  {c.description ? ` · ${c.description}` : ""}
                </Text>
              </View>
              {c.slug ? <Ionicons name="chevron-forward" size={17} color={colors.muted} /> : null}
            </Pressable>
          ))}
        </Section>
      ) : null}

      {/* Ideas history — the calls the numbers above are made of. A track
          record that shows only aggregates asks to be taken on trust, which
          is the opposite of what this product is for. */}
      {recos.length ? (
        <View style={styles.section}>
          <View style={styles.ideasHead}>
            <Text style={styles.sectionTitle}>Ideas history ({recos.length})</Text>
            <View style={{ flex: 1 }} />
            <Pressable
              style={[styles.iconBtn, searchOpen && styles.iconBtnOn]}
              onPress={() => setSearchOpen((v) => !v)}
              hitSlop={6}
            >
              <Ionicons name="search" size={15} color={searchOpen ? colors.accentInk : colors.muted} />
            </Pressable>
            <Pressable
              style={[styles.iconBtn, assetClass !== "all" && styles.iconBtnOn]}
              onPress={() => {
                setFilterOpen((v) => !v);
                setSortOpen(false);
              }}
              hitSlop={6}
            >
              <Ionicons
                name="options-outline"
                size={16}
                color={assetClass !== "all" ? colors.accentInk : colors.muted}
              />
            </Pressable>
            <Pressable
              style={[styles.iconBtn, sort !== "date_desc" && styles.iconBtnOn]}
              onPress={() => {
                setSortOpen((v) => !v);
                setFilterOpen(false);
              }}
              hitSlop={6}
            >
              <Ionicons
                name="swap-vertical"
                size={16}
                color={sort !== "date_desc" ? colors.accentInk : colors.muted}
              />
            </Pressable>
          </View>

          {searchOpen ? (
            <View style={styles.searchRow}>
              <Ionicons name="search" size={14} color={colors.muted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search ticker or name…"
                placeholderTextColor={colors.muted}
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {query ? (
                <Pressable onPress={() => setQuery("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={15} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {filterOpen && assetClasses.length > 2 ? (
            <View style={styles.chipsRow}>
              {assetClasses.map((c) => (
                <Pressable
                  key={c}
                  style={[styles.chip, assetClass === c && styles.chipOn]}
                  onPress={() => setAssetClass(c)}
                >
                  <Text style={[styles.chipText, assetClass === c && styles.chipTextOn]}>
                    {c === "all" ? "All" : c}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {sortOpen ? (
            <View style={styles.chipsRow}>
              {IDEA_SORTS.map((o) => (
                <Pressable
                  key={o.value}
                  style={[styles.chip, sort === o.value && styles.chipOn]}
                  onPress={() => setSort(o.value)}
                >
                  <Text style={[styles.chipText, sort === o.value && styles.chipTextOn]}>{o.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={[styles.sectionCard, { paddingVertical: 0, paddingHorizontal: 0 }]}>
            {visibleRecos.length ? (
              visibleRecos.map((r, i) => (
                <IdeaRow key={String(r.id)} reco={r} onPress={onOpenReco} last={i === visibleRecos.length - 1} />
              ))
            ) : (
              <Text style={styles.noMatch}>No ideas match this search or filter.</Text>
            )}
          </View>
        </View>
      ) : null}
    </>
  );
}

function IdeaRow({ reco, onPress, last }) {
  const closed = reco.status === "Closed" || reco.status === "Expired" || reco.exit_signal;
  const from = Number(reco.reco_price || 0);
  // return_pct is the server's own figure (api/_lib/handlers/public-profile.js)
  // — it already picks the right frozen/live price per status AND reverses
  // the direction for a Sell. Recomputing it here from raw prices used to
  // drop that Sell reversal, silently showing a Sell's return with the wrong
  // sign (and the wrong number whenever it disagreed with the value the rest
  // of the page, and the web, derive from the same field).
  const pct = reco.return_pct != null ? Number(reco.return_pct) : null;
  const isBuy = (reco.recommendation_type || "Buy") !== "Sell";

  return (
    <Pressable
      style={[styles.ideaRow, !last && styles.ideaRowBorder]}
      onPress={() => onPress?.(reco)}
      disabled={!onPress}
    >
      <View style={[styles.sideTag, isBuy ? styles.sideBuy : styles.sideSell]}>
        <Text style={[styles.sideText, isBuy ? styles.sideTextBuy : styles.sideTextSell]}>
          {isBuy ? "BUY" : "SELL"}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.ideaTicker} numberOfLines={1}>
          {reco.ticker || reco.asset_name || "—"}
        </Text>
        <Text style={styles.ideaMeta} numberOfLines={1}>
          {reco.created_at ? fmtDate(reco.created_at) : "—"}
          {reco.sector ? ` · ${reco.sector}` : ""}
          {closed ? " · Closed" : ""}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        {pct == null ? (
          <Text style={styles.ideaPrice}>—</Text>
        ) : (
          <Text style={[styles.ideaPct, { color: pct >= 0 ? colors.gain : colors.loss }]}>
            {fmtPct(pct)}
          </Text>
        )}
        <Text style={styles.ideaPrice}>{from > 0 ? fmt(from) : "—"}</Text>
      </View>
    </Pressable>
  );
}

// Social icon row for a profile hero — the web's equivalent (SocialIconBtn,
// src/components/common.jsx) on the public profile page. Missing on mobile
// entirely was the actual bug behind "social icons don't render": the
// public-profile API already returns twitter_url/linkedin_url/telegram_url/
// instagram_url (api/_lib/handlers/public-profile.js), but neither track
// record screen rendered them at all. Ionicons' brand glyphs stand in for
// the web's custom brand-colour SVGs — a platform-accurate icon set already
// in the app, not a new dependency for four icons.
const SOCIAL_ICONS = {
  twitter: "logo-twitter",
  linkedin: "logo-linkedin",
  telegram: "paper-plane",
  instagram: "logo-instagram",
};

export function SocialLinks({ profile }) {
  const links = ["twitter", "linkedin", "telegram", "instagram"]
    .map((p) => ({ platform: p, url: profile?.[`${p}_url`] }))
    .filter((l) => l.url);
  if (!links.length) return null;
  return (
    <View style={styles.socialRow}>
      {links.map(({ platform, url }) => (
        <Pressable
          key={platform}
          style={styles.socialBtn}
          onPress={() => Linking.openURL(url).catch(() => {})}
          hitSlop={6}
        >
          <Ionicons name={SOCIAL_ICONS[platform]} size={16} color="#fff" />
        </Pressable>
      ))}
    </View>
  );
}

function Stat({ label, value }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value ?? "—"}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, children, flush }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={[styles.sectionCard, flush && { paddingVertical: 0, paddingHorizontal: 0 }]}>
        {children}
      </View>
    </View>
  );
}

function Row({ label, value, valueColor }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sebiRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginTop: 14,
  },
  sebiText: { color: colors.accentInk, fontFamily: fonts.bold, fontSize: 12.5 },
  socialRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  socialBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  iciCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 16,
  },
  iciEyebrow: {
    color: colors.muted,
    fontFamily: fonts.extrabold,
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 12,
  },
  iciSub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 10 },
  statGrid: { flexDirection: "row", gap: 9, marginHorizontal: 16, marginTop: 16 },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  statValue: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 17 },
  statLabel: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, marginTop: 2 },
  section: { marginHorizontal: 16, marginTop: 20 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 15, marginBottom: 8 },
  ideasHead: { flexDirection: "row", alignItems: "center", gap: 4 },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  iconBtnOn: { backgroundColor: colors.accentSoft },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 11,
    marginTop: 9,
  },
  searchInput: { flex: 1, paddingVertical: 9, color: colors.ink, fontFamily: fonts.regular, fontSize: 13.5 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 9 },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 12 },
  chipTextOn: { color: "#fff" },
  noMatch: {
    color: colors.muted,
    fontFamily: fonts.regular,
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 24,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 4,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 },
  rowLabel: { color: colors.inkSoft, fontFamily: fonts.regular, fontSize: 14 },
  rowValue: { color: colors.ink, fontFamily: fonts.bold, fontSize: 14 },
  sectorLegend: { flexDirection: "row", gap: 16, paddingBottom: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendLabel: { color: colors.muted, fontFamily: fonts.regular, fontSize: 10.5 },
  sectorRow: { paddingVertical: 9 },
  sectorHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 6 },
  sectorName: { flex: 1, color: colors.ink, fontFamily: fonts.semibold, fontSize: 13.5 },
  sectorRate: { fontFamily: fonts.extrabold, fontSize: 12.5 },
  sectorCount: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11.5, marginTop: 5 },
  sectorBars: { flexDirection: "row", gap: 4 },
  sectorTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surface2, overflow: "hidden" },
  sectorFill: { height: "100%", borderRadius: 3 },
  circleRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 11 },
  circleDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  circleName: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 14 },
  circleMeta: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11.5, marginTop: 1 },
  ideaRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 14, paddingVertical: 12 },
  ideaRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  sideTag: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  sideBuy: { backgroundColor: colors.gainSoft },
  sideSell: { backgroundColor: colors.lossSoft },
  sideText: { fontFamily: fonts.extrabold, fontSize: 9.5 },
  sideTextBuy: { color: colors.gain },
  sideTextSell: { color: colors.loss },
  ideaTicker: { color: colors.ink, fontFamily: fonts.bold, fontSize: 14 },
  ideaMeta: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11.5, marginTop: 2 },
  ideaPct: { fontFamily: fonts.extrabold, fontSize: 13.5 },
  ideaPrice: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11.5, marginTop: 2 },
});

export default memo(TrackRecordView);
