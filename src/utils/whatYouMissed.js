/* ─── "What You Missed" ranking layer ────────────────────────────────────────
 * Pure, presentation-agnostic scoring for Pulse's "What You Missed" widget
 * (formerly "Missed Opportunities"). Everything here operates on data the
 * caller already has in memory (the merged Pulse reco pool, tracked-reco
 * ids, contact ids, tracked-creator ids, and a client-side seen-id set) —
 * no network calls happen in this module.
 *
 * Pipeline, matching the product spec's shape:
 *   generateCandidates()  -> eligible pool (time window + real movement +
 *                            not already tracked/hidden)
 *   scoreCandidate()      -> one numeric score per candidate (recency x
 *                            movement x relevance x seen-decay)
 *   rankWhatYouMissed()   -> sorted, deduped, capped, {idea, creator,
 *                            movement, relevance, reason}-shaped output
 *
 * The widget must not know any of the constants or math below — it just
 * renders whatever rankWhatYouMissed() returns. Adding a new signal later
 * (ICI, engagement, sector affinity, market context, ...) means editing
 * scoreCandidate() only; the widget and this module's public shape don't
 * change.
 *
 * ── Tuning: why these numbers ───────────────────────────────────────────
 * This is an early-stage, invite-only platform — there is no production
 * traffic history to mine for a data-driven half-life yet, and this repo
 * has no live DB credentials available to query real row counts/date
 * spans from this environment. The constants below are therefore a
 * reasoned starting point, not a measured one, calibrated against the one
 * piece of real signal already in the codebase: the main Feed's own
 * ranking (`scoreFeedRec` in `src/utils/format.js`) fades an idea's
 * recency contribution to zero over ~29 days (loses 3.5pts/day off a
 * 100pt recency budget). "What You Missed" is explicitly meant to be
 * *more* time-sensitive than the general feed ("a matter of days," per
 * spec, not weeks) since its whole premise is "something just happened,"
 * so its window and decay are set tighter than the feed's ~29-day fade,
 * not looser. Treat CANDIDATE_WINDOW_DAYS / RECENCY_HALFLIFE_DAYS as the
 * first thing to revisit once real usage data (or DB access) exists.
 */

// Hard shelf-life cutoff — beyond this many days old, an idea is not a
// candidate at all, no matter how large its move. Three weeks: long enough
// that an idea posted a few days before someone's last visit still has a
// chance to surface, short enough that this never turns into a permanent
// leaderboard of old winners.
export const CANDIDATE_WINDOW_DAYS = 21;

// Exponential half-life for the recency factor within that window: an idea
// loses half its scoring weight every N days. At the 21-day cutoff a
// half-life of 5 days leaves a candidate at ~1/16th of its day-0 weight —
// effectively gone well before the hard cutoff removes it outright, so the
// cutoff is a backstop, not the primary decay mechanism.
export const RECENCY_HALFLIFE_DAYS = 5;

// Minimum |return| since the recommendation for a move to count as
// "meaningful" rather than noise — keeps the widget from manufacturing
// FOMO out of a 1% wiggle.
export const MIN_MOVEMENT_PCT = 0.05;

// Movement contributes up to this many points (a 70%+ move gets the same
// credit as exactly 70% would) so one outlier can't mathematically out-run
// every other signal combined.
const MAX_MOVEMENT_POINTS = 70;

// Personal relevance of the creator, highest to lowest.
const RELEVANCE_POINTS = { tracked: 40, circle: 22, connection: 22, public: 6 };

// Once an idea has been surfaced to the user, its score is multiplied by
// this — a substantial but not total decay, so a big enough new move can
// still resurface something the user glanced at once but never opened.
// (See markSeen/getSeenIds below for why this is binary seen/unseen and
// not a three-state surfaced/opened model.)
const SEEN_DECAY_MULTIPLIER = 0.3;

// Below this score a candidate isn't worth a slot even if nothing else is
// competing — an empty widget reads better than a padded, weak one.
const MIN_SCORE_TO_SHOW = 5;

const MAX_RESULTS = 3;

/** Relevance tier for one candidate, given the caller's relationship data. */
function relevanceTierFor(r, { trackedCreatorIds, contactIds }) {
  if (trackedCreatorIds?.has(r.from)) return 'tracked';
  if (r.shareType === 'group') return 'circle';
  if (contactIds?.has(r.from)) return 'connection';
  if (r.feedSource === 'network_engagement') return 'connection';
  return 'public';
}

function reasonFor(tier, r) {
  switch (tier) {
    case 'tracked':    return 'From a creator you track';
    case 'circle':      return r.groupName ? `Shared in ${r.groupName}` : 'Shared in your Circle';
    case 'connection':  return 'From your connection';
    default:            return 'Public idea on the platform';
  }
}

/** Step 1 — candidate generation: the eligible pool before any scoring. */
export function generateCandidates(recos, { tracked, now = Date.now() } = {}) {
  return (recos || [])
    .filter(r => !r.hidden && r.priceAt > 0 && r.price > 0 && r.date)
    .filter(r => !tracked?.has(r.id)) // already tracked/acted on -> not "missed"
    .map(r => {
      const daysSince = (now - new Date(r.date).getTime()) / 86400000;
      const retPct = (r.price - r.priceAt) / r.priceAt;
      return { r, daysSince, retPct };
    })
    .filter(c => c.daysSince >= 0 && c.daysSince <= CANDIDATE_WINDOW_DAYS)
    .filter(c => Math.abs(c.retPct) >= MIN_MOVEMENT_PCT);
}

/** Step 2 — per-candidate score. Pure function of one candidate + context. */
export function scoreCandidate(candidate, ctx) {
  const { r, daysSince, retPct } = candidate;
  const recencyFactor = Math.pow(0.5, daysSince / RECENCY_HALFLIFE_DAYS);
  const movementPoints = Math.min(Math.abs(retPct) * 100, MAX_MOVEMENT_POINTS);
  const tier = relevanceTierFor(r, ctx);
  const relevancePoints = RELEVANCE_POINTS[tier] ?? RELEVANCE_POINTS.public;
  const seen = ctx.seenIds?.has(r.id);
  const seenMultiplier = seen ? SEEN_DECAY_MULTIPLIER : 1;

  const score = (movementPoints + relevancePoints) * recencyFactor * seenMultiplier;
  return { score, tier, seen, recencyFactor, movementPoints, relevancePoints, retPct };
}

/**
 * Step 3 — full pipeline: candidates -> scored -> ranked, deduped, capped.
 * Returns up to MAX_RESULTS entries shaped { idea, creator, movement,
 * relevance, reason, score }. `creator` is a plain {id, name} the widget
 * can pair with its own avatar/contact lookups; this module doesn't know
 * about React or the app's contact-card presentation.
 */
export function rankWhatYouMissed(recos, ctx = {}) {
  const { tracked, contactIds, trackedCreatorIds, seenIds, now = Date.now(), resolveCreatorName } = ctx;
  const scoreCtx = { contactIds, trackedCreatorIds, seenIds };

  const scored = generateCandidates(recos, { tracked, now })
    .map(c => ({ c, s: scoreCandidate(c, scoreCtx) }))
    .filter(({ s }) => s.score >= MIN_SCORE_TO_SHOW)
    .sort((a, b) => b.s.score - a.s.score);

  // Avoid repetition: at most one idea per ticker (highest-scoring wins),
  // and cap how many slots one creator can take up.
  const seenTickers = new Set();
  const perCreatorCount = new Map();
  const results = [];
  for (const { c, s } of scored) {
    if (results.length >= MAX_RESULTS) break;
    const tickerKey = c.r.ticker || c.r.assetName;
    if (tickerKey && seenTickers.has(tickerKey)) continue;
    const creatorCount = perCreatorCount.get(c.r.from) || 0;
    if (creatorCount >= 2) continue;

    if (tickerKey) seenTickers.add(tickerKey);
    perCreatorCount.set(c.r.from, creatorCount + 1);

    results.push({
      idea: c.r,
      creator: { id: c.r.from, name: resolveCreatorName?.(c.r) || c.r.byName || 'Someone' },
      movement: { pct: s.retPct, direction: s.retPct >= 0 ? 'up' : 'down' },
      relevance: { tier: s.tier },
      reason: reasonFor(s.tier, c.r),
      score: s.score,
    });
  }
  return results;
}

// ── Seen-state tracking (client-side, additive, no schema change) ──────────
// Precedent: `Connections.jsx`'s TrackingMeSection already uses a per-device
// localStorage cutoff for a purely-visual "new since last visit" affordance,
// with the explicit rationale "no schema change needed." "What You Missed"
// needs one step more than a single cutoff timestamp (items enter and leave
// the ranked set based on score, not simple chronological order), so this
// stores a small {recoId: firstSeenAtMs} map instead of one timestamp — but
// it's the same category of mechanism, and the same tradeoff: seen-state is
// per-browser, not per-account, so it won't follow a user across devices or
// survive clearing site data. That's an accepted limitation for a v1 FOMO
// affordance, not a source of truth anything else depends on. Entries older
// than the candidate window are pruned on every read/write so the stored
// blob can't grow without bound.
const SEEN_STORAGE_PREFIX = 'mic_whatyoumissed_seen_';

function seenKey(userId) { return `${SEEN_STORAGE_PREFIX}${userId || 'anon'}`; }

function pruneSeenMap(map, now = Date.now()) {
  const cutoffMs = CANDIDATE_WINDOW_DAYS * 86400000;
  const next = {};
  for (const [id, ts] of Object.entries(map)) {
    if (now - ts <= cutoffMs) next[id] = ts;
  }
  return next;
}

/** Read the current seen-id set for this user as a Set<string>. */
export function getSeenIds(userId) {
  try {
    const raw = localStorage.getItem(seenKey(userId));
    if (!raw) return new Set();
    const map = pruneSeenMap(JSON.parse(raw) || {});
    return new Set(Object.keys(map));
  } catch {
    return new Set();
  }
}

/** Mark the given reco ids as surfaced-to-user. One write, not per-card. */
export function markSeen(userId, ids) {
  if (!ids || !ids.length) return;
  try {
    const raw = localStorage.getItem(seenKey(userId));
    const map = pruneSeenMap(raw ? JSON.parse(raw) || {} : {});
    const now = Date.now();
    ids.forEach(id => { map[String(id)] = now; });
    localStorage.setItem(seenKey(userId), JSON.stringify(map));
  } catch { /* localStorage unavailable — seen-state degrades to "always unseen", not fatal */ }
}
