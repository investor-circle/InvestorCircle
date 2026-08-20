-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 9 — Instrument-level daily pricing history
--
-- ADDITIVE ONLY. Creates two new tables. Touches NO existing table: no
-- column is added to, changed on, or dropped from ic_recommendations, and
-- ic_recommendations.current_price keeps being populated exactly as it is
-- today (stamped once at idea creation from api/price.js). Re-sourcing
-- current_price from this layer is a deliberate FOLLOW-UP task, not this
-- migration.
--
-- Safe to run more than once (every statement is IF NOT EXISTS).
--
-- ── Why an instruments table rather than (ticker, exchange) on the price
--    rows directly ──────────────────────────────────────────────────────
-- Before this migration there is NO canonical security identity anywhere in
-- the schema: ic_recommendations carries free-text `ticker`, `asset_class`
-- and `exchange` columns that are written straight from the new-idea form,
-- with no dedup and no normalisation. Two users posting "reliance" and
-- "RELIANCE " are, today, two unrelated strings. Pricing has to be
-- instrument-level ("one row per instrument per trading day, no matter how
-- many ideas reference it"), which is precisely the guarantee free-text
-- keys cannot give. `instruments` supplies it with a normalised UNIQUE key,
-- and becomes the one place a future ticker-alias/rename fix can live.
--
-- ic_recommendations is deliberately NOT given an instrument_id FK here —
-- that would be a change to an existing hot table. Resolution happens in
-- the collector via the normalised key.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── INSTRUMENTS ────────────────────────────────────────────────────────────
-- One row per tradable security. Populated (upserted) by the daily pricing
-- collector from the currently-active idea universe; nothing else writes it.
--
-- Canonical key = (ticker, exchange, asset_class), all normalised by the
-- collector to UPPER(TRIM(...)) for ticker/exchange before insert. The
-- UNIQUE constraint is what makes "same instrument" a database-level fact
-- rather than a convention.
CREATE TABLE IF NOT EXISTS instruments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker        TEXT NOT NULL,
  exchange      TEXT NOT NULL DEFAULT 'NSE',
  asset_class   TEXT NOT NULL DEFAULT 'Equity',
  asset_name    TEXT,                                   -- best-known display name, refreshed by the collector
  currency      TEXT NOT NULL DEFAULT 'INR',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ticker, exchange, asset_class)
);

-- Read path: consumers look instruments up by ticker (optionally narrowing
-- by exchange), never by uuid — they don't have the uuid.
CREATE INDEX IF NOT EXISTS idx_instruments_ticker ON instruments(ticker);

-- ── INSTRUMENT DAILY PRICES ────────────────────────────────────────────────
-- One row per instrument per TRADING day. price_date is the date the
-- provider itself reported the close for — never "the date we happened to
-- run". That is what makes weekend/holiday handling correct without a
-- market-calendar table: a Saturday run finds Friday's close already
-- stored under Friday's date and does nothing.
--
-- prev_close_price / prev_price_date / change_abs / change_pct are
-- PRECOMPUTED at collection time so that "what did this move since the last
-- trading day" is a single indexed row read, not a self-join or a window
-- function evaluated per request.
--
-- The composite PRIMARY KEY (instrument_id, price_date) is the duplicate
-- guard: two collection runs on the same day cannot produce two rows for
-- the same instrument+date. The collector upserts (ON CONFLICT DO UPDATE)
-- so a re-run refreshes a row in place instead of failing or duplicating.
CREATE TABLE IF NOT EXISTS instrument_daily_prices (
  instrument_id     UUID NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
  price_date        DATE NOT NULL,
  close_price       NUMERIC(20,6) NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'INR',
  prev_close_price  NUMERIC(20,6),        -- close on prev_price_date (NULL when genuinely unknown)
  prev_price_date   DATE,                 -- the PREVIOUS TRADING DAY, as reported by the provider
  change_abs        NUMERIC(20,6),        -- close_price - prev_close_price
  change_pct        NUMERIC(12,6),        -- (close_price - prev_close_price) / prev_close_price * 100
  source            TEXT,                 -- 'yahoo_finance' | 'twelve_data' | ...
  collected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (instrument_id, price_date)
);

-- The PK already serves the dominant read ("latest row for these
-- instruments", a DISTINCT ON (instrument_id) ORDER BY price_date DESC).
-- This second index serves the housekeeping/backfill read ("everything
-- collected for date X").
CREATE INDEX IF NOT EXISTS idx_idp_date ON instrument_daily_prices(price_date DESC);

-- ── Retention ──────────────────────────────────────────────────────────────
-- Intentionally none for v1. At the current instrument count a daily row per
-- active instrument is a few thousand rows a year; partitioning or a purge
-- job would be premature. Revisit if instrument_daily_prices passes ~10M
-- rows, at which point monthly RANGE partitioning on price_date is the
-- natural next step (the PK already leads with instrument_id, so a
-- partition-wise index stays cheap).
