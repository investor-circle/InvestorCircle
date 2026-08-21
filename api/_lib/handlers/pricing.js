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
 * The canonical security identity is the PRE-EXISTING, live `instruments`
 * table — the same one that powers the new-idea form's "Search instrument"
 * autocomplete (lookups.js `instruments-list`) and the admin instrument
 * browser/importer (admin-config.js). Pricing does NOT stand up a table of
 * its own; an earlier revision of this work did, which would have silently
 * collided with the live table.
 *
 * Identity is (symbol, asset_class), normalised to UPPER(TRIM(symbol)),
 * enforced by the UNIQUE index the Phase 9 migration installs in place of
 * the old (symbol, exchange) key. Exchange is deliberately NOT part of
 * identity — this isn't a broking app, and NSE- and BSE-tagged ideas on the
 * same ticker are the same instrument everywhere else in this codebase, so
 * pricing follows suit. `instruments.exchange` survives as the preferred
 * source exchange (informational), used only to decide which provider
 * symbol to fetch. See supabase/phase9_instrument_pricing.sql for the full
 * rationale and the duplicate-merge rule.
 *
 * ── Asset-class scoping (deliberately narrow for v1) ─────────────────────
 * The provider chain in api/_lib/priceProvider.js only knows how to turn a
 * ticker into an NSE/BSE Yahoo symbol (SYMBOL.NS / SYMBOL.BO). That mapping
 * is meaningless for Crypto (a different symbol convention entirely, e.g.
 * BTC-USD), and poorly covered for Mutual Funds (NAVs), Bonds, Metals, F&P
 * and Others. Attempting them wouldn't merely fail — it could SILENTLY
 * match an unrelated NSE-listed company that happens to share the ticker
 * string, and store a confidently wrong price. So only the classes the
 * provider can genuinely price are collected; see IN_SCOPE_ASSET_CLASSES.
 *
 * ── Missing instruments are the NORMAL path, not an edge case ────────────
 * The master list came from a one-time, known-incomplete free CSV, not a
 * live exchange feed, and the new-idea form has a free-text "Not in the
 * list? Enter manually" fallback precisely for that. So an active idea's
 * ticker frequently has no matching master row. The collector MINTS one
 * (tagged source='auto') rather than skipping the idea — skipping would
 * mean IPOs, newly-listed names and every manually-typed ticker never got
 * priced at all, which is exactly the population the manual path exists to
 * serve.
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
 * The asset classes this collector will attempt to price.
 *
 * Compared case-insensitively against ic_recommendations.asset_class, whose
 * vocabulary is src/constants/app.js's DEFAULT_CLASSES:
 *   Equity, Bonds, ETF, Mutual Funds, Crypto, Metals, F&P, Others
 * Everything not listed here is EXCLUDED from the universe and reported as
 * `excludedAssetClasses` in the run result, so the gap is visible rather
 * than showing up as a pile of provider failures.
 *
 * ADDING A CLASS LATER TAKES TWO CHANGES, NOT ONE:
 *   1. teach api/_lib/priceProvider.js how to build that class's provider
 *      symbol (Crypto needs BTC-USD-style symbols; Mutual Funds need a NAV
 *      source entirely outside the current Yahoo/Twelve Data chain), AND
 *   2. add it here.
 * Doing only (2) reintroduces exactly the silent-wrong-price risk this list
 * exists to prevent. This is a deliberate v1 scope, not a permanent limit.
 */
const IN_SCOPE_ASSET_CLASSES = ['Equity', 'ETF'];
const IN_SCOPE_SET = new Set(IN_SCOPE_ASSET_CLASSES.map(c => c.toLowerCase()));
function isInScope(assetClass) { return IN_SCOPE_SET.has(String(assetClass || '').trim().toLowerCase()); }

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
 * Dedup happens in SQL (GROUP BY on ticker + asset_class — NOT exchange, see
 * this file's header note), so an instrument referenced by 50 ideas across
 * both NSE and BSE, or tracked by 500 users, appears exactly ONCE in the
 * returned list. The universe is recomputed from scratch every run, which is
 * what makes it self-maintaining: a newly-posted idea adds its instrument on
 * the next run, and an instrument whose last active idea exits or expires
 * simply stops being returned — its history stays, no cleanup job needed.
 *
 * ALL asset classes are returned here, in-scope or not, in ONE query; the
 * caller splits them (see IN_SCOPE_ASSET_CLASSES) so the out-of-scope count
 * can be reported honestly instead of a second round-trip or a silent
 * WHERE-clause omission.
 */
async function getActiveInstrumentUniverse() {
  return sql`
    SELECT
      UPPER(TRIM(ticker))                                AS symbol,
      COALESCE(NULLIF(TRIM(asset_class), ''), 'Equity')  AS asset_class,
      MIN(NULLIF(TRIM(asset_name), ''))                  AS asset_name,
      COUNT(*)::int                                      AS active_idea_count
    FROM ic_recommendations
    WHERE ticker IS NOT NULL
      AND TRIM(ticker) <> ''
      AND exit_signal = false
      AND (target_date IS NULL OR target_date >= CURRENT_DATE)
    GROUP BY 1, 2
    ORDER BY active_idea_count DESC, symbol ASC
  `;
}

/**
 * Resolve the universe to canonical `instruments` rows, minting rows for
 * symbols the master list doesn't have yet.
 *
 * Two statements for the WHOLE batch, never one per instrument:
 *
 *   1. INSERT ... ON CONFLICT (symbol, asset_class) DO UPDATE. The conflict
 *      branch deliberately does NOT overwrite curated data: it only fills a
 *      name that is currently blank, and it never touches `source`, `type`,
 *      `sector`, `exchange`, `currency` or `is_active`. An admin-curated row
 *      is therefore safe from being degraded by whatever free text a user
 *      happened to type into an idea. Newly-minted rows carry only what the
 *      triggering idea actually knew — symbol, name (falling back to the
 *      symbol itself), asset_class, exchange defaulted 'NSE', currency
 *      defaulted 'INR' — with `type` and `sector` left NULL rather than
 *      fabricated, and source='auto' so they stay distinguishable from
 *      curated rows forever (and are reconcilable by the eventual automated
 *      exchange-feed sync).
 *
 *      `is_active` is left at the column default (true) for minted rows, so
 *      a ticker a user had to type by hand becomes available in the
 *      instrument autocomplete for the next person — which is the whole
 *      point of the manual-entry fallback existing.
 *
 *   2. SELECT the canonical rows back with their ids and newest stored
 *      price date. Matching is by (symbol, asset_class) and ignores
 *      is_active on purpose: an admin deactivating an instrument means
 *      "stop offering it in pick-lists", not "stop pricing the live ideas
 *      that still reference it".
 */
async function resolveInstruments(universe) {
  await sql`
    INSERT INTO instruments (symbol, name, asset_class, exchange, currency, source)
    SELECT q.symbol, COALESCE(q.asset_name, q.symbol), q.asset_class, 'NSE', 'INR', 'auto'
    FROM UNNEST(
      ${universe.map(u => u.symbol)}::text[],
      ${universe.map(u => u.asset_class)}::text[],
      ${universe.map(u => u.asset_name || null)}::text[]
    ) AS q(symbol, asset_class, asset_name)
    ON CONFLICT (symbol, asset_class) DO UPDATE
      SET name       = COALESCE(NULLIF(BTRIM(instruments.name), ''), EXCLUDED.name),
          updated_at = now()
  `;
  return sql`
    SELECT i.id, i.symbol, i.asset_class, i.exchange,
           (SELECT MAX(p.price_date) FROM instrument_daily_prices p WHERE p.instrument_id = i.id) AS latest_price_date
    FROM instruments i
    WHERE (i.symbol, i.asset_class) IN (
      SELECT q.symbol, q.asset_class
      FROM UNNEST(
        ${universe.map(u => u.symbol)}::text[],
        ${universe.map(u => u.asset_class)}::text[]
      ) AS q(symbol, asset_class)
    )
  `;
}

// Exchange fallback order for sourcing a price: NSE is deeper/more liquid
// and is this app's default everywhere else, so it's tried first for every
// instrument regardless of which exchange any individual idea was tagged
// with. BSE is only used when NSE genuinely has no data for that ticker
// (e.g. a BSE-only listing). See this file's header note for why exchange
// is not part of instrument identity in the first place.
const EXCHANGE_FALLBACK_ORDER = ['NSE', 'BSE'];

/**
 * Exchanges to try for one instrument, most-preferred first: the
 * instrument's own `exchange` (informational — where the master list says
 * it trades, defaulted to NSE for auto-minted rows) followed by the rest of
 * the standard order. A BSE-only listing is therefore hit on the first
 * attempt instead of after a wasted NSE miss, while everything else still
 * behaves as NSE-first.
 */
function exchangesFor(instr) {
  const preferred = String(instr.exchange || '').trim().toUpperCase();
  const ordered = EXCHANGE_FALLBACK_ORDER.includes(preferred)
    ? [preferred, ...EXCHANGE_FALLBACK_ORDER.filter(e => e !== preferred)]
    : [...EXCHANGE_FALLBACK_ORDER];
  return ordered;
}

/**
 * Fetch one instrument's recent daily closes and derive today's snapshot
 * plus the precomputed previous-trading-day delta.
 *
 * Tries NSE then BSE, series form then single-price form (which also
 * reaches Twelve Data) — four attempts at most, stopping at the first
 * success. Returns null when NO exchange/provider combination has usable
 * data — the caller stores NOTHING for that instrument rather than
 * carrying a stale price forward or inventing one.
 */
async function collectOne(instr) {
  let lastErr;
  const exchanges = exchangesFor(instr);
  for (const exch of exchanges) {
    try {
      const { series } = await fetchDailySeries(instr.symbol, exch, SERIES_RANGE);
      const latest = series[series.length - 1];
      const prev   = series.length > 1 ? series[series.length - 2] : null;
      return { date: latest.date, close: latest.close, currency: 'INR', source: 'yahoo_finance', sourceExchange: exch, prev };
    } catch (seriesErr) {
      lastErr = seriesErr;
    }
  }
  // Series form failed on every exchange. Fall back to the shared provider
  // chain's single-price form (also reaches Twelve Data). That yields a
  // close with no previous close — recorded honestly as a NULL delta.
  for (const exch of exchanges) {
    try {
      const p = await fetchPrice(instr.symbol, exch);
      return { date: p.date, close: p.price, currency: p.currency, source: p.source, sourceExchange: exch, prev: null };
    } catch (priceErr) {
      lastErr = priceErr;
    }
  }
  throw lastErr;
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
       prev_close_price, prev_price_date, change_abs, change_pct, source, source_exchange, collected_at)
    SELECT
      q.instrument_id, q.price_date, q.close_price, q.currency,
      q.prev_close_price, q.prev_price_date,
      CASE WHEN q.prev_close_price IS NOT NULL
           THEN q.close_price - q.prev_close_price END,
      CASE WHEN q.prev_close_price IS NOT NULL AND q.prev_close_price <> 0
           THEN (q.close_price - q.prev_close_price) / q.prev_close_price * 100 END,
      q.source, q.source_exchange, now()
    FROM UNNEST(
      ${rows.map(r => r.instrumentId)}::uuid[],
      ${rows.map(r => r.date)}::date[],
      ${rows.map(r => r.close)}::numeric[],
      ${rows.map(r => r.currency || 'INR')}::text[],
      ${rows.map(r => r.prevClose)}::numeric[],
      ${rows.map(r => r.prevDate)}::date[],
      ${rows.map(r => r.source || null)}::text[],
      ${rows.map(r => r.sourceExchange || null)}::text[]
    ) AS q(instrument_id, price_date, close_price, currency, prev_close_price, prev_price_date, source, source_exchange)
    ON CONFLICT (instrument_id, price_date) DO UPDATE
      SET close_price      = EXCLUDED.close_price,
          currency         = EXCLUDED.currency,
          prev_close_price = COALESCE(EXCLUDED.prev_close_price, instrument_daily_prices.prev_close_price),
          prev_price_date  = COALESCE(EXCLUDED.prev_price_date,  instrument_daily_prices.prev_price_date),
          change_abs       = COALESCE(EXCLUDED.change_abs,       instrument_daily_prices.change_abs),
          change_pct       = COALESCE(EXCLUDED.change_pct,       instrument_daily_prices.change_pct),
          source           = EXCLUDED.source,
          source_exchange  = EXCLUDED.source_exchange,
          collected_at     = now()
  `;
  return rows.length;
}

/** The full collection run. */
async function runCollection({ force = false } = {}) {
  const startedAt = Date.now();
  const allGroups = await getActiveInstrumentUniverse();
  const cutoff    = expectedTradingDate();

  // Split by asset class BEFORE anything else, so an out-of-scope class is
  // never handed to the NSE/BSE provider chain at all. Reported as a count
  // (plus the distinct class names) rather than dropped quietly.
  const universe = allGroups.filter(g => isInScope(g.asset_class));
  const excluded = allGroups.filter(g => !isInScope(g.asset_class));
  const excludedAssetClasses = excluded.length;
  const excludedClassNames = [...new Set(excluded.map(g => g.asset_class))].sort();
  if (excluded.length) {
    console.log(`[pricing] excluded ${excluded.length} instrument(s) in unsupported asset classes: ${excludedClassNames.join(', ')} (in scope: ${IN_SCOPE_ASSET_CLASSES.join(', ')})`);
  }

  if (!universe.length) {
    return {
      ok: true, universe: 0, collected: 0, stored: 0, skipped: 0, failed: 0,
      excludedAssetClasses, excludedClassNames, inScopeAssetClasses: IN_SCOPE_ASSET_CLASSES,
      cutoff, ms: Date.now() - startedAt,
    };
  }

  const truncated = universe.length > MAX_INSTRUMENTS_PER_RUN;
  const batch = truncated ? universe.slice(0, MAX_INSTRUMENTS_PER_RUN) : universe;
  if (truncated) {
    console.warn(`[pricing] universe ${universe.length} exceeds MAX_INSTRUMENTS_PER_RUN=${MAX_INSTRUMENTS_PER_RUN}; collecting the ${MAX_INSTRUMENTS_PER_RUN} most-referenced instruments this run`);
  }

  const canonical = await resolveInstruments(batch);

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
      failures.push({ ticker: item.symbol, assetClass: item.asset_class, reason: error?.message || 'no usable price' });
      continue;
    }
    rows.push({
      instrumentId:   item.id,
      date:           value.date,
      close:          value.close,
      currency:       value.currency || 'INR',
      source:         value.source,
      sourceExchange: value.sourceExchange || null,
      prevClose:      value.prev ? value.prev.close : null,
      prevDate:       value.prev ? value.prev.date  : null,
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
    excludedAssetClasses,
    excludedClassNames,
    inScopeAssetClasses: IN_SCOPE_ASSET_CLASSES,
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
