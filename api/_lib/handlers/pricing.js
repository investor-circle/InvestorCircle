/**
 * api/_lib/handlers/pricing.js — "pricing" resource handler (Phase 9)
 *
 * The centralized instrument-level pricing layer. Two actions with very
 * different auth needs, which is why api/data.js registers this resource as
 * auth:'none' and each action authorises itself (same pattern as
 * lookups.js / claim-profile.js / groups.js):
 *
 *   GET|POST ?resource=pricing&action=collect      (auth: CRON SECRET or admin)
 *     The scheduled collector. Determines the active-instrument universe,
 *     fetches each instrument ONCE from the provider, and persists one
 *     daily snapshot per instrument per trading day.
 *
 *     Scheduled by the `crons` entry in vercel.json at 12:00 UTC = 17:30
 *     IST, two hours after the NSE 15:30 IST close so the day's closing
 *     prices are settled. It runs EVERY day rather than weekdays-only
 *     because the run is idempotent and self-skipping: on a weekend the
 *     latest trading day (Friday) is already stored, every instrument is
 *     filtered out before any provider call, and the run costs one SQL
 *     query. Vercel's Hobby plan permits one cron invocation per day —
 *     do not add an intra-day schedule without checking the plan tier.
 *
 *   GET ?resource=pricing&action=daily&tickers=A,B,C   (auth: user)
 *     The read path. Returns the latest stored snapshot for each requested
 *     ticker, including the PRECOMPUTED previous-trading-day close and
 *     daily change. One indexed query, no provider call, no aggregation.
 *
 * ── Why this lives inside api/data.js rather than as api/pricing.js ──────
 * The Vercel Hobby plan caps a deployment at 12 Serverless Functions and
 * this project is already at exactly 12 (api/{cas,email,price,push,reset,
 * data} + api/profile/*). A new top-level route would fail deployment. See
 * the same reasoning at the top of api/data.js.
 *
 * ── Instrument identity ──────────────────────────────────────────────────
 * Canonicalised as (UPPER(TRIM(ticker)), UPPER(TRIM(exchange)),
 * asset_class) against the `instruments` table's UNIQUE constraint. See
 * supabase/phase9_instrument_pricing.sql for why a canonical table was
 * needed rather than keying prices off ic_recommendations' free-text
 * columns.
 *
 * ── Trading days ─────────────────────────────────────────────────────────
 * There is no market-calendar table and this deliberately does not invent
 * one. `price_date` is always the date the PROVIDER reported the close for,
 * so "the previous trading day" is whatever the provider's series says it
 * is — a Monday snapshot's prev_price_date is the preceding Friday
 * automatically, and an exchange holiday simply never appears in the
 * series. The only calendar heuristic here is the cheap
 * already-collected-today pre-filter (see expectedTradingDate).
 */

import { sql, parseBody, requireUid, requireAdmin, sendAuthError } from '../auth.js';
import { fetchDailySeries, fetchPrice, mapWithConcurrency } from '../priceProvider.js';

// Yahoo is unofficial and rate-limits bursts; a serverless invocation also
// has a wall-clock budget. 6 in flight is the tested middle ground between a
// serial loop and an unbounded Promise.all.
const FETCH_CONCURRENCY = 6;

// A 7-day range yields the latest close AND the previous trading day's
// close from ONE request, so the collector never needs a second call per
// instrument just to learn the previous close. Seven calendar days spans a
// normal weekend plus a holiday and still leaves two trading days.
const SERIES_RANGE = '7d';

// Hard ceiling on one collection run, so a runaway universe can't blow the
// function's time budget or hammer the provider. Exceeding it is logged and
// reported in the response rather than silently truncated-and-forgotten.
const MAX_INSTRUMENTS_PER_RUN = 400;

// Ceiling on one read request. Callers ask for the tickers they actually
// have on screen; this just bounds a malformed/hostile request.
const MAX_TICKERS_PER_READ = 250;

/** Today's date in IST (the market timezone), as YYYY-MM-DD. */
function istToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/**
 * The most recent weekday on or before today (IST) — a cheap lower bound on
 * "the latest trading day that could possibly exist yet".
 *
 * This is ONLY used as a skip-work pre-filter: an instrument whose newest
 * stored snapshot is already at or after this date is not re-fetched. It is
 * deliberately NOT used as the stored price_date. On an exchange holiday
 * this returns a date that will never be stored, so the run does its
 * provider fanout, re-upserts the same unchanged rows, and stores nothing
 * new — correct, just mildly wasteful ~15 days a year. Being wrong in that
 * direction is safe; assuming a holiday was a trading day would not be.
 */
function expectedTradingDate() {
  const [y, m, d] = istToday().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6) dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

function normTicker(t) { return String(t || '').trim().toUpperCase(); }

/**
 * Authorise a collection run. Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET` when the CRON_SECRET env var is set,
 * which is the convention used here. An admin may also trigger a run
 * manually with a normal Firebase token (requireAdmin).
 *
 * If CRON_SECRET is not configured the secret path is DISABLED rather than
 * open — an unconfigured deployment falls back to admin-only, it never
 * degrades to unauthenticated.
 */
async function authorizeCollect(req) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.authorization || '';
    const bearer = header.match(/^Bearer\s+(.+)$/)?.[1];
    if (bearer === secret) return { via: 'cron' };
    if (req.headers['x-cron-secret'] === secret) return { via: 'cron' };
  }
  await requireAdmin(req); // throws {status,error} — caller reports via sendAuthError
  return { via: 'admin' };
}

/**
 * The active-instrument universe: every DISTINCT instrument referenced by at
 * least one currently-active idea.
 *
 * "Active" reuses the lifecycle rule this codebase already defines (see
 * src/db.js's status-rules comment and api/_lib/handlers/public-profile.js,
 * which encodes the same predicate):
 *     Active = NOT exit_signal AND (target_date IS NULL OR target_date >= CURRENT_DATE)
 * No new lifecycle concept is introduced.
 *
 * Dedup happens in SQL (GROUP BY on the normalised key), so an instrument
 * referenced by 50 ideas or tracked by 500 users appears exactly ONCE in the
 * returned list. The universe is recomputed from scratch every run, which is
 * what makes it self-maintaining: a newly-posted idea adds its instrument on
 * the next run, and an instrument whose last active idea exits or expires
 * simply stops being returned — its history stays, no cleanup job needed.
 */
async function getActiveInstrumentUniverse() {
  return sql`
    SELECT
      UPPER(TRIM(ticker))                        AS ticker,
      UPPER(TRIM(COALESCE(NULLIF(TRIM(exchange), ''), 'NSE'))) AS exchange,
      COALESCE(NULLIF(TRIM(asset_class), ''), 'Equity')        AS asset_class,
      MIN(asset_name)                            AS asset_name,
      COUNT(*)::int                              AS active_idea_count
    FROM ic_recommendations
    WHERE ticker IS NOT NULL
      AND TRIM(ticker) <> ''
      AND exit_signal = false
      AND (target_date IS NULL OR target_date >= CURRENT_DATE)
    GROUP BY 1, 2, 3
    ORDER BY active_idea_count DESC, ticker ASC
  `;
}

/** Upsert the universe into `instruments` and return the canonical rows with ids. One statement each — never per-instrument. */
async function upsertInstruments(universe) {
  await sql`
    INSERT INTO instruments (ticker, exchange, asset_class, asset_name)
    SELECT q.ticker, q.exchange, q.asset_class, q.asset_name
    FROM UNNEST(
      ${universe.map(u => u.ticker)}::text[],
      ${universe.map(u => u.exchange)}::text[],
      ${universe.map(u => u.asset_class)}::text[],
      ${universe.map(u => u.asset_name || null)}::text[]
    ) AS q(ticker, exchange, asset_class, asset_name)
    ON CONFLICT (ticker, exchange, asset_class) DO UPDATE
      SET asset_name = COALESCE(EXCLUDED.asset_name, instruments.asset_name),
          updated_at = now()
  `;
  return sql`
    SELECT i.id, i.ticker, i.exchange, i.asset_class,
           (SELECT MAX(p.price_date) FROM instrument_daily_prices p WHERE p.instrument_id = i.id) AS latest_price_date
    FROM instruments i
    WHERE (i.ticker, i.exchange, i.asset_class) IN (
      SELECT q.ticker, q.exchange, q.asset_class
      FROM UNNEST(
        ${universe.map(u => u.ticker)}::text[],
        ${universe.map(u => u.exchange)}::text[],
        ${universe.map(u => u.asset_class)}::text[]
      ) AS q(ticker, exchange, asset_class)
    )
  `;
}

/**
 * Fetch one instrument's recent daily closes and derive today's snapshot
 * plus the precomputed previous-trading-day delta.
 *
 * Returns null when the provider has no usable data — the caller stores
 * NOTHING for that instrument rather than carrying a stale price forward or
 * inventing one.
 */
async function collectOne(instr) {
  let series;
  try {
    ({ series } = await fetchDailySeries(instr.ticker, instr.exchange, SERIES_RANGE));
  } catch (seriesErr) {
    // Series unavailable (e.g. Yahoo has no chart for this symbol). Fall
    // back to the shared provider chain's single-price form, which also
    // reaches Twelve Data. That yields a close with no previous close —
    // recorded honestly as a snapshot with a NULL delta.
    try {
      const p = await fetchPrice(instr.ticker, instr.exchange);
      return { date: p.date, close: p.price, currency: p.currency, source: p.source, prev: null };
    } catch {
      throw seriesErr;
    }
  }
  const latest = series[series.length - 1];
  const prev   = series.length > 1 ? series[series.length - 2] : null;
  return { date: latest.date, close: latest.close, currency: 'INR', source: 'yahoo_finance', prev };
}

/**
 * For snapshots whose provider series gave no previous trading day, look the
 * previous close up from what we already stored. ONE batched query for all
 * of them, never one per instrument.
 */
async function backfillPrevFromDb(rows) {
  const needy = rows.filter(r => r.prevClose == null);
  if (!needy.length) return;
  const found = await sql`
    SELECT DISTINCT ON (p.instrument_id)
           p.instrument_id, p.price_date, p.close_price
    FROM instrument_daily_prices p
    JOIN UNNEST(${needy.map(r => r.instrumentId)}::uuid[], ${needy.map(r => r.date)}::date[]) AS q(instrument_id, before_date)
      ON q.instrument_id = p.instrument_id
    WHERE p.price_date < q.before_date
    ORDER BY p.instrument_id, p.price_date DESC
  `;
  const byId = new Map(found.map(f => [String(f.instrument_id), f]));
  needy.forEach(r => {
    const hit = byId.get(String(r.instrumentId));
    if (!hit) return;
    r.prevClose = Number(hit.close_price);
    r.prevDate  = hit.price_date?.toISOString?.().slice(0, 10) ?? String(hit.price_date);
  });
}

/** Persist snapshots. One statement for the whole run; the composite PK makes a repeat run an in-place refresh, never a duplicate. */
async function persistSnapshots(rows) {
  if (!rows.length) return 0;
  await sql`
    INSERT INTO instrument_daily_prices
      (instrument_id, price_date, close_price, currency,
       prev_close_price, prev_price_date, change_abs, change_pct, source, collected_at)
    SELECT
      q.instrument_id, q.price_date, q.close_price, q.currency,
      q.prev_close_price, q.prev_price_date,
      CASE WHEN q.prev_close_price IS NOT NULL
           THEN q.close_price - q.prev_close_price END,
      CASE WHEN q.prev_close_price IS NOT NULL AND q.prev_close_price <> 0
           THEN (q.close_price - q.prev_close_price) / q.prev_close_price * 100 END,
      q.source, now()
    FROM UNNEST(
      ${rows.map(r => r.instrumentId)}::uuid[],
      ${rows.map(r => r.date)}::date[],
      ${rows.map(r => r.close)}::numeric[],
      ${rows.map(r => r.currency || 'INR')}::text[],
      ${rows.map(r => r.prevClose)}::numeric[],
      ${rows.map(r => r.prevDate)}::date[],
      ${rows.map(r => r.source || null)}::text[]
    ) AS q(instrument_id, price_date, close_price, currency, prev_close_price, prev_price_date, source)
    ON CONFLICT (instrument_id, price_date) DO UPDATE
      SET close_price      = EXCLUDED.close_price,
          currency         = EXCLUDED.currency,
          prev_close_price = COALESCE(EXCLUDED.prev_close_price, instrument_daily_prices.prev_close_price),
          prev_price_date  = COALESCE(EXCLUDED.prev_price_date,  instrument_daily_prices.prev_price_date),
          change_abs       = COALESCE(EXCLUDED.change_abs,       instrument_daily_prices.change_abs),
          change_pct       = COALESCE(EXCLUDED.change_pct,       instrument_daily_prices.change_pct),
          source           = EXCLUDED.source,
          collected_at     = now()
  `;
  return rows.length;
}

/** The full collection run. */
async function runCollection({ force = false } = {}) {
  const startedAt = Date.now();
  const universe  = await getActiveInstrumentUniverse();
  const cutoff    = expectedTradingDate();

  if (!universe.length) {
    return { ok: true, universe: 0, fetched: 0, stored: 0, skipped: 0, failed: 0, cutoff, ms: Date.now() - startedAt };
  }

  const truncated = universe.length > MAX_INSTRUMENTS_PER_RUN;
  const batch = truncated ? universe.slice(0, MAX_INSTRUMENTS_PER_RUN) : universe;
  if (truncated) {
    console.warn(`[pricing] universe ${universe.length} exceeds MAX_INSTRUMENTS_PER_RUN=${MAX_INSTRUMENTS_PER_RUN}; collecting the ${MAX_INSTRUMENTS_PER_RUN} most-referenced instruments this run`);
  }

  const canonical = await upsertInstruments(batch);

  // Skip anything already priced for the latest possible trading day — this
  // is what makes a second run on the same day cost ~zero provider calls.
  const due = force ? canonical : canonical.filter(c => {
    const latest = c.latest_price_date?.toISOString?.().slice(0, 10) ?? (c.latest_price_date ? String(c.latest_price_date) : null);
    return !latest || latest < cutoff;
  });
  const skipped = canonical.length - due.length;

  const settled = await mapWithConcurrency(due, FETCH_CONCURRENCY, collectOne);

  const rows = [];
  const failures = [];
  for (const outcome of settled) {
    if (!outcome) continue;
    const { item, value, error } = outcome;
    if (error || !value || !(value.close > 0)) {
      failures.push({ ticker: item.ticker, exchange: item.exchange, reason: error?.message || 'no usable price' });
      continue;
    }
    rows.push({
      instrumentId: item.id,
      date:      value.date,
      close:     value.close,
      currency:  value.currency || 'INR',
      source:    value.source,
      prevClose: value.prev ? value.prev.close : null,
      prevDate:  value.prev ? value.prev.date  : null,
    });
  }

  await backfillPrevFromDb(rows);
  const stored = await persistSnapshots(rows);

  if (failures.length) {
    console.warn(`[pricing] ${failures.length} instrument(s) had no provider data:`, failures.slice(0, 20));
  }
  return {
    ok: true,
    universe: universe.length,
    collected: due.length,
    stored,
    skipped,
    failed: failures.length,
    failures: failures.slice(0, 20),
    truncated,
    cutoff,
    ms: Date.now() - startedAt,
  };
}

/**
 * Read path: latest stored snapshot per requested ticker.
 *
 * DISTINCT ON (i.id) + ORDER BY p.price_date DESC resolves "the newest row
 * per instrument" with the composite PK's index; no aggregation, no window
 * function, no per-ticker query. Deltas are read straight off the row
 * because collection already computed them.
 *
 * Keyed by ticker on the way IN, but each record echoes its exchange and
 * asset_class so the caller can disambiguate a ticker listed on more than
 * one exchange — the API deliberately does not pick a winner for you.
 */
async function getDailyPrices(tickers) {
  const wanted = [...new Set(tickers.map(normTicker).filter(Boolean))].slice(0, MAX_TICKERS_PER_READ);
  if (!wanted.length) return [];
  const rows = await sql`
    SELECT DISTINCT ON (i.id)
      i.ticker, i.exchange, i.asset_class, i.asset_name,
      p.price_date, p.close_price, p.currency,
      p.prev_close_price, p.prev_price_date,
      p.change_abs, p.change_pct, p.source, p.collected_at
    FROM instruments i
    JOIN instrument_daily_prices p ON p.instrument_id = i.id
    WHERE i.ticker = ANY(${wanted}::text[])
    ORDER BY i.id, p.price_date DESC
  `;
  const asDate = (v) => (v ? (v.toISOString?.().slice(0, 10) ?? String(v)) : null);
  return rows.map(r => ({
    ticker:     r.ticker,
    exchange:   r.exchange,
    assetClass: r.asset_class,
    assetName:  r.asset_name,
    currency:   r.currency || 'INR',
    date:       asDate(r.price_date),
    close:      r.close_price      != null ? Number(r.close_price)      : null,
    prevClose:  r.prev_close_price != null ? Number(r.prev_close_price) : null,
    prevDate:   asDate(r.prev_price_date),
    changeAbs:  r.change_abs != null ? Number(r.change_abs) : null,
    changePct:  r.change_pct != null ? Number(r.change_pct) : null,
    source:     r.source || null,
  }));
}

export default async function handler(req, res) {
  if (!sql) { res.status(500).json({ error: 'Database not configured' }); return; }

  const body   = req.method === 'POST' ? parseBody(req) : {};
  const action = String(req.query?.action || body.action || '');

  try {
    if (action === 'collect') {
      let via;
      try { ({ via } = await authorizeCollect(req)); }
      catch (e) { sendAuthError(res, e); return; }
      const force = String(req.query?.force || body.force || '') === '1';
      const result = await runCollection({ force });
      console.log(`[pricing] collect via=${via}`, JSON.stringify({ ...result, failures: undefined }));
      res.status(200).json(result);
      return;
    }

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
