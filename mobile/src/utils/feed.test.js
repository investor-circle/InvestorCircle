import { describe, it, expect } from "vitest";
import {
  computeEffectiveFeedConfig,
  buildFeed,
  mapPublicReco,
  mapNetworkReco,
  mapCircleReco,
  mapTrackedReco,
} from "./feed";

// The Feed originally shipped showing only direct deliveries — a strict
// subset of what the web Feed shows. These lock in the three-source merge,
// the dedup rules and the config gating so that can't silently regress.

const today = new Date().toISOString().slice(0, 10);
const reco = (id, extra = {}) => ({ id, date: today, priceAt: 100, price: 110, ...extra });

describe("computeEffectiveFeedConfig", () => {
  it("falls back to all sources on when options are unavailable", () => {
    // The feed_config tables may predate the migration, or the call may fail.
    // Defaulting to "off" would silently empty the feed.
    for (const empty of [undefined, null, []]) {
      const cfg = computeEffectiveFeedConfig(empty, []);
      expect(cfg.src_public).toBe(true);
      expect(cfg.src_network_engagement).toBe(true);
    }
  });

  it("admin_enabled=false wins over a user preference", () => {
    const cfg = computeEffectiveFeedConfig(
      [{ key: "src_public", admin_enabled: false, always_on: false, default_on: true }],
      [{ config_key: "src_public", enabled: true }]
    );
    expect(cfg.src_public).toBe(false);
  });

  it("always_on wins over a user preference that disables it", () => {
    const cfg = computeEffectiveFeedConfig(
      [{ key: "src_direct", admin_enabled: true, always_on: true, default_on: true }],
      [{ config_key: "src_direct", enabled: false }]
    );
    expect(cfg.src_direct).toBe(true);
  });

  it("uses the user preference, else the default", () => {
    const options = [
      { key: "a", admin_enabled: true, always_on: false, default_on: true },
      { key: "b", admin_enabled: true, always_on: false, default_on: false },
    ];
    const cfg = computeEffectiveFeedConfig(options, [{ config_key: "a", enabled: false }]);
    expect(cfg.a).toBe(false); // preference overrides default_on:true
    expect(cfg.b).toBe(false); // no preference → default_on
  });
});

describe("buildFeed", () => {
  it("merges all three sources", () => {
    const out = buildFeed({
      received: [reco("r1")],
      networkRecos: [reco("n1", { feedSource: "network_engagement" })],
      publicRecos: [reco("p1", { feedSource: "public" })],
      cfg: { src_network_engagement: true },
    });
    expect(out.map((r) => r.id).sort()).toEqual(["n1", "p1", "r1"]);
  });

  it("dedupes an idea that appears in more than one source", () => {
    // The same reco can legitimately arrive as a direct delivery AND in the
    // public feed; it must appear once, keeping the direct copy.
    const out = buildFeed({
      received: [reco("same")],
      networkRecos: [reco("same", { feedSource: "network_engagement" })],
      publicRecos: [reco("same", { feedSource: "public" })],
      cfg: { src_network_engagement: true },
    });
    expect(out).toHaveLength(1);
    expect(out[0].feedSource).toBe("direct");
  });

  it("omits network-engagement recos when that source is disabled", () => {
    const out = buildFeed({
      received: [],
      networkRecos: [reco("n1")],
      publicRecos: [],
      cfg: { src_network_engagement: false },
    });
    expect(out).toHaveLength(0);
  });

  it("omits public recos only when src_public is explicitly false", () => {
    const args = { received: [], networkRecos: [], publicRecos: [reco("p1")] };
    expect(buildFeed({ ...args, cfg: {} })).toHaveLength(1); // undefined = enabled
    expect(buildFeed({ ...args, cfg: { src_public: false } })).toHaveLength(0);
  });

  it("drops hidden deliveries, and invested ones only when configured", () => {
    const received = [reco("visible"), reco("hidden", { hidden: true }), reco("bought", { invested: true })];
    expect(buildFeed({ received, cfg: {} }).map((r) => r.id).sort()).toEqual(["bought", "visible"]);
    expect(buildFeed({ received, cfg: { filter_hide_invested: true } }).map((r) => r.id)).toEqual(["visible"]);
  });

  it("ranks a connection's idea above a stranger's", () => {
    const out = buildFeed({
      received: [],
      publicRecos: [reco("stranger", { from: "u-other" }), reco("friend", { from: "u-friend" })],
      cfg: {},
      contactIds: new Set(["u-friend"]),
    });
    expect(out[0].id).toBe("friend");
  });

  it("gives a null-dated reco a finite score so ordering stays deterministic", () => {
    // A NaN score makes the sort comparator inconsistent and the order
    // arbitrary — these must rank last, not randomly.
    const out = buildFeed({
      received: [reco("dated"), reco("undated", { date: null })],
      cfg: {},
    });
    expect(out.every((r) => Number.isFinite(r._score))).toBe(true);
    expect(out[out.length - 1].id).toBe("undated");
  });

  it("treats trackedIds as strings so a numeric id still matches", () => {
    // Server ids arrive as numbers in some payloads and strings in others.
    const out = buildFeed({
      received: [reco(7)],
      cfg: { rank_untracked_first: true },
      trackedIds: ["7"],
    });
    const untracked = buildFeed({ received: [reco(7)], cfg: { rank_untracked_first: true }, trackedIds: [] });
    expect(out[0]._score).toBeLessThan(untracked[0]._score);
  });
});

describe("source row mappers", () => {
  it("maps a public-feed row into the card shape", () => {
    const m = mapPublicReco({
      id: 1,
      asset_name: "Hindustan Aeronautics",
      reco_price: "4380",
      current_price: "5210",
      by_name: "Priya",
      from_id: "u1",
      recommendation_type: "Buy",
      likes_count: 3,
      comment_count: 2,
    });
    expect(m).toMatchObject({
      assetName: "Hindustan Aeronautics",
      priceAt: "4380",
      price: "5210",
      byName: "Priya",
      from: "u1",
      feedSource: "public",
      likes: 3,
      commentCount: 2,
      isPublic: true,
    });
  });

  it("maps network + circle rows, defaulting recType to Buy", () => {
    expect(mapNetworkReco({ id: 2, asset_name: "X" })).toMatchObject({
      feedSource: "network_engagement",
      recType: "Buy",
    });
    // The circle query spells it comments_count, unlike the other feeds.
    expect(mapCircleReco({ id: 3, asset_name: "Y", comments_count: 5, recommender_name: "Meera" })).toMatchObject({
      feedSource: "group",
      commentCount: 5,
      byName: "Meera",
    });
  });

  it("maps a tracked row, coercing numerics", () => {
    const m = mapTrackedReco({
      id: 4,
      asset_name: "Z",
      reco_price: "100",
      current_price: "150",
      target_price: "200",
      is_invested: true,
      created_at: "2026-01-05T10:00:00.000Z",
      recommender_name: "Rohan",
    });
    expect(m.priceAt).toBe(100);
    expect(m.price).toBe(150);
    expect(m.targetPrice).toBe(200);
    expect(m.invested).toBe(true);
    expect(m.date).toBe("2026-01-05"); // trimmed to a bare date
    expect(m.byName).toBe("Rohan");
  });
});
