/**
 * api/_lib/handlers/pricing.js — "pricing" resource handler (Phase 9)
 *
 * READ-ONLY. This file no longer writes any price data.
 *
 *   GET ?resource=pricing&action=daily&tickers=A,B,C   (auth: user)
 *     Returns the latest stored snapshot for each requested ticker,
 *     including the PRECOMPUTED previous-trading-day close and daily change.
 *     One indexed query, no provider call, no aggregation.
 *
 * ── Who writes the data this reads ───────────────────────────────────────
 * scripts/stamp-prices.js — the nightly GitHub Actions batch (9pm IST,
 * weekdays) — is the SOLE writer of both `instrument_daily_prices` and the
 * price columns on `ic_recommendations`. An earlier revision of this file
 * also carried a collector (`action=collect`, on a Vercel Cron), which
 * fetched the same stocks the nightly batch was already fetching a few hours
 * later and could resolve a different number for the same instrument on the
 * same day. That collector has been REMOVED — code and cron entry both — and
 * its universe/auto-create/upsert rules were ported into Task 1 of
 * scripts/stamp-prices.js, where one fetch feeds both destinations.
 *
 * Consequently nothing here needs CRON_SECRET or admin authorisation any
 * more; the one remaining action is an ordinary authenticated user read.
 *
 * ── Why this lives inside api/data.js rather than as api/pricing.js ──────
 * The Vercel Hobby plan caps a deployment at 12 Serverless Functions and
 * this project is already at exactly 12 (api/{cas,email,price,push,reset,
 * data} + api/profile/*). A new top-level route would fail deployment. See
 * the same reasoning at the top of api/data.js.
 *
 * ── Instrument identity ──────────────────────────────────────────────────
 * The canonical security identity is the PRE-EXISTING, live `instruments`
 * table — the same one that powers the new-idea form's "Search instrument"
 * autocomplete (lookups.js `instruments-list`) and the admin instrument
 * browser/importer (admin-config.js).
 *
 * Identity is (symbol, asset_class), normalised to UPPER(TRIM(symbol)),
 * enforced by the UNIQUE index the Phase 9 migration installs in place of
 * the old (symbol, exchange) key. Exchange is deliberately NOT part of
 * identity — this isn't a broking app, and NSE- and BSE-tagged ideas on the
 * same ticker are the same instrument everywhere else in this codebase, so
 * pricing follows suit. `instruments.exchange` survives as the preferred
 * source exchange (informational), used only to decide which provider
 * symbol the nightly batch fetches. See
 * supabase/phase9_instrument_pricing.sql for the full rationale and the
 * duplicate-merge rule.
 *
 * ── Trading days ─────────────────────────────────────────────────────────
 * There is no market-calendar table and this deliberately does not invent
 * one. `price_date` is always the date the PROVIDER reported the close for,
 * so "the previous trading day" is whatever the provider's series says it
 * is — a Monday snapshot's prev_price_date is the preceding Friday
 * automatically, and an exchange holiday simply never appears in the
 * series.
 */

import { sql, parseBody, requireUid, sendAuthError } from '../auth.js';

// Ceiling on one read request. Callers ask for the tickers they actually
// have on screen; this just bounds a malformed/hostile request.
const MAX_TICKERS_PER_READ = 250;

function normTicker(t) { return String(t || '').trim().toUpperCase(); }

/**
 * Read path: latest stored snapshot per requested ticker.
 *
 * DISTINCT ON (i.id) + ORDER BY p.price_date DESC resolves "the newest row
 * per instrument" with the composite PK's index; no aggregation, no window
 * function, no per-ticker query. Deltas are read straight off the row
 * because collection already computed them.
 *
 * Keyed by ticker on the way IN, and — since instruments are keyed on
 * (symbol, asset_class) only, not exchange — at most ONE row comes back per
 * ticker (per asset class), so the caller never has to pick a winner
 * between an NSE and a BSE snapshot. `sourceExchange` is included purely as
 * provenance (which exchange that day's close actually came from).
 *
 * The response deliberately keeps speaking `ticker`/`assetName`, which is
 * the vocabulary ic_recommendations and the whole frontend use; the
 * master-list columns are `symbol`/`name`. The translation happens here,
 * once, so no frontend code had to change when pricing moved onto the live
 * instruments table.
 */
async function getDailyPrices(tickers) {
  const wanted = [...new Set(tickers.map(normTicker).filter(Boolean))].slice(0, MAX_TICKERS_PER_READ);
  if (!wanted.length) return [];
  const rows = await sql`
    SELECT DISTINCT ON (i.id)
      i.symbol, i.asset_class, i.name, i.exchange,
      p.price_date, p.close_price, p.currency,
      p.prev_close_price, p.prev_price_date,
      p.change_abs, p.change_pct, p.source, p.source_exchange, p.collected_at
    FROM instruments i
    JOIN instrument_daily_prices p ON p.instrument_id = i.id
    WHERE i.symbol = ANY(${wanted}::text[])
    ORDER BY i.id, p.price_date DESC
  `;
  const asDate = (v) => (v ? (v.toISOString?.().slice(0, 10) ?? String(v)) : null);
  return rows.map(r => ({
    ticker:         r.symbol,
    assetClass:     r.asset_class,
    assetName:      r.name,
    currency:       r.currency || 'INR',
    date:           asDate(r.price_date),
    close:          r.close_price      != null ? Number(r.close_price)      : null,
    prevClose:      r.prev_close_price != null ? Number(r.prev_close_price) : null,
    prevDate:       asDate(r.prev_price_date),
    changeAbs:      r.change_abs != null ? Number(r.change_abs) : null,
    changePct:      r.change_pct != null ? Number(r.change_pct) : null,
    source:         r.source || null,
    sourceExchange: r.source_exchange || r.exchange || null,
  }));
}

export default async function handler(req, res) {
  if (!sql) { res.status(500).json({ error: 'Database not configured' }); return; }

  const body   = req.method === 'POST' ? parseBody(req) : {};
  const action = String(req.query?.action || body.action || '');

  try {
    if (action === 'daily') {
      try { await requireUid(req); }
      catch (e) { sendAuthError(res, e); return; }
      const raw = req.query?.tickers ?? body.tickers ?? '';
      const list = Array.isArray(raw) ? raw : String(raw).split(',');
      res.status(200).json({ prices: await getDailyPrices(list) });
      return;
    }

    res.status(400).json({ error: 'Unknown pricing action' });
  } catch (e) {
    console.error('[pricing] handler error:', e?.message || e);
    res.status(500).json({ error: 'Server error' });
  }
}
