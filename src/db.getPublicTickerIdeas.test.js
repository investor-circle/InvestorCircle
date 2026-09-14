import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getPublicTickerIdeas } from "./db";

// getPublicTickerIdeas is the signed-out data path for the Stock Insights
// page (#/security/:ticker) — it must adapt public-ideas.js's by-symbol
// response into the same field shape getTickerRecos already returns, so
// SecurityIntelligencePage's rendering logic runs unmodified against either
// source. That adaptation is the one thing worth pinning here.

describe("getPublicTickerIdeas", () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it("adapts author_username/author_name into from/username/full_name", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        symbol: "RELIANCE",
        ideas: [{
          id: "i1", ticker: "RELIANCE", asset_name: "Reliance Industries",
          recommendation_type: "Buy", thesis: "Refining margins bottomed.",
          author_name: "Arjun V", author_username: "arjun_v",
          status: "Active", return_pct: 6.2,
        }],
      }),
    }));

    const rows = await getPublicTickerIdeas("RELIANCE");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      from: "arjun_v",
      username: "arjun_v",
      full_name: "Arjun V",
      status: "Active",
    });
  });

  it("returns an empty array when the ticker has no public ideas (404)", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 404 }));
    const rows = await getPublicTickerIdeas("NOSUCH");
    expect(rows).toEqual([]);
  });

  it("returns an empty array rather than throwing on a network failure", async () => {
    global.fetch = vi.fn(async () => { throw new Error("network down"); });
    const rows = await getPublicTickerIdeas("RELIANCE");
    expect(rows).toEqual([]);
  });

  it("returns an empty array for an empty ticker without fetching", async () => {
    global.fetch = vi.fn();
    const rows = await getPublicTickerIdeas("");
    expect(rows).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
