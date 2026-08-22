/* ─── "Trending on MIC" ranking layer ─────────────────────────────────────────
 * Pure, presentation-agnostic scoring for Pulse's "Trending on MIC" widget
 * (formerly "Trending on Platform"). Same shape as
 * `src/utils/whatYouMissed.js` — candidate generation -> per-candidate
 * scoring -> ranked, deduped, capped output — and, like that module, it
 * makes no network calls: it scores whatever pool the caller hands it.
 *
 *   generateCandidates()  -> eligible pool (still active + real engagement)
 *   scoreCandidate()      -> one numeric score per candidate
 *   rankTrending()        -> sorted, diversity-capped, {idea, creator,
 *                            signal, reason, score}-shaped output
 *
 * ── What makes this different from "What You Missed" ────────────────────
 * "What You Missed" answers "did something in *your circle* move while you
 * were away" — it is deliberately personalized and scored on *price*
 * movement. Trending answers a different question: "what is the platform as
 * a whole paying attention to right now" — it is scored on *engagement*,
 * and it must NOT be filtered down to the viewer's own circle. See the
 * "Platform-wide, not personalized" note below; that constraint is the
 * whole point of this widget and the main thing the previous
 * implementation got wrong.
 *
 * ── Platform-wide, not personalized ─────────────────────────────────────
 * The widget this replaced was fed `allFeedRecos` — the viewer's own Pulse
 * pool (their direct deliveries merged with the public feed). Ranking that
 * pool by likes meant "Trending on Platform" was substantially a view of
 * the viewer's own circle, which is the opposite of a discovery surface.
 * The caller now passes the genuinely platform-wide public pool instead
 * (`publicFeedRecos`, i.e. the `public-feed` lookups action: every public
 * recommendation on the platform, most recent first). Personal relevance
 * survives here only as AFFINITY_BONUS_POINTS — a deliberately tiny
 * tie-breaker, roughly half of one recent like — and as a contextual label
 * on the card. It must never become a filter: nothing in this module
 * removes a candidate for being from someone the viewer doesn't know.
 *
 * ── Honesty about signals ───────────────────────────────────────────────
 * Every number this module emits has to be one the data actually supports.
 * `recommendation_reactions` and `recommendation_comments` both carry
 * `created_at` (already relied on by `getGroupRecos`'s last_activity_at in
 * api/_lib/handlers/recommendations.js), so recent-window engagement counts
 * are real, not inferred. But the frontend (GitHub Pages) and the API
 * (Vercel) deploy separately, so a browser running this code may be talking
 * to an API that predates the recent-engagement columns. In that case
 * `recentLikes`/`recentComments`/`lastActivityAt` are absent, `hasVelocity`
 * goes false, and scoring degrades to damped-lifetime-engagement x recency
 * with reasons that never claim a recency the response didn't contain.
 * We do not synthesize a velocity number from lifetime counts.
 *
 * ── Tuning: why these numbers ───────────────────────────────────────────
 * As with whatYouMissed.js, this is an early-stage platform with no traffic
 * history to mine and no live DB access from this environment, so the
 * constants are reasoned, not measured. They are calibrated against the one
 * explicit product requirement available: "a 2-day-old idea with 15 recent
 * engagements should outrank a 3-week-old idea with 30 cumulative likes."
 * With the values below that comparison lands at roughly 199 vs 2.5 (see
 * the harness described in the report) — i.e. the ordering is not marginal.
 * Everything here is exported or module-local by design so the widget never
 * needs to know any of it.
 */

// Hard shelf-life. An idea whose most recent activity (post, like or
// comment) is older than this is not trending by any reasonable reading of
// the word, regardless of how much lifetime engagement it accumulated.
// Measured against last activity rather than post date on purpose: a
// four-week-old idea that picks up a burst of comments today genuinely IS
// trending, and should be allowed back in.
export const TRENDING_WINDOW_DAYS = 21;

// The server counts likes/comments inside this window as "recent". Kept as
// an exported constant because it must stay in sync with the interval in
// the `public-feed` query (api/_lib/handlers/lookups.js) — if one changes,
// the other has to.
export const VELOCITY_WINDOW_DAYS = 7;

// Exponential half-life applied to time since *last activity*. Deliberately
// much tighter than whatYouMissed.js's 8 days: that widget is catching you
// up on things you may have missed over a week or two away, whereas this
// one is answering "right now". Three days means a thread that went quiet
// loses half its standing every three days, so the widget turns over on its
// own even if nothing new is posted.
export const ACTIVITY_HALFLIFE_DAYS = 3;

// Recent engagement points. A comment is weighted well above a like because
// it costs materially more effort and is a much stronger signal that an
// idea is actually being discussed rather than passively acknowledged.
const RECENT_LIKE_POINTS = 6;
const RECENT_COMMENT_POINTS = 10;

// Lifetime engagement is included, but logarithmically damped so it can
// inform rank without ever dominating it: 30 lifetime engagements is worth
// ~24.8 points, only ~24% more than the ~20 points 15 lifetime engagements
// earns, while 15 *recent* engagements is worth 90-150. This is the
// mechanism that stops an old idea with a big historical like count from
// squatting at the top forever — the failure mode of the previous widget.
const LIFETIME_WEIGHT = 5;

// Velocity: what share of an idea's total engagement arrived in the recent
// window. An idea whose engagement is all from this week gets the full
// boost; one whose engagement is all historical gets none. This is a ratio
// of two real counts, not a modelled rate.
const VELOCITY_BOOST = 0.6;

// Newness: a genuinely new idea that has already attracted engagement is
// more interesting than an equally-engaged older one. Fades linearly to
// zero across NOVELTY_WINDOW_DAYS. Note this is a bonus, never an entry
// ticket — see generateCandidates: a brand-new idea nobody has engaged with
// is not "trending", and padding the widget with those would be dishonest.
const NOVELTY_POINTS = 12;
const NOVELTY_WINDOW_DAYS = 3;

// Personal relevance, as a tie-breaker only — worth about half a single
// recent like. Large enough to break a tie between two otherwise-equal
// ideas in favour of the one with a familiar name on it, far too small to
// pull a circle idea past a genuinely trending stranger's. Keep it tiny.
const AFFINITY_BONUS_POINTS = 3;

// Once surfaced, an idea's score is multiplied down to this — enough that
// the widget visibly turns over between visits, not so much that a still-
// genuinely-hot idea vanishes outright.
const SEEN_DECAY_MULTIPLIER = 0.35;

// ...but each engagement an idea has picked up *since* the viewer last saw
// it buys back some of that decay, up to a full recovery. Four new
// engagements and a previously-seen idea is competing at full strength
// again. This is why the seen store records an engagement count alongside a
// timestamp (see getSeenState) rather than just marking a boolean: "seen"
// should decay rank, not permanently retire an idea that is still
// accelerating.
const SEEN_RECOVERY_PER_ENGAGEMENT = 0.1625;

// Below this a candidate isn't worth a slot. Set low deliberately: on a
// low-volume platform an under-filled widget beats an empty one, and the
// no-velocity-data degradation path (see module header) scores everything
// lower across the board. An idea with a single lifetime like and no
// recency data scores ~5 and can still appear; zero-engagement ideas are
// excluded at candidate generation, not here.
const MIN_SCORE_TO_SHOW = 3;

const MAX_RESULTS = 3;

// Diversity caps applied to the final selection, same technique as
// whatYouMissed.js's. Stricter here — one idea per creator rather than two
// — because with only three slots and creator discovery as an explicit
// goal, three slots showing three different people is worth more than
// letting one prolific poster take two of them.
const MAX_PER_CREATOR = 1;

const DAY_MS = 86400000;

/** Engagement counts for one reco, normalized across the pool's shapes. */
function engagementOf(r) {
  const likes = Number(r.likes ?? r.likes_count ?? 0) || 0;
  const comments = Number(r.commentCount ?? r.comment_count ?? 0) || 0;
  // Absent (not zero) means the API predates these columns — see header.
  const rawRecentLikes = r.recentLikes ?? r.recent_likes;
  const rawRecentComments = r.recentComments ?? r.recent_comments;
  const hasVelocity = rawRecentLikes != null || rawRecentComments != null;
  const recentLikes = Math.min(Number(rawRecentLikes) || 0, likes);
  const recentComments = Math.min(Number(rawRecentComments) || 0, comments);
  return {
    likes, comments, recentLikes, recentComments, hasVelocity,
    lifetime: likes + comments,
    recent: recentLikes + recentComments,
  };
}

/** Ms timestamp of the most recent real activity we know about on a reco. */
function lastActivityMs(r) {
  const raw = r.lastActivityAt ?? r.last_activity_at;
  const posted = r.date ? new Date(r.date).getTime() : NaN;
  const active = raw ? new Date(raw).getTime() : NaN;
  if (Number.isFinite(active) && Number.isFinite(posted)) return Math.max(active, posted);
  if (Number.isFinite(active)) return active;
  return posted;
}

/**
 * Step 1 — candidate generation.
 *
 * Note what is deliberately NOT filtered here: nothing about the viewer's
 * connections, circles, tracked creators or tracked ideas. This is the
 * platform-wide pool, and it stays that way (see module header). The only
 * exclusions are hidden ideas, ideas with no engagement at all (not
 * trending, by definition), and ideas whose last activity has aged out.
 */
export function generateCandidates(recos, { now = Date.now() } = {}) {
  return (recos || [])
    .filter(r => r && !r.hidden && r.id)
    .map(r => {
      const eng = engagementOf(r);
      const postedMs = r.date ? new Date(r.date).getTime() : NaN;
      const activeMs = lastActivityMs(r);
      return {
        r, eng,
        ageDays: Number.isFinite(postedMs) ? (now - postedMs) / DAY_MS : NaN,
        idleDays: Number.isFinite(activeMs) ? (now - activeMs) / DAY_MS : NaN,
      };
    })
    .filter(c => c.eng.lifetime > 0)
    .filter(c => Number.isFinite(c.idleDays) && c.idleDays >= -1 && c.idleDays <= TRENDING_WINDOW_DAYS);
}

/** Step 2 — per-candidate score. Pure function of one candidate + context. */
export function scoreCandidate(candidate, ctx = {}) {
  const { r, eng, ageDays, idleDays } = candidate;

  const recentPoints = eng.recentLikes * RECENT_LIKE_POINTS + eng.recentComments * RECENT_COMMENT_POINTS;
  const lifetimePoints = LIFETIME_WEIGHT * Math.log2(1 + eng.lifetime);

  // Share of all engagement that landed inside the recent window. Only
  // meaningful when the API actually supplied recent counts.
  const velocityRatio = eng.hasVelocity && eng.lifetime > 0
    ? Math.min(eng.recent / eng.lifetime, 1)
    : 0;
  const velocityFactor = 1 + VELOCITY_BOOST * velocityRatio;

  const noveltyPoints = Number.isFinite(ageDays) && ageDays >= 0 && ageDays < NOVELTY_WINDOW_DAYS
    ? NOVELTY_POINTS * (1 - ageDays / NOVELTY_WINDOW_DAYS)
    : 0;

  const isAffiliated = ctx.contactIds?.has(r.from) || ctx.trackedCreatorIds?.has(r.from);
  const affinityPoints = isAffiliated ? AFFINITY_BONUS_POINTS : 0;

  const recencyFactor = Math.pow(0.5, Math.max(idleDays, 0) / ACTIVITY_HALFLIFE_DAYS);

  // Seen-decay, partially bought back by engagement accrued since the
  // viewer last saw this card.
  const seenEntry = ctx.seenState?.[String(r.id)];
  const newSinceSeen = seenEntry ? Math.max(0, eng.lifetime - (seenEntry.e || 0)) : 0;
  const seenMultiplier = seenEntry
    ? Math.min(1, SEEN_DECAY_MULTIPLIER + newSinceSeen * SEEN_RECOVERY_PER_ENGAGEMENT)
    : 1;

  const score = ((recentPoints + lifetimePoints) * velocityFactor + noveltyPoints + affinityPoints)
    * recencyFactor * seenMultiplier;

  return {
    score, eng, recentPoints, lifetimePoints, noveltyPoints, affinityPoints,
    velocityRatio, velocityFactor, recencyFactor, seenMultiplier,
    seen: !!seenEntry, newSinceSeen, isAffiliated, ageDays, idleDays,
  };
}

/**
 * Step 3 — the "why is this trending" line.
 *
 * Derived strictly from whichever real signal actually drove this
 * candidate's score, in descending order of how much it contributed. Every
 * branch cites a count the API returned. The `hasVelocity` branches are
 * skipped entirely when the API didn't supply recent-window counts, so we
 * never attach "this week" to a lifetime number.
 */
export function reasonFor(s) {
  const { eng } = s;
  // Comments first: they outweigh likes in the score, so when both are
  // present the discussion is the more accurate explanation of the rank.
  if (eng.hasVelocity && eng.recentComments >= 2) return { icon: '💬', text: `${eng.recentComments} new comments this week` };
  if (eng.hasVelocity && eng.recentLikes >= 2) return { icon: '🔥', text: `${eng.recentLikes} investors liked it this week` };
  if (eng.hasVelocity && eng.recent === 1 && eng.recentComments === 1) return { icon: '💬', text: 'New comment this week' };
  if (eng.hasVelocity && eng.recent === 1) return { icon: '🔥', text: 'Picked up a like this week' };
  if (s.noveltyPoints > 0) return { icon: '⚡', text: 'New idea already getting attention' };
  if (eng.comments > 0 && eng.likes > 0) return { icon: '👀', text: `${eng.lifetime} investors engaged` };
  if (eng.comments > 0) return { icon: '💬', text: `${eng.comments} comment${eng.comments === 1 ? '' : 's'}` };
  return { icon: '👀', text: `${eng.likes} investor${eng.likes === 1 ? '' : 's'} liked this` };
}

/**
 * Step 4 — full pipeline: candidates -> scored -> ranked, diversity-capped.
 *
 * Returns up to MAX_RESULTS entries shaped
 *   { idea, creator, signal, reason, affiliated, score }
 * `creator` is a plain {id, name} for the widget to pair with its own
 * avatar/ICI lookups; this module knows nothing about React.
 */
export function rankTrending(recos, ctx = {}) {
  const { contactIds, trackedCreatorIds, seenState, now = Date.now(), resolveCreatorName } = ctx;
  const scoreCtx = { contactIds, trackedCreatorIds, seenState };

  const scored = generateCandidates(recos, { now })
    .map(c => ({ c, s: scoreCandidate(c, scoreCtx) }))
    .filter(({ s }) => s.score >= MIN_SCORE_TO_SHOW)
    .sort((a, b) => b.s.score - a.s.score);

  // Diversity: at most one idea per ticker and MAX_PER_CREATOR per creator,
  // highest-scoring instance of each winning. Same technique as
  // whatYouMissed.js's final selection loop.
  const usedTickers = new Set();
  const perCreator = new Map();
  const results = [];
  for (const { c, s } of scored) {
    if (results.length >= MAX_RESULTS) break;
    const tickerKey = c.r.ticker || c.r.assetName;
    if (tickerKey && usedTickers.has(tickerKey)) continue;
    const creatorKey = c.r.from;
    const used = perCreator.get(creatorKey) || 0;
    if (creatorKey && used >= MAX_PER_CREATOR) continue;

    if (tickerKey) usedTickers.add(tickerKey);
    if (creatorKey) perCreator.set(creatorKey, used + 1);

    results.push({
      idea: c.r,
      creator: { id: c.r.from, name: resolveCreatorName?.(c.r) || c.r.byName || 'Someone' },
      signal: {
        likes: s.eng.likes,
        comments: s.eng.comments,
        recentLikes: s.eng.recentLikes,
        recentComments: s.eng.recentComments,
        hasVelocity: s.eng.hasVelocity,
      },
      reason: reasonFor(s),
      affiliated: s.isAffiliated,
      score: s.score,
    });
  }
  return results;
}

// ── Seen-state tracking (client-side, additive, no schema change) ──────────
// Same category of mechanism as whatYouMissed.js's getSeenIds/markSeen and
// trackedActivity.js's seen-comment-counts, and for the same reason: this
// is a presentational freshness affordance, not something any other feature
// reads, so it does not justify a table, a write endpoint, or a round-trip
// on Pulse's critical path. It borrows from both precedents — whatYouMissed
// stores {id: timestamp}, trackedActivity stores a per-id engagement count,
// and Trending needs both: the timestamp to prune, the count to let an idea
// that kept accelerating climb back out of seen-decay (see
// SEEN_RECOVERY_PER_ENGAGEMENT).
//
// Accepted limitation, identical to the two precedents: seen-state is
// per-browser, not per-account. It won't follow a user across devices and
// won't survive clearing site data; the widget then simply behaves as if
// everything is unseen, which is a degraded ordering, not a broken one.
// Entries older than the trending window are pruned on every read and
// write, so the stored blob cannot grow without bound.
const SEEN_STORAGE_PREFIX = 'mic_trending_seen_';

function seenKey(userId) { return `${SEEN_STORAGE_PREFIX}${userId || 'anon'}`; }

function pruneSeenState(map, now = Date.now()) {
  const cutoffMs = TRENDING_WINDOW_DAYS * DAY_MS;
  const next = {};
  for (const [id, entry] of Object.entries(map || {})) {
    if (entry && typeof entry === 'object' && now - (entry.t || 0) <= cutoffMs) next[id] = entry;
  }
  return next;
}

/** Read this user's seen-state as {recoId: {t: seenAtMs, e: engagementAtSeen}}. */
export function getSeenState(userId) {
  try {
    const raw = localStorage.getItem(seenKey(userId));
    if (!raw) return {};
    return pruneSeenState(JSON.parse(raw) || {});
  } catch {
    return {};
  }
}

/**
 * Record what we just surfaced, together with each idea's engagement count
 * at the moment it was shown. One write per widget render, not per card.
 * `items` is rankTrending()'s own output.
 */
export function markSeen(userId, items) {
  if (!items || !items.length) return;
  try {
    const raw = localStorage.getItem(seenKey(userId));
    const map = pruneSeenState(raw ? JSON.parse(raw) || {} : {});
    const now = Date.now();
    for (const item of items) {
      const total = (item.signal?.likes || 0) + (item.signal?.comments || 0);
      map[String(item.idea.id)] = { t: now, e: total };
    }
    localStorage.setItem(seenKey(userId), JSON.stringify(map));
  } catch { /* localStorage unavailable — degrades to "always unseen", not fatal */ }
}
