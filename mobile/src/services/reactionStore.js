import { getReactionsBatch, reactToReco } from "./api/engagementApi";

/**
 * "Have I liked this?" for every idea currently on screen.
 *
 * WHY THIS EXISTS: the web hydrates this for all three feed sources
 * (App.jsx calls getReactionsBatch after each load) and shows a like button
 * with its count on every row. The app fetched neither: no card showed a like
 * count, none could be liked, and an idea you had already liked on the web
 * looked untouched on your phone. `reactions-batch` was the one engagement
 * endpoint no mobile screen reached.
 *
 * A module-level store rather than per-screen state, for the same reason
 * avatarCache.js is one: the same idea appears in the feed, in Discover and
 * in Track, and liking it in one place must not leave the other two showing
 * the old state. Cards subscribe individually, so a like re-renders one card
 * rather than the whole list.
 *
 * Deliberately NOT persisted. This is small, cheap to refetch, and wrong the
 * moment the user likes something on the web — so it lives only as long as
 * the process does.
 */

const liked = new Map(); // recoId -> true | false ("false" = known not liked)
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => fn());
}

export function subscribeReactions(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Synchronous read for useSyncExternalStore. undefined = not yet known. */
export function isLiked(recoId) {
  if (recoId == null) return undefined;
  return liked.get(String(recoId));
}

/**
 * Fetch reaction state for a list of ideas, skipping ones already known.
 *
 * Fire-and-forget by construction: a feed must render whether or not this
 * resolves, so nothing here throws and no caller awaits it.
 */
export async function primeReactions(recoIds) {
  const wanted = [...new Set((recoIds || []).map((id) => String(id ?? "")).filter(Boolean))].filter(
    (id) => !liked.has(id)
  );
  if (!wanted.length) return;

  // The server caps recoIds at 200 per request (engagement.js), so a long
  // feed is split rather than silently truncated — the ideas past the cap
  // would otherwise render as "not liked" and be wrong.
  const CHUNK = 150;
  for (let i = 0; i < wanted.length; i += CHUNK) {
    const batch = wanted.slice(i, i + CHUNK);
    let map;
    try {
      map = await getReactionsBatch(batch);
    } catch (_) {
      return; // leave them unknown; a later list will try again
    }
    if (!map) return;
    // The endpoint returns ONLY the ids the caller liked, so anything asked
    // for and not returned is a confirmed "not liked" — recording that is
    // what stops every subsequent list re-asking for the same ids.
    batch.forEach((id) => liked.set(id, map[id] === "like"));
  }
  emit();
}

/**
 * Like or unlike, optimistically.
 *
 * The tap flips immediately and reverts if the write fails — a like that
 * appears to work and silently didn't is worse than one that visibly bounces
 * back.
 *
 * @returns the state it settled on
 */
export async function toggleReaction(recoId) {
  const id = String(recoId);
  const next = !liked.get(id);
  liked.set(id, next);
  emit();

  const ok = await reactToReco(id, next ? "like" : null);
  if (!ok) {
    liked.set(id, !next);
    emit();
    return !next;
  }
  return next;
}

/**
 * Record a like state written somewhere else — the detail screen sends a
 * notification with its like, so it does its own write and reports the result
 * here. Without this, liking on the detail screen and going back would show
 * the card still unliked.
 */
export function setLiked(recoId, value) {
  if (recoId == null) return;
  const id = String(recoId);
  if (liked.get(id) === !!value) return;
  liked.set(id, !!value);
  emit();
}

/** Sign-out: the next account must not inherit this one's likes. */
export function clearReactions() {
  liked.clear();
  emit();
}

export function _resetReactionStore() {
  liked.clear();
  listeners.clear();
}
