import { callApi } from "./api";

/**
 * Member tags (Founding Member; Verified etc. later) — mirrors avatarCache.js's
 * subscribe/cachedX pattern, but simpler: unlike avatars (a per-user data:
 * URI, batched and fetched per-uid on demand), the whole tag map is a small
 * { tag_type: [userId, ...] } list (api/_lib/handlers/lookups.js,
 * action=member-tags) — one request covers every screen, not one per visible
 * row, so there's no batching here.
 *
 * It IS re-fetched: it used to load once per app session, so a tag an admin
 * granted after the app opened never appeared until a cold start, and one
 * failed fetch meant no badges anywhere for the rest of the session. Now every
 * <Avatar> mount asks, and the map is refreshed if older than REFRESH_MS
 * (a failure is retried after RETRY_MS rather than never).
 */

// A stable reference for "no tags" — useSyncExternalStore compares snapshots
// with Object.is, so a fresh `[]` literal on every call (e.g. `tagsByUser[uid]
// || []`) looks like a change on every render and loops forever.
const EMPTY_TAGS = [];
const REFRESH_MS = 5 * 60 * 1000;
const RETRY_MS = 30 * 1000;

let tagsByUser = {}; // uid -> [tag_type, ...]
let fetchedAt = 0; // last successful fetch
let failedAt = 0; // last failed fetch
let loadPromise = null;
const listeners = new Set();

function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch (_) {
      /* a bad subscriber must not break the others */
    }
  }
}

/** Subscribe to cache changes. Returns an unsubscribe function. */
export function subscribeMemberTags(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The cached tag list for a uid. Never triggers a fetch. */
export function cachedMemberTags(uid) {
  if (!uid) return EMPTY_TAGS;
  return tagsByUser[String(uid)] || EMPTY_TAGS;
}

/**
 * Fetch the tag map if it has never loaded or is older than REFRESH_MS.
 * Fire-and-forget: never throws, never blocks a render, and cheap to call on
 * every mount (a fresh map or a fetch already in flight is a no-op).
 */
export async function primeMemberTags() {
  if (loadPromise) return loadPromise;
  const now = Date.now();
  if (fetchedAt && now - fetchedAt < REFRESH_MS) return;
  if (failedAt && now - failedAt < RETRY_MS) return;
  // Promise.resolve(...) rather than calling callApi(...).then(...) directly:
  // callApi is a bare `jest.fn()` (returns undefined) in components' existing
  // tests that never anticipated this call, so guard against a non-promise
  // return the same way a real infra failure (throw) is already guarded below.
  loadPromise = Promise.resolve(callApi("/data?resource=lookups&action=member-tags"))
    .then((api) => {
      if (!api?.ok) {
        failedAt = Date.now();
        return;
      }
      const tags = api.data?.tags || {};
      const byUser = {};
      for (const [tagType, uids] of Object.entries(tags)) {
        for (const uid of uids || []) (byUser[String(uid)] ||= []).push(tagType);
      }
      tagsByUser = byUser;
      fetchedAt = Date.now();
      failedAt = 0;
      notify();
    })
    .catch(() => {
      // Keep whatever map we had; retried after RETRY_MS.
      failedAt = Date.now();
    })
    .finally(() => {
      loadPromise = null;
    });
  return loadPromise;
}

/** Test seam. */
export function _resetMemberTagsCache() {
  tagsByUser = {};
  fetchedAt = 0;
  failedAt = 0;
  loadPromise = null;
  listeners.clear();
}
