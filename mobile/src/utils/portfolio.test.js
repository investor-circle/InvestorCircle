import { buildHolding, validateHolding, newHoldingId, portfolioTotals } from "./portfolio";

// portfolio-add is one of the few endpoints that takes a CLIENT-supplied
// primary key and trusts the client to shape the row (the server's
// holdingFields() only coerces types, it doesn't fill anything in). So a
// wrong shape here writes a wrong row to the database rather than failing
// loudly — hence pinning the exact payload.

describe("buildHolding — the portfolio-add payload", () => {
  const form = {
    ticker: " infy ",
    name: "  Infosys Ltd ",
    assetType: "Stock",
    sector: " IT ",
    currency: "INR",
    qty: "10",
    purchPrice: "1500.50",
  };

  it("produces exactly the fields holdingFields() reads", () => {
    const h = buildHolding(form, { id: "hold_fixed", today: new Date("2026-08-31T00:00:00Z") });
    expect(h).toEqual({
      id: "hold_fixed",
      sym: "INFY",
      name: "Infosys Ltd",
      type: "Stock",
      acct: "manual",
      acctName: "Manual Portfolio",
      sh: 10,
      cost: 1500.5,
      price: 1500.5,
      isin: "",
      sector: "IT",
      currency: "INR",
      purchaseDate: "2026-08-31",
      source: "manual",
    });
  });

  it("seeds price from cost so a new holding reads 0%, not -100%", () => {
    // The server stores price as given; if we sent 0 the portfolio would show
    // the holding as a total loss until the nightly price run caught up.
    const h = buildHolding(form);
    expect(h.price).toBe(h.cost);
    expect(portfolioTotals([h]).pct).toBe(0);
  });

  it("allows a watch-only holding with no quantity or price", () => {
    const h = buildHolding({ ticker: "TCS", name: "TCS Ltd" });
    expect(h.sh).toBe(0);
    expect(h.cost).toBe(0);
    // Must be numbers, not NaN — holdingFields does Number(h.sh) || 0, but a
    // NaN here would still be wrong on the optimistic row we render locally.
    expect(Number.isFinite(h.sh)).toBe(true);
    expect(Number.isFinite(h.cost)).toBe(true);
  });

  it("generates ids in the web app's format", () => {
    expect(newHoldingId(1756600000000, () => 0.123456)).toMatch(/^hold_1756600000000_[a-z0-9]+$/);
    // Two ids generated in the same millisecond must still differ.
    expect(newHoldingId(1, () => 0.1)).not.toBe(newHoldingId(1, () => 0.9));
  });
});

describe("validateHolding", () => {
  it("requires ticker and name, in that order", () => {
    expect(validateHolding({})).toMatch(/Ticker/);
    expect(validateHolding({ ticker: "INFY" })).toMatch(/name/i);
    expect(validateHolding({ ticker: "INFY", name: "Infosys" })).toBeNull();
  });

  it("rejects whitespace-only entries", () => {
    expect(validateHolding({ ticker: "   ", name: "Infosys" })).toMatch(/Ticker/);
    expect(validateHolding({ ticker: "INFY", name: "   " })).toMatch(/name/i);
  });

  it("rejects non-numeric or negative quantity and price", () => {
    const base = { ticker: "INFY", name: "Infosys" };
    expect(validateHolding({ ...base, qty: "abc" })).toMatch(/Quantity/);
    expect(validateHolding({ ...base, qty: "-5" })).toMatch(/Quantity/);
    expect(validateHolding({ ...base, purchPrice: "-1" })).toMatch(/Buy price/);
    // Empty is fine — those fields are optional.
    expect(validateHolding({ ...base, qty: "", purchPrice: "" })).toBeNull();
  });
});

describe("portfolioTotals", () => {
  it("sums value and cost and derives P&L", () => {
    const t = portfolioTotals([
      { sh: 10, cost: 100, price: 130 }, // 1000 -> 1300
      { sh: 5, cost: 200, price: 180 }, // 1000 -> 900
    ]);
    expect(t.cost).toBe(2000);
    expect(t.value).toBe(2200);
    expect(t.pnl).toBe(200);
    expect(t.pct).toBeCloseTo(0.1);
  });

  it("returns zeros rather than NaN for empty, null and malformed rows", () => {
    for (const input of [[], null, undefined, [null, {}, { sh: "x", cost: "y", price: "z" }]]) {
      const t = portfolioTotals(input);
      expect(t).toEqual({ value: 0, cost: 0, pnl: 0, pct: 0 });
    }
  });

  it("does not divide by zero when nothing was paid", () => {
    // Watch-only holdings have cost 0; pct must be 0, not Infinity.
    expect(portfolioTotals([{ sh: 1, cost: 0, price: 50 }]).pct).toBe(0);
  });
});
