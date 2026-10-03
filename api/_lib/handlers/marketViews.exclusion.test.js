import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MARKET_VIEW_TYPES } from "../ideaType.js";

// A Market View (Positive / Neutral / Negative) is commentary, not a
// recommendation. The return maths in this codebase treats any type that is
// not 'Sell' as a LONG position, so a Market View that reached a performance /
// ICI / consensus aggregate would be scored as if it were a Buy. These tests
// read the SQL each such statement emits and fail if one stops excluding them.

const sqlCalls = [];
let rows = [];
const sqlTag = (strings, ...values) => {
  sqlCalls.push({ text: strings.join("?").replace(/\s+/g, " "), values });
  return Promise.resolve(rows);
};
vi.mock("../auth.js", async () => {
  const actual = await vi.importActual("../auth.js");
  return { ...actual, sql: (...a) => sqlTag(...a), requireUid: async () => "me" };
});

const { default: handleLookups } = await import("./lookups.js");
const { default: handlePublicProfile } = await import("./public-profile.js");
const { default: handlePublicIdeas } = await import("./public-ideas.js");

const mkRes = () => ({
  statusCode: 0, body: null, setHeader: vi.fn(),
  status(c) { this.statusCode = c; return this; },
  json(b) { this.body = b; return this; },
  end() { return this; },
});

beforeEach(() => { sqlCalls.length = 0; rows = []; });

const excludes = (call) => call.text.includes("<> ALL(") && call.values.some((v) => Array.isArray(v) && v.join() === MARKET_VIEW_TYPES.join());
const onIdeas = () => sqlCalls.filter((c) => c.text.includes("FROM ic_recommendations") || c.text.includes("JOIN ic_recommendations") || c.text.includes("ic_recommendations r ON"));

describe("Market Views stay out of performance, ICI and consensus inputs", () => {
  it("public-profile: every performance aggregate excludes them; only the idea list includes them", async () => {
    rows = [{ id: "u1", username: "someone" }];
    await handlePublicProfile({ method: "GET", query: { username: "someone" } }, mkRes());
    const stats = onIdeas().filter((c) => !c.text.includes("r.disclosure"));
    expect(stats.length).toBeGreaterThanOrEqual(7);
    for (const c of stats) expect(excludes(c), c.text.slice(0, 120)).toBe(true);
    const list = onIdeas().filter((c) => c.text.includes("r.disclosure"));
    expect(list).toHaveLength(1);
    expect(excludes(list[0])).toBe(false);
  });

  it.each([
    ["investor-ici-batch (ICI inputs)", "POST", { action: "investor-ici-batch", uids: ["a"] }, {}],
    ["discover-people (ICI inputs)", "GET", {}, { action: "discover-people" }],
    ["consensus-all", "GET", {}, { action: "consensus-all" }],
    ["consensus-public", "GET", {}, { action: "consensus-public" }],
    ["ticker-recos (Stock Insights)", "GET", {}, { action: "ticker-recos", ticker: "INFY" }],
    ["public-ideas-count-batch", "POST", { action: "public-ideas-count-batch", uids: ["a"] }, {}],
  ])("lookups %s", async (_n, method, body, query) => {
    await handleLookups({ method, query, body, headers: { authorization: "Bearer t" } }, mkRes());
    const calls = onIdeas();
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(excludes(c), c.text.slice(0, 140)).toBe(true);
  });

  it("public-ideas: the by-symbol hub, sitemap symbols and related list exclude them (the idea page itself and search do not)", async () => {
    for (const query of [{ action: "by-symbol", symbol: "INFY" }, { action: "symbols" }, { action: "related", symbol: "INFY" }]) {
      sqlCalls.length = 0;
      rows = [{ idea_count: 1 }];
      await handlePublicIdeas({ method: "GET", query }, mkRes());
      for (const c of onIdeas()) expect(excludes(c), `${query.action}: ${c.text.slice(0, 100)}`).toBe(true);
    }
    for (const query of [{ action: "idea", id: "i1" }, { action: "search", q: "infy" }]) {
      sqlCalls.length = 0;
      await handlePublicIdeas({ method: "GET", query }, mkRes());
      expect(onIdeas().some((c) => excludes(c)), query.action).toBe(false);
    }
  });

  it("the nightly price job never stamps an entry price on, or tracks, a Market View", () => {
    const src = readFileSync(resolve(process.cwd(), "scripts/stamp-prices.js"), "utf8");
    const guard = "COALESCE(recommendation_type, 'Buy') NOT IN ('Positive', 'Neutral', 'Negative')";
    const aliased = guard.replace("recommendation_type", "r.recommendation_type");
    expect(src.split(aliased).length - 1).toBe(1);   // price universe
    expect(src.split(guard).length - 1).toBe(2);     // current_price refresh + entry-price stamping
  });
});
