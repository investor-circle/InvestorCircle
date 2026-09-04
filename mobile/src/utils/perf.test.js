import {
  mark,
  getMarks,
  sinceStart,
  endpointKey,
  recordRequest,
  getRequestStats,
  formatRequestStats,
  resetPerf,
} from "./perf";

// This exists to make three reports answerable from a phone: "it hangs on the
// splash", "this screen spins forever", "the app is slow". The stats are only
// useful if requests that are the same endpoint aggregate — otherwise the
// table is one row per request and says nothing.

beforeEach(() => resetPerf());

describe("startup timeline", () => {
  it("records phases in order with a time since launch", () => {
    mark("a");
    mark("b");
    const marks = getMarks();
    expect(marks.map((m) => m.name)).toEqual(["a", "b"]);
    expect(marks[0].at).toBeGreaterThanOrEqual(0);
    expect(marks[1].at).toBeGreaterThanOrEqual(marks[0].at);
  });

  it("hands back a copy, so a caller cannot corrupt the timeline", () => {
    mark("a");
    getMarks().push({ name: "injected", at: 0 });
    expect(getMarks()).toHaveLength(1);
  });

  it("reports uptime", () => {
    expect(sinceStart()).toBeGreaterThanOrEqual(0);
  });
});

describe("grouping requests into endpoints", () => {
  it("keeps resource and action, which are what identify a call", () => {
    expect(endpointKey("/data?resource=groups&action=by-slug&slug=alpha")).toBe(
      "/data?resource=groups&action=by-slug"
    );
  });

  it("collapses the same call made for different arguments", () => {
    // Otherwise every circle, ticker and profile is its own row and the
    // table has no aggregate worth reading.
    const a = endpointKey("/data?resource=groups&action=by-slug&slug=alpha");
    const b = endpointKey("/data?resource=groups&action=by-slug&slug=beta");
    expect(a).toBe(b);
  });

  it("leaves a path with no query alone", () => {
    expect(endpointKey("/profile/me")).toBe("/profile/me");
  });

  it("survives a missing path", () => {
    expect(endpointKey(undefined)).toBe("");
  });
});

describe("request stats", () => {
  it("aggregates calls, average and worst case", () => {
    recordRequest("/x", 100, true);
    recordRequest("/x", 300, true);
    const [row] = getRequestStats();
    expect(row).toMatchObject({ key: "/x", calls: 2, failures: 0, avgMs: 200, maxMs: 300 });
  });

  it("counts failures separately from calls", () => {
    recordRequest("/x", 10, true);
    recordRequest("/x", 10, false);
    expect(getRequestStats()[0]).toMatchObject({ calls: 2, failures: 1 });
  });

  it("puts the slowest endpoint first — what a person debugging wants", () => {
    recordRequest("/fast", 50, true);
    recordRequest("/slow", 4000, true);
    expect(getRequestStats().map((r) => r.key)).toEqual(["/slow", "/fast"]);
  });

  it("formats a readable line per endpoint, flagging failures", () => {
    recordRequest("/x", 120, false);
    const out = formatRequestStats();
    expect(out).toContain("/x");
    expect(out).toContain("1 failed");
  });

  it("says so plainly when nothing has been requested", () => {
    expect(formatRequestStats()).toBe("(no requests yet)");
  });
});
