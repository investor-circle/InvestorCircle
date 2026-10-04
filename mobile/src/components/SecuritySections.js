import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import Avatar from "./Avatar";
import ThesisText from "./ThesisText";
import IdeaDisclaimer from "./IdeaDisclaimer";
import { fmt, fmtDate } from "../utils/format";
import { ideaTypeMeta } from "../utils/ideaType";
import {
  researchBreakdown,
  researchMonthly,
  viewMonthly,
  viewBreakdown,
  viewBreakdownFromCounts,
  viewThemes,
} from "../utils/securityInsights";
import { colors, fonts } from "../theme/colors";

/**
 * Sections of the Security Page — Verified Research vs Market Views.
 *
 * The page answers two SEPARATE questions and never combines them:
 *   Verified Research -> Buy / Hold / Sell
 *   Market Views      -> Positive / Neutral / Negative
 * There is deliberately no combined score and no "bullish strength": MIC
 * organises and presents both, it issues no recommendation of its own. A
 * dataset with nothing in it renders nothing (the screen doesn't mount the
 * section at all). Mirrors web's src/features/discovery/SecuritySections.jsx.
 */

const tone = (t) => {
  const m = ideaTypeMeta(t).tone;
  return m === "gain"
    ? { fg: colors.gain, bg: colors.gainSoft }
    : m === "loss"
    ? { fg: colors.loss, bg: colors.lossSoft }
    : { fg: colors.muted, bg: colors.surface2 };
};

function TypePill({ type }) {
  const c = tone(type);
  return (
    <Text style={[styles.tag, { color: c.fg, backgroundColor: c.bg }]}>{ideaTypeMeta(type).label}</Text>
  );
}

/** One proportional bar. segments: [{ pct, color }] */
function DistBar({ segments, label }) {
  return (
    <View style={styles.bar} accessibilityLabel={label}>
      {segments.map((s) => (s.pct > 0 ? <View key={s.color + s.pct} style={{ flex: s.pct, backgroundColor: s.color }} /> : null))}
    </View>
  );
}
const researchSegs = (b) => [
  { pct: b.buyPct, color: colors.gain },
  { pct: b.holdPct, color: colors.line2 },
  { pct: b.sellPct, color: colors.loss },
];
const viewSegs = (b) => [
  { pct: b.positivePct, color: colors.gain },
  { pct: b.neutralPct, color: colors.line2 },
  { pct: b.negativePct, color: colors.loss },
];

/** Header: the two layers, stacked. A layer with no data isn't passed. */
export function LayerSummary({ research, views }) {
  if (!research && !views) return null;
  return (
    <View>
      {research ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Verified Research</Text>
          <Text style={styles.counts}>
            <Text style={{ color: colors.gain }}>{research.buy} Buy</Text>
            <Text style={{ color: colors.muted }}> · </Text>
            <Text style={{ color: colors.inkSoft }}>{research.hold} Hold</Text>
            <Text style={{ color: colors.muted }}> · </Text>
            <Text style={{ color: colors.loss }}>{research.sell} Sell</Text>
          </Text>
          <DistBar segments={researchSegs(research)} label="Verified research distribution" />
          <Text style={styles.basis}>
            {research.total} piece{research.total === 1 ? "" : "s"} of research
            {research.publishers ? ` from ${research.publishers} publisher${research.publishers === 1 ? "" : "s"}` : ""}
          </Text>
        </View>
      ) : null}
      {views ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Market Views</Text>
          <Text style={styles.counts}>
            <Text style={{ color: colors.gain }}>{views.positive} Positive</Text>
            <Text style={{ color: colors.muted }}> · </Text>
            <Text style={{ color: colors.inkSoft }}>{views.neutral} Neutral</Text>
            <Text style={{ color: colors.muted }}> · </Text>
            <Text style={{ color: colors.loss }}>{views.negative} Negative</Text>
          </Text>
          <DistBar segments={viewSegs(views)} label="Market views distribution" />
          <Text style={styles.basis}>
            {views.total} independent view{views.total === 1 ? "" : "s"}
            {views.contributors ? ` from ${views.contributors} contributor${views.contributors === 1 ? "" : "s"}` : ""}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function SectionHead({ title, sub }) {
  return (
    <View style={{ marginTop: 26 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSub}>{sub}</Text>
    </View>
  );
}

/** Month columns, one stacked bar per month. kinds: [{ key, color }] */
function MonthBars({ months, kinds }) {
  const shown = months.slice(-8);
  const max = Math.max(...shown.map((m) => kinds.reduce((a, k) => a + m[k.key], 0)), 1);
  return (
    <View style={styles.monthRow}>
      {shown.map((m) => {
        const total = kinds.reduce((a, k) => a + m[k.key], 0);
        return (
          <View key={m.mo} style={styles.monthCol}>
            <Text style={styles.monthCount}>{total || ""}</Text>
            <View style={styles.monthBars}>
              {kinds.map((k) =>
                m[k.key] > 0 ? (
                  <View key={k.key} style={{ height: Math.max((m[k.key] / max) * 54, 3), backgroundColor: k.color, borderRadius: 2 }} />
                ) : null
              )}
            </View>
            <Text style={styles.monthLabel}>{m.mo.slice(5)}</Text>
          </View>
        );
      })}
    </View>
  );
}

/* ───────────────────────── Verified Research ───────────────────────── */
export function ResearchSection({ ticker, recos, onOpenReco, onOpenProfile }) {
  const b = researchBreakdown(recos, (r) => r.from);
  const months = researchMonthly(recos);
  const active = recos.filter((r) => r.status === "Active").length;
  const closed = recos.filter((r) => r.status === "Closed").length;
  const expired = recos.filter((r) => r.status === "Expired").length;
  const conv = {};
  recos.forEach((r) => {
    if (r.conviction) conv[r.conviction] = (conv[r.conviction] || 0) + 1;
  });
  return (
    <View>
      <SectionHead
        title="Verified Research"
        sub="Published by Verified Research Publishers. Buy / Hold / Sell with entry price, target and outcome on the record — permanent once posted."
      />

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Research Consensus</Text>
        <Text style={styles.counts}>
          <Text style={{ color: colors.gain }}>{b.buy} Buy</Text>
          <Text style={{ color: colors.muted }}> · </Text>
          <Text style={{ color: colors.inkSoft }}>{b.hold} Hold</Text>
          <Text style={{ color: colors.muted }}> · </Text>
          <Text style={{ color: colors.loss }}>{b.sell} Sell</Text>
        </Text>
        <DistBar segments={researchSegs(b)} label="Research consensus distribution" />
        <Text style={styles.basis}>
          Buy {b.buyPct}% · Hold {b.holdPct}% · Sell {b.sellPct}%
        </Text>
      </View>

      <View style={styles.statGrid}>
        <StatTile label="Research" value={b.total} />
        <StatTile label="Active" value={active} tint={colors.gain} />
        <StatTile label="Closed" value={closed} />
        <StatTile label="Expired" value={expired} />
      </View>

      <Text style={styles.subTitle}>Research History</Text>
      {recos.map((r) => (
        <Pressable key={String(r.id)} style={styles.ideaRow} onPress={() => onOpenReco?.(r)}>
          <Pressable style={styles.rowAuthor} onPress={() => r.username && onOpenProfile?.(r.username)} disabled={!r.username} hitSlop={4}>
            <Avatar profile={r} uid={r.from} name={r.full_name} size={34} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.ideaName} numberOfLines={1}>
                {r.full_name || r.username || "Publisher"}
              </Text>
              <Text style={styles.ideaMeta} numberOfLines={2}>
                {fmtDate(r.created_at)}
                {r.reco_price ? ` · Entry ${fmt(r.reco_price)}` : ""}
                {r.return_pct != null ? ` · ${Number(r.return_pct) >= 0 ? "+" : ""}${Number(r.return_pct).toFixed(1)}%` : ""}
                {r.conviction ? ` · ${r.conviction} conviction` : ""}
                {r.status ? ` · ${r.status}` : ""}
              </Text>
            </View>
          </Pressable>
          <TypePill type={r.recommendation_type} />
        </Pressable>
      ))}

      {months.length > 1 ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Research activity by month</Text>
          <MonthBars
            months={months}
            kinds={[
              { key: "Buy", color: colors.gain },
              { key: "Hold", color: colors.line2 },
              { key: "Sell", color: colors.loss },
            ]}
          />
        </View>
      ) : null}

      {Object.keys(conv).length ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Conviction</Text>
          {Object.entries(conv)
            .sort((a, c) => c[1] - a[1])
            .map(([level, n]) => (
              <View key={level} style={styles.convRow}>
                <Text style={styles.convLabel}>{level}</Text>
                <Text style={styles.convCount}>
                  {n} piece{n === 1 ? "" : "s"}
                </Text>
              </View>
            ))}
        </View>
      ) : null}
    </View>
  );
}

function StatTile({ label, value, tint }) {
  return (
    <View style={styles.statTile}>
      <Text style={[styles.statValue, tint && { color: tint }]}>{value ?? "—"}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/* ─────────────────────────── Market Views ─────────────────────────── */
function DistRow({ label, b, note }) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={styles.distLabel}>{label}</Text>
      <Text style={styles.distPct}>
        <Text style={{ color: colors.gain }}>{b.positivePct}% Positive</Text>
        <Text style={{ color: colors.muted }}> · </Text>
        <Text style={{ color: colors.inkSoft }}>{b.neutralPct}% Neutral</Text>
        <Text style={{ color: colors.muted }}> · </Text>
        <Text style={{ color: colors.loss }}>{b.negativePct}% Negative</Text>
      </Text>
      <DistBar segments={viewSegs(b)} label={`${label} distribution`} />
      <Text style={styles.basis}>
        {b.total} view{b.total === 1 ? "" : "s"}
        {note ? ` · ${note}` : ""}
      </Text>
    </View>
  );
}

function ViewRow({ v, inCircle, onOpenReco, onOpenProfile }) {
  return (
    <Pressable style={styles.viewCard} onPress={() => onOpenReco?.(v)}>
      <View style={styles.viewHead}>
        <Pressable style={styles.rowAuthor} onPress={() => v.username && onOpenProfile?.(v.username)} disabled={!v.username} hitSlop={4}>
          <Avatar profile={v} uid={v.from} name={v.full_name} size={34} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.ideaName} numberOfLines={1}>
              {v.full_name || v.username || "Contributor"}
              {inCircle ? "  · Your Circle" : ""}
            </Text>
            <Text style={styles.ideaMeta} numberOfLines={1}>
              Independent contributor · {fmtDate(v.created_at)}
            </Text>
          </View>
        </Pressable>
        <TypePill type={v.recommendation_type} />
      </View>
      <View style={{ marginTop: 8 }}>
        <ThesisText thesis={v.thesis} previewLines={3} />
      </View>
      <IdeaDisclaimer text={v.disclosure} />
    </Pressable>
  );
}

export function ViewsSection({
  ticker,
  summary,
  views,
  stances,
  circleIds,
  signedIn,
  hasMore,
  loadingMore,
  onLoadMore,
  onOpenReco,
  onOpenProfile,
}) {
  const community = viewBreakdownFromCounts(summary);
  const circleStances = signedIn && circleIds ? stances.filter((s) => circleIds.has(String(s.from))) : [];
  const circle = viewBreakdown(circleStances, (s) => s.from);
  const months = viewMonthly(stances);
  const themes = viewThemes(views, { nameOf: (r) => r.full_name || r.username || null });
  const hasThemes = themes.positive.length > 0 || themes.concerns.length > 0;
  return (
    <View>
      <SectionHead
        title="Market Views"
        sub="Independent commentary from members — personal views, not research and not a recommendation. myInvestorCircle does not endorse them."
      />

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Community sentiment</Text>
        <Text style={styles.counts}>
          {community.total} independent view{community.total === 1 ? "" : "s"}
        </Text>
        {signedIn && circle.total > 0 ? <DistRow label="Your Circle" b={circle} /> : null}
        <DistRow
          label="Community"
          b={community}
          note={community.contributors ? `${community.contributors} contributor${community.contributors === 1 ? "" : "s"}` : null}
        />
        {signedIn && circle.total === 0 ? (
          <Text style={[styles.basis, { marginTop: 12 }]}>No one in Your Circle has shared a view on {ticker} yet.</Text>
        ) : null}
        {!signedIn ? <Text style={[styles.basis, { marginTop: 12 }]}>Sign in to see how the people you're connected with see {ticker}.</Text> : null}
      </View>

      {hasThemes ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Market View Summary</Text>
          <Text style={styles.basis}>A summary of themes appearing across community views on this security.</Text>
          {themes.positive.length ? (
            <View style={styles.themeBlock}>
              <Text style={[styles.themeHead, { color: colors.gain }]}>Positive themes</Text>
              {themes.positive.map((t) => (
                <Text key={t.id} style={styles.themePoint}>
                  • “{t.text}”{t.by ? ` — ${t.by}` : ""}
                </Text>
              ))}
            </View>
          ) : null}
          {themes.concerns.length ? (
            <View style={styles.themeBlock}>
              <Text style={[styles.themeHead, { color: colors.loss }]}>Concerns raised</Text>
              {themes.concerns.map((t) => (
                <Text key={t.id} style={styles.themePoint}>
                  • “{t.text}”{t.by ? ` — ${t.by}` : ""}
                </Text>
              ))}
            </View>
          ) : null}
          <Text style={styles.themeNote}>
            Excerpts are contributors' own words from public Market Views. This reflects community opinion, not financial advice, and
            is not a myInvestorCircle recommendation or signal.
          </Text>
        </View>
      ) : null}

      <Text style={styles.subTitle}>Latest Market Views</Text>
      {views.map((v) => (
        <ViewRow
          key={String(v.id)}
          v={v}
          inCircle={!!(signedIn && circleIds && circleIds.has(String(v.from)))}
          onOpenReco={onOpenReco}
          onOpenProfile={onOpenProfile}
        />
      ))}
      {hasMore ? (
        <Pressable style={styles.moreBtn} onPress={onLoadMore} disabled={loadingMore}>
          {loadingMore ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={styles.moreText}>Show more ({Math.max(community.total - views.length, 0)} more)</Text>
          )}
        </Pressable>
      ) : null}

      {months.length > 1 ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Market View activity by month</Text>
          <MonthBars
            months={months}
            kinds={[
              { key: "Positive", color: colors.gain },
              { key: "Neutral", color: colors.line2 },
              { key: "Negative", color: colors.loss },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 16,
    marginTop: 14,
  },
  cardLabel: { color: colors.muted, fontFamily: fonts.bold, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 },
  counts: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 19, marginTop: 6, marginBottom: 10 },
  basis: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 6, lineHeight: 17 },
  bar: { flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden", backgroundColor: colors.line },
  sectionTitle: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 18 },
  sectionSub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  subTitle: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 15, marginTop: 20, marginBottom: 8 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 14 },
  statTile: {
    flexGrow: 1,
    flexBasis: "22%",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  statValue: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 19 },
  statLabel: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, marginTop: 3 },
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
  rowAuthor: { flexDirection: "row", alignItems: "center", gap: 11, flex: 1, minWidth: 0 },
  ideaName: { color: colors.ink, fontFamily: fonts.bold, fontSize: 14 },
  ideaMeta: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, marginTop: 1 },
  tag: { fontFamily: fonts.bold, fontSize: 11, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, overflow: "hidden" },
  viewCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  viewHead: { flexDirection: "row", alignItems: "center", gap: 11 },
  distLabel: { color: colors.ink, fontFamily: fonts.bold, fontSize: 13, marginBottom: 2 },
  distPct: { fontFamily: fonts.semibold, fontSize: 12.5, marginBottom: 6 },
  themeBlock: { marginTop: 14, gap: 6 },
  themeHead: { fontFamily: fonts.bold, fontSize: 11.5, letterSpacing: 0.5, textTransform: "uppercase" },
  themePoint: { color: colors.inkSoft, fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 20 },
  themeNote: {
    color: colors.muted,
    fontFamily: fonts.regular,
    fontSize: 11.5,
    lineHeight: 17,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  moreBtn: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 18 },
  moreText: { color: colors.accentInk, fontFamily: fonts.bold, fontSize: 13 },
  monthRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, marginTop: 14 },
  monthCol: { flex: 1, alignItems: "center", gap: 3 },
  monthCount: { color: colors.ink, fontFamily: fonts.bold, fontSize: 10, height: 13 },
  monthBars: { width: "100%", gap: 2, justifyContent: "flex-end" },
  monthLabel: { color: colors.muted, fontFamily: fonts.regular, fontSize: 9.5 },
  convRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
  convLabel: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 13.5 },
  convCount: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12.5 },
});
