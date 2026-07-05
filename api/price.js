/**
 * api/price.js — Vercel Serverless Function
 *
 * Proxy for market price data. Keeps API keys server-side and
 * avoids CORS issues with Yahoo Finance.
 *
 * GET /api/price?symbol=RELIANCE&exchange=NSE&date=2025-01-15
 *
 * Query params:
 *   symbol    NSE/BSE trading symbol (required)
 *   exchange  "NSE" | "BSE" (default: "NSE")
 *   date      ISO 8601 date (optional; omit for previous close)
 *
 * Response:
 *   { price, currency, date, source, symbol }
 *
 * Provider chain (tried in order):
 *   1. Yahoo Finance (unofficial but free)
 *   2. Twelve Data   (if TWELVE_DATA_KEY env var is set)
 *
 * To swap providers: edit this file only. Nothing in the app changes.
 */

// ── Yahoo Finance provider ────────────────────────────────────────────────────
async function fetchFromYahoo(symbol, exchange, date) {
  const suffix     = exchange === 'BSE' ? '.BO' : '.NS';
  const yahooSym   = `${symbol}${suffix}`;

  // Build URL — historical if date given, else 5-day range for latest close
  let apiUrl;
  if (date) {
    const d      = new Date(date);
    const period1 = Math.floor(d.getTime() / 1000);
    const period2 = Math.floor((d.getTime() + 86400_000) / 1000);
    apiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=1d&period1=${period1}&period2=${period2}`;
  } else {
    apiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=1d&range=5d`;
  }

  const res = await fetch(apiUrl, {
    headers: {
      'User-Agent':      'Mozilla/5.0 (compatible; InvestorCircle/1.0)',
      'Accept':          'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
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

// ── Twelve Data provider ──────────────────────────────────────────────────────
async function fetchFromTwelveData(symbol, exchange, date, apiKey) {
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
  } else {
    if (!json.price) throw new Error('TwelveData: no price field');
    return {
      price:    +parseFloat(json.price).toFixed(2),
      currency: 'INR',
      date:     new Date().toISOString().slice(0, 10),
      source:   'twelve_data',
    };
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS — allow calls from your GitHub Pages domain
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

  const { symbol, exchange = 'NSE', date } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });

  const providers = [
    () => fetchFromYahoo(symbol.toUpperCase(), exchange.toUpperCase(), date),
    () => fetchFromTwelveData(symbol.toUpperCase(), exchange.toUpperCase(), date, process.env.TWELVE_DATA_KEY),
  ];

  let lastError;
  for (const tryProvider of providers) {
    try {
      const result = await tryProvider();
      if (result?.price > 0) {
        return res.json({ ...result, symbol: symbol.toUpperCase(), exchange: exchange.toUpperCase() });
      }
    } catch (e) {
      lastError = e;
      console.warn(`[price] provider failed: ${e.message}`);
    }
  }

  console.error(`[price] all providers failed for ${symbol}:`, lastError?.message);
  return res.status(404).json({
    error:  'Price not available from any provider',
    symbol: symbol.toUpperCase(),
    detail: lastError?.message,
  });
}
