// Live price fetcher using Finnhub's free API.
//
// Setup (one time):
//   1. Sign up at https://finnhub.io — takes 30 seconds, no credit card.
//   2. Copy your API key from the Finnhub dashboard.
//   3. Add it to your .env file:
//        VITE_FINNHUB_KEY=your_key_here
//   4. Restart the dev server (npm run dev).
//
// Free tier limits: 60 requests/minute — plenty for a personal portfolio.
// Data freshness: ~15-20 min delayed for stocks; real-time for crypto on some pairs.
//
// Symbol format reference:
//   US stocks/ETFs:  "AAPL", "MSFT", "VOO", "JEPI"    → pass as-is
//   Mutual funds:    "VTSAX", "PPFAS"                  → pass as-is (may return 0 — see note)
//   NSE stocks:      "RELIANCE.NS", "TCS.NS"            → Yahoo-style suffix works on Finnhub
//   BSE stocks:      "RELIANCE.BO"                      → same
//   Bitcoin:         use "BINANCE:BTCUSDT"              → exchange:pair format
//   Ethereum:        use "BINANCE:ETHUSDT"
//
// Note on mutual funds: Finnhub free tier doesn't cover all mutual fund NAVs.
// If a symbol returns 0, it means Finnhub doesn't have data for it — the
// existing mock price is kept unchanged. This is expected for some fund symbols.

const FINNHUB_KEY = import.meta.env.VITE_FINNHUB_KEY;
const BASE = "https://finnhub.io/api/v1/quote";

// Some symbols need remapping to formats Finnhub understands.
// Add more here as you add holdings to your portfolio.
const SYMBOL_MAP = {
  BTC:   "BINANCE:BTCUSDT",
  ETH:   "BINANCE:ETHUSDT",
  SOL:   "BINANCE:SOLUSDT",
  BNB:   "BINANCE:BNBUSDT",
  DOGE:  "BINANCE:DOGEUSDT",
};

function mapSymbol(sym) {
  return SYMBOL_MAP[sym.toUpperCase()] ?? sym;
}

async function fetchOne(sym) {
  const mapped = mapSymbol(sym);
  const url = `${BASE}?symbol=${encodeURIComponent(mapped)}&token=${FINNHUB_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  // Finnhub returns { c: current, d: change, dp: %change, h: high, l: low, o: open, pc: prevClose }
  // c === 0 means symbol not found or not covered on this plan.
  return {
    sym,
    price: data.c > 0 ? data.c : null,   // null = no data for this symbol
    change: data.d,
    changePct: data.dp,
    prevClose: data.pc,
    high: data.h,
    low: data.l,
  };
}

/**
 * Fetch live prices for all unique symbols in the holdings array, in parallel.
 * Returns a map of { [sym]: priceResult } where priceResult.price is null
 * if Finnhub has no data for that symbol.
 *
 * @param {Array} holdings  — the holdings state array from App.jsx
 * @returns {Promise<{results: Object, errors: string[]}>}
 */
export async function fetchLivePrices(holdings) {
  if (!FINNHUB_KEY) {
    throw new Error(
      "VITE_FINNHUB_KEY is not set. Add it to your .env file — see src/services/priceService.js for instructions."
    );
  }

  // Deduplicate symbols (multiple holdings can share a ticker)
  const uniqueSyms = [...new Set(holdings.map(h => h.sym))];

  const settled = await Promise.allSettled(uniqueSyms.map(sym => fetchOne(sym)));

  const results = {};
  const errors = [];

  settled.forEach((outcome, i) => {
    const sym = uniqueSyms[i];
    if (outcome.status === "fulfilled") {
      results[sym] = outcome.value;
      if (outcome.value.price === null) {
        errors.push(`${sym}: no price data on this plan (keeping existing price)`);
      }
    } else {
      errors.push(`${sym}: fetch failed — ${outcome.reason?.message ?? "unknown error"}`);
    }
  });

  return { results, errors };
}

export const isFinnhubConfigured = Boolean(FINNHUB_KEY);
