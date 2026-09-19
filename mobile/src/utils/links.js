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
 * Bare `/idea/:id` — NOT the nested `/investor/:username/idea/:id` shape
 * this used to build. That nested form is the web app's own in-app
 * navigational URL, not its public share link: web-public/ (the SSR app
 * behind /idea/:id, /security/:symbol, /investor/:username — see the main
 * repo's CLAUDE.md "Public, crawlable pages") only proxies the bare shape,
 * so a nested link opened by someone without the app got no server-rendered
 * content at all — no title, no description, and (since the main repo added
 * per-idea opengraph-image.jsx) no preview image either, just the SPA shell.
 * The bare shape needs no username (api/_lib/handlers/public-ideas.js's
 * `idea` action looks an idea up by id alone), so this now takes just the
 * id — see ShareRecoSheet.js and announceReco.js, both simplified along
 * with this since neither needs to resolve a username anymore either.
 *
 * Still null rather than a best-effort URL for an id-less idea — the caller
 * says there's no public page rather than handing someone a link that
 * quietly goes nowhere.
 */
export function recoUrl(recoId) {
  if (!recoId) return null;
  return `${WEB_ORIGIN}/idea/${encodeURIComponent(recoId)}`;
}

/** The invite URL for one Circle, by slug — the link the web hands out. */
export function circleUrl(slug) {
  return `${WEB_ORIGIN}/circle/${encodeURIComponent(slug)}`;
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
  return `${WEB_ORIGIN}/investor/${encodeURIComponent(username)}`;
}

/** The canonical public URL for one security's Stock Insights page. */
export function securityUrl(ticker) {
  return ticker ? `${WEB_ORIGIN}/security/${encodeURIComponent(ticker)}` : null;
}
