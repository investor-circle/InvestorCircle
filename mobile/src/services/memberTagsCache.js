import { callApi } from "./api";

/**
 * Member tags (Founding Member; Verified etc. later) — mirrors avatarCache.js's
 * subscribe/cachedX pattern, but simpler: unlike avatars (a per-user data:
 * URI, batched and fetched per-uid on demand), the whole tag map is a small
 * { tag_type: [userId, ...] } list (api/_lib/handlers/lookups.js,
 * action=member-tags) — one request covers every screen, not one per visible
 * row, so there's no batching or TTL to manage here.
 */

// A stable reference for "no tags" — useSyncExternalStore compares snapshots
// with Object.is, so a fresh `[]` literal on every call (e.g. `tagsByUser[uid]
// || []`) looks like a change on every render and loops forever.
const EMPTY_TAGS = [];

let tagsByUser = {}; // uid -> [tag_type, ...]
let loaded = false;
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

/** Fetch once per app session; fire-and-forget, never throws, never blocks a render. */
export async function primeMemberTags() {
  if (loaded) return;
  if (loadPromise) return loadPromise;
  // Promise.resolve(...) rather than calling callApi(...).then(...) directly:
  // callApi is a bare `jest.fn()` (returns undefined) in components' existing
  // tests that never anticipated this call, so guard against a non-promise
  // return the same way a real infra failure (throw) is already guarded below.
  loadPromise = Promise.resolve(callApi("/data?resource=lookups&action=member-tags"))
    .then((api) => {
      if (!api?.ok) return;
      const tags = api.data?.tags || {};
      const byUser = {};
      for (const [tagType, uids] of Object.entries(tags)) {
        for (const uid of uids || []) (byUser[uid] ||= []).push(tagType);
      }
      tagsByUser = byUser;
      notify();
    })
    .catch(() => {
      /* leave tagsByUser as-is — a failed fetch just means no badges this session */
    })
    .finally(() => {
      loaded = true;
      loadPromise = null;
    });
  return loadPromise;
}

/** Test seam. */
export function _resetMemberTagsCache() {
  tagsByUser = {};
  loaded = false;
  loadPromise = null;
  listeners.clear();
}
