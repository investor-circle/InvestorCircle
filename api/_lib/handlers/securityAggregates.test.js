import { describe, it, expect, vi } from "vitest";
import { circleViewBreakdown, researchMonthlyFromAggregate, viewMonthlyFromAggregate, viewBreakdownFromCounts, researchBreakdownFromCounts } from "../../../src/utils/securityInsights.js";

// The Security Page's analytics (Your Circle vs Community split, monthly
// activity) must be EXACT. The lists the page renders are capped (research 60,
// Market Views 30 per page, stances 1000), so none of these figures may be
// derived from them. This drives both endpoints against a "database" that holds
// far more rows than any cap, with the aggregate statements answered from the
// FULL dataset and the list statements answered from the capped slice — exactly
// what Postgres does — and checks what comes back.

const MONTHS = ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04"];
const RESEARCH = [];                      // newest first
for (let i = 0; i < 300; i++) RESEARCH.push({ type: i % 6 === 0 ? "Sell" : i % 3 === 0 ? "Hold" : "Buy", mo: MONTHS[5 - Math.floor(i / 50)], from: `p${i % 7}` });
const VIEWS = [];                         // newest first
for (let i = 0; i < 2400; i++) {
  // The OLDEST 1400 views (beyond the 1000-row stances cap) are all Negative and
  // all by Circle members u0-u9, so any figure derived from the capped rows is
  // visibly wrong.
  const old = i >= 1000;
  VIEWS.push({
    type: old ? "Negative" : ["Positive", "Positive", "Neutral", "Negative"][i % 4],
    mo: MONTHS[Math.min(5, Math.floor(i / 400))],
    from: old ? `u${i % 10}` : `u${10 + (i % 40)}`,
  });
}
const CIRCLE = new Set(Array.from({ length: 10 }, (_, i) => `u${i}`));

const group = (rows, types) => {
  const by = {};
  for (const r of rows) { by[r.mo] ||= Object.fromEntries(types.map((t) => [t, 0])); by[r.mo][r.type]++; }
  return by;
};
const count = (rows, t) => rows.filter((r) => r.type === t).length;

const sqlCalls = [];
const fakeDb = (strings, ...values) => {
  const text = strings.join("?").replace(/\s+/g, " ");
  sqlCalls.push(text);
  const isView = text.includes("= ANY(");
  const data = isView ? VIEWS : RESEARCH;
  const nums = values.filter((v) => typeof v === "number");
  if (text.includes("to_char(")) {
    const by = group(data, isView ? ["Positive", "Neutral", "Negative"] : ["Buy", "Hold", "Sell"]);
    return Promise.resolve(Object.keys(by).sort().map((mo) => isView
      ? { mo, positive: by[mo].Positive, neutral: by[mo].Neutral, negative: by[mo].Negative, Positive: by[mo].Positive, Neutral: by[mo].Neutral, Negative: by[mo].Negative }
      : { mo, buy: by[mo].Buy, hold: by[mo].Hold, sell: by[mo].Sell }));
  }
  if (text.includes("GROUP BY r.recommender_id")) {
    const by = {};
    for (const r of VIEWS) { by[r.from] ||= { from: r.from, positive: 0, neutral: 0, negative: 0 }; by[r.from][r.type.toLowerCase()]++; }
    return Promise.resolve(Object.values(by));
  }
  if (text.includes("COUNT(")) {
    return Promise.resolve([isView
      ? { idea_count: data.length, total: data.length, positive: count(data, "Positive"), neutral: count(data, "Neutral"), negative: count(data, "Negative"), contributor_count: 50, contributors: 50 }
      : { idea_count: data.length, contributor_count: 7, closed_count: 0, buy_count: count(data, "Buy"), hold_count: count(data, "Hold"), sell_count: count(data, "Sell") }]);
  }
  // A list statement: capped, whatever exists.
  const limit = nums.length ? nums[nums.length - 1] : 1000;
  const offset = text.includes("OFFSET") ? nums[nums.length - 1] : 0;
  const lim = text.includes("OFFSET") ? nums[nums.length - 2] : limit;
  return Promise.resolve(data.slice(offset, offset + lim).map((r, i) => ({
    id: `x${i}`, recommendation_type: r.type, created_at: `${r.mo}-15T10:00:00Z`, author_username: r.from, from: r.from, thesis: "t",
  })));
};
vi.mock("../auth.js", async () => {
  const actual = await vi.importActual("../auth.js");
  return { ...actual, sql: (...a) => fakeDb(...a), requireUid: async () => "me" };
});

const { default: handlePublicIdeas } = await import("./public-ideas.js");
const { default: handleLookups } = await import("./lookups.js");
const mkRes = () => ({ statusCode: 0, body: null, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } });

describe("public security page — exact aggregates for a ticker with more records than the row caps", () => {
  it("returns monthly counts, and Research / Market View figures, from ALL records, separately", async () => {
    const res = mkRes();
    await handlePublicIdeas({ method: "GET", query: { action: "by-symbol", symbol: "BIG" } }, res);
    const b = res.body;

    // The lists really are capped well below the dataset…
    expect(b.ideas.length).toBeLessThan(RESEARCH.length);
    expect(b.views.length).toBeLessThan(VIEWS.length);
    expect(b.view_stances.length).toBeLessThan(VIEWS.length);

    // …but the monthly activity is exact over every record.
    const sumKeys = (rows, keys) => rows.reduce((a, r) => a + keys.reduce((x, k) => x + r[k], 0), 0);
    expect(sumKeys(b.research_monthly, ["Buy", "Hold", "Sell"])).toBe(RESEARCH.length);
    expect(sumKeys(b.view_monthly, ["Positive", "Neutral", "Negative"])).toBe(VIEWS.length);
    const rm = group(RESEARCH, ["Buy", "Hold", "Sell"]);
    for (const m of b.research_monthly) expect(m).toEqual({ mo: m.mo, ...rm[m.mo] });
    const vm = group(VIEWS, ["Positive", "Neutral", "Negative"]);
    for (const m of b.view_monthly) expect(m).toEqual({ mo: m.mo, ...vm[m.mo] });

    // Research and Market Views never share a key: no research type in a view month, and vice-versa.
    for (const m of b.research_monthly) expect(Object.keys(m).sort()).toEqual(["Buy", "Hold", "Sell", "mo"]);
    for (const m of b.view_monthly) expect(Object.keys(m).sort()).toEqual(["Negative", "Neutral", "Positive", "mo"]);

    // Community split from complete counts.
    const cb = viewBreakdownFromCounts({ ...b.view_summary, contributors: b.view_summary.contributor_count });
    expect(cb.total).toBe(VIEWS.length);
    expect(cb.positive).toBe(count(VIEWS, "Positive"));
    expect(cb.positivePct + cb.neutralPct + cb.negativePct).toBe(100);
    const rb = researchBreakdownFromCounts({ buy: b.summary.buy_count, hold: b.summary.hold_count, sell: b.summary.sell_count });
    expect(rb.total).toBe(RESEARCH.length);
    expect(rb.buyPct + rb.holdPct + rb.sellPct).toBe(100);
  });

  it("runs the monthly statements as database aggregates, one per dataset, each excluding the other", async () => {
    sqlCalls.length = 0;
    await handlePublicIdeas({ method: "GET", query: { action: "by-symbol", symbol: "BIG" } }, mkRes());
    const monthly = sqlCalls.filter((t) => t.includes("to_char("));
    expect(monthly).toHaveLength(2);
    for (const t of monthly) { expect(t).toContain("GROUP BY"); expect(t).toContain("is_public = true"); expect(t).not.toContain("LIMIT"); }
    expect(monthly.filter((t) => t.includes("<> ALL("))).toHaveLength(1);   // research only
    expect(monthly.filter((t) => t.includes("= ANY("))).toHaveLength(1);    // Market Views only
  });
});

describe("signed-in Market Views — Your Circle vs Community are exact", () => {
  it("totals the Circle from every view by every Circle member, not the capped stances", async () => {
    const res = mkRes();
    await handleLookups({ method: "GET", query: { action: "ticker-views", ticker: "BIG" }, headers: { authorization: "Bearer t" } }, res);
    const b = res.body;
    expect(b.stances.length).toBe(1000);                       // capped…
    expect(b.views.length).toBeLessThan(VIEWS.length);          // …paginated…
    expect(b.has_more).toBe(true);

    const circle = circleViewBreakdown(b.by_contributor, (id) => CIRCLE.has(id));
    const truth = VIEWS.filter((v) => CIRCLE.has(v.from));
    expect(circle.total).toBe(truth.length);
    expect(circle.negative).toBe(count(truth, "Negative"));
    expect(circle.contributors).toBe(10);
    expect(circle.positivePct + circle.neutralPct + circle.negativePct).toBe(100);

    // What the capped stances would have said — wrong, which is the bug this prevents.
    const fromStances = b.stances.filter((s) => CIRCLE.has(s.from));
    expect(fromStances.length).not.toBe(truth.length);

    // Community comes from the exact summary.
    expect(b.summary.total).toBe(VIEWS.length);
    expect(b.summary.negative).toBe(count(VIEWS, "Negative"));
  });

  it("monthly Market View activity is exact and carries no research types", async () => {
    const res = mkRes();
    await handleLookups({ method: "GET", query: { action: "ticker-views", ticker: "BIG" }, headers: { authorization: "Bearer t" } }, res);
    const months = viewMonthlyFromAggregate(res.body.monthly);
    expect(months.reduce((a, m) => a + m.Positive + m.Neutral + m.Negative, 0)).toBe(VIEWS.length);
    for (const m of months) expect(Object.keys(m).sort()).toEqual(["Negative", "Neutral", "Positive", "mo"]);
    expect(researchMonthlyFromAggregate([{ mo: "2026-01", Buy: 2, Hold: 0, Sell: 1 }])).toEqual([{ mo: "2026-01", Buy: 2, Hold: 0, Sell: 1 }]);
  });
});
