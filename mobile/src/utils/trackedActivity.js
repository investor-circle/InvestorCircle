import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * "My Tracked" activity layer — ported verbatim from the web's
 * src/utils/trackedActivity.js (same module, same categories, same
 * thresholds), which feeds the cards shown below the graph on Pulse's My
 * Tracked widget. See the web file for the full rationale behind each
 * category and the since-yesterday/since-tracking distinction; kept short
 * here since this is a straight port, not a fork.
 *
 * The only difference from the web copy is the seen-comment-count storage
 * at the bottom: AsyncStorage (async) instead of localStorage (sync).
 */

export const MOVER_THRESHOLD_PCT = 0.08;
export const DAILY_MOVER_THRESHOLD_PCT = 0.02;
export const REINFORCED_WINDOW_DAYS = 10;
const YESTERDAY_WINDOW_MS = 30 * 60 * 60 * 1000; // 30h
export const MAX_ACTIVITY_ITEMS = 4;

function tickerKeyOf(r) {
  return r.ticker || r.assetName || null;
}

/** Movers — cumulative move since shared, from priceAt/price already on every reco. */
function moverItems(trackedRecos) {
  return trackedRecos
    .filter((r) => r.priceAt > 0 && r.price > 0)
    .map((r) => ({ r, retPct: (r.price - r.priceAt) / r.priceAt }))
    .filter((x) => Math.abs(x.retPct) >= MOVER_THRESHOLD_PCT)
    .sort((a, b) => Math.abs(b.retPct) - Math.abs(a.retPct))
    .map(({ r, retPct }) => ({
      type: "mover",
      idea: r,
      date: r.date,
      direction: retPct >= 0 ? "up" : "down",
      pct: retPct,
      headline: `${r.assetName} ${retPct >= 0 ? "+" : ""}${(retPct * 100).toFixed(1)}% since shared`,
    }));
}

/** Daily movers — a real close-to-close move read from the Phase 9 instrument daily-price snapshots. */
function dailyMoverItems(trackedRecos, dailyPrices) {
  if (!dailyPrices) return [];
  const seen = new Set();
  const items = [];
  for (const r of trackedRecos) {
    const tickerKey = (r.ticker || "").trim().toUpperCase();
    if (!tickerKey || seen.has(r.id)) continue;
    const key = `${tickerKey}::${String(r.assetClass || "").trim().toUpperCase()}`;
    const snap = dailyPrices[key];
    if (!snap || snap.changePct == null || snap.prevClose == null) continue;
    const retPct = snap.changePct / 100;
    if (Math.abs(retPct) < DAILY_MOVER_THRESHOLD_PCT) continue;
    seen.add(r.id);
    items.push({
      type: "mover",
      idea: r,
      date: snap.date,
      direction: retPct >= 0 ? "up" : "down",
      pct: retPct,
      daily: true,
      prevDate: snap.prevDate,
      headline: `${r.assetName} ${retPct >= 0 ? "+" : ""}${(retPct * 100).toFixed(1)}% since previous close`,
    });
  }
  return items.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
}

/** Exit signals — recommender flagged an exit on a tracked idea. */
function exitSignalItems(trackedRecos) {
  return trackedRecos
    .filter((r) => r.exitSignal)
    .sort((a, b) => new Date(b.exitDate || b.date || 0) - new Date(a.exitDate || a.date || 0))
    .map((r) => ({
      type: "exit",
      idea: r,
      date: r.exitDate || r.date,
      headline: `Exit signal flagged on ${r.assetName}`,
    }));
}

/** Reinforced — a different creator posted a different idea on a ticker you already track. */
function reinforcedItems(trackedRecos, allRecos, { now = Date.now(), windowDays = REINFORCED_WINDOW_DAYS } = {}) {
  const trackedByTicker = new Map();
  trackedRecos.forEach((r) => {
    const k = tickerKeyOf(r);
    if (k && !trackedByTicker.has(k)) trackedByTicker.set(k, r);
  });
  if (!trackedByTicker.size) return [];

  const seenTicker = new Set();
  const results = [];
  for (const cand of allRecos || []) {
    const k = tickerKeyOf(cand);
    if (!k || !trackedByTicker.has(k) || seenTicker.has(k)) continue;
    const trackedIdea = trackedByTicker.get(k);
    if (cand.id === trackedIdea.id) continue;
    if (!cand.date) continue;
    const daysSince = (now - new Date(cand.date).getTime()) / 86400000;
    if (daysSince < 0 || daysSince > windowDays) continue;
    seenTicker.add(k);
    results.push({
      type: "reinforced",
      idea: cand,
      date: cand.date,
      headline: `New idea posted on ${cand.assetName} — a ticker you track`,
    });
  }
  return results;
}

/** New comments — delta against a per-device "last seen count" snapshot. */
function newCommentItems(trackedRecos, seenCommentCounts) {
  return trackedRecos
    .filter((r) => typeof r.commentCount === "number" && r.commentCount > 0)
    .map((r) => ({ r, delta: r.commentCount - (seenCommentCounts[r.id] ?? r.commentCount) }))
    .filter((x) => x.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .map(({ r, delta }) => ({
      type: "comment",
      idea: r,
      date: r.date,
      headline: `${delta} new comment${delta > 1 ? "s" : ""} on ${r.assetName}`,
    }));
}

/**
 * Full pipeline: tracked recos + the full in-memory feed pool -> a capped,
 * ranked list of activity items. Priority order: exit signals first, then
 * movers, then new comments, then reinforcement.
 */
export function deriveTrackedActivity(trackedRecos, allRecos, ctx = {}) {
  const {
    mode = "tracking",
    seenCommentCounts = {},
    dailyPrices = null,
    now = Date.now(),
    max = MAX_ACTIVITY_ITEMS,
  } = ctx;
  const isYesterday = mode === "yesterday";

  let items = [
    ...exitSignalItems(trackedRecos),
    ...(isYesterday ? dailyMoverItems(trackedRecos, dailyPrices) : moverItems(trackedRecos)),
    ...newCommentItems(trackedRecos, seenCommentCounts),
    ...reinforcedItems(trackedRecos, allRecos, { now, windowDays: isYesterday ? 1.25 : REINFORCED_WINDOW_DAYS }),
  ];

  if (isYesterday) {
    items = items.filter(
      (it) =>
        it.type === "comment" ||
        it.daily ||
        (it.date && now - new Date(it.date).getTime() <= YESTERDAY_WINDOW_MS)
    );
  }

  const seenKeys = new Set();
  const out = [];
  for (const item of items) {
    const key = `${item.type}:${item.idea.id}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

// ── Comment-count "seen" snapshot — AsyncStorage, not localStorage ──
// Same mechanism as the web's, just async: a per-device snapshot, not a
// source of truth anything else depends on. Rewritten wholesale from the
// caller's current tracked-recos list on every save.
const COMMENT_SEEN_PREFIX = "mic_trackedactivity_commentcounts_";

function commentSeenKey(userId) {
  return `${COMMENT_SEEN_PREFIX}${userId || "anon"}`;
}

/** Read the last-seen commentCount snapshot for this user as {recoId: count}. */
export async function getSeenCommentCounts(userId) {
  try {
    const raw = await AsyncStorage.getItem(commentSeenKey(userId));
    return raw ? JSON.parse(raw) || {} : {};
  } catch {
    return {};
  }
}

/** Overwrite the snapshot with the current commentCount for the given tracked recos. */
export async function saveSeenCommentCounts(userId, trackedRecos) {
  try {
    const next = {};
    (trackedRecos || []).forEach((r) => {
      if (typeof r.commentCount === "number") next[r.id] = r.commentCount;
    });
    await AsyncStorage.setItem(commentSeenKey(userId), JSON.stringify(next));
  } catch {
    /* AsyncStorage unavailable — newCommentItems degrades to "always new", not fatal */
  }
}
