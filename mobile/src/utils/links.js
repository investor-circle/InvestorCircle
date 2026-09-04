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

/**
 * The canonical public URL for one idea, or null when there isn't one.
 *
 * An idea's public page hangs off its AUTHOR'S username — the web app only
 * routes `#/investor/:username/reco/:id`, and has no id-only form. So a
 * username-less link is not a shorter link, it is a broken one: it would open
 * correctly in the app (whose parser accepts `/reco/:id`) and land a
 * recipient without the app on the home feed. Since almost everyone a link is
 * sent to does not have the app, that is the wrong half to get right.
 *
 * Hence null rather than a best-effort URL — the caller says the idea has no
 * public page rather than handing someone a link that quietly goes nowhere.
 */
export function recoUrl(username, recoId) {
  if (!username || !recoId) return null;
  return `${WEB_ORIGIN}/#/investor/${encodeURIComponent(username)}/reco/${encodeURIComponent(recoId)}`;
}

/** The invite URL for one Circle, by slug — the link the web hands out. */
export function circleUrl(slug) {
  return `${WEB_ORIGIN}/#/circle/${encodeURIComponent(slug)}`;
}

/**
 * Your personal invite link, or null without a username.
 *
 * `?ref=` on the site ROOT, not a route — that is the shape App.jsx captures
 * and process-referral matches on, and the same shape parseReferral() reads
 * back when the link is followed on a phone.
 */
export function inviteUrl(username) {
  return username ? `${WEB_ORIGIN}/?ref=${encodeURIComponent(username)}` : null;
}

/** The canonical public URL for one member's profile. */
export function profileUrl(username) {
  return `${WEB_ORIGIN}/#/investor/${encodeURIComponent(username)}`;
}
