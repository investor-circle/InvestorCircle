import { callApi } from "./api";

/**
 * Username (and SEBI-approved flag) for a user id, cached per session.
 *
 * Feed rows carry the author's NAME but not their username — only the Circle
 * feed selects recommender_username (see api/_lib/handlers/recommendations.js).
 * Profile routes are by username, so without this lookup there is no way to
 * open an author's profile from a feed card, which is why the author on a
 * mobile card was not tappable at all while the web's is.
 *
 * Mirrors fetchPublicProfileInfo in the web's src/utils/navigation.js,
 * including the detail that makes it cheap: the in-flight PROMISE is cached,
 * not just the resolved value, so the several cards by the same author that
 * mount together share one request. A miss or an error is evicted rather
 * than cached, so a later attempt can retry.
 */

const cache = new Map(); // userId -> Promise<{ username, isSebiApproved } | null>

export function fetchProfileNavInfo(userId) {
  if (!userId) return Promise.resolve(null);
  const key = String(userId);
  if (cache.has(key)) return cache.get(key);

  const promise = callApi(`/data?resource=lookups&action=profile-nav-info&userId=${encodeURIComponent(key)}`)
    .then((api) => {
      const info = api.ok ? api.data.info : null;
      if (!info) cache.delete(key);
      return info || null;
    })
    .catch(() => {
      cache.delete(key);
      return null;
    });

  cache.set(key, promise);
  return promise;
}

/** Test seam / sign-out cleanup. */
export function _resetProfileNavCache() {
  cache.clear();
}
