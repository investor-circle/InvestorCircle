import { tickerStats, buildAiSummary, investorsFor } from "./stockInsights";

// The "AI Summary" involves no model and no network call — it is a
// deterministic reading of the ideas, exactly as on the web. That is the
// property worth pinning: given the same recommendations it must say the
// same thing, and it must never assert more than the data supports.

const buy = (o = {}) => ({
  recommendation_type: "Buy",
  from: "u1",
  created_at: "2026-09-01T00:00:00.000Z",
  ...o,
});
const sell = (o = {}) => ({ ...buy(o), recommendation_type: "Sell", from: o.from ?? "u2" });

describe("statistics", () => {
  it("counts ideas and the distinct investors behind them", () => {
    const s = tickerStats([buy({ from: "a" }), buy({ from: "a" }), sell({ from: "b" })]);
    expect(s).toMatchObject({ total: 3, uniqueInvestors: 2 });
  });

  it("buckets by month, splitting buys from sells, oldest first", () => {
    const s = tickerStats([
      buy({ created_at: "2026-08-15T00:00:00Z" }),
      sell({ created_at: "2026-08-20T00:00:00Z" }),
      buy({ created_at: "2026-07-02T00:00:00Z" }),
    ]);
    expect(s.months).toEqual([
      { mo: "2026-07", buy: 1, sell: 0 },
      { mo: "2026-08", buy: 1, sell: 1 },
    ]);
  });

  it("handles a created_at that arrives as a Date, not a string", () => {
    // Neon hands back Date objects; String(date).slice(0,7) would give "Tue Se".
    const s = tickerStats([buy({ created_at: new Date("2026-08-15T00:00:00Z") })]);
    expect(s.months[0].mo).toBe("2026-08");
  });

  it("tallies convictions as given", () => {
    const s = tickerStats([buy({ conviction: "High" }), buy({ conviction: "High" }), buy({ conviction: "Low" })]);
    expect(s.convMap).toEqual({ High: 2, Low: 1 });
  });

  it("reports no exited ideas rather than inventing a number", () => {
    // The endpoint's rows carry no status column, so anything but zero here
    // would be made up. The tile stays, matching the web's grid.
    expect(tickerStats([buy()]).exited).toBe(0);
  });

  it("returns null when there is nothing to count", () => {
    expect(tickerStats([])).toBeNull();
    expect(tickerStats(null)).toBeNull();
  });
});

describe("the summary", () => {
  it("reads the sentiment off the consensus label, in the web's words", () => {
    expect(buildAiSummary([buy({ from: "a" }), buy({ from: "b" })]).sentiment).toBe("strongly bullish");
    expect(buildAiSummary([sell({ from: "a" }), sell({ from: "b" })]).sentiment).toBe("strongly bearish");
    expect(buildAiSummary([buy({ from: "a" }), sell({ from: "b" })]).sentiment).toBe("divided");
  });

  it("quotes the authors' own theses rather than paraphrasing them", () => {
    // This summarises what people said; it does not generate an opinion.
    const s = buildAiSummary([buy({ thesis: "Margins expanding on the services mix." })]);
    expect(s.bullThemes).toEqual(["Margins expanding on the services mix."]);
  });

  it("reads a thesis stored as the JSON envelope, not the raw column", () => {
    const raw = JSON.stringify({ __v: "1", text: "Cash conversion improving.", images: ["x"] });
    expect(buildAiSummary([buy({ thesis: raw })]).bullThemes).toEqual(["Cash conversion improving."]);
  });

  it("falls back to counting positions when nobody wrote a thesis", () => {
    const s = buildAiSummary([buy({ from: "a" }), buy({ from: "b" })]);
    expect(s.bullThemes).toEqual(["2 investors tracking as a Buy opportunity"]);
  });

  it("says plainly when there is no bearish view, rather than leaving a gap", () => {
    expect(buildAiSummary([buy()]).bearThemes).toEqual(["No bearish recommendations on record"]);
  });

  it("shows at most three themes a side", () => {
    const many = Array.from({ length: 6 }, (_, i) => buy({ from: `u${i}`, thesis: `t${i}` }));
    expect(buildAiSummary(many).bullThemes).toHaveLength(3);
  });

  it("counts high-conviction calls under both spellings the data uses", () => {
    const s = buildAiSummary([
      buy({ conviction: "High Conviction" }),
      buy({ conviction: "Very High" }),
      buy({ conviction: "Low" }),
    ]);
    expect(s.highConv).toBe(2);
  });

  it("counts distinct investors, not ideas", () => {
    expect(buildAiSummary([buy({ from: "a" }), buy({ from: "a" }), buy({ from: "b" })]).uniqueInv).toBe(2);
  });

  it("is deterministic — the same ideas produce the same summary", () => {
    const rows = [buy({ from: "a", thesis: "x" }), sell({ from: "b", thesis: "y" })];
    expect(buildAiSummary(rows)).toEqual(buildAiSummary(rows));
  });

  it("returns null when there is nothing to summarise", () => {
    expect(buildAiSummary([])).toBeNull();
    expect(buildAiSummary(null)).toBeNull();
  });
});

describe("investors on a ticker", () => {
  it("keeps one row per investor — their most recent call", () => {
    // The list arrives newest-first, so the first row seen for a uid is the
    // position that investor currently holds.
    const rows = [
      sell({ from: "a", created_at: "2026-09-02T00:00:00Z" }),
      buy({ from: "a", created_at: "2026-01-01T00:00:00Z" }),
      buy({ from: "b" }),
    ];
    const list = investorsFor(rows);
    expect(list).toHaveLength(2);
    expect(list[0].recommendation_type).toBe("Sell");
  });

  it("skips rows with no author instead of grouping them together", () => {
    expect(investorsFor([buy({ from: null }), buy({ from: undefined })])).toEqual([]);
  });

  it("survives an empty list", () => {
    expect(investorsFor(null)).toEqual([]);
  });
});
