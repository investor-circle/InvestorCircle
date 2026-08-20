/**
 * api/_lib/priceProvider.js — server-side market-data provider layer
 *
 * The ONE place in this repo that talks to an external pricing provider.
 * Extracted verbatim from api/price.js (which now imports from here) so the
 * scheduled instrument-pricing collector in
 * api/_lib/handlers/pricing.js can reuse exactly the same provider chain
 * and fallback order instead of growing a second, divergent copy.
 *
 * Files under api/_lib/ are excluded from Vercel's file-system routing and
 * do not count against the Hobby plan's 12-function cap (see api/data.js).
 *
 * Provider credentials stay server-side: TWELVE_DATA_KEY is a plain
 * (non-VITE_) env var read only from here. The browser never calls a
 * provider directly — it goes through api/price.js, and from Phase 9 on it
 * mostly doesn't need to at all (it reads persisted snapshots instead).
 *
 * Provider chain (tried in order, first success wins):
 *   1. Yahoo Finance (unofficial but free, no key)
 *   2. Twelve Data   (only if TWELVE_DATA_KEY is set)
 *
 * KNOWN PROVIDER LIMITATIONS (documented, not papered over):
 *   - Yahoo's chart endpoint is ONE SYMBOL PER REQUEST. There is no batch
 *     quote endpoint we can use without a crumb/cookie handshake, so the
 *     collector fans out with a bounded concurrency pool rather than a
 *     single batch call. `fetchDailySeries` mitigates this by returning
 *     several trading days from that one request, so the collector never
 *     needs a second call just to learn the previous close.
 *   - Yahoo is unofficial and rate-limits aggressively under burst. The
 *     collector's concurrency limit exists for that reason.
 *   - Neither provider covers every Indian mutual-fund NAV. An instrument
 *     with no provider data yields NO row rather than a fabricated one.
 */

const YAHOO_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (compatible; InvestorCircle/1.0)',
  'Accept':          'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

/** NSE/BSE symbol -> Yahoo symbol. */
export function yahooSymbol(symbol, exchange) {
  return `${symbol}${exchange === 'BSE' ? '.BO' : '.NS'}`;
}

/**
 * Fetch a daily close series for one instrument from Yahoo.
 *
 * Returns ascending [{ date: 'YYYY-MM-DD', close: Number }, ...] containing
 * only real trading days the provider actually reported a close for —
 * weekends and exchange holidays simply are not in the array. That is what
 * makes "the previous trading day" a lookup rather than a calendar guess.
 *
 * @param {string} symbol    e.g. "RELIANCE"
 * @param {string} exchange  "NSE" | "BSE"
 * @param {string} range     Yahoo range token, e.g. "5d", "1mo"
 * @returns {Promise<{ series: Array, currency: string, source: string }>}
 */
export async function fetchDailySeries(symbol, exchange = 'NSE', range = '5d') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol(symbol, exchange)}?interval=1d&range=${range}`;
  const res = await fetch(url, { headers: YAHOO_HEADERS });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);

  const json   = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('Yahoo: no result');

  const timestamps = result.timestamp || [];
  const closes     = result.indicators?.quote?.[0]?.close || [];
  const currency   = result.meta?.currency || 'INR';

  const series = [];
  timestamps.forEach((ts, i) => {
    const close = closes[i];
    if (close == null || !(close > 0)) return; // provider gap — skip, never interpolate
    series.push({ date: new Date(ts * 1000).toISOString().slice(0, 10), close: +Number(close).toFixed(6) });
  });
  if (!series.length) throw new Error('Yahoo: empty close series');

  // Yahoo returns ascending, but do not rely on it.
  series.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { series, currency, source: 'yahoo_finance' };
}

// ── Yahoo Finance provider (single-price form used by api/price.js) ──────────
export async function fetchFromYahoo(symbol, exchange, date) {
  const yahooSym = yahooSymbol(symbol, exchange);

  // Build URL — historical if date given, else 5-day range for latest close
  let apiUrl;
  if (date) {
    const d       = new Date(date);
    const period1 = Math.floor(d.getTime() / 1000);
    const period2 = Math.floor((d.getTime() + 86400_000) / 1000);
    apiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=1d&period1=${period1}&period2=${period2}`;
  } else {
    apiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=1d&range=5d`;
  }

  const res = await fetch(apiUrl, { headers: YAHOO_HEADERS });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);

  const json     = await res.json();
  const result   = json?.chart?.result?.[0];
  if (!result)   throw new Error('Yahoo: no result');

  const timestamps = result.timestamp || [];
  const closes     = result.indicators?.quote?.[0]?.close || [];
  const currency   = result.meta?.currency || 'INR';

  if (!closes.length) throw new Error('Yahoo: empty close array');

  let price, priceDate;

  if (date) {
    // Find the close that matches the requested date
    const target = new Date(date);
    let bestIdx  = -1;
    let bestDiff = Infinity;
    timestamps.forEach((ts, i) => {
      if (closes[i] == null) return;
      const diff = Math.abs(ts * 1000 - target.getTime());
      if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
    });
    if (bestIdx === -1) throw new Error('Yahoo: date not found in range');
    price     = closes[bestIdx];
    priceDate = new Date(timestamps[bestIdx] * 1000).toISOString().slice(0, 10);
  } else {
    // Latest available close (last non-null entry)
    let idx = closes.length - 1;
    while (idx >= 0 && closes[idx] == null) idx--;
    if (idx < 0) throw new Error('Yahoo: no valid close found');
    price     = closes[idx];
    priceDate = new Date(timestamps[idx] * 1000).toISOString().slice(0, 10);
  }

  return { price: +price.toFixed(2), currency, date: priceDate, source: 'yahoo_finance' };
}

// ── Twelve Data provider ─────────────────────────────────────────────────────
export async function fetchFromTwelveData(symbol, exchange, date, apiKey) {
  if (!apiKey) throw new Error('Twelve Data: no API key');
  const tdSymbol = `${symbol}:${exchange}`;
  const url = date
    ? `https://api.twelvedata.com/time_series?symbol=${tdSymbol}&interval=1day&start_date=${date}&end_date=${date}&apikey=${apiKey}`
    : `https://api.twelvedata.com/price?symbol=${tdSymbol}&apikey=${apiKey}`;

  const res  = await fetch(url);
  if (!res.ok) throw new Error(`TwelveData HTTP ${res.status}`);
  const json = await res.json();

  if (json.status === 'error') throw new Error(`TwelveData: ${json.message}`);

  if (date) {
    const values = json.values;
    if (!values?.length) throw new Error('TwelveData: no data for date');
    return {
      price:    +parseFloat(values[0].close).toFixed(2),
      currency: 'INR',
      date:     values[0].datetime,
      source:   'twelve_data',
    };
  }
  if (!json.price) throw new Error('TwelveData: no price field');
  return {
    price:    +parseFloat(json.price).toFixed(2),
    currency: 'INR',
    date:     new Date().toISOString().slice(0, 10),
    source:   'twelve_data',
  };
}

/**
 * The shared provider chain: try Yahoo, then Twelve Data. Returns the first
 * result with a positive price, or throws the last provider error.
 * Used by api/price.js (the browser-facing proxy) and as the collector's
 * single-day fallback when a series fetch fails.
 */
export async function fetchPrice(symbol, exchange = 'NSE', date) {
  const sym = String(symbol).toUpperCase();
  const exc = String(exchange || 'NSE').toUpperCase();
  const providers = [
    () => fetchFromYahoo(sym, exc, date),
    () => fetchFromTwelveData(sym, exc, date, process.env.TWELVE_DATA_KEY),
  ];
  let lastError;
  for (const tryProvider of providers) {
    try {
      const result = await tryProvider();
      if (result?.price > 0) return { ...result, symbol: sym, exchange: exc };
    } catch (e) {
      lastError = e;
      console.warn(`[price] provider failed for ${sym}: ${e.message}`);
    }
  }
  throw lastError || new Error('Price not available from any provider');
}

/**
 * Run `worker` over `items` with at most `limit` in flight at once.
 * Yahoo rate-limits bursts, and a serverless function has a wall-clock
 * budget — this is the middle ground between a serial loop (too slow for a
 * few hundred instruments) and Promise.all over everything (throttled).
 * Never rejects: every entry resolves to { item, value } or { item, error }.
 */
export async function mapWithConcurrency(items, limit, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        out[i] = { item: items[i], value: await worker(items[i]) };
      } catch (e) {
        out[i] = { item: items[i], error: e };
      }
    }
  });
  await Promise.all(runners);
  return out;
}
