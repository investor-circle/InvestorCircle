import {
  getProfileNavInfo as dbGetProfileNavInfo
} from "../services/api/profileApi";

export const _profileInfoCache = new Map(); // userId → { username, isSebiApproved }

export function fetchPublicProfileInfo(userId) {
  if (!userId) return Promise.resolve(null);
  if (_profileInfoCache.has(userId)) return _profileInfoCache.get(userId);
  // Cache the in-flight promise itself (not just the resolved value) so that
  // multiple FeedCards for the same recommender — which all mount around the
  // same time on the home feed — share one request instead of each firing
  // its own. A miss/error is evicted rather than cached, same as before, so
  // a later call can still retry.
  const promise = dbGetProfileNavInfo(userId)
    .then(info => {
      if (!info) { _profileInfoCache.delete(userId); return null; }
      return info;
    })
    .catch(() => { _profileInfoCache.delete(userId); return null; });
  _profileInfoCache.set(userId, promise);
  return promise;
}

/** Navigate to a public profile by username (hash-based routing). */

export function openProfile(username) {
  if (username) window.location.hash = `#/investor/${username}`;
}

/** Look up username from userId then navigate — used for click handlers. */

export async function gotoUserProfile(userId) {
  const info = await fetchPublicProfileInfo(userId);
  if (info?.username) openProfile(info.username);
}

/** Navigate to a Circle's dedicated page by its shareable slug (hash-based routing). */
export function gotoCircle(slug) {
  if (slug) window.location.hash = `#/circle/${slug}`;
}
