import { describe, it, expect, vi, beforeEach } from "vitest";

// pricing.js's `daily` action is an ordinary authenticated read; `public-daily`
// is the new, deliberately unauthenticated, single-symbol counterpart backing
// the public /security/:symbol price display. These tests pin that boundary:
// `daily` still requires auth, `public-daily` doesn't, and both read the same
// non-sensitive fields from the same table.

const sqlCalls = [];
let rows = [];
const sqlTag = (strings, ...values) => {
  sqlCalls.push({ text: strings.join("?"), values });
  return Promise.resolve(rows);
};
let requireUidImpl = async () => { throw { status: 401, error: "Missing or malformed Authorization header" }; };
vi.mock("../auth.js", async () => {
  const actual = await vi.importActual("../auth.js");
  return { ...actual, sql: (...a) => sqlTag(...a), requireUid: (...a) => requireUidImpl(...a) };
});

const { default: handlePricing } = await import("./pricing.js");

const mkRes = () => ({
  statusCode: 0,
  body: null,
  setHeader: vi.fn(),
  status(c) { this.statusCode = c; return this; },
  json(b) { this.body = b; return this; },
  end() { return this; },
});

const priceRow = {
  symbol: "RELIANCE", asset_class: "EQ", name: "Reliance Industries", exchange: "NSE",
  price_date: new Date("2026-09-17"), close_price: 1500, currency: "INR",
  prev_close_price: 1480, prev_price_date: new Date("2026-09-16"),
  change_abs: 20, change_pct: 1.35, source: "yahoo_finance", source_exchange: "NSE",
  collected_at: new Date("2026-09-17"),
};

beforeEach(() => {
  sqlCalls.length = 0;
  rows = [priceRow];
  requireUidImpl = async () => { throw { status: 401, error: "Missing or malformed Authorization header" }; };
});

describe("pricing — daily (authenticated, unchanged)", () => {
  it("still requires auth", async () => {
    const res = mkRes();
    await handlePricing({ method: "GET", query: { action: "daily", tickers: "RELIANCE" } }, res);
    expect(res.statusCode).toBe(401);
    expect(sqlCalls.length).toBe(0);
  });

  it("returns prices once authenticated", async () => {
    requireUidImpl = async () => "uid-1";
    const res = mkRes();
    await handlePricing({ method: "GET", query: { action: "daily", tickers: "RELIANCE" } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.prices).toHaveLength(1);
    expect(res.body.prices[0]).toMatchObject({ ticker: "RELIANCE", close: 1500, changePct: 1.35 });
  });
});

describe("pricing — public-daily (new, deliberately unauthenticated)", () => {
  it("requires no auth", async () => {
    const res = mkRes();
    await handlePricing({ method: "GET", query: { action: "public-daily", symbol: "RELIANCE" } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.price).toMatchObject({ ticker: "RELIANCE", close: 1500, prevClose: 1480, changePct: 1.35 });
  });

  it("returns null (not a 404) for a symbol with no stored snapshot", async () => {
    rows = [];
    const res = mkRes();
    await handlePricing({ method: "GET", query: { action: "public-daily", symbol: "NOPE" } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.price).toBeNull();
  });

  it("only ever queries one symbol, never a batch", async () => {
    const res = mkRes();
    await handlePricing({ method: "GET", query: { action: "public-daily", symbol: "RELIANCE,TCS" } }, res);
    const call = sqlCalls.find((c) => c.text.includes("instrument_daily_prices"));
    // The whole "RELIANCE,TCS" string is passed through as ONE array element
    // to `= ANY($1)`, not split into two tickers — so only "RELIANCE,TCS"
    // itself (which matches nothing real) is ever looked up, not TCS.
    expect(call.values.flat()).toEqual(["RELIANCE,TCS"]);
  });

  it("selects no sensitive column", async () => {
    const res = mkRes();
    await handlePricing({ method: "GET", query: { action: "public-daily", symbol: "RELIANCE" } }, res);
    const call = sqlCalls.find((c) => c.text.includes("instrument_daily_prices"));
    const forbidden = ["email", "password", "uid", "user_id", "recommender", "sebi"];
    for (const bad of forbidden) expect(call.text.toLowerCase()).not.toContain(bad);
  });

  it("never uses SELECT * or RETURNING *", async () => {
    const res = mkRes();
    await handlePricing({ method: "GET", query: { action: "public-daily", symbol: "RELIANCE" } }, res);
    for (const call of sqlCalls) {
      expect(call.text).not.toMatch(/select\s+\*/i);
      expect(call.text).not.toMatch(/returning\s+\*/i);
    }
  });
});
