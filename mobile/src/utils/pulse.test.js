import { rankTrending } from "./trending";
import { rankWhatYouMissed } from "./whatYouMissed";
import { mapPublicReco } from "./feed";

// Pulse feeds two ranking modules from two DIFFERENT server endpoints, whose
// rows are shaped differently:
//
//   "Trending on MIC"   <- lookups public-feed rows, snake_case, run through
//                          mapPublicReco()
//   "What you missed"   <- recommendations?scope=received rows, which the
//                          server already returns camelCase (mapReceivedRow)
//
// Both modules are copies of the web app's, written against the web's shapes.
// These tests pin each one to the shape its ACTUAL mobile caller passes it —
// the exact class of bug CLAUDE.md's incident note describes (a shared helper
// that worked for one caller's data shape and threw on another's).

const days = (n) => new Date(Date.now() - n * 86400000).toISOString();

// A verbatim-shaped row from the public-feed SQL in
// api/_lib/handlers/lookups.js (action 'public-feed').
const publicRow = (over = {}) => ({
  id: 1,
  asset_name: "Infosys",
  ticker: "INFY",
  asset_class: "Equity",
  recommendation_type: "Buy",
  reco_price: 100,
  current_price: 130,
  target_price: 160,
  stop_loss: 90,
  horizon: "Long",
  thesis: "t",
  sector: "IT",
  conviction: "High",
  date: days(3),
  is_public: true,
  by_name: "Alice",
  from_id: "u-alice",
  from_username: "alice",
  comment_count: 4,
  likes_count: 9,
  recent_comments: 3,
  recent_likes: 5,
  last_activity_at: days(1),
  ...over,
});

// A verbatim-shaped row from mapReceivedRow in
// api/_lib/handlers/recommendations.js (scope=received).
const receivedRow = (over = {}) => ({
  deliveryId: "d1",
  id: 11,
  from: "u-bob",
  byName: "Bob",
  shareType: "one",
  groupId: null,
  groupName: null,
  assetName: "Tata Motors",
  ticker: "TATAMOTORS",
  priceAt: 400,
  price: 520,
  date: days(4).slice(0, 10), // received rows carry a bare YYYY-MM-DD
  invested: false,
  reaction: "none",
  hidden: false,
  likes: 2,
  commentCount: 1,
  isPublic: true,
  recType: "Buy",
  ...over,
});

describe("Trending on MIC — fed by mapPublicReco(public-feed rows)", () => {
  it("ranks a real public-feed row and explains why", () => {
    const recos = [publicRow()].map(mapPublicReco);
    const out = rankTrending(recos, { contactIds: new Set(["u-alice"]) });

    expect(out).toHaveLength(1);
    expect(out[0].idea.ticker).toBe("INFY");
    expect(out[0].creator).toEqual({ id: "u-alice", name: "Alice" });
    expect(out[0].score).toBeGreaterThan(0);
    // Discover renders reason as {icon, text} for this module.
    expect(typeof out[0].reason.text).toBe("string");
    expect(out[0].reason.text.length).toBeGreaterThan(0);
  });

  it("keeps the velocity columns alive through mapPublicReco", () => {
    // If mapPublicReco dropped recent_likes/recent_comments, trending would
    // silently fall back to lifetime-only scoring and never say "this week".
    const mapped = mapPublicReco(publicRow());
    expect(mapped.recentLikes).toBe(5);
    expect(mapped.recentComments).toBe(3);
    expect(mapped.lastActivityAt).toBeTruthy();

    const [top] = rankTrending([mapped], {});
    expect(top.signal.hasVelocity).toBe(true);
    expect(top.reason.text).toMatch(/this week/);
  });

  it("drops ideas with no engagement and ideas that went quiet long ago", () => {
    const noEngagement = mapPublicReco(publicRow({ id: 2, likes_count: 0, comment_count: 0, recent_likes: 0, recent_comments: 0 }));
    const stale = mapPublicReco(publicRow({ id: 3, date: days(200), last_activity_at: days(180) }));
    expect(rankTrending([noEngagement, stale], {})).toEqual([]);
  });

  it("survives rows missing the newer velocity columns (older API)", () => {
    const row = publicRow();
    delete row.recent_likes;
    delete row.recent_comments;
    delete row.last_activity_at;
    const out = rankTrending([mapPublicReco(row)], {});
    expect(out).toHaveLength(1);
    // No velocity data must not be reported as "this week".
    expect(out[0].signal.hasVelocity).toBe(false);
    expect(out[0].reason.text).not.toMatch(/this week/);
  });
});

describe("What you missed — fed by raw scope=received rows", () => {
  it("ranks a real received row and explains why", () => {
    const out = rankWhatYouMissed([receivedRow()], {
      tracked: { has: () => false },
      contactIds: new Set(["u-bob"]),
    });

    expect(out).toHaveLength(1);
    expect(out[0].idea.ticker).toBe("TATAMOTORS");
    // 400 -> 520 is +30%
    expect(out[0].movement.direction).toBe("up");
    expect(Math.round(out[0].movement.pct * 100)).toBe(30);
    // Discover renders reason as a plain string for this module.
    expect(out[0].reason).toBe("From your connection");
  });

  it("excludes ideas the viewer already tracked", () => {
    // Discover passes a String-coercing wrapper because ids come back as
    // numbers here and strings from the tracked-ids endpoint.
    const trackedIds = new Set(["11"]);
    const tracked = { has: (id) => trackedIds.has(String(id)) };
    expect(rankWhatYouMissed([receivedRow()], { tracked })).toEqual([]);
  });

  it("excludes ideas that barely moved", () => {
    const flat = receivedRow({ id: 12, price: 401 }); // +0.25%
    expect(rankWhatYouMissed([flat], { tracked: { has: () => false } })).toEqual([]);
  });

  it("names the Circle when the idea arrived through one", () => {
    const viaCircle = receivedRow({ shareType: "group", groupName: "Value Hunters" });
    const [top] = rankWhatYouMissed([viaCircle], { tracked: { has: () => false } });
    expect(top.reason).toBe("Shared in Value Hunters");
  });
});

describe("Pulse ranking — degenerate inputs must not throw", () => {
  it("handles empty/absent input and rows missing most fields", () => {
    for (const input of [[], null, undefined, [{}, { id: 1 }]]) {
      expect(() => rankTrending(input, {})).not.toThrow();
      expect(() => rankWhatYouMissed(input, { tracked: { has: () => false } })).not.toThrow();
    }
  });

  it("documents that whatYouMissed throws on a null row, unlike trending", () => {
    // Not a mobile regression: this divergence exists in the web copies
    // these files are verbatim ports of (trending.js filters `r && !r.hidden
    // && r.id`, whatYouMissed.js only `!r.hidden`). Discover therefore drops
    // null/id-less rows BEFORE ranking; this pins the reason that guard
    // exists so nobody removes it as redundant.
    expect(() => rankTrending([null], {})).not.toThrow();
    expect(() => rankWhatYouMissed([null], { tracked: { has: () => false } })).toThrow(TypeError);
  });

  it("handles an unparseable date without producing NaN-ordered output", () => {
    const bad = mapPublicReco(publicRow({ date: "not-a-date", last_activity_at: "also-bad" }));
    expect(() => rankTrending([bad], {})).not.toThrow();
    for (const r of rankTrending([bad], {})) expect(Number.isFinite(r.score)).toBe(true);
  });
});
