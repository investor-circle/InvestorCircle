import { computeIci, iciFromStatsRow, iciMapFromStats } from "./ici";

// ICI is the product's headline metric — the number an investor is judged by.
// This file is a byte-identical copy of the web's computeIci (verified at port
// time), so these tests pin the CONTRACT rather than re-deriving the formula:
// the band thresholds, the component caps, and the mapping from the batch
// endpoint's raw counts. If mobile and web ever disagree on a score, the app
// has two different opinions about the same investor.

describe("computeIci — bands", () => {
  const perfect = {
    years_history: 5,
    total: 50,
    hit_rate_pct: 100,
    median_return: 30,
    risk_adjusted_return: 3,
    deleted_count: 0,
  };

  it("caps at 100 no matter how good the inputs are", () => {
    expect(computeIci(perfect).score).toBe(100);
    expect(computeIci({ ...perfect, total: 1e6, median_return: 1e6 }).score).toBe(100);
  });

  it("never goes below the unearned floor", () => {
    // A brand-new investor with nothing still scores 20: profile verification
    // is a flat 10, and transparency pays full marks for having deleted
    // nothing. So the score is never 0, and the band is Early, not an error
    // state. Worth pinning because the floor is easy to misread as 10.
    const zero = computeIci({});
    expect(zero.score).toBe(20);
    expect(zero.band).toBe("Early");
  });

  it("labels bands at the documented thresholds", () => {
    // Built up from the 20-point floor by adding whole components, so each
    // case lands on a known total without depending on rounding.
    expect(computeIci({}).score).toBe(20);
    expect(computeIci({}).band).toBe("Early"); // < 35

    const building = computeIci({ hit_rate_pct: 100 }); // 20 + 20
    expect(building.score).toBe(40);
    expect(building.band).toBe("Building"); // 35–54

    const good = computeIci({ hit_rate_pct: 100, total: 20, years_history: 3 }); // 20+20+15+15
    expect(good.score).toBe(70);
    expect(good.band).toBe("Good"); // 55–74

    expect(computeIci(perfect).band).toBe("Strong"); // >= 75
  });

  it("treats negative inputs as zero rather than subtracting", () => {
    // A negative median return must not drag the score below the floor.
    expect(computeIci({ median_return: -50, risk_adjusted_return: -3 }).score).toBe(20);
  });

  it("penalises deletions through the transparency component", () => {
    const clean = computeIci({ total: 10, deleted_count: 0 });
    const deleted = computeIci({ total: 10, deleted_count: 10 });
    expect(deleted.score).toBeLessThan(clean.score);
    // Transparency is worth 10; deleting everything should cost all of it.
    expect(clean.score - deleted.score).toBe(10);
  });

  it("returns the seven components the breakdown UI renders", () => {
    const { components } = computeIci(perfect);
    expect(components).toHaveLength(7);
    expect(components.reduce((n, c) => n + c.max, 0)).toBe(100);
    for (const c of components) {
      expect(c.score).toBeLessThanOrEqual(c.max);
      expect(c.score).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("iciFromStatsRow — the batch endpoint's shape", () => {
  const row = {
    uid: "u1",
    total: 20,
    years_history: 3.2,
    closed: 10,
    wins: 7,
    median_ret: 12,
    ret_stddev: 6,
  };

  it("derives hit rate from wins/closed, not from a server field", () => {
    const ici = iciFromStatsRow(row);
    // 7/10 = 70% hit rate -> 14 of the 20 hit-rate points.
    const hit = ici.components.find((c) => c.label === "Hit rate");
    expect(hit.score).toBe(14);
  });

  it("derives risk-adjusted return as median/stddev", () => {
    const ici = iciFromStatsRow(row);
    // 12/6 = 2.0, which is full marks (15) on that component.
    const ra = ici.components.find((c) => c.label === "Risk-adjusted return");
    expect(ra.score).toBe(15);
  });

  it("treats zero spread as no risk signal, not as infinite quality", () => {
    // stddev 0 would divide by zero; that must score 0, not Infinity/NaN.
    const ici = iciFromStatsRow({ ...row, ret_stddev: 0 });
    const ra = ici.components.find((c) => c.label === "Risk-adjusted return");
    expect(ra.score).toBe(0);
    expect(Number.isFinite(ici.score)).toBe(true);
  });

  it("scores zero closed ideas as a 0% hit rate rather than NaN", () => {
    const ici = iciFromStatsRow({ ...row, closed: 0, wins: 0 });
    expect(Number.isFinite(ici.score)).toBe(true);
    expect(ici.components.find((c) => c.label === "Hit rate").score).toBe(0);
  });

  it("carries the idea count through for the 'based on N ideas' line", () => {
    expect(iciFromStatsRow(row).total).toBe(20);
  });

  it("returns null for a missing row", () => {
    expect(iciFromStatsRow(null)).toBeNull();
    expect(iciFromStatsRow(undefined)).toBeNull();
  });
});

describe("iciMapFromStats", () => {
  it("keys scores by uid", () => {
    const map = iciMapFromStats([
      { uid: "a", total: 5, closed: 2, wins: 2 },
      { uid: "b", total: 1, closed: 0, wins: 0 },
    ]);
    expect(Object.keys(map).sort()).toEqual(["a", "b"]);
    expect(map.a.score).toBeGreaterThan(map.b.score);
  });

  it("skips rows with no uid and survives absent input", () => {
    expect(iciMapFromStats([{ total: 5 }])).toEqual({});
    for (const v of [null, undefined, []]) expect(iciMapFromStats(v)).toEqual({});
  });
});
