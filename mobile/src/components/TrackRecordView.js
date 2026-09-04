import { memo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import IciBadge, { IciBreakdown } from "./IciBadge";
import { fmt, fmtDate, fmtPct } from "../utils/format";
import { colors, fonts } from "../theme/colors";

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
          <View style={styles.iciHead}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.iciTitle}>Credibility</Text>
              <Text style={styles.iciSub}>
                Based on {ici.total} public idea{ici.total === 1 ? "" : "s"}
              </Text>
            </View>
            <IciBadge ici={ici} />
          </View>
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
      {sectors.length ? (
        <Section title="Sectors">
          {sectors.slice(0, 8).map((s) => {
            const share = summary?.total ? Math.round((s.total_recs / summary.total) * 100) : 0;
            return (
              <View key={s.sector} style={styles.sectorRow}>
                <View style={styles.sectorHead}>
                  <Text style={styles.sectorName} numberOfLines={1}>
                    {s.sector}
                  </Text>
                  <Text style={styles.sectorCount}>
                    {s.total_recs} idea{s.total_recs === 1 ? "" : "s"}
                    {s.closed_count > 0 ? ` · ${s.closed_wins}/${s.closed_count} won` : ""}
                  </Text>
                </View>
                <View style={styles.sectorTrack}>
                  <View style={[styles.sectorFill, { width: `${Math.max(share, 2)}%` }]} />
                </View>
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
        <Section title={`Ideas history (${recos.length})`} flush>
          {recos.map((r, i) => (
            <IdeaRow key={String(r.id)} reco={r} onPress={onOpenReco} last={i === recos.length - 1} />
          ))}
        </Section>
      ) : null}
    </>
  );
}

function IdeaRow({ reco, onPress, last }) {
  const closed = reco.status === "Closed" || reco.status === "Expired" || reco.exit_signal;
  // A closed idea's return is frozen at its exit price; a live one moves with
  // the market. Using current price for both would silently keep rewriting
  // history, which is the one thing a track record must not do.
  const from = Number(reco.reco_price || 0);
  const to = Number(reco.exit_price ?? reco.expiry_price ?? reco.current_price ?? 0);
  const pct = from > 0 && to > 0 ? ((to - from) / from) * 100 : null;
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
  iciCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
  },
  iciHead: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  iciTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 15 },
  iciSub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
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
  sectorRow: { paddingVertical: 9 },
  sectorHead: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 6 },
  sectorName: { flex: 1, color: colors.ink, fontFamily: fonts.semibold, fontSize: 13.5 },
  sectorCount: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11.5 },
  sectorTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surface2, overflow: "hidden" },
  sectorFill: { height: "100%", backgroundColor: colors.accent, borderRadius: 3 },
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
