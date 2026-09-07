import { deriveTrackedActivity, getSeenCommentCounts, saveSeenCommentCounts } from "./trackedActivity";

// A minimal in-memory AsyncStorage so the save/read round trip is real,
// not just "was called with" assertions.
const mockStore = new Map();
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async (k) => (mockStore.has(k) ? mockStore.get(k) : null)),
  setItem: jest.fn(async (k, v) => {
    mockStore.set(k, v);
  }),
}));

// Straight port of the web's src/utils/trackedActivity.js — these tests pin
// the categories/priority order/dedup this mobile copy must keep matching.

const idea = (over = {}) => ({
  id: 1,
  assetName: "Infosys",
  ticker: "INFY",
  assetClass: "Equity",
  priceAt: 100,
  price: 100,
  date: new Date().toISOString(),
  exitSignal: false,
  exitDate: null,
  commentCount: 0,
  ...over,
});

describe("deriveTrackedActivity", () => {
  it("surfaces an exit signal first", () => {
    const out = deriveTrackedActivity([idea({ exitSignal: true, exitDate: new Date().toISOString() })], []);
    expect(out[0].type).toBe("exit");
    expect(out[0].headline).toMatch(/Exit signal flagged on Infosys/);
  });

  it("surfaces a cumulative mover in tracking mode", () => {
    const out = deriveTrackedActivity([idea({ id: 2, price: 110 })], [], { mode: "tracking" });
    expect(out[0].type).toBe("mover");
    expect(out[0].direction).toBe("up");
    expect(out[0].headline).toMatch(/\+10\.0% since shared/);
  });

  it("ignores a move below the mover threshold", () => {
    const out = deriveTrackedActivity([idea({ id: 3, price: 102 })], [], { mode: "tracking" });
    expect(out).toEqual([]);
  });

  it("surfaces a daily mover only in yesterday mode, from the daily snapshot", () => {
    const dailyPrices = { "INFY::EQUITY": { changePct: 3, prevClose: 100, date: "2026-09-06", prevDate: "2026-09-05" } };
    const out = deriveTrackedActivity([idea({ id: 4 })], [], { mode: "yesterday", dailyPrices });
    expect(out[0].type).toBe("mover");
    expect(out[0].daily).toBe(true);
    expect(out[0].headline).toMatch(/since previous close/);
  });

  it("surfaces new comments since the last-seen snapshot", () => {
    const out = deriveTrackedActivity([idea({ id: 5, commentCount: 4 })], [], { seenCommentCounts: { 5: 1 } });
    expect(out[0].type).toBe("comment");
    expect(out[0].headline).toBe("3 new comments on Infosys");
  });

  it("surfaces reinforcement — a different creator's new idea on a tracked ticker", () => {
    const tracked = [idea({ id: 6 })];
    const allRecos = [{ id: 99, ticker: "INFY", assetName: "Infosys", date: new Date().toISOString() }];
    const out = deriveTrackedActivity(tracked, allRecos);
    expect(out.some((x) => x.type === "reinforced")).toBe(true);
  });

  it("never surfaces the same tracked idea's own post as reinforcement", () => {
    const tracked = [idea({ id: 7 })];
    const allRecos = [{ id: 7, ticker: "INFY", assetName: "Infosys", date: new Date().toISOString() }];
    expect(deriveTrackedActivity(tracked, allRecos).some((x) => x.type === "reinforced")).toBe(false);
  });

  it("caps at MAX_ACTIVITY_ITEMS and dedups by type+id", () => {
    const many = Array.from({ length: 10 }, (_, i) => idea({ id: i + 1, price: 120 }));
    const out = deriveTrackedActivity(many, []);
    expect(out.length).toBeLessThanOrEqual(4);
  });

  it("handles empty/absent input without throwing", () => {
    expect(() => deriveTrackedActivity([], [])).not.toThrow();
    expect(deriveTrackedActivity([], [])).toEqual([]);
  });
});

describe("seen-comment-count snapshot (AsyncStorage)", () => {
  it("round-trips through AsyncStorage", async () => {
    await saveSeenCommentCounts("u1", [idea({ id: 8, commentCount: 5 })]);
    await expect(getSeenCommentCounts("u1")).resolves.toEqual({ 8: 5 });
  });

  it("returns an empty object for a user with no snapshot", async () => {
    await expect(getSeenCommentCounts("nobody")).resolves.toEqual({});
  });
});
