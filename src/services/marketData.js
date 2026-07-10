/**
 * marketData.js — Market Data Abstraction Layer (browser side)
 *
 * ALL app code imports from this file only.
 * To swap the price provider: update VITE_PRICE_API_URL or the
 * api/price.js Vercel function. Nothing else changes.
 *
 * The browser never calls Yahoo/Twelve Data directly — it always
 * goes through the Vercel proxy to avoid CORS and keep API keys secret.
 */

// ── Config ────────────────────────────────────────────────────────────────────
// Set VITE_PRICE_API_URL in your .env.local and in GitHub Actions secrets.
// Default points to the Vercel project you'll deploy api/price.js to.
const PROXY_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PRICE_API_URL) ||
  'https://investor-circle.vercel.app';

const TIMEOUT_MS = 8_000;

// ── Internal fetch with timeout ───────────────────────────────────────────────
async function proxyFetch(params) {
  const url = new URL(`${PROXY_BASE}/api/price`);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, String(v)));

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data; // { price, currency, date, source, symbol }
  } finally {
    clearTimeout(tid);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Get the previous trading day's closing price.
 * Used when a recommendation is published — stamps entry price.
 *
 * @param {string} symbol   NSE/BSE trading symbol e.g. "RELIANCE"
 * @param {string} exchange "NSE" | "BSE"
 * @returns {Promise<{ price: number, currency: string, date: string, source: string }>}
 */
export async function getPreviousClose(symbol, exchange = 'NSE') {
  return proxyFetch({ symbol, exchange });
}

/**
 * Get the closing price for a specific calendar date.
 * Used for expiry stamping and historical lookups.
 *
 * @param {string} symbol
 * @param {string} exchange
 * @param {string} date     ISO 8601 e.g. "2025-01-15"
 */
export async function getHistoricalClose(symbol, exchange = 'NSE', date) {
  return proxyFetch({ symbol, exchange, date });
}

/**
 * Get today's closing price (or most recent available if market is still open).
 * Used when investor posts an exit signal.
 */
export async function getTodayClose(symbol, exchange = 'NSE') {
  return proxyFetch({ symbol, exchange });
}

/**
 * Human-readable label for a price source value stored in the DB.
 */
export function sourceName(source) {
  return {
    nse_bhavcopy:  'NSE Official (Bhavcopy)',
    yahoo_finance: 'Yahoo Finance',
    twelve_data:   'Twelve Data',
    manual:        'Manual entry',
    unavailable:   'Source unavailable',
  }[source] || source || '—';
}

/**
 * Returns true if price auto-stamping is configured.
 * If VITE_PRICE_API_URL is not set and we're not in prod, this is false.
 */
export function isPriceServiceConfigured() {
  return Boolean(PROXY_BASE);
}
