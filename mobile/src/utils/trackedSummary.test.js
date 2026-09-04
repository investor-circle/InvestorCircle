import {
  priceKey,
  byTicker,
  trackedTickers,
  summariseTracked,
  topMovers,
  mapTrackedReco,
} from "./trackedSummary";

// The "My Tracked" widget's two modes answer different questions, and the web
// learned that the hard way: an earlier version computed an in/out-of-money
// delta for "since yesterday", but in-the-money is anchored to entry price and
// therefore cumulative, so the delta was almost always zero and both tabs
// showed the same thing. These lock the distinction in.

const idea = (o) => ({ ticker: "INFY", assetClass: "Equity", priceAt: 100, price: 110, ...o });

describe("price keys", () => {
  it("includes the asset class, because a ticker alone is not an instrument", () => {
    // An equity and an ETF can share a raw symbol. Keying on symbol alone
    // would attribute one instrument's daily move to the other.
    expect(priceKey("INFY", "Equity")).not.toBe(priceKey("INFY", "ETF"));
  });

  it("normalises case and whitespace on both halves", () => {
    expect(priceKey(" infy ", " equity ")).toBe(priceKey("INFY", "EQUITY"));
  });

  it("keys rows whether the API spells it assetClass or asset_class", () => {
    const map = byTicker([{ ticker: "INFY", asset_class: "Equity", changePct: 1 }]);
    expect(map[priceKey("INFY", "Equity")].changePct).toBe(1);
  });

  it("collects the distinct tickers a list needs prices for", () => {
    expect(trackedTickers([idea({}), idea({}), idea({ ticker: "tcs" }), idea({ ticker: "" })])).toEqual([
      "INFY",
      "TCS",
    ]);
  });
});

describe("since tracking — against the entry price", () => {
  it("counts an idea above its entry price as in profit", () => {
    const s = summariseTracked([idea({ priceAt: 100, price: 120 })], null);
    expect(s).toMatchObject({ total: 1, inMoney: 1, outMoney: 0 });
  });

  it("counts equal or below as behind, not in profit", () => {
    expect(summariseTracked([idea({ priceAt: 100, price: 100 })], null).inMoney).toBe(0);
    expect(summariseTracked([idea({ priceAt: 100, price: 90 })], null).inMoney).toBe(0);
  });

  it("does not count an idea with no entry price as a winner", () => {
    // Nothing to compare against; inflating the winners would flatter the
    // number that the whole product is about.
    expect(summariseTracked([idea({ priceAt: 0, price: 500 })], null).inMoney).toBe(0);
  });
});

describe("since yesterday — against the previous close", () => {
  const list = [
    idea({ id: 1, ticker: "UP" }),
    idea({ id: 2, ticker: "DOWN" }),
    idea({ id: 3, ticker: "FLAT" }),
    idea({ id: 4, ticker: "UNKNOWN" }),
  ];
  const prices = byTicker([
    { ticker: "UP", assetClass: "Equity", changePct: 2.4 },
    { ticker: "DOWN", assetClass: "Equity", changePct: -1.1 },
    { ticker: "FLAT", assetClass: "Equity", changePct: 0 },
  ]);

  it("splits up, down and no-data over the same total", () => {
    const s = summariseTracked(list, prices);
    expect(s).toMatchObject({ total: 4, up: 1, down: 1, noData: 2 });
    expect(s.up + s.down + s.noData).toBe(s.total);
  });

  it("counts a flat day as neither a gainer nor a loser", () => {
    // Rounding it into one would overstate whichever side it landed on.
    expect(summariseTracked([idea({ ticker: "FLAT" })], prices)).toMatchObject({ up: 0, down: 0, noData: 1 });
  });

  it("is a DIFFERENT answer from the entry-price split, not the same one relabelled", () => {
    // The bug this replaced: both tabs showing identical numbers.
    const s = summariseTracked(list, prices);
    expect([s.up, s.down]).not.toEqual([s.inMoney, s.outMoney]);
  });

  it("treats everything as unknown while prices are still loading", () => {
    const s = summariseTracked(list, null);
    expect(s).toMatchObject({ up: 0, down: 0, noData: 4, hasDaily: false });
  });

  it("still reports the entry-price split with no prices at all", () => {
    // The widget must render something useful before the price call lands.
    expect(summariseTracked(list, null).inMoney).toBe(4);
  });
});

describe("biggest movers", () => {
  const list = [
    idea({ id: 1, ticker: "SMALL" }),
    idea({ id: 2, ticker: "BIG" }),
    idea({ id: 3, ticker: "SINKING" }),
    idea({ id: 4, ticker: "NOPRICE" }),
    idea({ id: 5, ticker: "FLAT" }),
  ];
  const prices = byTicker([
    { ticker: "SMALL", assetClass: "Equity", changePct: 0.4 },
    { ticker: "BIG", assetClass: "Equity", changePct: 3.2 },
    { ticker: "SINKING", assetClass: "Equity", changePct: -7.5 },
    { ticker: "FLAT", assetClass: "Equity", changePct: 0 },
  ]);

  it("ranks by size of move, in either direction", () => {
    // A 7% fall is bigger news than a 3% rise.
    expect(topMovers(list, prices, 3).map((m) => m.reco.ticker)).toEqual(["SINKING", "BIG", "SMALL"]);
  });

  it("drops ideas with no snapshot rather than sorting them as zero", () => {
    // Sorted as zero they would park in the middle as though they hadn't moved.
    const tickers = topMovers(list, prices, 5).map((m) => m.reco.ticker);
    expect(tickers).not.toContain("NOPRICE");
    expect(tickers).not.toContain("FLAT");
  });

  it("returns nothing before prices arrive", () => {
    expect(topMovers(list, null)).toEqual([]);
  });

  it("respects the limit", () => {
    expect(topMovers(list, prices, 1)).toHaveLength(1);
  });
});

describe("reshaping the API row", () => {
  it("maps the fields the widget reads, coercing the numeric ones", () => {
    const m = mapTrackedReco({
      id: 7,
      ticker: "INFY",
      asset_name: "Infosys",
      asset_class: "Equity",
      reco_price: "100.5",
      current_price: "110.25",
      created_at: "2026-09-01T10:20:30.000Z",
      recommender_id: "u1",
      comment_count: "3",
    });
    expect(m).toMatchObject({
      id: 7,
      ticker: "INFY",
      assetName: "Infosys",
      assetClass: "Equity",
      priceAt: 100.5,
      price: 110.25,
      date: "2026-09-01",
      from: "u1",
      commentCount: 3,
    });
  });

  it("survives a row with nothing in it", () => {
    const m = mapTrackedReco({});
    expect(m.priceAt).toBe(0);
    expect(m.date).toBeNull();
  });
});

describe("empty state", () => {
  it("reports zeroes rather than throwing on an empty or missing list", () => {
    for (const l of [[], null, undefined]) {
      expect(summariseTracked(l, null)).toMatchObject({ total: 0, inMoney: 0, outMoney: 0 });
    }
    expect(trackedTickers(null)).toEqual([]);
    expect(byTicker(null)).toEqual({});
  });
});
