import {
  buildTickerList,
  featuredTickers,
  groupByTicker,
  sectorOptions,
  avgConviction,
  recencyFactor,
  daysSinceLastActivity,
} from "./marketInsights";

// Ported from the web's MarketIntelligencePage. The numbers on this page are
// the platform's opinion of a stock, so the risk is not that it crashes — it
// is that it ranks differently from the web and nobody notices. These pin the
// decisions the web made deliberately, in its own words, rather than whatever
// the port happened to compute.

const DAY = 86400000;
const NOW = Date.UTC(2026, 8, 3);
const ago = (days) => new Date(NOW - days * DAY).toISOString();

const reco = (o) => ({
  ticker: "INFY",
  asset_name: "Infosys",
  sector: "IT",
  recommendation_type: "Buy",
  conviction: "Medium",
  created_at: ago(1),
  from: "u1",
  ...o,
});

describe("grouping", () => {
  it("groups ideas by ticker, keeping the name and sector", () => {
    const map = groupByTicker([reco({}), reco({ ticker: "TCS", asset_name: "TCS Ltd", sector: "IT" })]);
    expect(Object.keys(map).sort()).toEqual(["INFY", "TCS"]);
    expect(map.INFY).toMatchObject({ name: "Infosys", sector: "IT" });
    expect(map.INFY.recos).toHaveLength(1);
  });

  it("skips ideas with no ticker instead of grouping them under one blank", () => {
    expect(Object.keys(groupByTicker([reco({ ticker: null }), reco({ ticker: "" })]))).toEqual([]);
  });

  it("survives an empty or missing list", () => {
    expect(groupByTicker([])).toEqual({});
    expect(groupByTicker(null)).toEqual({});
    expect(buildTickerList(null)).toEqual([]);
  });
});

describe("the My Circle tab", () => {
  const recos = [
    reco({ from: "friend" }),
    reco({ from: "stranger" }),
    reco({ ticker: "TCS", from: "stranger" }),
  ];

  it("counts only ideas from the viewer's connections", () => {
    const list = buildTickerList(recos, { tab: "circle", circleIds: ["friend"] });
    expect(list.map((t) => t.ticker)).toEqual(["INFY"]); // TCS has no circle idea
    expect(list[0].filteredRecos).toHaveLength(1);
  });

  it("still reports the community-wide consensus alongside the circle's", () => {
    // The row shows both, so filtering the tab must not erase the wider view.
    const [infy] = buildTickerList(recos, { tab: "circle", circleIds: ["friend"] });
    expect(infy.community.total).toBe(2);
    expect(infy.circle.total).toBe(1);
  });

  it("drops a ticker nobody in the circle has an idea on", () => {
    expect(buildTickerList(recos, { tab: "circle", circleIds: ["nobody"] })).toEqual([]);
  });
});

describe("filters", () => {
  const recos = [reco({}), reco({ ticker: "HDFCBANK", asset_name: "HDFC Bank", sector: "Financials" })];

  it("filters by sector", () => {
    expect(buildTickerList(recos, { sector: "IT" }).map((t) => t.ticker)).toEqual(["INFY"]);
  });

  it("searches the ticker case-insensitively and the name too", () => {
    expect(buildTickerList(recos, { search: "hdfc" }).map((t) => t.ticker)).toEqual(["HDFCBANK"]);
    expect(buildTickerList(recos, { search: "Bank" }).map((t) => t.ticker)).toEqual(["HDFCBANK"]);
  });

  it("offers every sector present, with 'all' first", () => {
    expect(sectorOptions(recos)).toEqual(["all", "IT", "Financials"]);
    expect(sectorOptions([reco({ sector: null })])).toEqual(["all"]);
  });
});

describe("sorting", () => {
  const recos = [
    // AAA: unanimous (strength 100), 2 ideas, oldest
    reco({ ticker: "AAA", created_at: ago(40) }),
    reco({ ticker: "AAA", created_at: ago(40) }),
    // BBB: split (strength 0), 4 ideas
    reco({ ticker: "BBB", recommendation_type: "Buy", created_at: ago(10) }),
    reco({ ticker: "BBB", recommendation_type: "Buy", created_at: ago(10) }),
    reco({ ticker: "BBB", recommendation_type: "Sell", created_at: ago(10) }),
    reco({ ticker: "BBB", recommendation_type: "Sell", created_at: ago(10) }),
    // CCC: unanimous, 1 idea, newest
    reco({ ticker: "CCC", created_at: ago(1) }),
  ];
  const order = (sortBy) => buildTickerList(recos, { sortBy }).map((t) => t.ticker);

  it("leads with the most one-sided consensus by default", () => {
    // This page's stated purpose is sentiment, not volume.
    expect(order("strength")[0]).toMatch(/AAA|CCC/);
    expect(order("strength")[2]).toBe("BBB");
  });

  it("breaks a strength tie on investor count", () => {
    // AAA and CCC are both unanimous; AAA has more people behind it.
    const strong = order("strength").slice(0, 2);
    expect(strong).toEqual(["AAA", "CCC"]);
  });

  it("sorts by most recent, most investors, and alphabetically", () => {
    expect(order("recent")[0]).toBe("CCC");
    expect(order("investors")[0]).toBe("BBB");
    expect(order("alpha")).toEqual(["AAA", "BBB", "CCC"]);
  });
});

describe("recency weighting", () => {
  it("halves a ticker's weight every 30 days, and never blanks it out", () => {
    expect(recencyFactor([reco({ created_at: ago(0) })], NOW)).toBeCloseTo(1, 5);
    expect(recencyFactor([reco({ created_at: ago(30) })], NOW)).toBeCloseTo(0.5, 5);
    expect(recencyFactor([reco({ created_at: ago(60) })], NOW)).toBeCloseTo(0.25, 5);
    // A gentle multiplier, not a filter: an old ticker still ranks.
    expect(recencyFactor([reco({ created_at: ago(365) })], NOW)).toBeGreaterThan(0);
  });

  it("measures from the LATEST idea, not the oldest", () => {
    const recos = [reco({ created_at: ago(200) }), reco({ created_at: ago(2) })];
    expect(daysSinceLastActivity(recos, NOW)).toBeCloseTo(2, 5);
  });

  it("treats a ticker with no usable dates as infinitely stale, without throwing", () => {
    expect(daysSinceLastActivity([reco({ created_at: "not a date" })], NOW)).toBe(Infinity);
    expect(recencyFactor([], NOW)).toBe(0);
  });
});

describe("the four featured cards", () => {
  const recos = [
    // STRONG: unanimous buy, recent, low conviction
    ...Array.from({ length: 3 }, () => reco({ ticker: "STRONG", conviction: "Low", created_at: ago(1) })),
    // CONVICT: unanimous too, but every recommender rated it High
    ...Array.from({ length: 2 }, () => reco({ ticker: "CONVICT", conviction: "High", created_at: ago(1) })),
    // CHATTY: many ideas, mixed enough not to win on strength
    ...Array.from({ length: 5 }, (_, i) =>
      reco({ ticker: "CHATTY", recommendation_type: i < 3 ? "Buy" : "Sell", conviction: "Low", created_at: ago(1) })
    ),
    // SPLIT: an even 2/2 — the most divided
    ...Array.from({ length: 2 }, () => reco({ ticker: "SPLIT", recommendation_type: "Buy", conviction: "Low", created_at: ago(1) })),
    ...Array.from({ length: 2 }, () => reco({ ticker: "SPLIT", recommendation_type: "Sell", conviction: "Low", created_at: ago(1) })),
  ];
  const picks = () => featuredTickers(buildTickerList(recos), NOW);

  it("never features the same ticker twice", () => {
    // Otherwise all four cards collapse onto one dominant stock while the
    // platform is small.
    const chosen = Object.values(picks()).filter(Boolean).map((t) => t.ticker);
    expect(new Set(chosen).size).toBe(chosen.length);
  });

  it("picks the most one-sided for Strongest Consensus", () => {
    expect(picks().strongest.ticker).toMatch(/STRONG|CONVICT/);
  });

  it("picks on rated conviction, not on agreement, for Highest Conviction", () => {
    // The distinct signal: how sure the recommenders said they were.
    expect(picks().highConviction.ticker).toBe("CONVICT");
  });

  it("picks the busiest ticker for Most Discussed", () => {
    expect(picks().mostDiscussed.ticker).toBe("CHATTY");
  });

  it("picks the ticker closest to an even split for Most Divided", () => {
    // Sorting by distance-from-50 descending puts the LEAST divided first —
    // that bug once had a unanimous stock winning "Most Divided".
    expect(picks().mostDivided.ticker).toBe("SPLIT");
  });

  it("requires a real sample before calling anything divided", () => {
    // A single Buy and a single Sell is not a debate.
    const thin = buildTickerList([
      reco({ ticker: "TINY", recommendation_type: "Buy" }),
      reco({ ticker: "TINY", recommendation_type: "Sell" }),
    ]);
    expect(featuredTickers(thin, NOW).mostDivided).toBeNull();
  });

  it("leaves a card empty rather than repeating a ticker already shown", () => {
    const one = buildTickerList([reco({ ticker: "ONLY" })]);
    const p = featuredTickers(one, NOW);
    expect(p.strongest.ticker).toBe("ONLY");
    expect(p.highConviction).toBeNull();
    expect(p.mostDiscussed).toBeNull();
    expect(p.mostDivided).toBeNull();
  });

  it("returns nothing at all when there is no data", () => {
    expect(featuredTickers([], NOW)).toEqual({
      strongest: null,
      highConviction: null,
      mostDiscussed: null,
      mostDivided: null,
    });
  });

  it("prefers current discussion over a dormant ticker with the same split", () => {
    const list = buildTickerList([
      ...Array.from({ length: 2 }, () => reco({ ticker: "OLD", created_at: ago(180) })),
      ...Array.from({ length: 2 }, () => reco({ ticker: "NEW", created_at: ago(1) })),
    ]);
    expect(featuredTickers(list, NOW).strongest.ticker).toBe("NEW");
  });
});

describe("conviction averaging", () => {
  it("scores High/Medium/Low and ignores anything else", () => {
    expect(avgConviction([reco({ conviction: "High" }), reco({ conviction: "Low" })])).toBe(2);
    expect(avgConviction([reco({ conviction: "Wat" })])).toBe(0);
    expect(avgConviction([])).toBe(0);
  });
});
