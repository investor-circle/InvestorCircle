import {
  buildHoldingsData,
  opportunitySignals,
  filterHoldings,
  assetClassOptions,
  holdingAssetClass,
  holdingPriceIdentifier,
  SIGNAL_LABEL,
} from "./portfolioSignals";
import { byTicker } from "./trackedSummary";

// Opportunity Signals are the portfolio's headline: four cards claiming to
// tell you what to look at. The failure that matters is not a crash — it is
// four cards all showing the same stock, which is what happens without the
// dedupe while one holding leads every category at once.

const hold = (o) => ({ sym: "INFY", name: "Infosys", type: "Stock", sh: 10, cost: 100, price: 120, ...o });
const buy = (o = {}) => ({ recommendation_type: "Buy", from: "u1", created_at: new Date().toISOString(), ...o });
const sell = (o = {}) => ({ recommendation_type: "Sell", from: "u2", created_at: new Date().toISOString(), ...o });

// The price rows below carry assetClass "Equity", not "Stock", because that
// is what the pricing endpoint actually returns (`assetClass: r.asset_class`,
// the INSTRUMENT's class) for a holding whose own `type` is "Stock". Getting
// this pair wrong is invisible: the lookup misses, dailyChangePct stays null,
// and the "Daily mover" card just never appears.
describe("addressing the daily-price table", () => {
  it("translates a holding's type into the instrument's asset class", () => {
    expect(holdingAssetClass({ type: "Stock" })).toBe("Equity");
    expect(holdingAssetClass({ type: "ETF" })).toBe("ETF");
    expect(holdingAssetClass({ type: "Fund" })).toBe("Mutual Funds");
    expect(holdingAssetClass({})).toBe("Equity");
  });

  it("prices a mutual fund by ISIN and everything else by symbol", () => {
    expect(holdingPriceIdentifier({ type: "Fund", sym: "PPFAS", isin: "inf879k01" })).toBe("INF879K01");
    expect(holdingPriceIdentifier({ type: "Stock", sym: " infy " })).toBe("INFY");
    expect(holdingPriceIdentifier({})).toBe("");
  });

  it("matches a snapshot for a stock holding end to end", () => {
    const prices = byTicker([{ ticker: "INFY", assetClass: "Equity", close: 150, changePct: 2 }]);
    const [h] = buildHoldingsData([hold({ type: "Stock" })], {}, [], prices);
    expect(h.dailyChangePct).toBe(2);
  });

  it("matches a fund's snapshot by its ISIN", () => {
    const prices = byTicker([{ ticker: "INF879K01", assetClass: "Mutual Funds", close: 60, changePct: 0.4 }]);
    const [h] = buildHoldingsData(
      [hold({ sym: "PPFAS", type: "Fund", isin: "INF879K01" })],
      {},
      [],
      prices
    );
    expect(h.price).toBe(60);
    expect(h.dailyChangePct).toBe(0.4);
  });
});

describe("joining holdings to what people think of them", () => {
  it("matches ideas case-insensitively", () => {
    // CAS imports arrive in the registrar's casing; matching on it exactly
    // would silently pair a holding with nothing.
    const [h] = buildHoldingsData([hold({ sym: "infy" })], { INFY: [buy(), buy()] });
    expect(h.community.total).toBe(2);
  });

  it("separates the circle's view from the community's", () => {
    const [h] = buildHoldingsData(
      [hold({})],
      { INFY: [buy({ from: "friend" }), sell({ from: "stranger" })] },
      ["friend"]
    );
    expect(h.community.total).toBe(2);
    expect(h.circle.total).toBe(1);
    expect(h.circle.bullPct).toBe(100);
  });

  it("prefers a live snapshot over the stored price", () => {
    // A portfolio priced from a stale column reports days-old gains without
    // saying so.
    const prices = byTicker([{ ticker: "INFY", assetClass: "Equity", close: 150, changePct: 1.5 }]);
    const [h] = buildHoldingsData([hold({ price: 120 })], {}, [], prices);
    expect(h.price).toBe(150);
    expect(h.value).toBe(1500);
    expect(h.gain).toBeCloseTo(50, 5);
    expect(h.dailyChangePct).toBe(1.5);
  });

  it("falls back to the stored price when there is no snapshot", () => {
    const [h] = buildHoldingsData([hold({ price: 120 })], {}, [], byTicker([]));
    expect(h.price).toBe(120);
    expect(h.dailyChangePct).toBeNull();
  });

  it("does not divide by a zero cost", () => {
    const [h] = buildHoldingsData([hold({ cost: 0 })], {});
    expect(h.gain).toBe(0);
  });
});

describe("opportunity signals", () => {
  const many = (n, o) => Array.from({ length: n }, () => buy(o));

  it("never shows the same holding in two cards", () => {
    // One dominant holding leads every category at once while the platform
    // is small; without the dedupe all four cards are the same stock.
    const data = buildHoldingsData(
      [hold({ sym: "STAR" })],
      { STAR: many(5, {}) },
      [],
      byTicker([{ ticker: "STAR", assetClass: "Equity", close: 100, changePct: 9 }])
    );
    const cards = opportunitySignals(data);
    const syms = cards.map((c) => c.holding.sym);
    expect(new Set(syms).size).toBe(syms.length);
  });

  it("produces at most four cards, in a fixed narrative order", () => {
    const data = buildHoldingsData(
      [hold({ sym: "A" }), hold({ sym: "B" }), hold({ sym: "C" }), hold({ sym: "D" }), hold({ sym: "E" })],
      {
        A: many(6, {}),
        B: many(4, {}),
        C: many(4, {}),
        D: many(4, {}),
        E: many(4, {}),
      },
      [],
      byTicker([{ ticker: "B", assetClass: "Equity", close: 100, changePct: 8 }])
    );
    const cards = opportunitySignals(data);
    expect(cards.length).toBeLessThanOrEqual(4);
    const kinds = cards.map((c) => c.kind);
    expect(kinds).toEqual([...kinds].sort((a, b) => {
      const order = ["strong", "mover", "diverging", "emerging"];
      return order.indexOf(a) - order.indexOf(b);
    }));
  });

  it("flags a daily mover only past the threshold", () => {
    const near = buildHoldingsData([hold({ sym: "SMALL" })], {},
      [], byTicker([{ ticker: "SMALL", assetClass: "Equity", close: 1, changePct: 1.9 }]));
    const past = buildHoldingsData([hold({ sym: "BIG" })], {},
      [], byTicker([{ ticker: "BIG", assetClass: "Equity", close: 1, changePct: 2.1 }]));
    expect(opportunitySignals(near).some((c) => c.kind === "mover")).toBe(false);
    expect(opportunitySignals(past).some((c) => c.kind === "mover")).toBe(true);
  });

  it("flags a falling stock as a mover too, not only a rising one", () => {
    const data = buildHoldingsData([hold({ sym: "DROP" })], {},
      [], byTicker([{ ticker: "DROP", assetClass: "Equity", close: 1, changePct: -7 }]));
    expect(opportunitySignals(data).some((c) => c.kind === "mover")).toBe(true);
  });

  it("flags a circle that is materially less bullish than the community", () => {
    const data = buildHoldingsData(
      [hold({ sym: "SPLIT" })],
      { SPLIT: [buy({ from: "a" }), buy({ from: "b" }), buy({ from: "c" }), sell({ from: "f1" }), sell({ from: "f2" })] },
      ["f1", "f2"]
    );
    expect(opportunitySignals(data).some((c) => c.kind === "diverging")).toBe(true);
  });

  it("does not call a thin sample diverging", () => {
    // One friend disagreeing is not a signal.
    const data = buildHoldingsData(
      [hold({ sym: "THIN" })],
      { THIN: [buy({ from: "a" }), sell({ from: "f1" })] },
      ["f1"]
    );
    expect(opportunitySignals(data).some((c) => c.kind === "diverging")).toBe(false);
  });

  it("flags recent interest in a barely-covered stock as emerging", () => {
    // Deliberately mixed, so it does NOT also clear the strong-conviction
    // bar — that category claims first, and a fixture that qualifies for
    // both would test the dedupe rather than the emerging rule.
    const data = buildHoldingsData([hold({ sym: "NEW" })], {
      NEW: [buy({ from: "a" }), buy({ from: "b" }), sell({ from: "c" })],
    });
    expect(opportunitySignals(data).some((c) => c.kind === "emerging")).toBe(true);
  });

  it("gives a holding to the FIRST category that claims it", () => {
    // A unanimous, recent, barely-covered stock qualifies as both strong
    // conviction and emerging. It appears once, under the earlier category.
    const data = buildHoldingsData([hold({ sym: "BOTH" })], {
      BOTH: [buy({ from: "a" }), buy({ from: "b" })],
    });
    const cards = opportunitySignals(data);
    expect(cards).toHaveLength(1);
    expect(cards[0].kind).toBe("strong");
  });

  it("does not call a long-covered stock emerging", () => {
    const old = new Date(Date.now() - 200 * 86400000).toISOString();
    const data = buildHoldingsData([hold({ sym: "OLD" })], {
      OLD: [buy({ from: "a", created_at: old }), buy({ from: "b", created_at: old })],
    });
    expect(opportunitySignals(data).some((c) => c.kind === "emerging")).toBe(false);
  });

  it("returns nothing at all for an empty portfolio", () => {
    expect(opportunitySignals([])).toEqual([]);
    expect(opportunitySignals(null)).toEqual([]);
  });

  it("labels every kind it can emit", () => {
    for (const kind of ["strong", "mover", "diverging", "emerging"]) {
      expect(SIGNAL_LABEL[kind]).toBeTruthy();
    }
  });
});

describe("filters", () => {
  const data = buildHoldingsData(
    [hold({ sym: "BULL" }), hold({ sym: "BEAR" }), hold({ sym: "MIXED" }), hold({ sym: "GOLD", type: "ETF" })],
    {
      BULL: [buy({ from: "a" }), buy({ from: "b" })],
      BEAR: [sell({ from: "a" }), sell({ from: "b" })],
      MIXED: [buy({ from: "a" }), sell({ from: "b" })],
      GOLD: [buy({ from: "a" })],
    }
  );
  const syms = (o) => filterHoldings(data, o).map((h) => h.sym);

  it("filters by signal", () => {
    expect(syms({ signal: "bullish" })).toEqual(expect.arrayContaining(["BULL", "GOLD"]));
    expect(syms({ signal: "bearish" })).toEqual(["BEAR"]);
    expect(syms({ signal: "neutral" })).toEqual(["MIXED"]);
  });

  it("filters by asset class", () => {
    expect(syms({ assetClass: "ETF" })).toEqual(["GOLD"]);
  });

  it("IGNORES an asset class the portfolio does not hold", () => {
    // The web defaults this to 'Stock'; a portfolio of only ETFs would
    // otherwise open filtered to nothing with no visible way to undo it.
    expect(syms({ assetClass: "Bond" })).toHaveLength(4);
  });

  it("searches symbol and name, case-insensitively", () => {
    expect(syms({ search: "bull" })).toEqual(["BULL"]);
    expect(syms({ search: "infosys" })).toHaveLength(4); // every fixture shares the name
  });

  it("combines all three", () => {
    expect(syms({ signal: "bullish", assetClass: "ETF", search: "go" })).toEqual(["GOLD"]);
  });

  it("lists the asset classes actually held, sorted", () => {
    expect(assetClassOptions(data)).toEqual(["ETF", "Stock"]);
    expect(assetClassOptions([])).toEqual([]);
  });

  it("survives an empty portfolio", () => {
    expect(filterHoldings(null, {})).toEqual([]);
    expect(filterHoldings([], undefined)).toEqual([]);
  });
});
