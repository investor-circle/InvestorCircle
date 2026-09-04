// Portfolio holding construction + validation.
//
// The server (api/_lib/handlers/lookups.js, action 'portfolio-add') requires a
// CLIENT-SUPPLIED `id` and `sym`, and normalizes the rest through
// holdingFields(). The web app builds that object in AddHoldingModal's
// handleAdd (src/features/portfolio/Portfolio.jsx) — this mirrors it field for
// field so a holding added on mobile is indistinguishable from one added on
// web, including the id format and the `price: cost` proxy.
//
// Kept pure (no RN imports) so it can be unit tested.

export const HOLDING_TYPES = ["Stock", "ETF", "Fund", "Crypto", "Bond", "REIT", "Others"];
export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "JPY", "SGD", "AED"];

/** Same id shape the web app generates, so both clients look alike in the DB. */
export function newHoldingId(now = Date.now(), rand = Math.random) {
  return `hold_${now}_${rand().toString(36).slice(2, 7)}`;
}

/**
 * Validate the add-holding form. Returns an error string, or null when valid.
 * Mirrors the web modal's checks: ticker and name are the only hard
 * requirements; quantity/price are optional (a watch-only holding is allowed).
 */
export function validateHolding({ ticker, name, qty, purchPrice }) {
  if (!String(ticker || "").trim()) return "Ticker / symbol is required.";
  if (!String(name || "").trim()) return "Asset name is required.";
  if (qty !== "" && qty != null && !(Number(qty) >= 0)) return "Quantity must be a positive number.";
  if (purchPrice !== "" && purchPrice != null && !(Number(purchPrice) >= 0)) {
    return "Buy price must be a positive number.";
  }
  return null;
}

/**
 * Build the holding payload for portfolio-add from the form fields.
 * `price` is seeded from `cost` exactly as the web does — a proxy until the
 * nightly batch prices this ticker/ISIN — so P&L reads 0% rather than -100%
 * on a freshly added holding.
 */
export function buildHolding(form, { id = newHoldingId(), today = new Date() } = {}) {
  const sh = parseFloat(form.qty) || 0;
  const cost = parseFloat(form.purchPrice) || 0;
  return {
    id,
    sym: String(form.ticker || "").trim().toUpperCase(),
    name: String(form.name || "").trim(),
    type: form.assetType || "Stock",
    acct: "manual",
    acctName: "Manual Portfolio",
    sh,
    cost,
    price: cost,
    isin: form.isin || "",
    sector: String(form.sector || "").trim(),
    currency: form.currency || "INR",
    purchaseDate: form.purchDate || today.toISOString().slice(0, 10),
    source: "manual",
  };
}

/** Value/cost/P&L totals for a holdings list. Same arithmetic as the web table. */
export function portfolioTotals(holdings) {
  let value = 0;
  let cost = 0;
  for (const h of holdings || []) {
    const sh = Number(h?.sh) || 0;
    value += sh * (Number(h?.price) || 0);
    cost += sh * (Number(h?.cost) || 0);
  }
  return { value, cost, pnl: value - cost, pct: cost > 0 ? (value - cost) / cost : 0 };
}
