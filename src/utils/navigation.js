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

/** Navigate to a recommendation's dedicated post page by recommender username (hash-based routing). */
export function openReco(username, recoId) {
  if (username && recoId) window.location.hash = `#/investor/${username}/reco/${recoId}`;
}

/** Look up recommender username from userId then navigate to their reco's dedicated page. */
export async function gotoReco(userId, recoId) {
  const info = await fetchPublicProfileInfo(userId);
  if (info?.username) openReco(info.username, recoId);
}

/**
 * Browser "back" for a standalone page reached via in-app hash navigation
 * (a reco post, a public profile), with a fallback for when there's nothing
 * to go back to — e.g. the page was opened directly from a shared link in a
 * fresh tab, where history.back() would leave the site (or do nothing)
 * instead of returning to My Ideas/wherever the user came from.
 */
export function goBackOrElse(fallbackFn) {
  const beforeHash = window.location.hash;
  window.history.back();
  setTimeout(() => { if (window.location.hash === beforeHash) fallbackFn(); }, 350);
}
