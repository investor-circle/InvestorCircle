import { searchInstruments, toSelection, holdingTypeFor } from "./instruments";

// The instrument master feeds two forms (Add Holding, New Idea) and, through
// them, the nightly pricing job's instrument identity (symbol, asset_class).
// A search that surfaces the wrong row, or a selection that drops asset_class,
// produces a holding or idea that never gets priced — so these pin the
// matching rule and the exact selection shape.

const INSTRUMENTS = [
  { symbol: "INFY", name: "Infosys Ltd", exchange: "NSE", type: "EQ", asset_class: "Equity", currency: "INR", sector: "IT" },
  { symbol: "INFIBEAM", name: "Infibeam Avenues", exchange: "NSE", type: "EQ", asset_class: "Equity", currency: "INR", sector: "IT" },
  { symbol: "TCS", name: "Tata Consultancy Services", exchange: "NSE", type: "EQ", asset_class: "Equity", currency: "INR", sector: "IT" },
  { symbol: "NIFTYBEES", name: "Nippon India ETF Nifty BeES", exchange: "NSE", type: "ETF", asset_class: "ETF", currency: "INR", sector: null },
  { symbol: "AAPL", name: "Apple Inc", exchange: "NASDAQ", type: "EQ", asset_class: "Equity", currency: "USD", sector: "Technology" },
];

describe("searchInstruments — matching rule", () => {
  it("matches a symbol by prefix", () => {
    const hits = searchInstruments(INSTRUMENTS, "inf");
    expect(hits.map((i) => i.symbol)).toEqual(["INFY", "INFIBEAM"]);
  });

  it("matches a name anywhere", () => {
    expect(searchInstruments(INSTRUMENTS, "consultancy").map((i) => i.symbol)).toEqual(["TCS"]);
  });

  it("puts symbol matches ahead of name matches", () => {
    // "app" is a symbol prefix for AAPL? No — but it is in "Apple Inc".
    // Use a term that is both: "nifty" prefixes NIFTYBEES and appears in
    // Nippon's name. The symbol hit must come first.
    const hits = searchInstruments(INSTRUMENTS, "nifty");
    expect(hits[0].symbol).toBe("NIFTYBEES");
  });

  it("does not match a symbol in the middle, only as a prefix", () => {
    // Substring-matching symbols would make every ticker containing the typed
    // letters compete with the one actually being typed.
    // "ftybees" sits inside the symbol NIFTYBEES but not inside its name
    // ("Nippon India ETF Nifty BeES" — the space breaks it), so a hit here
    // could only have come from substring-matching the symbol.
    expect(searchInstruments(INSTRUMENTS, "ftybees")).toEqual([]);
  });

  it("is case insensitive and ignores surrounding whitespace", () => {
    expect(searchInstruments(INSTRUMENTS, "  InFy ").map((i) => i.symbol)).toEqual(["INFY"]);
  });

  it("stays silent for under two characters", () => {
    // One letter would match most of the list — noise, not help.
    for (const term of ["", " ", "i", null, undefined]) {
      expect(searchInstruments(INSTRUMENTS, term)).toEqual([]);
    }
  });

  it("caps the number of results", () => {
    const many = Array.from({ length: 60 }, (_, n) => ({ symbol: `ABC${n}`, name: `Company ${n}` }));
    expect(searchInstruments(many, "abc").length).toBe(18);
    expect(searchInstruments(many, "abc", 5).length).toBe(5);
  });

  it("survives a missing list and malformed rows", () => {
    for (const list of [null, undefined, [], [null, {}, { symbol: null, name: null }]]) {
      expect(() => searchInstruments(list, "inf")).not.toThrow();
      expect(searchInstruments(list, "inf")).toEqual([]);
    }
  });
});

describe("toSelection — what the forms receive", () => {
  it("maps snake_case columns onto the form's camelCase fields", () => {
    expect(toSelection(INSTRUMENTS[0])).toEqual({
      symbol: "INFY",
      name: "Infosys Ltd",
      exchange: "NSE",
      assetClass: "Equity",
      currency: "INR",
      sector: "IT",
      type: "EQ",
    });
  });

  it("keeps asset_class, which the pricing job needs to identify the instrument", () => {
    expect(toSelection(INSTRUMENTS[3]).assetClass).toBe("ETF");
  });

  it("defaults currency to INR but leaves unknown fields null, not undefined", () => {
    const sel = toSelection({ symbol: "X", name: "X Ltd" });
    expect(sel.currency).toBe("INR");
    expect(sel.sector).toBeNull();
    expect(sel.exchange).toBeNull();
  });

  it("returns null for no instrument", () => {
    expect(toSelection(null)).toBeNull();
    expect(toSelection(undefined)).toBeNull();
  });
});

describe("holdingTypeFor — instrument class to portfolio type", () => {
  it("maps the classes the web modal maps", () => {
    expect(holdingTypeFor({ asset_class: "ETF" })).toBe("ETF");
    expect(holdingTypeFor({ asset_class: "Mutual Fund" })).toBe("Fund");
    expect(holdingTypeFor({ asset_class: "MF" })).toBe("Fund");
    expect(holdingTypeFor({ asset_class: "Crypto" })).toBe("Crypto");
    expect(holdingTypeFor({ asset_class: "Equity" })).toBe("Stock");
  });

  it("falls back to type when asset_class is absent", () => {
    expect(holdingTypeFor({ type: "ETF" })).toBe("ETF");
  });

  it("defaults to Stock for anything unrecognised or missing", () => {
    for (const inst of [{}, null, undefined, { asset_class: "Something Else" }]) {
      expect(holdingTypeFor(inst)).toBe("Stock");
    }
  });
});
