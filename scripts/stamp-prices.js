data in one download)
 *   → Yahoo Finance (per-symbol fallback for any misses or BSE symbols)
 *   → Twelve Data  (if TWELVE_DATA_KEY is set)
 *
 * Required env vars:
 *   NEON_DATABASE_URL   — Neon direct connection string (from dashboard)
 *
 * Optional env vars:
 *   TWELVE_DATA_KEY     — Twelve Data API key for paid fallback
 *   STAMP_DATE          — Override today's date e.g. "2025-01-15" (for backfill)
 */

'use strict';

const { Client }  = require('pg');
const https       = require('https');
const http        = require('http');
const zlib        = require('zlib');
const { Writable } = require('stream');

// ── Config ────────────────────────────────────────────────────────────────────
const DB_URL     = process.env.NEON_DATABASE_URL;
const TD_KEY     = process.env.TWELVE_DATA_KEY;
const TODAY_ISO  = process.env.STAMP_DATE || new Date().toISOString().slice(0, 10);
const TODAY      = new Date(TODAY_ISO);

if (!DB_URL) { console.error('NEON_DATABASE_URL not set'); process.exit(1); }

// ── Helpers ───────────────────────────────────────────────────────────────────
function isoToNseDate(iso) {
  // "2025-01-15" → { day:"15", month:"JAN", year:"2025" }
  const d   = new Date(iso);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const mon = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getUTCMonth()];
  const yr  = String(d.getUTCFullYear());
  return { day, month: mon, year: yr };
}

function fetchUrl(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent':  'Mozilla/5.0 (compatible; InvestorCircle-Batch/1.0)',
        'Accept':      '*/*',
        'Referer':     'https://www.nseindia.com/',
        ...(opts.headers || {}),
      },
      timeout: 20_000,
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end',  () => resolve({ status: res.statusCode, data: Buffer.concat(chunks), headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

// ── Provider 1: NSE Bhavcopy ──────────────────────────────────────────────────
async function downloadNseBhavcopy(isoDate) {
  const { day, month, year } = isoToNseDate(isoDate);
  const url = `https://archives.nseindia.com/content/historical/EQUITIES/${year}/${month}/cm${day}${month}${year}bhav.csv.zip`;
  console.log(`[NSE Bhavcopy] Downloading: ${url}`);

  const { status, data } = await fetchUrl(url);
  if (status !== 200) throw new Error(`NSE Bhavcopy HTTP ${status}`);

  // Unzip in memory
  const csvBuf = await new Promise((resolve, reject) => {
    zlib.unzip(data, (err, buf) => {
      if (err) reject(new Error(`Unzip failed: ${err.message}`));
      else resolve(buf);
    });
  });

  // Parse CSV → symbol→close map
  const lines  = csvBuf.toString('utf8').split('\n');
  const header = lines[0].split(',').map(h => h.trim());
  const symIdx    = header.indexOf('SYMBOL');
  const closeIdx  = header.indexOf('CLOSE');
  const seriesIdx = header.indexOf('SERIES');

  if (symIdx < 0 || closeIdx < 0) throw new Error('NSE CSV: unexpected format');

  const priceMap = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (!cols[symIdx]) continue;
    const series = cols[seriesIdx]?.trim();
    if (series !== 'EQ') continue; // equity only, skip F&O
    const sym   = cols[symIdx].trim();
    const close = parseFloat(cols[closeIdx]);
    if (sym && !isNaN(close)) priceMap[sym] = close;
  }

  console.log(`[NSE Bhavcopy] Loaded ${Object.keys(priceMap).length} symbols`);
  return priceMap;
}

// ── Provider 2: Yahoo Finance (per-symbol fallback) ───────────────────────────
async function fetchYahooPrice(symbol, exchange, isoDate) {
  const suffix   = exchange === 'BSE' ? '.BO' : '.NS';
  const yahooSym = `${symbol}${suffix}`;

  let apiUrl;
  if (isoDate) {
    const d       = new Date(isoDate);
    const period1 = Math.floor(d.getTime() / 1000);
    const period2 = Math.floor((d.getTime() + 86400_000) / 1000);
    apiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=1d&period1=${period1}&period2=${period2}`;
  } else {
    apiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=1d&range=5d`;
  }

  const { status, data } = await fetchUrl(apiUrl);
  if (status !== 200) throw new Error(`Yahoo HTTP ${status}`);

  const json   = JSON.parse(data.toString());
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('Yahoo: no result');

  const closes     = result.indicators?.quote?.[0]?.close || [];
  const timestamps = result.timestamp || [];

  if (isoDate) {
    const target  = new Date(isoDate);
    let bestIdx = -1, bestDiff = Infinity;
    timestamps.forEach((ts, i) => {
      if (closes[i] == null) return;
      const diff = Math.abs(ts * 1000 - target.getTime());
      if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
    });
    if (bestIdx === -1 || closes[bestIdx] == null) throw new Error('Yahoo: no close for date');
    return { price: +closes[bestIdx].toFixed(2), source: 'yahoo_finance' };
  } else {
    let idx = closes.length - 1;
    while (idx >= 0 && closes[idx] == null) idx--;
    if (idx < 0) throw new Error('Yahoo: no valid close');
    return { price: +closes[idx].toFixed(2), source: 'yahoo_finance' };
  }
}

// ── Provider 3: Twelve Data (if key is set) ───────────────────────────────────
async function fetchTwelveDataPrice(symbol, exchange, isoDate) {
  if (!TD_KEY) throw new Error('Twelve Data: no API key configured');
  const tdSym = `${symbol}:${exchange}`;
  const url   = `https://api.twelvedata.com/time_series?symbol=${tdSym}&interval=1day&start_date=${isoDate}&end_date=${isoDate}&apikey=${TD_KEY}`;
  const { status, data } = await fetchUrl(url);
  if (status !== 200) throw new Error(`TwelveData HTTP ${status}`);
  const json = JSON.parse(data.toString());
  if (json.status === 'error') throw new Error(`TwelveData: ${json.message}`);
  const values = json.values;
  if (!values?.length) throw new Error('TwelveData: no data');
  return { price: +parseFloat(values[0].close).toFixed(2), source: 'twelve_data' };
}

// ── Price resolver with fallback chain ────────────────────────────────────────
async function resolvePrice(symbol, exchange, isoDate, bhavMap) {
  // 1. NSE Bhavcopy (batch only, already downloaded)
  if (bhavMap && exchange !== 'BSE' && bhavMap[symbol]) {
    return { price: +bhavMap[symbol].toFixed(2), source: 'nse_bhavcopy' };
  }

  // 2. Yahoo Finance
  try { return await fetchYahooPrice(symbol, exchange, isoDate); }
  catch (e) { console.warn(`  [Yahoo] ${symbol}: ${e.message}`); }

  // 3. Twelve Data
  try { return await fetchTwelveDataPrice(symbol, exchange, isoDate); }
  catch (e) { console.warn(`  [TwelveData] ${symbol}: ${e.message}`); }

  return null; // all providers failed
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== InvestorCircle Price Stamp — ${TODAY_ISO} ===\n`);

  const db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  console.log('DB connected');

  let bhavMap = null;
  try {
    bhavMap = await downloadNseBhavcopy(TODAY_ISO);
  } catch (e) {
    console.warn(`[NSE Bhavcopy] Download failed (${e.message}). Will use Yahoo for all symbols.`);
  }

  let stamped = 0, failed = 0;

  // ── Task 1: Update current_price for all active recommendations ───────────
  console.log('\n[Task 1] Updating current_price for active recommendations…');
  const { rows: active } = await db.query(`
    SELECT id, ticker, exchange
    FROM ic_recommendations
    WHERE NOT exit_signal
      AND (target_date IS NULL OR target_date >= CURRENT_DATE)
  `);
  console.log(`  Found ${active.length} active recommendations`);

  for (const rec of active) {
    try {
      const result = await resolvePrice(rec.ticker, rec.exchange || 'NSE', null, bhavMap);
      if (!result) { failed++; continue; }
      await db.query(
        `UPDATE ic_recommendations
         SET current_price = $1, updated_at = now()
         WHERE id = $2`,
        [result.price, rec.id]
      );
      stamped++;
    } catch (e) {
      console.warn(`  Failed ${rec.ticker}: ${e.message}`);
      failed++;
    }
  }
  console.log(`  Done: ${stamped} updated, ${failed} failed`);

  // ── Task 2: Stamp expiry_price for recommendations that expire today ───────
  console.log('\n[Task 2] Stamping expiry_price for recommendations expiring today…');
  const { rows: expiring } = await db.query(`
    SELECT id, ticker, exchange, target_date
    FROM ic_recommendations
    WHERE NOT exit_signal
      AND target_date IS NOT NULL
      AND target_date = CURRENT_DATE
      AND expiry_price IS NULL
  `);
  console.log(`  Found ${expiring.length} expiring today`);

  let expStamped = 0;
  for (const rec of expiring) {
    try {
      const isoDate = rec.target_date.toISOString().slice(0, 10);
      const result  = await resolvePrice(rec.ticker, rec.exchange || 'NSE', isoDate, bhavMap);
      if (!result) { failed++; continue; }
      await db.query(
        `UPDATE ic_recommendations
         SET expiry_price = $1,
             expiry_price_source = $2,
             expiry_price_stamped_at = now(),
             updated_at = now()
         WHERE id = $3`,
        [result.price, result.source, rec.id]
      );
      expStamped++;
    } catch (e) {
      console.warn(`  Failed expiry stamp ${rec.ticker}: ${e.message}`);
    }
  }
  console.log(`  Done: ${expStamped} expiry prices stamped`);

  // ── Task 3: Stamp exit_price for exited recs missing it ──────────────────
  console.log('\n[Task 3] Backfilling exit_price for exited recommendations without price…');
  const { rows: exitsMissing } = await db.query(`
    SELECT id, ticker, exchange, exit_date
    FROM ic_recommendations
    WHERE exit_signal = true
      AND exit_price IS NULL
      AND exit_date IS NOT NULL
  `);
  console.log(`  Found ${exitsMissing.length} needing exit price`);

  let exitStamped = 0;
  for (const rec of exitsMissing) {
    try {
      const isoDate = rec.exit_date.toISOString().slice(0, 10);
      // Use a fresh bhavcopy for that date if different from today
      let dateBhav = (isoDate === TODAY_ISO) ? bhavMap : null;
      if (!dateBhav && isoDate !== TODAY_ISO) {
        try { dateBhav = await downloadNseBhavcopy(isoDate); }
        catch (_) {}
      }
      const result = await resolvePrice(rec.ticker, rec.exchange || 'NSE', isoDate, dateBhav);
      if (!result) continue;
      await db.query(
        `UPDATE ic_recommendations
         SET exit_price = $1,
             exit_price_source = $2,
             exit_price_stamped_at = now(),
             updated_at = now()
         WHERE id = $3`,
        [result.price, result.source, rec.id]
      );
      exitStamped++;
    } catch (e) {
      console.warn(`  Failed exit stamp ${rec.ticker}: ${e.message}`);
    }
  }
  console.log(`  Done: ${exitStamped} exit prices backfilled`);

  await db.end();
  console.log(`\n=== Batch complete — ${TODAY_ISO} ===`);
  console.log(`  Active updated: ${stamped}`);
  console.log(`  Expiry stamped: ${expStamped}`);
  console.log(`  Exit backfilled: ${exitStamped}`);
}

main().catch(e => { console.error('Batch failed:', e); process.exit(1); });
