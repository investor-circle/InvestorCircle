/* ─── "My Tracked" activity layer ────────────────────────────────────────
 * Pure, presentation-agnostic derivation of "what's happened with the
 * ideas you're tracking" for Pulse's TrackedSummaryWidget
 * (src/features/discovery/Discovery.jsx). Follows the same modularity
 * precedent as src/utils/whatYouMissed.js: the widget renders whatever
 * deriveTrackedActivity() returns, it never computes activity inline, so
 * the algorithm can evolve later without touching the widget.
 *
 * ── What's actually implemented, and why ────────────────────────────────
 * Every category below is derivable from data the caller already has in
 * memory (recsReceived + publicFeedRecos, merged as `allFeedRecos` in
 * HomeFeed) or from one already-existing endpoint — nothing here adds a
 * new query, and nothing here invents a number the data model can't back:
 *
 *  - mover:      priceAt/price are present on every reco object regardless
 *                of source (mapReceivedRow, public-feed, network-engagement
 *                -feed all select them). A tracked idea whose cumulative
 *                move since it was shared clears MOVER_THRESHOLD_PCT is a
 *                mover. This is a *since-shared* number, not a daily delta
 *                — see the toggle note below for why.
 *  - exitSignal:  mapReceivedRow already selects exit_signal/exit_date
 *                (r.exitSignal / r.exitDate) — a tracked idea whose
 *                recommender flagged an exit.
 *  - reinforced:  "someone posted a new idea on a ticker you already
 *                track" is derivable by joining the tracked-ticker set
 *                against the full in-memory feed pool (allFeedRecos) —
 *                no new query, same join whatYouMissed.js already does
 *                for relevance tiers.
 *  - newComment:  commentCount is present on publicFeedRecos/network-
 *                engagement items (api/_lib/handlers/lookups.js selects
 *                comment_count for both) but is NOT present on direct
 *                deliveries (api/_lib/handlers/recommendations.js's
 *                mapReceivedRow selects comments/likes only for the
 *                "made" scope, not "received" — see CLAUDE_HANDOVER note
 *                below). So this category only fires for tracked ideas
 *                that also carry a commentCount; a tracked idea that was
 *                delivered to you directly and never appeared in the
 *                public/network pool silently has no comment signal here.
 *                That's an honest gap, not a bug — flagged in the PR
 *                report rather than papered over with a fake 0.
 *
 * NOT implemented — "target/thesis updates": ic_recommendations has no
 * updated_at / edit-history column anywhere in the schema (verified via
 * api/_lib/handlers/*.js and supabase/*.sql — every table that DOES track
 * edits, e.g. user_profiles/connections/ic_groups, has an explicit
 * updated_at column; ic_recommendations does not). Recommendations appear
 * to be immutable after creation except for price/exit-signal fields that
 * already have their own columns. Faking an "updated" event off of
 * created_at would misattribute normal aging as an edit, so this category
 * is skipped entirely rather than approximated.
 *
 * ── The "since yesterday" / "since tracking" toggle ─────────────────────
 * There is no daily price-history/snapshot table anywhere in this schema
 * (verified: no price_history/prev_close/snapshot table or column exists).
 * `price` is a single live "current price" field with no "as of" time-
 * series behind it, so a per-idea "% change since yesterday" cannot be
 * honestly computed — there is no yesterday price to diff against.
 *
 * Rather than fabricate that number, `mode: 'yesterday'` changes what the
 * activity list is filtered to, not how it's computed:
 *   - 'tracking' (default-adjacent, cumulative): every category above,
 *     unbounded by recency beyond each category's own natural window.
 *   - 'yesterday': movers are dropped entirely (a cumulative since-shared
 *     move can't be honestly relabeled "since yesterday"), and every
 *     remaining category is filtered to items whose own real date field
 *     (exitDate, the reinforcing idea's post date) falls inside the last
 *     ~1 day. newComment entries have no per-comment timestamp available
 *     client-side (only an aggregate count), so they're treated as
 *     "new since you last opened this widget" (see getSeenCommentCounts
 *     below) in both modes — which for a daily-checking user approximates
 *     "since yesterday" honestly without pretending to a literal calendar
 *     boundary it can't measure.
 * The widget surfaces this as two different summary shapes (a live
 * activity count for 'yesterday', the existing in/out-of-money composition
 * for 'tracking') rather than presenting a single number under both labels.
 */

// A tracked idea's cumulative move since it was shared must clear this to
// count as a "mover" worth a slot — keeps the widget from manufacturing
// noise out of a 1-2% wiggle. Slightly higher than whatYouMissed's 5%
// threshold since this is a tracked idea the user already committed to,
// not a "look what you missed" prompt — small wiggles aren't news here.
export const MOVER_THRESHOLD_PCT = 0.08;

// How many days back a *different* creator's post on a ticker you track
// still counts as "reinforced by your circle" in 'tracking' mode.
export const REINFORCED_WINDOW_DAYS = 10;

// The recency cutoff applied to every date-bearing category in 'yesterday'
// mode. Slightly over 24h so a browser session spanning midnight doesn't
// drop something that's genuinely "since you last checked yesterday."
const YESTERDAY_WINDOW_MS = 30 * 60 * 60 * 1000; // 30h

export const MAX_ACTIVITY_ITEMS = 4;

function tickerKeyOf(r) { return r.ticker || r.assetName || null; }

/** Movers — cumulative move since shared, from priceAt/price already on every reco. */
function moverItems(trackedRecos) {
  return trackedRecos
    .filter(r => r.priceAt > 0 && r.price > 0)
    .map(r => ({ r, retPct: (r.price - r.priceAt) / r.priceAt }))
    .filter(x => Math.abs(x.retPct) >= MOVER_THRESHOLD_PCT)
    .sort((a, b) => Math.abs(b.retPct) - Math.abs(a.retPct))
    .map(({ r, retPct }) => ({
      type: 'mover',
      idea: r,
      date: r.date,
      direction: retPct >= 0 ? 'up' : 'down',
      pct: retPct,
      headline: `${r.assetName} ${retPct >= 0 ? '+' : ''}${(retPct * 100).toFixed(1)}% since shared`,
    }));
}

/** Exit signals — recommender flagged an exit on a tracked idea. */
function exitSignalItems(trackedRecos) {
  return trackedRecos
    .filter(r => r.exitSignal)
    .sort((a, b) => new Date(b.exitDate || b.date || 0) - new Date(a.exitDate || a.date || 0))
    .map(r => ({
      type: 'exit',
      idea: r,
      date: r.exitDate || r.date,
      headline: `Exit signal flagged on ${r.assetName}`,
    }));
}

/** Reinforced — a different creator posted a different idea on a ticker you already track. */
function reinforcedItems(trackedRecos, allRecos, { now = Date.now(), windowDays = REINFORCED_WINDOW_DAYS } = {}) {
  const trackedByTicker = new Map();
  trackedRecos.forEach(r => { const k = tickerKeyOf(r); if (k && !trackedByTicker.has(k)) trackedByTicker.set(k, r); });
  if (!trackedByTicker.size) return [];

  const seenTicker = new Set();
  const results = [];
  for (const cand of (allRecos || [])) {
    const k = tickerKeyOf(cand);
    if (!k || !trackedByTicker.has(k) || seenTicker.has(k)) continue;
    const trackedIdea = trackedByTicker.get(k);
    if (cand.id === trackedIdea.id) continue; // the same idea, not a new post
    if (!cand.date) continue;
    const daysSince = (now - new Date(cand.date).getTime()) / 86400000;
    if (daysSince < 0 || daysSince > windowDays) continue;
    seenTicker.add(k);
    results.push({
      type: 'reinforced',
      idea: cand,
      date: cand.date,
      headline: `New idea posted on ${cand.assetName} — a ticker you track`,
    });
  }
  return results;
}

/** New comments — delta against a per-device "last seen count" snapshot (no per-comment timestamp available client-side). */
function newCommentItems(trackedRecos, seenCommentCounts) {
  return trackedRecos
    .filter(r => typeof r.commentCount === 'number' && r.commentCount > 0)
    .map(r => ({ r, delta: r.commentCount - (seenCommentCounts[r.id] ?? r.commentCount) }))
    .filter(x => x.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .map(({ r, delta }) => ({
      type: 'comment',
      idea: r,
      date: r.date,
      headline: `${delta} new comment${delta > 1 ? 's' : ''} on ${r.assetName}`,
    }));
}

/**
 * Full pipeline: tracked recos + the full in-memory feed pool -> a capped,
 * ranked list of activity items. Priority order (not a numeric score, this
 * is a short compact list, not a ranked feed): exit signals first (most
 * actionable), then movers, then new comments, then reinforcement.
 *
 * `mode` is 'tracking' (cumulative, default) or 'yesterday' (see module
 * header for what each honestly can and can't show).
 */
export function deriveTrackedActivity(trackedRecos, allRecos, ctx = {}) {
  const { mode = 'tracking', seenCommentCounts = {}, now = Date.now(), max = MAX_ACTIVITY_ITEMS } = ctx;
  const isYesterday = mode === 'yesterday';

  let items = [
    ...exitSignalItems(trackedRecos),
    ...(isYesterday ? [] : moverItems(trackedRecos)),
    ...newCommentItems(trackedRecos, seenCommentCounts),
    ...reinforcedItems(trackedRecos, allRecos, { now, windowDays: isYesterday ? 1.25 : REINFORCED_WINDOW_DAYS }),
  ];

  if (isYesterday) {
    items = items.filter(it =>
      it.type === 'comment' || // no per-comment timestamp; already delta-based, see header
      (it.date && (now - new Date(it.date).getTime()) <= YESTERDAY_WINDOW_MS)
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

// ── Comment-count "seen" snapshot (client-side, additive, no schema change) ──
// Same category of mechanism as whatYouMissed.js's getSeenIds/markSeen: a
// per-device localStorage snapshot, not a source of truth anything else
// depends on. Stores {recoId: lastSeenCommentCount} so newCommentItems can
// diff "has this grown since I last looked" without a per-comment
// timestamp. Snapshot is rewritten wholesale from the caller's current
// tracked-recos list on every save, so ids that fall out of tracking are
// naturally dropped instead of growing the stored blob forever.
const COMMENT_SEEN_PREFIX = 'mic_trackedactivity_commentcounts_';

function commentSeenKey(userId) { return `${COMMENT_SEEN_PREFIX}${userId || 'anon'}`; }

/** Read the last-seen commentCount snapshot for this user as {recoId: count}. */
export function getSeenCommentCounts(userId) {
  try {
    const raw = localStorage.getItem(commentSeenKey(userId));
    return raw ? (JSON.parse(raw) || {}) : {};
  } catch {
    return {};
  }
}

/** Overwrite the snapshot with the current commentCount for the given tracked recos. One write, not per-card. */
export function saveSeenCommentCounts(userId, trackedRecos) {
  try {
    const next = {};
    (trackedRecos || []).forEach(r => {
      if (typeof r.commentCount === 'number') next[r.id] = r.commentCount;
    });
    localStorage.setItem(commentSeenKey(userId), JSON.stringify(next));
  } catch { /* localStorage unavailable — newCommentItems degrades to "always new", not fatal */ }
}
