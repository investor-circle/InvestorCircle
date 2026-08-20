/**
 * api/price.js — Vercel Serverless Function
 *
 * Browser-facing proxy for market price data. Keeps provider API keys
 * server-side and avoids CORS issues with Yahoo Finance.
 *
 * GET /api/price?symbol=RELIANCE&exchange=NSE&date=2025-01-15
 *
 * Query params:
 *   symbol    NSE/BSE trading symbol (required)
 *   exchange  "NSE" | "BSE" (default: "NSE")
 *   date      ISO 8601 date (optional; omit for previous close)
 *
 * Response:
 *   { price, currency, date, source, symbol, exchange }
 *
 * The provider chain itself now lives in api/_lib/priceProvider.js so the
 * scheduled instrument-pricing collector (api/_lib/handlers/pricing.js)
 * shares exactly one implementation with this proxy. To swap providers,
 * edit priceProvider.js only — nothing in the app changes.
 *
 * This endpoint remains the ON-DEMAND path used at the two moments a fresh
 * live price is genuinely required and no daily snapshot can substitute:
 * stamping a new idea's entry price, and stamping an exit price. Recurring
 * "what is this worth today" reads should use the persisted daily snapshots
 * (?resource=pricing&action=daily) instead of calling a provider per view.
 */

import { fetchPrice } from './_lib/priceProvider.js';

export default async function handler(req, res) {
  // CORS — allow calls from any origin (GitHub Pages, local dev, etc.)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { symbol, exchange = 'NSE', date } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });

  try {
    return res.json(await fetchPrice(symbol, exchange, date));
  } catch (e) {
    console.error(`[price] all providers failed for ${symbol}:`, e?.message);
    return res.status(404).json({
      error:  'Price not available from any provider',
      symbol: String(symbol).toUpperCase(),
      detail: e?.message,
    });
  }
}
