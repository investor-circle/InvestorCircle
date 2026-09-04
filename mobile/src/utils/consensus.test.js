import { computeConsensus, computeTrend, consensusColor, consensusByTicker } from "./consensus";

// computeConsensus and computeTrend are byte-identical copies of the web's
// (verified at port time). These pin the CONTRACT, and in particular the one
// product decision that is easy to "simplify" away: the label comes from the
// bull/bear GAP, not from bullPct alone, so the label can never contradict
// the strength gauge shown next to it.

const buy = (over = {}) => ({ recommendation_type: "Buy", created_at: new Date().toISOString(), ...over });
const sell = (over = {}) => ({ recommendation_type: "Sell", created_at: new Date().toISOString(), ...over });
const hold = (over = {}) => ({ recommendation_type: "Hold", created_at: new Date().toISOString(), ...over });

describe("computeConsensus", () => {
  it("reports no data for an empty list rather than a false neutral", () => {
    const c = computeConsensus([]);
    expect(c.label).toBe("No Data");
    expect(c.total).toBe(0);
    expect(c.bullPct).toBe(0);
  });

  it("splits bull / bear / neutral percentages", () => {
    const c = computeConsensus([buy(), buy(), sell(), hold()]);
    expect(c.bull).toBe(2);
    expect(c.bear).toBe(1);
    expect(c.neutral).toBe(1);
    expect(c.bullPct).toBe(50);
    expect(c.bearPct).toBe(25);
    expect(c.neutralPct).toBe(25);
  });

  it("derives strength from the bull/bear gap", () => {
    expect(computeConsensus([buy(), buy(), buy(), buy()]).strength).toBe(100);
    expect(computeConsensus([buy(), sell()]).strength).toBe(0);
  });

  it("labels from the gap, not from bullPct alone", () => {
    // THE regression this file exists for. 75% buy / 25% sell is a gap of 50,
    // which is a plain "Bullish" — not "Strong Bullish", even though bullPct
    // clears 70. An earlier web version got this wrong and the label
    // contradicted the strength gauge beside it.
    const c = computeConsensus([buy(), buy(), buy(), sell()]);
    expect(c.bullPct).toBe(75);
    expect(c.strength).toBe(50);
    expect(c.label).toBe("Bullish");

    // A gap of 60+ is what earns "Strong".
    const strong = computeConsensus([buy(), buy(), buy(), buy(), sell()]);
    expect(strong.strength).toBe(60);
    expect(strong.label).toBe("Strong Bullish");
  });

  it("labels a bearish lean bearish", () => {
    expect(computeConsensus([sell(), sell(), sell(), sell()]).label).toBe("Strong Bearish");
  });

  it("calls an even split, and a mostly-hold book, Neutral", () => {
    expect(computeConsensus([buy(), sell()]).label).toBe("Neutral");
    // All holds: no lean at all.
    expect(computeConsensus([hold(), hold()]).label).toBe("Neutral");
  });
});

describe("computeTrend", () => {
  const monthsAgo = (n) => {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    d.setDate(15); // mid-month, so it can't slip into a neighbouring bucket
    return d.toISOString();
  };

  it("returns a point per month as a Buy percentage", () => {
    const trend = computeTrend([buy({ created_at: monthsAgo(0) }), sell({ created_at: monthsAgo(0) })], 6);
    expect(trend[trend.length - 1]).toBe(50);
  });

  it("carries the previous month forward through a quiet month", () => {
    // A month with no ideas should not read as 0% bullish — that would show a
    // collapse in sentiment where there was simply no activity.
    const trend = computeTrend([buy({ created_at: monthsAgo(2) })], 3);
    expect(trend[trend.length - 1]).toBe(100);
  });

  it("returns nothing for no ideas", () => {
    expect(computeTrend([])).toEqual([]);
    expect(computeTrend()).toEqual([]);
  });
});

describe("consensusColor", () => {
  const colors = { gain: "G", loss: "L", muted: "M" };

  it("colours by which side leads, not by magnitude", () => {
    // A lopsided SELL scores just as high on strength as a lopsided BUY;
    // colouring by magnitude alone painted it green, which read as bullish.
    expect(consensusColor(computeConsensus([sell(), sell(), sell()]), colors)).toBe("L");
    expect(consensusColor(computeConsensus([buy(), buy(), buy()]), colors)).toBe("G");
  });

  it("is muted for an even split or no data", () => {
    expect(consensusColor(computeConsensus([buy(), sell()]), colors)).toBe("M");
    expect(consensusColor(computeConsensus([]), colors)).toBe("M");
    expect(consensusColor(null, colors)).toBe("M");
  });
});

describe("consensusByTicker", () => {
  it("groups ideas by ticker with each group's consensus", () => {
    const groups = consensusByTicker([
      buy({ ticker: "INFY", asset_name: "Infosys" }),
      buy({ ticker: "INFY" }),
      sell({ ticker: "TCS", asset_name: "TCS Ltd" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].ticker).toBe("INFY"); // busiest first
    expect(groups[0].consensus.bullPct).toBe(100);
    expect(groups[0].assetName).toBe("Infosys");
    expect(groups[1].consensus.label).toBe("Strong Bearish");
  });

  it("normalises ticker case so one security is not split in two", () => {
    const groups = consensusByTicker([buy({ ticker: "infy" }), buy({ ticker: "INFY" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].consensus.total).toBe(2);
  });

  it("skips rows with no ticker and survives absent input", () => {
    expect(consensusByTicker([buy({ ticker: "" }), buy()])).toEqual([]);
    for (const v of [null, undefined, []]) expect(consensusByTicker(v)).toEqual([]);
  });
});
