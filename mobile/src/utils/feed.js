// Feed composition — mirrors the web app's Feed tab exactly.
//
// The web Feed (src/features/discovery/Discovery.jsx `feedRecs`, plus the
// source mapping in src/App.jsx and the effective-config resolution there)
// merges THREE sources — direct deliveries, network-engagement recos, and
// public platform recos — deduped by id, filtered by the effective feed
// config, then ranked by scoreFeedRec. The mobile Feed previously showed
// only direct deliveries (scope=received), which is a strict subset — that
// was the "limited ideas" discrepancy. This module reproduces the web
// behaviour so the mobile Feed shows the same set, in the same order.
import { scoreFeedRec } from "./format";

/**
 * Resolve the effective per-source feed config from the admin-defined
 * options + the user's saved prefs. Mirrors src/App.jsx (feedCfgResult
 * branch). When options are unavailable (endpoint down, or tables predate
 * the feed-config migration), fall back to the same safe defaults the web
 * app uses — every source on.
 */
export function computeEffectiveFeedConfig(options, prefs) {
  if (!Array.isArray(options) || options.length === 0) {
    return {
      src_direct: true,
      src_group: true,
      src_network_engagement: true,
      src_public: true,
      rank_engagement: true,
      rank_price_movement: true,
      rank_untracked_first: true,
    };
  }
  const userPrefsMap = Object.fromEntries((prefs || []).map((p) => [p.config_key, p.enabled]));
  const effective = {};
  options.forEach((o) => {
    if (!o.admin_enabled) {
      effective[o.key] = false;
      return;
    }
    if (o.always_on) {
      effective[o.key] = true;
      return;
    }
    effective[o.key] =
      o.config_key in userPrefsMap
        ? userPrefsMap[o.config_key]
        : o.key in userPrefsMap
        ? userPrefsMap[o.key]
        : o.default_on;
  });
  return effective;
}

// Map a raw public-feed row (snake_case, from lookups public-feed) into the
// same UI shape as a direct received reco. Mirrors src/App.jsx pubMapped.
export function mapPublicReco(r) {
  return {
    ...r,
    assetName: r.asset_name,
    priceAt: r.reco_price,
    price: r.current_price,
    targetPrice: r.target_price,
    stopLoss: r.stop_loss,
    byName: r.by_name,
    from: r.from_id,
    feedSource: "public",
    reaction: "none",
    hidden: false,
    invested: false,
    deliveryId: null,
    isPublic: true,
    likes: r.likes_count || 0,
    commentCount: r.comment_count || 0,
    recType: r.recommendation_type || "Buy",
  };
}

// Map a raw network-engagement row into the UI shape. Mirrors engMapped.
export function mapNetworkReco(r) {
  return {
    ...r,
    assetName: r.asset_name,
    priceAt: r.reco_price,
    price: r.current_price,
    byName: r.by_name,
    from: r.from_id,
    feedSource: "network_engagement",
    reaction: "none",
    hidden: false,
    invested: false,
    deliveryId: null,
    commentCount: r.comment_count || 0,
    targetPrice: r.target_price ? Number(r.target_price) : null,
    stopLoss: r.stop_loss ? Number(r.stop_loss) : null,
    recType: r.recommendation_type || "Buy",
  };
}

// Map a raw my-tracked-recos row (snake_case, from engagement my-tracked-recos)
// into the UI shape RecoCard consumes. Mirrors the web TrackedSummaryWidget's
// trackedList mapping (src/features/discovery/Discovery.jsx).
export function mapTrackedReco(r) {
  return {
    id: r.id,
    assetName: r.asset_name,
    ticker: r.ticker,
    assetClass: r.asset_class,
    priceAt: Number(r.reco_price || 0),
    price: Number(r.current_price || 0),
    date: r.created_at ? String(r.created_at).slice(0, 10) : null,
    thesis: r.thesis,
    byName: r.recommender_name,
    from: r.recommender_id,
    recType: r.recommendation_type || "Buy",
    exitPrice: r.exit_price ? Number(r.exit_price) : null,
    targetDate: r.target_date ? String(r.target_date).slice(0, 10) : null,
    commentCount: Number(r.comment_count || 0),
    invested: r.is_invested,
    investedPrice: r.invested_price ? Number(r.invested_price) : null,
  };
}

/**
 * Compose the ranked Feed list from the three already-mapped sources.
 * Mirrors `feedRecs` in Discovery.jsx: direct first, then network-engagement
 * (deduped against direct), then public (deduped against everything so far),
 * hide-invested filter, then scoreFeedRec sort (highest first).
 *
 * @param received     mapped direct-delivery recos (getMyReceivedRecos)
 * @param networkRecos mapped network-engagement recos (mapNetworkReco)
 * @param publicRecos  mapped public recos (mapPublicReco)
 * @param cfg          effective feed config (computeEffectiveFeedConfig)
 * @param trackedIds   array/Set of tracked reco ids (for rank_untracked_first)
 * @param contactIds   Set of active-connection user ids (for the connection boost)
 */
export function buildFeed({ received = [], networkRecos = [], publicRecos = [], cfg = {}, trackedIds = [], contactIds = new Set() }) {
  const tracked = trackedIds instanceof Set ? trackedIds : new Set((trackedIds || []).map(String));
  const trackedHas = { has: (id) => tracked.has(String(id)) };

  const directIds = new Set(received.map((r) => r.id));
  let items = received.filter((r) => !r.hidden).map((r) => ({ ...r, feedSource: r.feedSource || "direct" }));

  if (cfg.src_network_engagement) {
    items = [...items, ...networkRecos.filter((r) => !directIds.has(r.id))];
  }

  if (cfg.src_public !== false) {
    const seenIds = new Set(items.map((r) => r.id));
    items = [...items, ...publicRecos.filter((r) => !seenIds.has(r.id))];
  }

  if (cfg.filter_hide_invested) items = items.filter((r) => !r.invested);

  return items
    .map((r) => ({ ...r, _score: scoreFeedRec(r, trackedHas, cfg, contactIds) }))
    .sort((a, b) => b._score - a._score);
}
