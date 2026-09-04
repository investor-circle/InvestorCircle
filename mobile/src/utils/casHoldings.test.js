import { holdingKey, importableHoldings, splitAgainstExisting, importValue } from "./casHoldings";

// CAS import writes many rows into someone's real portfolio in one tap, with
// no per-row confirmation. The properties that matter are therefore: it never
// adds something already there, never adds the same row twice from one
// statement, and never silently adds junk.

const eq = (over = {}) => ({ sym: "INFY", name: "Infosys", type: "Stock", sh: 10, cost: 1400, price: 1500, isin: "INE009A01021", ...over });
const mf = (over = {}) => ({ sym: "", name: "Parag Parikh Flexi Cap", type: "Fund", sh: 120.5, cost: 55, price: 72, isin: "INF879O01027", ...over });

describe("holdingKey — what counts as the same holding", () => {
  it("prefers ISIN, which is the reliable key for funds", () => {
    expect(holdingKey({ isin: "INE009A01021", sym: "INFY" })).toBe("isin:INE009A01021");
  });

  it("falls back to symbol when there is no ISIN", () => {
    expect(holdingKey({ sym: "INFY" })).toBe("sym:INFY");
  });

  it("ignores case and whitespace so formatting differences don't duplicate", () => {
    expect(holdingKey({ isin: " ine009a01021 " })).toBe(holdingKey({ isin: "INE009A01021" }));
    expect(holdingKey({ sym: " infy " })).toBe(holdingKey({ sym: "INFY" }));
  });

  it("returns empty for a row with no identity at all", () => {
    for (const h of [{}, null, undefined, { isin: "  ", sym: "" }]) {
      expect(holdingKey(h)).toBe("");
    }
  });
});

describe("importableHoldings — what is worth importing", () => {
  it("combines both sections of the statement", () => {
    const out = importableHoldings({ equity: [eq()], mf: [mf()] });
    expect(out).toHaveLength(2);
  });

  it("drops closed positions the statement still lists", () => {
    // A CAS lists sold-out schemes with zero units; importing those would add
    // zero-value clutter the user then has to delete by hand.
    const out = importableHoldings({ equity: [eq({ sh: 0 }), eq({ sym: "TCS", isin: "", sh: -5 })], mf: [] });
    expect(out).toEqual([]);
  });

  it("drops rows with no identity, which could never be priced", () => {
    expect(importableHoldings({ equity: [{ sh: 5, name: "Mystery" }] })).toEqual([]);
  });

  it("marks the source and account so imported rows are distinguishable", () => {
    const [h] = importableHoldings({ equity: [eq()] });
    expect(h.source).toBe("cas");
    expect(h.acct).toBe("cas");
    expect(h.acctName).toBeTruthy();
  });

  it("coerces numbers and falls back to cost when no price is given", () => {
    const [h] = importableHoldings({ equity: [eq({ sh: "10", cost: "1400", price: 0 })] });
    expect(h.sh).toBe(10);
    expect(h.cost).toBe(1400);
    expect(h.price).toBe(1400);
  });

  it("survives absent sections and malformed rows", () => {
    for (const input of [{}, null, undefined, { equity: null, mf: null }, { equity: [null, undefined] }]) {
      expect(() => importableHoldings(input)).not.toThrow();
      expect(importableHoldings(input)).toEqual([]);
    }
  });
});

describe("splitAgainstExisting — never double-add", () => {
  it("skips holdings already in the portfolio", () => {
    const existing = [{ isin: "INE009A01021", sym: "INFY" }];
    const { toAdd, duplicates } = splitAgainstExisting([eq(), mf()], existing);
    expect(toAdd.map((h) => h.isin)).toEqual(["INF879O01027"]);
    expect(duplicates).toHaveLength(1);
  });

  it("collapses the same scheme appearing under two folios in one statement", () => {
    // CAS statements legitimately list one scheme across multiple folios;
    // without this the import would add it twice.
    const { toAdd, duplicates } = splitAgainstExisting([mf(), mf({ sh: 40 })], []);
    expect(toAdd).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
  });

  it("matches an existing holding by symbol when neither has an ISIN", () => {
    const { toAdd } = splitAgainstExisting([eq({ isin: "" })], [{ sym: "infy" }]);
    expect(toAdd).toEqual([]);
  });

  it("adds everything when the portfolio is empty", () => {
    for (const existing of [[], null, undefined]) {
      expect(splitAgainstExisting([eq(), mf()], existing).toAdd).toHaveLength(2);
    }
  });

  it("is additive — it never returns anything to remove or overwrite", () => {
    const result = splitAgainstExisting([eq()], [{ sym: "TCS" }]);
    expect(Object.keys(result).sort()).toEqual(["duplicates", "toAdd"]);
  });
});

describe("importValue", () => {
  it("totals units times price", () => {
    expect(importValue([eq()])).toBe(15000);
  });

  it("uses cost when a row has no price", () => {
    expect(importValue([eq({ price: 0, cost: 1400 })])).toBe(14000);
  });

  it("returns 0 rather than NaN for empty or malformed input", () => {
    for (const input of [[], null, undefined, [null, {}, { sh: "x", price: "y" }]]) {
      expect(importValue(input)).toBe(0);
    }
  });
});
