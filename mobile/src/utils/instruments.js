/**
 * Instrument master search helpers.
 *
 * Pure and free of service/React-Native imports so they can be unit tested
 * directly — the fetching + caching half lives in
 * src/services/instrumentCache.js. Same split as the rest of utils/.
 *
 * The matching rule mirrors the web app's InstrumentSearch
 * (src/components/common.jsx).
 */

/**
 * Filter the instrument list for a typed term. Pure — the caller supplies the
 * list, so this is testable without touching the network.
 *
 * Matching rule is the web app's, deliberately: symbol matches by PREFIX (so
 * typing "INF" surfaces INFY rather than every name containing "inf"), name
 * matches anywhere. Symbol hits sort first, because someone typing a ticker
 * wants that ticker.
 */
export function searchInstruments(all, term, limit = 18) {
  const t = String(term || "").trim().toLowerCase();
  if (t.length < 2) return [];

  const symbolHits = [];
  const nameHits = [];
  for (const i of all || []) {
    if (!i) continue;
    const symbol = String(i.symbol || "").toLowerCase();
    const name = String(i.name || "").toLowerCase();
    if (symbol && symbol.startsWith(t)) symbolHits.push(i);
    else if (name && name.includes(t)) nameHits.push(i);
    if (symbolHits.length >= limit) break;
  }
  return [...symbolHits, ...nameHits].slice(0, limit);
}

/**
 * Normalize a selected instrument row into the shape the forms consume.
 * Mirrors the object InstrumentSearch's select() hands to its onSelect.
 */
export function toSelection(inst) {
  if (!inst) return null;
  return {
    symbol: inst.symbol || "",
    name: inst.name || "",
    exchange: inst.exchange || null,
    assetClass: inst.asset_class || null,
    currency: inst.currency || "INR",
    sector: inst.sector || null,
    type: inst.type || null,
  };
}

/**
 * Map an instrument's asset_class/type onto the portfolio's holding types.
 * Mirrors handleSelect in the web AddHoldingModal.
 */
export function holdingTypeFor(inst) {
  const ac = String(inst?.asset_class || inst?.type || "").toLowerCase();
  if (ac.includes("etf")) return "ETF";
  if (ac.includes("fund") || ac.includes("mf")) return "Fund";
  if (ac.includes("crypto")) return "Crypto";
  return "Stock";
}
