import {
  RECOMMENDATION_TYPES, MARKET_VIEW_TYPES, DEFAULT_MARKET_VIEW_DISCLOSURE, publishingPersona,
  ideaTypeMeta, isMarketViewIdea, onlyRecommendations, commentaryText,
} from "./ideaType";
import { returnPct } from "./format";
import { computeConsensus, computeTrend } from "./consensus";
import { tickerStats, buildAiSummary } from "./stockInsights";

describe("publishingPersona", () => {
  it("is verified_publisher only for an APPROVED Verified Research Publisher", () => {
    expect(publishingPersona("verified_research_publisher", "approved")).toBe("verified_publisher");
  });
  it("is contributor for everyone else, including pending / rejected publishers", () => {
    for (const ap of ["pending", "rejected", "not_applied", null, undefined]) {
      expect(publishingPersona("verified_research_publisher", ap)).toBe("contributor");
    }
    expect(publishingPersona("independent_market_contributor", "approved")).toBe("contributor");
    expect(publishingPersona(undefined, undefined)).toBe("contributor");
  });
});

describe("types", () => {
  it("has the two families", () => {
    expect(RECOMMENDATION_TYPES).toEqual(["Buy", "Hold", "Sell"]);
    expect(MARKET_VIEW_TYPES).toEqual(["Positive", "Neutral", "Negative"]);
  });
  it("labels and tones every type; unknown falls back to Buy", () => {
    expect(ideaTypeMeta("Hold").tone).toBe("muted");
    expect(ideaTypeMeta("Positive")).toEqual({ label: "Positive", tone: "gain" });
    expect(ideaTypeMeta("Negative")).toEqual({ label: "Negative", tone: "loss" });
    expect(ideaTypeMeta("Neutral").tone).toBe("muted");
    expect(ideaTypeMeta(undefined).label).toBe("Buy");
  });
  it("recognises a Market View from either row shape", () => {
    expect(isMarketViewIdea({ recType: "Neutral" })).toBe(true);
    expect(isMarketViewIdea({ recommendation_type: "Positive" })).toBe(true);
    expect(isMarketViewIdea({ recType: "Hold" })).toBe(false);
    expect(onlyRecommendations([{ recType: "Buy" }, { recType: "Positive" }])).toHaveLength(1);
  });
  it("default disclosure carries the three required statements", () => {
    expect(DEFAULT_MARKET_VIEW_DISCLOSURE).toMatch(/personal, independent market view/i);
    expect(DEFAULT_MARKET_VIEW_DISCLOSURE).toMatch(/not presenting myself as a SEBI-registered Research Analyst/i);
    expect(DEFAULT_MARKET_VIEW_DISCLOSURE).toMatch(/not investment advice/i);
  });
  it("reads commentary from plain and serialised theses", () => {
    expect(commentaryText(JSON.stringify({ __v: "1", text: "hello there", images: ["x"] }))).toBe("hello there");
  });
});

// A Market View must never be scored or counted as a recommendation.
describe("Market Views stay out of performance and consensus", () => {
  it("has no return, whatever the stored prices are", () => {
    expect(returnPct({ recType: "Positive", priceAt: 100, price: 150 })).toBe(0);
    expect(returnPct({ recType: "Negative", priceAt: 100, price: 150 })).toBe(0);
    expect(returnPct({ recType: "Buy", priceAt: 100, price: 150 })).toBeCloseTo(0.5);
    expect(returnPct({ recType: "Sell", priceAt: 100, price: 150 })).toBeCloseTo(-0.5);
  });
  it("does not dilute consensus or the monthly trend", () => {
    const now = new Date().toISOString();
    const base = [{ recommendation_type: "Buy", created_at: now }, { recommendation_type: "Sell", created_at: now }];
    const withViews = [...base, { recommendation_type: "Positive", created_at: now }, { recommendation_type: "Neutral", created_at: now }];
    expect(computeConsensus(withViews)).toEqual(computeConsensus(base));
    expect(computeTrend(withViews)).toEqual(computeTrend(base));
  });
  it("is left out of ticker statistics and the summary", () => {
    const rows = [
      { recommendation_type: "Buy", created_at: "2025-01-02", from: "a", thesis: "good" },
      { recommendation_type: "Positive", created_at: "2025-01-03", from: "b", thesis: "nice" },
    ];
    expect(tickerStats(rows).total).toBe(1);
    expect(buildAiSummary([rows[1]])).toBeNull();
  });
});
