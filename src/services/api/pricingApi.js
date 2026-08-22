/**
 * InvestorCircle — Instrument pricing service module (Phase 9).
 *
 * Thin re-export of the daily-pricing read helpers from src/db.js — the
 * underlying implementation still funnels through callApi() (see db.js),
 * which talks to the authenticated server API in api/data.js /
 * api/_lib/handlers/pricing.js. The browser never connects to Neon, and
 * never calls a market-data provider, directly.
 *
 * Read-only by design: writing price history is the nightly batch's job
 * (scripts/stamp-prices.js), not the frontend's.
 */
export { getDailyPrices, byTicker } from "../../db";
