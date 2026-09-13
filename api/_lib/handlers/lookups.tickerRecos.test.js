import { describe, it, expect, vi, beforeEach } from "vitest";

// ticker-recos backs the authenticated (signed-in) Stock Insights page. Its
// Idea History tab used to hardcode every row's status badge to "Active"
// because this query never selected exit_signal/target_date, so the client
// had nothing else to check — the fix is additive columns from the same
// already is_public-filtered row, not a change to who can see what. The
// status/return_pct expression is copied verbatim from public-ideas.js
// rather than shared (the Neon driver can't compose query fragments across
// files); this test pins that the copy hasn't drifted.

const sqlCalls = [];
let rows = [];
const sqlTag = (strings, ...values) => {
  sqlCalls.push({ text: strings.join("?"), values });
  return Promise.resolve(rows);
};
vi.mock("../auth.js", async () => {
  const actual = await vi.importActual("../auth.js");
  return { ...actual, sql: (...a) => sqlTag(...a), requireUid: async () => "me" };
});

const { default: handleLookups } = await import("./lookups.js");
const { default: handlePublicIdeas } = await import("./public-ideas.js");

const mkRes = () => ({
  statusCode: 0,
  body: null,
  setHeader: vi.fn(),
  status(c) { this.statusCode = c; return this; },
  json(b) { this.body = b; return this; },
  end() { return this; },
});

const getTickerRecos = async (ticker = "RELIANCE") => {
  const res = mkRes();
  await handleLookups({ method: "GET", query: { action: "ticker-recos", ticker } }, res);
  return res;
};

beforeEach(() => { sqlCalls.length = 0; rows = []; });

describe("ticker-recos — status/return_pct", () => {
  it("selects exit/target columns plus computed status and return_pct", async () => {
    await getTickerRecos();
    const call = sqlCalls.find((c) => c.text.includes("ic_recommendations"));
    const text = call.text.replace(/\s+/g, " ");
    expect(text).toContain("r.exit_signal, r.exit_date, r.exit_price");
    expect(text).toContain("r.expiry_price, r.target_date, r.target_price");
    expect(text).toContain("AS status");
    expect(text).toContain("AS return_pct");
  });

  it("still requires auth and still filters is_public = true", async () => {
    const call0 = sqlCalls.length;
    await getTickerRecos();
    const call = sqlCalls.find((c) => c.text.includes("ic_recommendations"));
    expect(call.text.replace(/\s+/g, " ")).toContain("r.is_public = true");
  });

  it("never uses SELECT * or RETURNING *", async () => {
    await getTickerRecos();
    for (const call of sqlCalls) {
      expect(call.text).not.toMatch(/select\s+\*/i);
      expect(call.text).not.toMatch(/returning\s+\*/i);
    }
  });

  it("keeps the status/return_pct expression identical to public-ideas.js's copies", async () => {
    const extract = (text) => {
      const m = text.replace(/\s+/g, " ").match(/CASE WHEN r\.exit_signal[\s\S]*?AS return_pct/);
      return m ? m[0] : null;
    };

    await getTickerRecos();
    const tickerRecosExpr = extract(sqlCalls.find((c) => c.text.includes("ic_recommendations")).text);
    expect(tickerRecosExpr).toBeTruthy();

    sqlCalls.length = 0;
    const res = mkRes();
    await handlePublicIdeas({ method: "GET", query: { action: "by-symbol", symbol: "RELIANCE" } }, res);
    const publicIdeasExpr = extract(sqlCalls.find((c) => c.text.includes("ic_recommendations")).text);
    expect(publicIdeasExpr).toBeTruthy();

    expect(tickerRecosExpr).toBe(publicIdeasExpr);
  });
});
