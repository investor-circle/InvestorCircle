import { computeConsensus } from "./consensus";
import { priceKey } from "./trackedSummary";

/**
 * Portfolio Intelligence — Opportunity Signals and the holdings filters.
 *
 * Ported from the web's Portfolio.jsx. The app had the consensus overlay on
 * each holding but neither the signal cards above the list nor any way to
 * narrow it, so a portfolio of any size was one long undifferentiated column.
 *
 * Pure: the screen supplies holdings, the ideas behind them and the daily
 * price snapshot, and gets back what to draw.
 */

/**
 * How a holding addresses the daily-price table.
 *
 * A holding and a priced instrument do not speak the same vocabulary, and
 * getting this wrong fails silently — the lookup misses, `dailyChangePct`
 * stays null, and the "Daily mover" card simply never appears. Two
 * mismatches, both ported verbatim from the web:
 *
 *  - the asset class: a holding's `type` is 'Stock' | 'ETF' | 'Fund', while
 *    the pricing endpoint returns the instrument's class ('Equity' | 'ETF' |
 *    'Mutual Funds').
 *  - the identifier: a mutual fund is priced by ISIN, not by symbol.
 */
export const holdingAssetClass = (h) =>
  h?.type === "ETF" ? "ETF" : h?.type === "Fund" ? "Mutual Funds" : "Equity";

export const holdingPriceIdentifier = (h) =>
  h?.type === "Fund"
    ? String(h?.isin || "").trim().toUpperCase()
    : String(h?.sym || "").trim().toUpperCase();

/**
 * Each holding, joined to what the community and your circle think of it.
 *
 * Symbols are upper-cased on both sides before matching — the web's own
 * comment flags this, because holdings imported from a CAS statement arrive
 * in whatever case the registrar used and would otherwise silently match
 * nothing.
 */
export function buildHoldingsData(holdings, recosByTicker, circleIds = [], dailyPrices = null) {
  const ids = new Set((circleIds || []).map(String));
  return (holdings || []).map((h) => {
    const key = String(h.sym || "").toUpperCase().trim();
    const allR = recosByTicker?.[key] || [];
    const circleR = allR.filter((r) => ids.has(String(r.from)));
    // Ideas are matched by symbol; the price is looked up the way the
    // pricing endpoint keys it, which is not the same thing.
    const snap = dailyPrices?.[priceKey(holdingPriceIdentifier(h), holdingAssetClass(h))] ?? null;
    // A live snapshot beats the stored price; a portfolio priced from a
    // stale column reports gains that are days old without saying so.
    const price = snap?.close != null ? snap.close : Number(h.price || 0);
    return {
      ...h,
      price,
      community: computeConsensus(allR),
      circle: computeConsensus(circleR),
      value: Number(h.sh || 0) * price,
      gain: Number(h.cost) > 0 ? ((price - h.cost) / h.cost) * 100 : 0,
      dailyChangePct: snap?.changePct ?? null,
      allR,
      circleR,
    };
  });
}

/** Mirrors trackedActivity.js's bar for "worth a line in a daily digest". */
export const DAILY_MOVER_THRESHOLD = 0.02;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Up to four cards, one per category, never the same holding twice.
 *
 * The dedupe is the point, and the web's comment says why: at this stage one
 * dominant holding would otherwise lead every category at once and all four
 * cards would show the same stock. Categories claim a holding in a fixed
 * narrative order — strength, then movement, then divergence, then early
 * signal — and a category with nothing left simply produces no card rather
 * than repeating one already shown.
 */
export function opportunitySignals(holdingsData, now = Date.now()) {
  const rows = holdingsData || [];

  const strongConv = [...rows]
    .filter((h) => h.community.strength >= 65 && h.community.bullPct >= 60)
    .sort((a, b) => b.community.strength - a.community.strength)
    .slice(0, 3);

  const dailyMover = rows
    .filter((h) => h.dailyChangePct != null && Math.abs(h.dailyChangePct) / 100 >= DAILY_MOVER_THRESHOLD)
    .sort((a, b) => Math.abs(b.dailyChangePct) - Math.abs(a.dailyChangePct));

  // Your circle is materially less bullish than the wider community — worth
  // knowing precisely because it contradicts the headline number.
  const weakening = rows
    .filter((h) => h.community.total >= 3 && h.circle.total >= 2 && h.circle.bullPct < h.community.bullPct - 15)
    .sort(
      (a, b) =>
        a.circle.bullPct - a.community.bullPct - (b.circle.bullPct - b.community.bullPct)
    )
    .slice(0, 3);

  // Recent interest on a stock nobody has covered much yet.
  const emerging = rows
    .filter((h) => {
      const recent = (h.allR || []).filter(
        (r) => r.created_at && now - new Date(r.created_at).getTime() < THIRTY_DAYS_MS
      );
      return recent.length >= 2 && h.community.total <= 6;
    })
    .sort((a, b) => b.community.bullPct - a.community.bullPct)
    .slice(0, 3);

  const used = new Set();
  const claim = (pool, kind) => {
    const h = pool.find((x) => !used.has(x.sym));
    if (!h) return null;
    used.add(h.sym);
    return { kind, holding: h };
  };

  return [
    claim(strongConv, "strong"),
    claim(dailyMover, "mover"),
    claim(weakening, "diverging"),
    claim(emerging, "emerging"),
  ].filter(Boolean);
}

export const SIGNAL_LABEL = {
  strong: "Strong conviction",
  mover: "Daily mover",
  diverging: "Circle diverging",
  emerging: "Emerging idea",
};

/** Asset classes actually present, for the filter row. */
export function assetClassOptions(holdingsData) {
  return [...new Set((holdingsData || []).map((h) => h.type).filter(Boolean))].sort();
}

/**
 * Signal tab + asset class + free text, in that order — the same three the
 * web applies.
 *
 * The asset-class filter is only honoured when the portfolio actually holds
 * that class. The web's comment explains why: its default is 'Stock', and a
 * portfolio of only ETFs would otherwise open filtered down to nothing with
 * no visible control to undo it.
 */
export function filterHoldings(holdingsData, { signal = "all", assetClass = "all", search = "" } = {}) {
  const rows = holdingsData || [];
  const classes = assetClassOptions(rows);
  const classActive = assetClass !== "all" && classes.includes(assetClass);
  const q = String(search || "").trim().toLowerCase();

  return rows.filter((h) => {
    const bySignal =
      signal === "all" ||
      (signal === "bullish" && h.community.bullPct >= 55) ||
      (signal === "bearish" && h.community.bearPct >= 55) ||
      (signal === "neutral" && h.community.bullPct < 55 && h.community.bearPct < 55);
    if (!bySignal) return false;
    if (classActive && h.type !== assetClass) return false;
    if (!q) return true;
    return (
      String(h.sym || "").toLowerCase().includes(q) ||
      String(h.name || "").toLowerCase().includes(q)
    );
  });
}
