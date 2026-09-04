/**
 * Public URLs — the ones a HUMAN opens, as opposed to the ones the app
 * fetches from.
 *
 * Pure and dependency-free, and deliberately NOT in services/api.js: that
 * module pulls in Firebase for the authenticated client, so building a link
 * from there dragged the whole auth stack into anything that needed a URL.
 *
 * WEB_ORIGIN is a different host from the API. These are genuinely two
 * deployments: the frontend is on GitHub Pages behind
 * the custom domain, the serverless functions are on Vercel. Any URL meant for
 * a HUMAN to open (a shared idea, a profile, the privacy policy) belongs to
 * this one; API_ORIGIN is only ever a fetch target.
 *
 * Named separately because confusing them is silent: a link built from
 * API_ORIGIN looks perfectly well-formed and simply does not open the page.
 * The share sheet did exactly that, so every idea shared from the app pointed
 * at the API deployment instead of the site.
 */
export const WEB_ORIGIN = process.env.EXPO_PUBLIC_WEB_ORIGIN || "https://myinvestorcircle.com";

/** The canonical public URL for one idea, matching the web's share links. */
export function recoUrl(username, recoId) {
  return username
    ? `${WEB_ORIGIN}/#/investor/${encodeURIComponent(username)}/reco/${encodeURIComponent(recoId)}`
    : `${WEB_ORIGIN}/#/reco/${encodeURIComponent(recoId)}`;
}

/** The invite URL for one Circle, by slug — the link the web hands out. */
export function circleUrl(slug) {
  return `${WEB_ORIGIN}/#/circle/${encodeURIComponent(slug)}`;
}

/** The canonical public URL for one member's profile. */
export function profileUrl(username) {
  return `${WEB_ORIGIN}/#/investor/${encodeURIComponent(username)}`;
}
