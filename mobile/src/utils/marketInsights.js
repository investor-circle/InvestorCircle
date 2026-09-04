import { computeConsensus } from "./consensus";

/**
 * Market Insights — "what does the platform generally think", by ticker.
 *
 * PORTED FROM src/features/discovery/Discovery.jsx (MarketIntelligencePage).
 * Every ranking decision below is one the web already made deliberately, and
 * each is documented there; the reasoning is repeated here because a
 * paraphrase would quietly lose it, and because two clients ranking the same
 * ideas differently would look like a bug in the numbers rather than a
 * difference in code.
 *
 * Pure and screen-free so both the ordering and the four featured picks can
 * be tested directly against the web's stated intent.
 */

/**
 * RECENCY — a gentle multiplier, not a hard filter or a heavy decay like the
 * Trending / What You Missed widgets use.
 *
 * This page answers "what does the platform generally think", not "what just
 * happened": a stock the community has debated for weeks is still
 * meaningfully the strongest consensus even if today was quiet. A 30-day
 * half-life lets genuinely fresh activity float a ticker up without blanking
 * out legitimate historical consensus — which matters at today's traffic,
 * where a handful of ideas a month apart IS the entire dataset for a ticker
 * and an aggressive decay would empty these cards rather than reorder them.
 */
export const RECENCY_HALFLIFE_DAYS = 30;

export function daysSinceLastActivity(recos, now = Date.now()) {
  if (!recos || !recos.length) return Infinity;
  const latest = lastActivityAt(recos);
  return latest ? (now - latest) / 86400000 : Infinity;
}

export function lastActivityAt(recos) {
  const times = (recos || [])
    .map((r) => new Date(r.created_at).getTime())
    .filter((t) => Number.isFinite(t));
  return times.length ? Math.max(...times) : null;
}

export function recencyFactor(recos, now = Date.now()) {
  return Math.pow(0.5, daysSinceLastActivity(recos, now) / RECENCY_HALFLIFE_DAYS);
}

/** Conviction as the recommender rated it, averaged. */
const CONVICTION_SCORE = { High: 3, Medium: 2, Low: 1 };
export function avgConviction(recos) {
  const scored = (recos || []).map((r) => CONVICTION_SCORE[r.conviction]).filter(Boolean);
  return scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : 0;
}

/** Group the flat idea list by ticker, keeping each ticker's name and sector. */
export function groupByTicker(recos) {
  const byT = {};
  for (const r of recos || []) {
    const t = r?.ticker;
    if (!t) continue;
    if (!byT[t]) byT[t] = { ticker: t, name: r.asset_name || t, sector: r.sector || "", recos: [] };
    byT[t].recos.push(r);
  }
  return byT;
}

/**
 * The ticker list behind the page: filtered, ranked, and carrying both the
 * community-wide and circle-only consensus for each.
 *
 * @param recos       every public idea
 * @param circleIds   the viewer's connections, for the "My Circle" tab
 * @param tab         all | circle | community
 * @param sector      'all' or one sector
 * @param search      free text over ticker and name
 * @param sortBy      strength | recent | investors | alpha
 */
export function buildTickerList(recos, { circleIds = [], tab = "all", sector = "all", search = "", sortBy = "strength" } = {}) {
  const ids = new Set(circleIds.map(String));
  const map = groupByTicker(recos);
  const q = String(search || "").trim();

  return Object.values(map)
    .map((t) => {
      // 'community' and 'all' are the same slice on this page — the web keeps
      // them as separate labels because the tab also re-frames the cards
      // above, not because the filter differs.
      const filtered = tab === "circle" ? t.recos.filter((r) => ids.has(String(r.from))) : t.recos;
      return {
        ...t,
        community: computeConsensus(t.recos),
        circle: computeConsensus(t.recos.filter((r) => ids.has(String(r.from)))),
        tabCons: computeConsensus(filtered),
        filteredRecos: filtered,
        lastActive: lastActivityAt(filtered) || 0,
      };
    })
    .filter(
      (t) =>
        t.filteredRecos.length > 0 &&
        (sector === "all" || t.sector === sector) &&
        (!q ||
          t.ticker.includes(q.toUpperCase()) ||
          t.name.toLowerCase().includes(q.toLowerCase()))
    )
    .sort((a, b) => {
      if (sortBy === "recent") return b.lastActive - a.lastActive;
      if (sortBy === "investors") return b.filteredRecos.length - a.filteredRecos.length;
      if (sortBy === "alpha") return a.ticker.localeCompare(b.ticker);
      // 'strength' (default) — this page's stated purpose is sentiment and
      // conviction, so lead with how one-sided each stock's consensus is;
      // investor count breaks ties between equally one-sided stocks.
      return (
        b.tabCons.strength - a.tabCons.strength ||
        b.filteredRecos.length - a.filteredRecos.length
      );
    });
}

/**
 * The four featured cards, each highlighting a DIFFERENT signal.
 *
 * A ticker already featured is excluded from later cards, so all four don't
 * collapse onto one dominant stock just because the platform is early-stage
 * and one ticker happens to lead on several axes at once. A card with no
 * other qualifying ticker returns null and simply isn't rendered, rather
 * than repeating one that is already shown.
 *
 * @returns { strongest, highConviction, mostDiscussed, mostDivided }
 */
export function featuredTickers(tickers, now = Date.now()) {
  const used = new Set();
  const pick = (candidates) => {
    const hit = candidates.find((t) => !used.has(t.ticker));
    if (hit) used.add(hit.ticker);
    return hit || null;
  };
  const rf = (t) => recencyFactor(t.filteredRecos, now);

  // Directional AGREEMENT — how one-sided the community is, nudged by
  // recency so a ticker with the same split but more current discussion
  // edges out a dormant one.
  const strongest = pick(
    [...tickers].sort((a, b) => b.tabCons.strength * rf(b) - a.tabCons.strength * rf(a))
  );

  // Investor CONVICTION — a distinct signal from agreement direction: how
  // strongly the recommenders themselves rated their confidence, not how
  // many agree with each other.
  const highConviction = pick(
    [...tickers]
      .map((t) => ({ ...t, avgConv: avgConviction(t.filteredRecos) }))
      .filter((t) => t.avgConv > 0)
      .sort(
        (a, b) =>
          b.avgConv * rf(b) - a.avgConv * rf(a) ||
          b.filteredRecos.length - a.filteredRecos.length
      )
  );

  // Raw DISCUSSION VOLUME — most ideas regardless of direction,
  // recency-weighted so a ticker that was chatty once but has gone quiet for
  // months doesn't permanently outrank one people are discussing now.
  const mostDiscussed = pick(
    [...tickers].sort(
      (a, b) => b.filteredRecos.length * rf(b) - a.filteredRecos.length * rf(a)
    )
  );

  // Most DIVIDED — closest to a 50/50 split among tickers with a meaningful
  // sample. `closeness` is 50 minus the distance from 50%, so higher = more
  // divided. Sorting by DISTANCE descending (the obvious-looking version)
  // puts the LEAST divided ticker first, which once had a unanimously
  // bullish stock winning "Most Divided" — the exact inverse of the label.
  const mostDivided = pick(
    [...tickers]
      .filter((t) => t.tabCons.total >= 3)
      .map((t) => ({ ...t, closeness: 50 - Math.abs(50 - t.tabCons.bullPct) }))
      .sort((a, b) => b.closeness * rf(b) - a.closeness * rf(a))
  );

  return { strongest, highConviction, mostDiscussed, mostDivided };
}

/** Sector filter options for the current data set. */
export function sectorOptions(recos) {
  return ["all", ...new Set((recos || []).map((r) => r.sector).filter(Boolean))];
}
