import { fmt, fmtPct, fmtDate, initialsOf, returnPct, scoreFeedRec } from "./format";

describe("fmtDate", () => {
  // CLAUDE.md incident note: a shared date helper assumed every caller passed
  // a bare YYYY-MM-DD, but one endpoint returns a full ISO timestamp for the
  // same logical field — the Invalid Date that produced took down the app.
  // Both shapes are used by real callers here, so both are locked in.
  it("handles a bare YYYY-MM-DD (recommendations rows)", () => {
    expect(fmtDate("2026-08-04")).toContain("2026");
  });

  it("handles a full ISO timestamp (engagement/notification rows)", () => {
    expect(fmtDate("2026-08-04T10:30:00.000Z")).toContain("2026");
  });

  it("handles a Date object", () => {
    expect(fmtDate(new Date("2026-08-04"))).toContain("2026");
  });

  it("never throws on null/empty/garbage — it returns a dash", () => {
    for (const bad of [null, undefined, "", "not-a-date", {}]) {
      expect(() => fmtDate(bad)).not.toThrow();
      expect(fmtDate(bad)).toBe("—");
    }
  });
});

describe("returnPct", () => {
  it("computes a plain gain from entry to current", () => {
    expect(returnPct({ priceAt: 100, price: 110 })).toBeCloseTo(0.1);
  });

  it("INVERTS the sign for a Sell idea", () => {
    // Business rule: a Sell call is correct when the price FALLS, so a drop
    // is a positive return. Changing this silently misreports performance.
    expect(returnPct({ priceAt: 100, price: 90, recType: "Sell" })).toBeCloseTo(0.1);
    expect(returnPct({ priceAt: 100, price: 110, recType: "Sell" })).toBeCloseTo(-0.1);
  });

  it("prefers the exit price once an idea is closed", () => {
    expect(returnPct({ priceAt: 100, price: 999, exitPrice: 120 })).toBeCloseTo(0.2);
  });

  it("returns 0 rather than dividing by a missing entry price", () => {
    expect(returnPct({ priceAt: 0, price: 110 })).toBe(0);
    expect(returnPct({ price: 110 })).toBe(0);
  });
});

describe("fmt / fmtPct / initialsOf", () => {
  it("formats currency with a symbol and rounds", () => {
    expect(fmt(4380.4)).toContain("4,380");
    expect(fmt(1000, "USD")).toMatch(/^\$/);
  });

  it("signs percentages explicitly", () => {
    expect(fmtPct(0.1)).toBe("+10.0%");
    expect(fmtPct(-0.055)).toBe("-5.5%");
  });

  it("takes up to two uppercase initials and tolerates odd names", () => {
    expect(initialsOf("Priya Venkatesh")).toBe("PV");
    expect(initialsOf("Meera")).toBe("M");
    expect(initialsOf(null)).toBe("?");
    expect(() => initialsOf("  double  spaces ")).not.toThrow();
  });
});

describe("scoreFeedRec", () => {
  const noTracked = { has: () => false };
  const today = new Date().toISOString().slice(0, 10);

  it("ranks a direct delivery above a public idea, all else equal", () => {
    const direct = scoreFeedRec({ id: 1, date: today, feedSource: "direct" }, noTracked, {}, new Set());
    const pub = scoreFeedRec({ id: 2, date: today, feedSource: "public" }, noTracked, {}, new Set());
    expect(direct).toBeGreaterThan(pub);
  });

  it("boosts an idea from someone you're connected to", () => {
    const base = { id: 1, date: today, feedSource: "public", from: "u1" };
    const withContact = scoreFeedRec(base, noTracked, {}, new Set(["u1"]));
    const without = scoreFeedRec(base, noTracked, {}, new Set());
    expect(withContact).toBeGreaterThan(without);
  });

  it("decays with age", () => {
    const old = new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10);
    expect(scoreFeedRec({ id: 1, date: today }, noTracked, {}, new Set())).toBeGreaterThan(
      scoreFeedRec({ id: 2, date: old }, noTracked, {}, new Set())
    );
  });

  it("downranks an already-tracked idea when configured", () => {
    const cfg = { rank_untracked_first: true };
    const tracked = { has: (id) => id === 1 };
    expect(scoreFeedRec({ id: 1, date: today }, tracked, cfg, new Set())).toBeLessThan(
      scoreFeedRec({ id: 2, date: today }, tracked, cfg, new Set())
    );
  });
});
