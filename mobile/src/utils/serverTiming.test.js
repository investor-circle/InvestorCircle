import { parseServerTiming, describeServerTiming } from "./serverTiming";

// This exists to answer one question from a phone: of a 4.6-second request,
// how much was the server and how much was everything between the two? A
// parser that quietly returns nothing would leave that question open while
// looking like it had been answered, so the absence cases matter as much as
// the happy path.

const resWith = (value) => ({ headers: { get: () => value } });

describe("reading the header", () => {
  it("pulls out each phase the server reported", () => {
    const t = parseServerTiming(resWith("auth;dur=412, db;dur=1980, total;dur=2402, cold;dur=1"));
    expect(t).toEqual({ auth: 412, db: 1980, total: 2402, cold: 1 });
  });

  it("tolerates the whitespace real servers emit", () => {
    expect(parseServerTiming(resWith("auth;dur = 5 ,  total;dur=9"))).toEqual({ auth: 5, total: 9 });
  });

  it("keeps a zero, which is a measurement and not a missing value", () => {
    // cold;dur=0 means "warm instance" — dropping it would lose the answer.
    expect(parseServerTiming(resWith("total;dur=12, cold;dur=0"))).toEqual({ total: 12, cold: 0 });
  });

  it("returns null when the header is absent, not an empty object", () => {
    // An empty object would read downstream as "server took 0ms".
    expect(parseServerTiming(resWith(null))).toBeNull();
    expect(parseServerTiming(resWith(""))).toBeNull();
    expect(parseServerTiming({})).toBeNull();
    expect(parseServerTiming(null)).toBeNull();
  });

  it("survives a header it cannot make sense of", () => {
    expect(parseServerTiming(resWith("garbage"))).toBeNull();
    expect(parseServerTiming(resWith("db;dur=abc"))).toBeNull();
  });

  it("does not throw when reading the header itself throws", () => {
    const hostile = { headers: { get: () => { throw new Error("not exposed"); } } };
    expect(parseServerTiming(hostile)).toBeNull();
  });
});

describe("describing what was found", () => {
  it("attributes the time the server never saw", () => {
    // 4600ms wall, 2402ms server => 2198ms of network + platform.
    const out = describeServerTiming({ auth: 412, db: 1980, total: 2402 }, 4600);
    expect(out).toContain("auth=412ms");
    expect(out).toContain("db=1980ms");
    expect(out).toContain("server=2402ms");
    expect(out).toContain("network+platform=2198ms");
  });

  it("calls out a cold start, which changes what the number means", () => {
    expect(describeServerTiming({ total: 3000, cold: 1 }, 3200)).toContain("COLD START");
    expect(describeServerTiming({ total: 30, cold: 0 }, 200)).not.toContain("COLD START");
  });

  it("never reports negative network time", () => {
    // Two different machines' clocks; a small negative means imprecision,
    // not that the response arrived before the server finished.
    expect(describeServerTiming({ total: 100 }, 95)).toContain("network+platform=0ms");
  });

  it("omits what was not measured rather than reporting it as zero", () => {
    const out = describeServerTiming({ total: 50 }, 300);
    expect(out).not.toContain("db=");
    expect(out).not.toContain("auth=");
  });

  it("says nothing when there is nothing to say", () => {
    expect(describeServerTiming(null, 100)).toBe("");
  });
});
