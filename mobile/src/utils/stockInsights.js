import { computeConsensus } from "./consensus";
import { getThesisText } from "./format";

/**
 * The Statistics and AI Summary halves of Stock Insights.
 *
 * Ported from the web's SecurityIntelligencePage (features/discovery/
 * Discovery.jsx), which offers five tabs — Consensus, Idea History,
 * Investors, Statistics, AI Summary. The app had the first three and neither
 * of these.
 *
 * Both are pure functions of the idea list, deliberately. In particular the
 * "AI" summary involves no model and no network call: it is a deterministic
 * reading of the recommendations, exactly as on the web. Keeping it pure is
 * what lets the same inputs be asserted to produce the same summary, and
 * stops it drifting into something that quietly makes claims the data does
 * not support.
 */

/** created_at arrives as a Date from Neon or a string over JSON. */
const toIso = (v) => (v instanceof Date ? v.toISOString() : String(v || ""));

/**
 * Headline counts and the monthly buy/sell histogram.
 *
 * `exited` is 0 and stays 0: the web's own comment records that the schema
 * has no status column on this endpoint's rows, so reporting anything else
 * here would be inventing it. Kept in the shape so the card grid matches
 * the web's rather than silently omitting a tile.
 */
export function tickerStats(recos) {
  const rows = recos || [];
  if (!rows.length) return null;

  const byMonth = {};
  for (const r of rows) {
    const mo = toIso(r.created_at).slice(0, 7);
    if (!mo) continue;
    if (!byMonth[mo]) byMonth[mo] = { mo, buy: 0, sell: 0 };
    if (r.recommendation_type === "Buy") byMonth[mo].buy++;
    else byMonth[mo].sell++;
  }
  const months = Object.values(byMonth).sort((a, b) => a.mo.localeCompare(b.mo));

  const convMap = {};
  for (const r of rows) {
    if (r.conviction) convMap[r.conviction] = (convMap[r.conviction] || 0) + 1;
  }

  return {
    months,
    convMap,
    total: rows.length,
    active: rows.length,
    exited: 0,
    uniqueInvestors: new Set(rows.map((r) => r.from)).size,
    firstDate: rows[rows.length - 1]?.created_at || null,
  };
}

/** The web's phrasing for a consensus label, so both clients read alike. */
const SENTIMENT = {
  "Strong Bullish": "strongly bullish",
  Bullish: "moderately bullish",
  "Strong Bearish": "strongly bearish",
  Bearish: "cautious",
};

/**
 * The deterministic summary.
 *
 * Themes are the authors' OWN theses, quoted rather than paraphrased — this
 * summarises what people said, it does not generate an opinion. When nobody
 * wrote a thesis it falls back to counting positions, which is a weaker but
 * still honest statement, and says so in those words.
 *
 * @returns null when there is nothing to summarise
 */
export function buildAiSummary(recos) {
  const rows = recos || [];
  if (!rows.length) return null;

  const bull = rows.filter((r) => r.recommendation_type === "Buy");
  const bear = rows.filter((r) => r.recommendation_type === "Sell");
  const themesOf = (list) => list.slice(0, 3).map((r) => getThesisText(r.thesis)).filter(Boolean);

  const community = computeConsensus(rows);
  const bullThemes = themesOf(bull);
  const bearThemes = themesOf(bear);

  return {
    sentiment: SENTIMENT[community.label] || "divided",
    community,
    bullThemes: bullThemes.length
      ? bullThemes
      : bull.length
      ? [`${bull.length} investor${bull.length > 1 ? "s" : ""} tracking as a Buy opportunity`]
      : [],
    bearThemes: bearThemes.length
      ? bearThemes
      : bear.length
      ? [`${bear.length} investor${bear.length > 1 ? "s" : ""} flagging caution`]
      : ["No bearish recommendations on record"],
    // The web counts these two conviction spellings; both exist in the data.
    highConv: rows.filter((r) => r.conviction === "High Conviction" || r.conviction === "Very High").length,
    uniqueInv: new Set(rows.map((r) => r.from)).size,
  };
}

/**
 * One row per investor with an idea on this ticker, newest first.
 *
 * The web keeps the FIRST row it sees per uid while iterating its
 * newest-first list, which is that investor's most recent call — the one
 * that represents their current position.
 */
export function investorsFor(recos) {
  const seen = new Map();
  for (const r of recos || []) {
    if (r?.from == null) continue;
    if (!seen.has(String(r.from))) seen.set(String(r.from), r);
  }
  return [...seen.values()];
}
