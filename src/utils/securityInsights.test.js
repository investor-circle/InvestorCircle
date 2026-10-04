import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  percentSplit, researchBreakdown, researchBreakdownFromCounts, viewBreakdown, viewBreakdownFromCounts, currentViews, researchMonthly, viewMonthly,
  commentaryOf, excerpt, viewThemes, pageSections, researchRows, viewRows, isViewRow,
} from "./securityInsights";

// Verified Research (Buy / Hold / Sell) and Market Views (Positive / Neutral /
// Negative) are separate datasets. These pin that they are never blended.

const r = (type, extra = {}) => ({ recommendation_type: type, created_at: "2025-02-01T00:00:00Z", from: "p1", ...extra });
const v = (type, extra = {}) => ({ recommendation_type: type, created_at: "2025-03-01T00:00:00Z", from: "c1", ...extra });

describe("the three copies stay identical", () => {
  const read = (p) => readFileSync(resolve(process.cwd(), p), "utf8");
  it("src / mobile / web-public securityInsights are byte-for-byte the same", () => {
    const web = read("src/utils/securityInsights.js");
    expect(read("mobile/src/utils/securityInsights.js")).toBe(web);
    expect(read("web-public/lib/securityInsights.js")).toBe(web);
  });
});

describe("percentSplit", () => {
  it("always adds up to 100", () => {
    for (const c of [[1, 1, 1], [3, 1, 1], [60, 25, 15], [1, 0, 0], [7, 3, 0], [2, 2, 1]]) {
      expect(percentSplit(c).reduce((a, b) => a + b, 0), String(c)).toBe(100);
    }
  });
  it("is all zeros with nothing", () => expect(percentSplit([0, 0, 0])).toEqual([0, 0, 0]));
  it("matches the 60 / 25 / 15 example", () => expect(percentSplit([12, 5, 3])).toEqual([60, 25, 15]));
});

describe("research breakdown (Buy / Hold / Sell)", () => {
  it("counts the three ratings and publishers", () => {
    const b = researchBreakdown([r("Buy"), r("Buy", { from: "p2" }), r("Hold"), r("Sell", { from: "p3" })], x => x.from);
    expect(b).toMatchObject({ total: 4, buy: 2, hold: 1, sell: 1, publishers: 3 });
    expect(b.buyPct + b.holdPct + b.sellPct).toBe(100);
  });
  it("never counts a Market View", () => {
    const b = researchBreakdown([r("Buy"), v("Positive"), v("Negative"), v("Neutral")]);
    expect(b).toMatchObject({ total: 1, buy: 1, hold: 0, sell: 0 });
  });
  it("treats the legacy default (no type) as Buy", () => expect(researchBreakdown([{}]).buy).toBe(1));
  it("is empty for no research", () => expect(researchBreakdown([]).total).toBe(0));
});

describe("research breakdown from exact counts", () => {
  it("uses the server counts, not however many rows were returned", () => {
    expect(researchBreakdownFromCounts({ buy: 70, hold: 20, sell: 10, publishers: 31 })).toMatchObject({ total: 100, buyPct: 70, holdPct: 20, sellPct: 10, publishers: 31 });
  });
  it("still adds up to 100", () => {
    const b = researchBreakdownFromCounts({ buy: 1, hold: 1, sell: 1 });
    expect(b.buyPct + b.holdPct + b.sellPct).toBe(100);
  });
});

describe("market view breakdown (Positive / Neutral / Negative)", () => {
  it("counts the three views and contributors", () => {
    const b = viewBreakdown([v("Positive"), v("Positive", { from: "c2" }), v("Neutral", { from: "c3" }), v("Negative", { from: "c4" })], x => x.from);
    expect(b).toMatchObject({ total: 4, positive: 2, neutral: 1, negative: 1, contributors: 4 });
  });
  it("never counts a recommendation", () => {
    expect(viewBreakdown([v("Positive"), r("Buy"), r("Sell"), r("Hold")])).toMatchObject({ total: 1, positive: 1, neutral: 0, negative: 0 });
  });
  it.each([["Positive", [100, 0, 0]], ["Neutral", [0, 100, 0]], ["Negative", [0, 0, 100]]])("%s only is a single 100%% bucket", (type, pcts) => {
    const b = viewBreakdown([v(type), v(type, { from: "c2" })]);
    expect([b.positivePct, b.neutralPct, b.negativePct]).toEqual(pcts);
    expect(b.total).toBe(2);
  });
  it("builds from exact server counts (not capped by a page of rows)", () => {
    expect(viewBreakdownFromCounts({ positive: 12, neutral: 5, negative: 3, contributors: 14 })).toMatchObject({ total: 20, positivePct: 60, neutralPct: 25, negativePct: 15, contributors: 14 });
  });
});

describe("the two datasets never mix", () => {
  const mixed = [r("Buy"), r("Sell"), v("Positive"), v("Negative"), v("Neutral")];
  it("partitions cleanly with nothing lost or shared", () => {
    expect(researchRows(mixed)).toHaveLength(2);
    expect(viewRows(mixed)).toHaveLength(3);
    expect(researchRows(mixed).some(isViewRow)).toBe(false);
    expect(viewRows(mixed).some(x => !isViewRow(x))).toBe(false);
  });
  it("the monthly charts are separate too", () => {
    expect(researchMonthly(mixed)).toEqual([{ mo: "2025-02", Buy: 1, Hold: 0, Sell: 1 }]);
    expect(viewMonthly(mixed)).toEqual([{ mo: "2025-03", Positive: 1, Neutral: 1, Negative: 1 }]);
  });
  it("accepts either row shape (recType)", () => {
    expect(isViewRow({ recType: "Neutral" })).toBe(true);
    expect(isViewRow({ recType: "Hold" })).toBe(false);
  });
});

describe("currentViews — each contributor's latest view", () => {
  it("keeps the most recent per contributor", () => {
    const out = currentViews([v("Positive", { from: "a", created_at: "2025-01-01" }), v("Negative", { from: "a", created_at: "2025-04-01" }), v("Neutral", { from: "b" })], x => x.from);
    expect(out).toHaveLength(2);
    expect(out.find(x => x.from === "a").recommendation_type).toBe("Negative");
  });
  it("ignores recommendations", () => expect(currentViews([r("Buy")], x => x.from)).toEqual([]));
});

describe("viewThemes — contributors' own words, not a generated signal", () => {
  const rows = [
    v("Positive", { id: "1", thesis: "Deal wins are accelerating and **margins** are improving.", created_at: "2025-05-02" }),
    v("Positive", { id: "2", thesis: "Deal wins are accelerating and **margins** are improving.", created_at: "2025-05-01" }), // duplicate
    v("Negative", { id: "3", thesis: "Attrition remains a concern for the near term.", created_at: "2025-04-01" }),
    v("Neutral", { id: "4", thesis: "Wait and watch.", created_at: "2025-04-02" }),
    r("Buy", { id: "5", thesis: "Research thesis that must never appear" }),
  ];
  it("quotes positive themes and concerns, newest first, de-duplicated", () => {
    const t = viewThemes(rows, { nameOf: x => "n" + x.id });
    expect(t.positive.map(x => x.id)).toEqual(["1"]);
    expect(t.concerns.map(x => x.id)).toEqual(["3"]);
    expect(t.positive[0].text).toBe("Deal wins are accelerating and margins are improving.");
    expect(t.basis).toEqual({ positive: 2, concerns: 1 }); // views with commentary the snippets are drawn from
    expect(t.positive[0].by).toBe("n1");
  });
  it("neutral views and research never become themes", () => {
    const all = JSON.stringify(viewThemes(rows));
    expect(all).not.toContain("Wait and watch");
    expect(all).not.toContain("Research thesis");
  });
  it("a side with nothing to quote is empty so the caller can hide it", () => {
    expect(viewThemes([v("Positive", { id: "1", thesis: "Good." })]).concerns).toEqual([]);
    expect(viewThemes([v("Negative", { id: "1", thesis: "Bad." })]).positive).toEqual([]);
    expect(viewThemes([])).toEqual({ positive: [], concerns: [], basis: { positive: 0, concerns: 0 } });
  });
  it("keeps snippets short, however long the commentary", () => {
    const long = v("Positive", { id: "9", thesis: "word ".repeat(200) });
    const t = viewThemes([long]);
    expect(t.positive[0].text.length).toBeLessThanOrEqual(111);
    expect(t.positive[0].text.endsWith("…")).toBe(true);
  });
  it("shows at most three snippets per side", () => {
    const many = Array.from({ length: 8 }, (_, i) => v("Positive", { id: "p" + i, thesis: "Distinct positive point number " + i, created_at: "2025-06-0" + (i + 1) }));
    expect(viewThemes(many).positive).toHaveLength(3);
    expect(viewThemes(many).basis.positive).toBe(8);
  });
  it("uses no signal wording", () => {
    expect(JSON.stringify(viewThemes(rows))).not.toMatch(/bullish|bearish|strongly|buy|sell/i);
  });
});

describe("commentary helpers", () => {
  it("strips markup and keeps link labels", () => expect(commentaryOf("**Hi** [there](http://x.y) _you_")).toBe("Hi there you"));
  it("reads a serialised thesis", () => expect(commentaryOf(JSON.stringify({ __v: "1", text: "abc", images: ["x"] }))).toBe("abc"));
  it("excerpts on a word boundary", () => expect(excerpt("word ".repeat(50), 30).endsWith("…")).toBe(true));
});

describe("pageSections — what to show", () => {
  it.each([
    [{ research: 3, views: 0 }, { hasResearch: true, hasViews: false, hasAny: true }],
    [{ research: 0, views: 4 }, { hasResearch: false, hasViews: true, hasAny: true }],
    [{ research: 3, views: 4 }, { hasResearch: true, hasViews: true, hasAny: true }],
    [{ research: 0, views: 0 }, { hasResearch: false, hasViews: false, hasAny: false }],
    [{}, { hasResearch: false, hasViews: false, hasAny: false }],
  ])("%j", (input, out) => expect(pageSections(input)).toEqual(out));
});
