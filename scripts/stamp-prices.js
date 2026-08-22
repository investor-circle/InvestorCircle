/**
 * scripts/stamp-prices.js — Nightly Price Stamping Batch (ESM)
 *
 * Run by GitHub Actions at 9pm IST every weekday (.github/workflows/price-stamp.yml).
 * Also safe to run manually: node scripts/stamp-prices.js
 *
 * Required env: NEON_DATABASE_URL
 * Optional env: TWELVE_DATA_KEY, STAMP_DATE
 *
 * ── This script is now the SOLE writer of market prices ──────────────────────
 * Phase 9 briefly had a second, parallel pricing job: a Vercel Cron hitting
 * api/_lib/handlers/pricing.js `action=collect`, which built its own
 * instrument universe and fetched the same stocks this script was already
 * fetching a few hours earlier. That collector has been retired (its code is
 * gone, not merely unscheduled, and the `crons` entry is out of vercel.json).
 * Everything it did lives here now, in Task 1, so a given stock is fetched
 * from the provider EXACTLY ONCE per run and the SAME resolved number is
 * written to both destinations:
 *
 *   (a) ic_recommendations.current_price on every active idea referencing it, and
 *   (b) instrument_daily_prices — the one-row-per-instrument-per-trading-day
 *       history that powers My Tracked's "since yesterday" deltas
 *       (read back through api/_lib/handlers/pricing.js `action=daily`,
 *       which is now a READ-ONLY endpoint).
 *
 * Two independent resolutions could disagree; one resolution cannot.
 *
 * ── The four tasks ───────────────────────────────────────────────────────────
 *   Task 0  reco_price   — entry price for ideas published without one (historical date)
 *   Task 1  current_price + instrument_daily_prices — the consolidated live refresh
 *   Task 2  expiry_price — for ideas whose target_date is today
 *   Task 3  exit_price   — backfill for exited ideas missing one (historical date)
 *
 * Tasks 0/2/3 are unchanged in behaviour: they still look a price up for ONE
 * specific historical date, per idea, using that idea's own tagged exchange.
 * Only their fetch plumbing changed (see below).
 *
 * ── Provider chain ───────────────────────────────────────────────────────────
 * Unchanged priority: NSE Bhavcopy (official settlement CSV, NSE-only, and
 * only for the run's own date) -> Yahoo Finance -> Twelve Data.
 *
 * The Yahoo/Twelve Data calls are no longer hand-written here. They are
 * imported from api/_lib/priceProvider.js — the single implementation shared
 * with api/price.js — so there is ONE answer to "how do we ask a provider for
 * a price" instead of two copies that drift. priceProvider.js is plain ESM
 * with no Vercel-request dependency (it reads TWELVE_DATA_KEY from
 * process.env, which GitHub Actions supplies as a step env var), so importing
 * it from a standalone node process is safe.
 *
 * Bhavcopy download/parsing stays local to this script: nothing else uses it.
 */

import pg       from 'pg';
import https    from 'https';
import http     from 'http';
import zlib     from 'zlib';
import { pathToFileURL } from 'url';

import {
  fetchDailySeries,
  fetchPrice,
  mapWithConcurrency,
} from '../api/_lib/priceProvider.js';

const { Client } = pg;

// ── Config ────────────────────────────────────────────────────────────────────
const DB_URL    = process.env.NEON_DATABASE_URL;
const TODAY_ISO = process.env.STAMP_DATE || new Date().toISOString().slice(0, 10);

if (!DB_URL) { console.error('NEON_DATABASE_URL not set'); process.exit(1); }

// Yahoo is unofficial and rate-limits bursts. 6 in flight is the same tested
// middle ground the retired collector used.
const FETCH_CONCURRENCY = 6;

// A 7-day range yields the latest close AND the previous trading day's close
// from ONE request, so Task 1 never needs a second call per instrument just to
// learn the previous close for the history row's precomputed delta.
const SERIES_RANGE = '7d';

/**
 * Asset classes that get a row in `instrument_daily_prices`.
 *
 * NOTE THE SCOPE CAREFULLY — this list restricts (b) ONLY, never (a):
 *   * current_price is refreshed for active ideas in EVERY asset class
 *     (Equity, Bonds, ETF, Mutual Funds, Crypto, Metals, F&P, Others), exactly
 *     as this script has always done. Narrowing that would silently degrade
 *     public track-record / hit-rate / investor-ranking maths in
 *     api/_lib/handlers/public-profile.js and lookups.js, which read
 *     current_price directly.
 *   * the instrument_daily_prices history is Equity/ETF-only, because the
 *     provider chain only knows how to turn a ticker into an NSE/BSE Yahoo
 *     symbol (SYMBOL.NS / SYMBOL.BO). That mapping is meaningless for Crypto
 *     (BTC-USD-style symbols) and poorly covered for Mutual Funds (NAVs),
 *     Bonds, Metals, F&P and Others — and worse than useless when a ticker
 *     string happens to collide with an unrelated NSE listing.
 *
 * Adding a class here later takes TWO changes, not one: teach
 * api/_lib/priceProvider.js that class's symbol convention first.
 */
const IN_SCOPE_ASSET_CLASSES = ['Equity', 'ETF'];
const IN_SCOPE_SET = new Set(IN_SCOPE_ASSET_CLASSES.map(c => c.toLowerCase()));
function isInScope(assetClass) { return IN_SCOPE_SET.has(String(assetClass || '').trim().toLowerCase()); }

// Exchange fallback order for sourcing a price. NSE is deeper/more liquid and
// is this app's default everywhere else, so it is tried first for every
// instrument regardless of which exchange any individual idea was tagged with;
// BSE is only used when NSE genuinely has no data (a BSE-only listing).
// Exchange is informational, not identity — see supabase/phase9_instrument_pricing.sql.
const EXCHANGE_FALLBACK_ORDER = ['NSE', 'BSE'];

function exchangesFor(preferredExchange) {
  const preferred = String(preferredExchange || '').trim().toUpperCase();
  return EXCHANGE_FALLBACK_ORDER.includes(preferred)
    ? [preferred, ...EXCHANGE_FALLBACK_ORDER.filter(e => e !== preferred)]
    : [...EXCHANGE_FALLBACK_ORDER];
}

const asIsoDate = (v) => (v ? (v.toISOString?.().slice(0, 10) ?? String(v)) : null);

// ── Helpers ───────────────────────────────────────────────────────────────────
function isoToNseDate(iso) {
  const d   = new Date(iso);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const mon = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getUTCMonth()];
  return { day, month: mon, year: String(d.getUTCFullYear()) };
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; InvestorCircle-Batch/1.0)',
        'Accept':     '*/*',
        'Referer':    'https://www.nseindia.com/',
      },
      timeout: 20_000,
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end',  () => resolve({ status: res.statusCode, data: Buffer.concat(chunks) }));
    });
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

// ── Provider 1: NSE Bhavcopy (local to this script — nothing else uses it) ────
export async function downloadNseBhavcopy(isoDate) {
  const { day, month, year } = isoToNseDate(isoDate);
  const url = `https://archives.nseindia.com/content/historical/EQUITIES/${year}/${month}/cm${day}${month}${year}bhav.csv.zip`;
  console.log(`[NSE Bhavcopy] Downloading: ${url}`);

  const { status, data } = await fetchUrl(url);
  if (status !== 200) throw new Error(`HTTP ${status}`);

  const csvBuf = await new Promise((resolve, reject) =>
    zlib.unzip(data, (err, buf) => err ? reject(err) : resolve(buf))
  );

  const lines  = csvBuf.toString('utf8').split('\n');
  const header = lines[0].split(',').map(h => h.trim());
  const symIdx    = header.indexOf('SYMBOL');
  const closeIdx  = header.indexOf('CLOSE');
  const seriesIdx = header.indexOf('SERIES');
  if (symIdx < 0 || closeIdx < 0) throw new Error('Unexpected CSV format');

  const priceMap = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (!cols[symIdx]) continue;
    if (cols[seriesIdx]?.trim() !== 'EQ') continue;
    const sym   = cols[symIdx].trim();
    const close = parseFloat(cols[closeIdx]);
    if (sym && !isNaN(close)) priceMap[sym] = close;
  }
  console.log(`[NSE Bhavcopy] Loaded ${Object.keys(priceMap).length} symbols`);
  return priceMap;
}

// ── Price resolver with fallback chain (single date, one idea's exchange) ─────
// Used by Tasks 0/2/3, whose semantics are "the close on THIS specific date".
// Yahoo + Twelve Data now come from the shared provider chain (fetchPrice),
// which tries Yahoo first and Twelve Data second — the same order, and the
// same per-provider semantics, this script implemented inline before.
export async function resolvePrice(symbol, exchange, isoDate, bhavMap) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) return null;
  if (bhavMap && exchange !== 'BSE' && bhavMap[sym]) {
    return { price: +bhavMap[sym].toFixed(2), source: 'nse_bhavcopy' };
  }
  try {
    const p = await fetchPrice(sym, exchange || 'NSE', isoDate || undefined);
    return { price: p.price, source: p.source };
  } catch (e) {
    console.warn(`  [provider] ${sym}${isoDate ? ` @ ${isoDate}` : ''}: ${e.message}`);
    return null;
  }
}

// ── Task 1 support: the active-instrument universe ────────────────────────────
/**
 * Every DISTINCT instrument referenced by at least one currently-active idea.
 *
 * "Active" is this codebase's existing lifecycle rule, unchanged:
 *     NOT exit_signal AND (target_date IS NULL OR target_date >= CURRENT_DATE)
 *
 * Dedup happens in SQL on (UPPER(TRIM(ticker)), asset_class) — NOT exchange —
 * so a stock referenced by 50 ideas across both NSE and BSE tags appears
 * exactly ONCE, and is therefore fetched exactly once.
 *
 * ALL asset classes are returned; the caller splits them, so an out-of-scope
 * class is still refreshed on ic_recommendations and merely skips the history
 * table. Ported from the retired collector's getActiveInstrumentUniverse().
 */
async function getActiveInstrumentUniverse(db) {
  const { rows } = await db.query(`
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
  `);
  return rows;
}

/**
 * Resolve the in-scope universe to canonical `instruments` rows, MINTING rows
 * for symbols the master list doesn't have yet.
 *
 * Missing instruments are the NORMAL path, not an edge case: the master list
 * came from a one-time, known-incomplete CSV, and the new-idea form has a
 * free-text "Not in the list? Enter manually" fallback. Skipping them would
 * mean IPOs, newly-listed names and every hand-typed ticker never got a price
 * history at all.
 *
 * The conflict branch deliberately does NOT degrade curated data: it only
 * fills a name that is currently blank, and never touches source/type/sector/
 * exchange/currency/is_active. Minted rows carry only what the idea knew, are
 * tagged source='auto', and leave type/sector NULL rather than fabricated.
 *
 * Two statements for the whole batch, never one per instrument. Ported from
 * the retired collector's resolveInstruments().
 */
async function resolveInstruments(db, universe) {
  if (!universe.length) return [];
  const symbols     = universe.map(u => u.symbol);
  const assetClasses = universe.map(u => u.asset_class);
  const assetNames  = universe.map(u => u.asset_name || null);

  await db.query(`
    INSERT INTO instruments (symbol, name, asset_class, exchange, currency, source)
    SELECT q.symbol, COALESCE(q.asset_name, q.symbol), q.asset_class, 'NSE', 'INR', 'auto'
    FROM UNNEST($1::text[], $2::text[], $3::text[]) AS q(symbol, asset_class, asset_name)
    ON CONFLICT (symbol, asset_class) DO UPDATE
      SET name       = COALESCE(NULLIF(BTRIM(instruments.name), ''), EXCLUDED.name),
          updated_at = now()
  `, [symbols, assetClasses, assetNames]);

  const { rows } = await db.query(`
    SELECT i.id, i.symbol, i.asset_class, i.exchange
    FROM instruments i
    WHERE (i.symbol, i.asset_class) IN (
      SELECT q.symbol, q.asset_class
      FROM UNNEST($1::text[], $2::text[]) AS q(symbol, asset_class)
    )
  `, [symbols, assetClasses]);
  return rows;
}

/**
 * Resolve ONE instrument's price for the run, with the full provider chain and
 * the NSE->BSE exchange fallback.
 *
 * DELIBERATE, AGREED BEHAVIOUR CHANGE: two ideas that tag the same stock with
 * different exchanges no longer get two independent fetches; the stock is
 * priced once, from its single preferred exchange (NSE unless the master row
 * says otherwise, falling back to BSE only when NSE has no data). Consistent
 * with exchange having stopped being part of instrument identity.
 *
 * Returns null when no exchange/provider combination has usable data — the
 * caller then writes NOTHING for that instrument rather than carrying a stale
 * price forward or inventing one.
 */
async function resolveInstrumentPrice(entry, bhavMap) {
  const exchanges = exchangesFor(entry.exchange);

  // Priority 1: today's official NSE settlement price — but only when NSE is
  // actually this instrument's preferred/first exchange. Bhavcopy is NSE-only
  // data; using it unconditionally would silently override a BSE-preferred
  // instrument's exchange preference whenever the symbol also happens to be
  // NSE-listed, defeating exchangesFor()'s ordering. Mirrors the same guard
  // resolvePrice() (Tasks 0/2/3) already applies via `exchange !== 'BSE'`.
  if (bhavMap && exchanges[0] === 'NSE' && bhavMap[entry.symbol] != null) {
    return {
      date: TODAY_ISO, close: +bhavMap[entry.symbol].toFixed(2), currency: 'INR',
      source: 'nse_bhavcopy', sourceExchange: 'NSE', prev: null,
    };
  }

  let lastErr;

  // Priority 2: Yahoo series form — one request yields the latest close AND
  // the previous trading day's close for the precomputed delta.
  for (const exch of exchanges) {
    try {
      const { series, currency } = await fetchDailySeries(entry.symbol, exch, SERIES_RANGE);
      const latest = series[series.length - 1];
      const prev   = series.length > 1 ? series[series.length - 2] : null;
      return { date: latest.date, close: latest.close, currency: currency || 'INR', source: 'yahoo_finance', sourceExchange: exch, prev };
    } catch (e) { lastErr = e; }
  }

  // Priority 3: the shared single-price chain (which also reaches Twelve
  // Data). Yields a close with no previous close — recorded honestly as a
  // NULL delta, then backfilled from what we already stored if possible.
  for (const exch of exchanges) {
    try {
      const p = await fetchPrice(entry.symbol, exch);
      return { date: p.date, close: p.price, currency: p.currency || 'INR', source: p.source, sourceExchange: exch, prev: null };
    } catch (e) { lastErr = e; }
  }

  if (lastErr) console.warn(`  [provider] ${entry.symbol}: ${lastErr.message}`);
  return null;
}

/**
 * For snapshots whose provider series gave no previous trading day, look the
 * previous close up from what we already stored. ONE batched query for all of
 * them. Ported from the retired collector's backfillPrevFromDb().
 */
async function backfillPrevFromDb(db, rows) {
  const needy = rows.filter(r => r.prevClose == null);
  if (!needy.length) return;
  const { rows: found } = await db.query(`
    SELECT DISTINCT ON (p.instrument_id)
           p.instrument_id, p.price_date, p.close_price
    FROM instrument_daily_prices p
    JOIN UNNEST($1::int[], $2::date[]) AS q(instrument_id, before_date)
      ON q.instrument_id = p.instrument_id
    WHERE p.price_date < q.before_date
    ORDER BY p.instrument_id, p.price_date DESC
  `, [needy.map(r => r.instrumentId), needy.map(r => r.date)]);

  const byId = new Map(found.map(f => [String(f.instrument_id), f]));
  needy.forEach(r => {
    const hit = byId.get(String(r.instrumentId));
    if (!hit) return;
    r.prevClose = Number(hit.close_price);
    r.prevDate  = asIsoDate(hit.price_date);
  });
}

/**
 * Persist daily snapshots. ONE statement for the whole run; the composite PK
 * (instrument_id, price_date) plus ON CONFLICT DO UPDATE makes a repeat run an
 * in-place refresh, never a duplicate row. change_abs/change_pct are computed
 * here so readers never have to. Ported from the retired collector's
 * persistSnapshots().
 */
async function persistSnapshots(db, rows) {
  if (!rows.length) return 0;
  await db.query(`
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
      $1::int[], $2::date[], $3::numeric[], $4::text[],
      $5::numeric[], $6::date[], $7::text[], $8::text[]
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
  `, [
    rows.map(r => r.instrumentId),
    rows.map(r => r.date),
    rows.map(r => r.close),
    rows.map(r => r.currency || 'INR'),
    rows.map(r => r.prevClose),
    rows.map(r => r.prevDate),
    rows.map(r => r.source || null),
    rows.map(r => r.sourceExchange || null),
  ]);
  return rows.length;
}

/**
 * TASK 1 — the consolidated live-price refresh.
 *
 * Structure: dedupe -> fetch ONCE -> apply TWICE.
 *   1. Build the DISTINCT active-instrument universe (all asset classes).
 *   2. For the Equity/ETF subset, resolve/mint canonical `instruments` rows.
 *   3. Fetch each distinct instrument's price EXACTLY ONCE (bounded concurrency).
 *   4. Apply that ONE resolved number to:
 *        (a) current_price on EVERY active idea referencing that
 *            (ticker, asset_class) — every asset class, no exceptions; and
 *        (b) an instrument_daily_prices row — Equity/ETF only.
 *
 * There is no "already collected today, skip the fetch" pre-filter (the
 * retired collector had one): skipping the fetch would also skip the
 * current_price refresh, which must happen on every run.
 */
async function runTask1(db, bhavMap) {
  const allGroups = await getActiveInstrumentUniverse(db);
  console.log(`  Found ${allGroups.length} distinct active instrument(s) across all asset classes`);

  const inScope  = allGroups.filter(g => isInScope(g.asset_class));
  const excluded = allGroups.filter(g => !isInScope(g.asset_class));
  if (excluded.length) {
    const names = [...new Set(excluded.map(g => g.asset_class))].sort();
    console.log(`  ${excluded.length} instrument(s) are outside ${IN_SCOPE_ASSET_CLASSES.join('/')} (${names.join(', ')}) — current_price still refreshed, no price-history row`);
  }

  // Canonical instrument rows (minting missing ones) for the history-table half.
  const canonical = await resolveInstruments(db, inScope);
  const canonicalKey = (sym, cls) => `${sym}||${String(cls).toLowerCase()}`;
  const byKey = new Map(canonical.map(c => [canonicalKey(c.symbol, c.asset_class), c]));

  // One fetch entry per DISTINCT instrument — this is the dedup that makes a
  // stock referenced by many ideas cost exactly one provider call.
  const entries = allGroups.map(g => {
    const hit = byKey.get(canonicalKey(g.symbol, g.asset_class));
    return {
      symbol:       g.symbol,
      assetClass:   g.asset_class,
      ideaCount:    g.active_idea_count,
      instrumentId: hit ? hit.id : null,          // null => out of history scope
      exchange:     hit ? hit.exchange : 'NSE',   // informational preference only
    };
  });

  const settled = await mapWithConcurrency(entries, FETCH_CONCURRENCY, e => resolveInstrumentPrice(e, bhavMap));

  let updatedRecos = 0, pricedInstruments = 0, failedInstruments = 0;
  const snapshots = [];

  for (const outcome of settled) {
    if (!outcome) continue;
    const { item, value, error } = outcome;
    if (error || !value || !(value.close > 0)) {
      failedInstruments++;
      if (error) console.warn(`  Failed ${item.symbol}: ${error.message}`);
      continue;
    }
    pricedInstruments++;

    // (a) current_price — EVERY active idea on this instrument, EVERY asset class.
    const { rowCount } = await db.query(`
      UPDATE ic_recommendations
         SET current_price = $1, updated_at = now()
       WHERE UPPER(TRIM(ticker)) = $2
         AND COALESCE(NULLIF(TRIM(asset_class), ''), 'Equity') = $3
         AND exit_signal = false
         AND (target_date IS NULL OR target_date >= CURRENT_DATE)
    `, [value.close, item.symbol, item.assetClass]);
    updatedRecos += rowCount;

    // (b) price history — Equity/ETF only, same resolved number.
    if (item.instrumentId != null) {
      snapshots.push({
        instrumentId:   item.instrumentId,
        date:           value.date,
        close:          value.close,
        currency:       value.currency || 'INR',
        source:         value.source,
        sourceExchange: value.sourceExchange || null,
        prevClose:      value.prev ? value.prev.close : null,
        prevDate:       value.prev ? value.prev.date  : null,
      });
    }
  }

  await backfillPrevFromDb(db, snapshots);
  const stored = await persistSnapshots(db, snapshots);

  console.log(`  Done: ${pricedInstruments} instrument(s) priced, ${failedInstruments} failed`);
  console.log(`        ${updatedRecos} recommendation current_price value(s) updated`);
  console.log(`        ${stored} instrument_daily_prices row(s) upserted (${IN_SCOPE_ASSET_CLASSES.join('/')} only)`);
  return { instruments: entries.length, priced: pricedInstruments, failed: failedInstruments, updatedRecos, stored };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== InvestorCircle Price Stamp — ${TODAY_ISO} ===\n`);

  const db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  console.log('DB connected');

  let bhavMap = null;
  try { bhavMap = await downloadNseBhavcopy(TODAY_ISO); }
  catch (e) { console.warn(`[NSE Bhavcopy] Failed: ${e.message}. Using Yahoo for all symbols.`); }

  // Task 0: stamp reco_price for recommendations published without a price
  console.log('\n[Task 0] Stamping reco_price for new recommendations missing entry price…');
  const { rows: unpriced } = await db.query(`
    SELECT id, ticker, exchange, created_at::date AS reco_date
    FROM ic_recommendations
    WHERE reco_price IS NULL OR reco_price = 0
  `);
  console.log(`  Found ${unpriced.length} recommendations without entry price`);
  // Fetches run with the same bounded concurrency Task 1 uses (FETCH_CONCURRENCY)
  // rather than one-at-a-time — a backlog of unpriced recs (e.g. after an
  // outage) could otherwise run each provider round-trip sequentially and risk
  // exceeding the job's 15-minute GitHub Actions timeout before later tasks
  // (including Task 1) even start. Writes stay sequential, same as Task 1.
  const rpSettled = await mapWithConcurrency(unpriced, FETCH_CONCURRENCY, rec => {
    const isoDate = asIsoDate(rec.reco_date);
    const dateBhav = (isoDate === TODAY_ISO) ? bhavMap : null; // bhavcopy for today's recs, Yahoo for historical
    return resolvePrice(rec.ticker, rec.exchange || 'NSE', isoDate, dateBhav);
  });
  let rpStamped = 0;
  for (const { item: rec, value: result, error } of rpSettled) {
    if (error) { console.warn(`  Failed ${rec.ticker}: ${error.message}`); continue; }
    if (!result) { console.warn(`  No price found for ${rec.ticker} on ${asIsoDate(rec.reco_date)}`); continue; }
    try {
      await db.query(
        `UPDATE ic_recommendations
         SET reco_price = $1, price_source = $2, price_stamped_at = now(), updated_at = now()
         WHERE id = $3`,
        [result.price, result.source, rec.id]
      );
      rpStamped++;
      console.log(`  Stamped ${rec.ticker}: ₹${result.price} (${result.source})`);
    } catch (e) { console.warn(`  Failed ${rec.ticker}: ${e.message}`); }
  }
  console.log(`  Done: ${rpStamped} entry prices stamped`);

  // Task 1: current_price for active recommendations + instrument price history
  console.log('\n[Task 1] Refreshing current_price for active recommendations and collecting instrument price history…');
  const task1 = await runTask1(db, bhavMap);

  // Task 2: expiry_price for recommendations expiring today
  console.log('\n[Task 2] Stamping expiry_price for recommendations expiring today…');
  const { rows: expiring } = await db.query(`
    SELECT id, ticker, exchange, target_date FROM ic_recommendations
    WHERE NOT exit_signal AND target_date = CURRENT_DATE AND expiry_price IS NULL
  `);
  console.log(`  Found ${expiring.length} expiring today`);
  const expSettled = await mapWithConcurrency(expiring, FETCH_CONCURRENCY,
    rec => resolvePrice(rec.ticker, rec.exchange || 'NSE', asIsoDate(rec.target_date), bhavMap));
  let expStamped = 0;
  for (const { item: rec, value: result, error } of expSettled) {
    if (error) { console.warn(`  Failed expiry ${rec.ticker}: ${error.message}`); continue; }
    if (!result) continue;
    try {
      await db.query(
        'UPDATE ic_recommendations SET expiry_price=$1, expiry_price_source=$2, expiry_price_stamped_at=now(), updated_at=now() WHERE id=$3',
        [result.price, result.source, rec.id]
      );
      expStamped++;
    } catch (e) { console.warn(`  Failed expiry ${rec.ticker}: ${e.message}`); }
  }
  console.log(`  Done: ${expStamped} expiry prices stamped`);

  // Task 3: backfill exit_price for exited recommendations missing it
  console.log('\n[Task 3] Backfilling missing exit prices…');
  const { rows: exitsMissing } = await db.query(`
    SELECT id, ticker, exchange, exit_date FROM ic_recommendations
    WHERE exit_signal = true AND exit_price IS NULL AND exit_date IS NOT NULL
  `);
  console.log(`  Found ${exitsMissing.length} needing exit price`);
  const exitSettled = await mapWithConcurrency(exitsMissing, FETCH_CONCURRENCY,
    rec => resolvePrice(rec.ticker, rec.exchange || 'NSE', asIsoDate(rec.exit_date), null));
  let exitStamped = 0;
  for (const { item: rec, value: result, error } of exitSettled) {
    if (error) { console.warn(`  Failed exit stamp ${rec.ticker}: ${error.message}`); continue; }
    if (!result) continue;
    try {
      await db.query(
        'UPDATE ic_recommendations SET exit_price=$1, exit_price_source=$2, exit_price_stamped_at=now(), updated_at=now() WHERE id=$3',
        [result.price, result.source, rec.id]
      );
      exitStamped++;
    } catch (e) { console.warn(`  Failed exit stamp ${rec.ticker}: ${e.message}`); }
  }
  console.log(`  Done: ${exitStamped} exit prices backfilled`);

  await db.end();
  console.log(`\n=== Batch complete ===`);
  console.log(`  Entry prices stamped     : ${rpStamped}`);
  console.log(`  Instruments priced       : ${task1.priced} / ${task1.instruments} (${task1.failed} failed)`);
  console.log(`  Active current_price set : ${task1.updatedRecos}`);
  console.log(`  Price-history rows       : ${task1.stored}`);
  console.log(`  Expiry stamped           : ${expStamped}`);
  console.log(`  Exit backfilled          : ${exitStamped}`);
}

// Exported for local/offline validation harnesses; the CLI entry point below
// is what GitHub Actions runs.
export { runTask1, getActiveInstrumentUniverse, resolveInstruments, resolveInstrumentPrice, backfillPrevFromDb, persistSnapshots, isInScope, exchangesFor };

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch(e => { console.error('Batch failed:', e); process.exit(1); });
}
