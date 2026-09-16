import {
  getProfileNavInfo as dbGetProfileNavInfo
} from "../services/api/profileApi";

/**
 * True for a plain, same-site path like "/security/RELIANCE" or
 * "/idea/42?highlightComment=9" — false for anything that could send a
 * visitor somewhere other than this app: an absolute URL, a
 * protocol-relative "//evil.example" (a bare path to the browser's eyes,
 * but a full external origin once resolved), or a "javascript:" scheme.
 *
 * Used to validate the `next` destination App.jsx reads back from
 * web-public's Gate (?next=<path> on the sign-in link) before ever handing
 * it to goToPath() — without this check, that query param would be an
 * open redirect: anyone could craft
 * https://myinvestorcircle.com/?next=https://evil.example and use this
 * app's own domain to send a signed-in visitor's browser somewhere else
 * right after they authenticate.
 */
export function isSameSitePath(path) {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//");
}

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

/**
 * App.jsx owns the actual standalone-route state (pagePath) that decides
 * whether a public profile/circle/security URL renders — this module is
 * plain, component-free code called from all over the app, so it can't call
 * that state setter directly. App.jsx registers its goToPath (a raw
 * History-API push that also updates pagePath) here once, on mount, and the
 * navigation helpers below call it instead of touching the address bar on
 * their own — a plain `window.location.href/pathname` assignment would
 * force a full page reload, which is not what any of these are for.
 */
let _goToPath = (path) => { window.location.href = path; };
export function registerGoToPath(fn) { _goToPath = fn; }

/**
 * Leave a standalone route (public profile / circle / standalone Stock
 * Insights) and land back on the normal app flow — e.g. a "Sign in" prompt
 * shown to a signed-out visitor on one of those pages.
 */
export function goHome() {
  _goToPath('/');
}

/** Navigate to a public profile by username (real path, no #). */

export function openProfile(username) {
  if (username) _goToPath(`/investor/${username}`);
}

/** Look up username from userId then navigate — used for click handlers. */

export async function gotoUserProfile(userId) {
  const info = await fetchPublicProfileInfo(userId);
  if (info?.username) openProfile(info.username);
}

/** Navigate to a Circle's dedicated page by its shareable slug (real path, no #). */
export function gotoCircle(slug) {
  if (slug) _goToPath(`/circle/${slug}`);
}

/** Navigate to a recommendation's dedicated post page by recommender username (real path, no #). */
export function openReco(username, recoId) {
  if (username && recoId) _goToPath(`/investor/${username}/idea/${recoId}`);
}

/** Navigate to a security's Stock Insights page by ticker (real path, no #). */
export function openSecurity(ticker) {
  if (ticker) _goToPath(`/security/${encodeURIComponent(ticker)}`);
}

/** Look up recommender username from userId then navigate to their reco's dedicated page. */
export async function gotoReco(userId, recoId) {
  const info = await fetchPublicProfileInfo(userId);
  if (info?.username) openReco(info.username, recoId);
}

/**
 * Browser "back" for a standalone page reached via in-app path navigation
 * (a reco post, a public profile), with a fallback for when there's nothing
 * to go back to — e.g. the page was opened directly from a shared link in a
 * fresh tab, where history.back() would leave the site (or do nothing)
 * instead of returning to My Ideas/wherever the user came from.
 */
export function goBackOrElse(fallbackFn) {
  const beforePath = window.location.pathname + window.location.search;
  window.history.back();
  setTimeout(() => {
    if (window.location.pathname + window.location.search === beforePath) fallbackFn();
  }, 350);
}
