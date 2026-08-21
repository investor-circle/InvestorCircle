-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 9 — Instrument-level daily pricing history
--
-- ── READ THIS FIRST: `instruments` ALREADY EXISTS IN PRODUCTION ────────────
-- An earlier revision of this file did `CREATE TABLE IF NOT EXISTS
-- instruments (...)` with a fresh column set (ticker/asset_name/
-- price_exchange). That was WRONG and is fully superseded by this file.
-- `instruments` is a LIVE table that no checked-in SQL file ever documented
-- (CLAUDE.md's warning that supabase/*.sql can be stale is exactly this
-- case). Because of the IF NOT EXISTS, the old script would have silently
-- no-opped against the live table and every collector/read query would then
-- have failed on columns that do not exist.
--
-- The live table is:
--     instruments(id, symbol, name, exchange, type, asset_class,
--                 currency, sector, is_active)
-- with a UNIQUE key on (symbol, exchange), and it already powers two
-- shipped features:
--   * api/_lib/handlers/lookups.js `instruments-list` -> the "Search
--     instrument" autocomplete on the new-idea form.
--   * api/_lib/handlers/admin-config.js scope=instruments /
--     instrument-upsert / instrument-deactivate -> the admin instrument
--     browser, bulk CSV importer and manual add form.
--
-- So pricing REUSES that table as the canonical security identity rather
-- than standing up a second, competing one.
--
-- ── What this migration does ──────────────────────────────────────────────
--   1. Adds the columns pricing needs (`source`, `created_at`,
--      `updated_at`) and relaxes NOT NULLs that block minimal auto-created
--      rows.
--   2. Normalises `symbol` to UPPER(TRIM(...)) and backfills empty
--      `asset_class` to 'Equity' (a NULL asset_class cannot participate in
--      the new UNIQUE key — NULLs never conflict in Postgres).
--   3. MERGES duplicate (symbol, asset_class) rows — in practice the NSE
--      and BSE listings of one company — down to a single canonical row.
--   4. Swaps the UNIQUE key from (symbol, exchange) to
--      (symbol, asset_class), so `exchange` becomes purely informational.
--   5. Creates `instrument_daily_prices`.
--
-- ── Why exchange stops being part of identity ─────────────────────────────
-- No feature anywhere in this app treats an NSE listing and a BSE listing
-- of the same company as different things. Security Intelligence's
-- ticker-consensus query (lookups.js `ticker-recos`) filters on
-- `r.ticker = ...` with NO exchange predicate; tracking dedup, "reinforced
-- by your Circle" and the portfolio all key on ticker alone. Pricing would
-- have been the ONE place splitting a stock into two identities, which
-- means two near-duplicate price series per dual-listed ticker and every
-- reader having to pick a winner between them. One row, one price, one
-- number every feature reads the same way.
--
-- `exchange` is retained as an informational field: it is which exchange
-- the collector PREFERS to source from, and
-- `instrument_daily_prices.source_exchange` records which one a given
-- day's close actually came from. Neither affects whether two rows are the
-- same instrument.
--
-- ── Safety ────────────────────────────────────────────────────────────────
-- Runs in ONE transaction and is IDEMPOTENT — re-running finds no
-- duplicates, no missing columns and the constraint already swapped, and
-- changes nothing. It never drops a column and never deletes a row whose
-- information has not first been folded into the surviving row.
--
-- ic_recommendations is NOT TOUCHED by this migration. It stores free-text
-- `ticker`/`exchange`/`asset_class` and has no FK to `instruments`; that
-- stays true. (Verified at authoring time: nothing in api/ or supabase/
-- references instruments(id) except instrument_daily_prices, created
-- below — which is what makes the row merge in step 3 low-risk.)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Columns pricing needs ───────────────────────────────────────────────

-- Provenance of the row. 'admin' = curated by a human through the admin
-- importer/add-form (and every row that existed before this migration, since
-- that is the only way rows were ever created). 'auto' = minted by the daily
-- pricing collector because an active idea referenced a ticker that was not
-- in the master list.
--
-- This distinction matters because the master list is a known-INCOMPLETE
-- one-time CSV import, not a live feed: a ticker being absent is an ordinary,
-- frequent situation (IPOs, newly-listed names, anything the CSV missed), and
-- the new-idea form has a free-text "Not in the list? Enter manually" path
-- precisely for it. Tagging collector-created rows keeps them from being
-- mistaken for curated data, and gives the eventual automated exchange-feed
-- sync a clean set of rows to reconcile/upgrade.
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS source     TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Auto-created rows carry only what the triggering idea actually knew:
-- symbol, a display name, asset_class, a defaulted exchange/currency. `type`
-- (the broker instrument-type code — EQ/ETF/MF/FUT/CE/PE) and `sector` are
-- left NULL rather than fabricated, so these must be nullable.
ALTER TABLE instruments ALTER COLUMN type   DROP NOT NULL;
ALTER TABLE instruments ALTER COLUMN sector DROP NOT NULL;

-- ── 2. Normalise the key columns BEFORE deduping ───────────────────────────
-- Normalisation can itself create duplicates ('reliance' vs 'RELIANCE'),
-- which is why it runs first and step 3 cleans up after it.
UPDATE instruments
   SET symbol = UPPER(BTRIM(symbol))
 WHERE symbol IS DISTINCT FROM UPPER(BTRIM(symbol));

UPDATE instruments
   SET asset_class = 'Equity'
 WHERE asset_class IS NULL OR BTRIM(asset_class) = '';

UPDATE instruments
   SET asset_class = BTRIM(asset_class)
 WHERE asset_class IS DISTINCT FROM BTRIM(asset_class);

ALTER TABLE instruments ALTER COLUMN asset_class SET DEFAULT 'Equity';
ALTER TABLE instruments ALTER COLUMN asset_class SET NOT NULL;

-- ── 3. Merge duplicate (symbol, asset_class) rows ──────────────────────────
--
-- CANONICAL-ROW RULE (deterministic, in order):
--   a. an is_active row beats a deactivated one;
--   b. then NSE beats BSE beats anything else — NSE is deeper, more liquid,
--      and is already this app's default everywhere (the new-idea form
--      defaults a manually-typed ticker's exchange to 'NSE');
--   c. then lowest id, purely so the rule is total and stable across re-runs.
--
-- FIELD-MERGE RULE: for name / exchange / type / currency / sector the
-- canonical row's value wins when it is present and non-blank; otherwise the
-- first present, non-blank value from the losing rows in that same rank order
-- is adopted. So nothing recoverable is lost — a BSE row that carried a
-- sector the NSE row lacked donates it.
--   * is_active: TRUE if ANY of the merged rows was active. Deactivating a
--     BSE listing must not silently hide the NSE listing that survives.
--   * source: 'admin' if ANY merged row was admin-curated (curation is the
--     stronger claim and must not be downgraded).
--
-- Recording that a second exchange listing ALSO existed is explicitly out of
-- scope for v1: exchange is now a single informational field on the surviving
-- row, not a list.
WITH ranked AS (
  SELECT
    id, symbol, asset_class, name, exchange, type, currency, sector, is_active, source,
    ROW_NUMBER() OVER w  AS rn,
    FIRST_VALUE(id) OVER w AS canonical_id,
    COUNT(*)        OVER (PARTITION BY symbol, asset_class) AS grp_size
  FROM instruments
  WINDOW w AS (
    PARTITION BY symbol, asset_class
    ORDER BY
      COALESCE(is_active, false) DESC,
      CASE UPPER(COALESCE(BTRIM(exchange), ''))
        WHEN 'NSE' THEN 0 WHEN 'BSE' THEN 1 ELSE 2 END,
      id
  )
),
dupes AS (
  SELECT * FROM ranked WHERE grp_size > 1
),
merged AS (
  SELECT
    canonical_id,
    (ARRAY_REMOVE(ARRAY_AGG(NULLIF(BTRIM(name),     '') ORDER BY rn), NULL))[1] AS name,
    (ARRAY_REMOVE(ARRAY_AGG(NULLIF(BTRIM(exchange), '') ORDER BY rn), NULL))[1] AS exchange,
    (ARRAY_REMOVE(ARRAY_AGG(NULLIF(BTRIM(type),     '') ORDER BY rn), NULL))[1] AS type,
    (ARRAY_REMOVE(ARRAY_AGG(NULLIF(BTRIM(currency), '') ORDER BY rn), NULL))[1] AS currency,
    (ARRAY_REMOVE(ARRAY_AGG(NULLIF(BTRIM(sector),   '') ORDER BY rn), NULL))[1] AS sector,
    BOOL_OR(COALESCE(is_active, false))                                          AS is_active,
    CASE WHEN BOOL_OR(source = 'admin') THEN 'admin' ELSE 'auto' END              AS source
  FROM dupes
  GROUP BY canonical_id
)
UPDATE instruments i
   SET name       = COALESCE(m.name, i.name),
       exchange   = COALESCE(m.exchange, i.exchange),
       type       = COALESCE(m.type, i.type),
       currency   = COALESCE(m.currency, i.currency),
       sector     = COALESCE(m.sector, i.sector),
       is_active  = m.is_active,
       source     = m.source,
       updated_at = now()
  FROM merged m
 WHERE i.id = m.canonical_id;

-- Repoint any already-collected price rows from a losing row onto the
-- surviving one BEFORE deleting, so the ON DELETE CASCADE below can never
-- take price history with it. This is a no-op on a database where
-- instrument_daily_prices does not exist yet (the normal production case) —
-- hence the to_regclass guard. Where a canonical row already has a snapshot
-- for the same date, the duplicate's snapshot is simply dropped: both
-- describe the same instrument on the same day.
DO $$
BEGIN
  IF to_regclass('public.instrument_daily_prices') IS NOT NULL THEN
    WITH ranked AS (
      SELECT id,
             FIRST_VALUE(id) OVER w AS canonical_id,
             COUNT(*) OVER (PARTITION BY symbol, asset_class) AS grp_size
      FROM instruments
      WINDOW w AS (
        PARTITION BY symbol, asset_class
        ORDER BY
          COALESCE(is_active, false) DESC,
          CASE UPPER(COALESCE(BTRIM(exchange), ''))
            WHEN 'NSE' THEN 0 WHEN 'BSE' THEN 1 ELSE 2 END,
          id
      )
    ),
    losers AS (
      SELECT id, canonical_id FROM ranked WHERE grp_size > 1 AND id <> canonical_id
    )
    UPDATE instrument_daily_prices p
       SET instrument_id = l.canonical_id
      FROM losers l
     WHERE p.instrument_id = l.id
       AND NOT EXISTS (
         SELECT 1 FROM instrument_daily_prices c
          WHERE c.instrument_id = l.canonical_id AND c.price_date = p.price_date
       );

    DELETE FROM instrument_daily_prices p
     USING (
       WITH ranked AS (
         SELECT id,
                FIRST_VALUE(id) OVER w AS canonical_id,
                COUNT(*) OVER (PARTITION BY symbol, asset_class) AS grp_size
         FROM instruments
         WINDOW w AS (
           PARTITION BY symbol, asset_class
           ORDER BY
             COALESCE(is_active, false) DESC,
             CASE UPPER(COALESCE(BTRIM(exchange), ''))
               WHEN 'NSE' THEN 0 WHEN 'BSE' THEN 1 ELSE 2 END,
             id
         )
       )
       SELECT id FROM ranked WHERE grp_size > 1 AND id <> canonical_id
     ) l
     WHERE p.instrument_id = l.id;
  END IF;
END $$;

-- Now the losing master rows can go.
DELETE FROM instruments
 WHERE id IN (
   WITH ranked AS (
     SELECT id,
            FIRST_VALUE(id) OVER w AS canonical_id,
            COUNT(*) OVER (PARTITION BY symbol, asset_class) AS grp_size
     FROM instruments
     WINDOW w AS (
       PARTITION BY symbol, asset_class
       ORDER BY
         COALESCE(is_active, false) DESC,
         CASE UPPER(COALESCE(BTRIM(exchange), ''))
           WHEN 'NSE' THEN 0 WHEN 'BSE' THEN 1 ELSE 2 END,
         id
     )
   )
   SELECT id FROM ranked WHERE grp_size > 1 AND id <> canonical_id
 );

-- ── 4. Swap the UNIQUE key: (symbol, exchange) -> (symbol, asset_class) ────
-- Done only AFTER the merge, so adding the new key cannot fail on leftover
-- duplicates. The old key's NAME is not assumed — it is discovered from the
-- catalog, covering both "created as a constraint" and "created as a bare
-- unique index" and making the step safe to re-run.
DO $$
DECLARE
  con_name TEXT;
  idx_name TEXT;
BEGIN
  -- Drop any UNIQUE CONSTRAINT whose columns are exactly (symbol, exchange).
  FOR con_name IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'public.instruments'::regclass
       AND c.contype = 'u'
       AND (
         SELECT ARRAY_AGG(a.attname::text ORDER BY a.attname)
           FROM unnest(c.conkey) k
           JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
       ) = ARRAY['exchange','symbol']
  LOOP
    EXECUTE format('ALTER TABLE instruments DROP CONSTRAINT %I', con_name);
  END LOOP;

  -- Drop any remaining bare UNIQUE INDEX on exactly (symbol, exchange).
  FOR idx_name IN
    SELECT ci.relname
      FROM pg_index i
      JOIN pg_class ci ON ci.oid = i.indexrelid
     WHERE i.indrelid = 'public.instruments'::regclass
       AND i.indisunique
       AND NOT i.indisprimary
       AND (
         SELECT ARRAY_AGG(a.attname::text ORDER BY a.attname)
           FROM unnest(i.indkey::int[]) k
           JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k
       ) = ARRAY['exchange','symbol']
  LOOP
    EXECUTE format('DROP INDEX %I', idx_name);
  END LOOP;
END $$;

-- The new identity. This is what makes "same instrument" a database-level
-- fact rather than a convention, and what the collector's and the admin
-- upsert's ON CONFLICT target resolves against.
CREATE UNIQUE INDEX IF NOT EXISTS instruments_symbol_asset_class_key
  ON instruments (symbol, asset_class);

-- Read path: every consumer looks an instrument up by symbol, never by uuid.
CREATE INDEX IF NOT EXISTS idx_instruments_symbol ON instruments (symbol);

-- Lets the admin browser filter/segregate collector-created rows cheaply.
CREATE INDEX IF NOT EXISTS idx_instruments_source ON instruments (source);

-- ── 5. INSTRUMENT DAILY PRICES ─────────────────────────────────────────────
-- One row per instrument per TRADING day. `price_date` is the date the
-- PROVIDER reported the close for — never "the date we happened to run".
-- That is what makes weekend/holiday handling correct without a
-- market-calendar table: a Saturday run finds Friday's close already stored
-- under Friday's date and does nothing.
--
-- prev_close_price / prev_price_date / change_abs / change_pct are
-- PRECOMPUTED at collection time so "what did this move since the last
-- trading day" is a single indexed row read, not a self-join or a per-request
-- window function.
--
-- The composite PRIMARY KEY (instrument_id, price_date) is the duplicate
-- guard: two collection runs on the same day cannot produce two rows for the
-- same instrument+date. The collector upserts (ON CONFLICT DO UPDATE), so a
-- re-run refreshes the row in place instead of failing or duplicating.
CREATE TABLE IF NOT EXISTS instrument_daily_prices (
  instrument_id     UUID NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
  price_date        DATE NOT NULL,
  close_price       NUMERIC(20,6) NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'INR',
  prev_close_price  NUMERIC(20,6),   -- close on prev_price_date (NULL when genuinely unknown)
  prev_price_date   DATE,            -- the PREVIOUS TRADING DAY, as reported by the provider
  change_abs        NUMERIC(20,6),   -- close_price - prev_close_price
  change_pct        NUMERIC(12,6),   -- (close_price - prev_close_price) / prev_close_price * 100
  source            TEXT,            -- 'yahoo_finance' | 'twelve_data' | ...
  source_exchange   TEXT,            -- 'NSE' | 'BSE' — which exchange THIS close came from (informational)
  collected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (instrument_id, price_date)
);

-- The PK already serves the dominant read ("latest row per instrument", a
-- DISTINCT ON (instrument_id) ORDER BY price_date DESC). This second index
-- serves the housekeeping/backfill read ("everything collected for date X").
CREATE INDEX IF NOT EXISTS idx_idp_date ON instrument_daily_prices (price_date DESC);

COMMIT;

-- ── Retention ──────────────────────────────────────────────────────────────
-- Intentionally none for v1. At the current instrument count a daily row per
-- active instrument is a few thousand rows a year; partitioning or a purge
-- job would be premature. Revisit past ~10M rows, at which point monthly
-- RANGE partitioning on price_date is the natural next step (the PK already
-- leads with instrument_id, so a partition-wise index stays cheap).

-- ── Post-migration verification (run manually, read-only) ──────────────────
-- Expect ZERO rows from the duplicate check:
--   SELECT symbol, asset_class, COUNT(*)
--     FROM instruments GROUP BY 1,2 HAVING COUNT(*) > 1;
-- Expect the new index to be present and the old (symbol, exchange) key gone:
--   SELECT indexname, indexdef FROM pg_indexes
--    WHERE tablename = 'instruments';
-- Expect every pre-existing row to be tagged 'admin':
--   SELECT source, COUNT(*) FROM instruments GROUP BY 1;
