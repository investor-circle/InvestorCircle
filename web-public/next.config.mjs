// vercel.json on the MAIN project proxies only the page paths
// (/security/:symbol, /idea/:id, /search, /) to this project's real URL —
// a visitor's browser still thinks it's on myinvestorcircle.com. Next.js by
// default writes its CSS/JS <link>/<script> tags as root-relative paths
// (/_next/static/...), which the browser then requests from
// myinvestorcircle.com/_next/... — a path nothing proxies, since only the
// page itself is rewritten, not its assets. The page loads with every
// style and script silently 404ing: exactly the bare, unstyled HTML a
// visitor sees, on every request through the real domain, not just in
// incognito.
//
// This used to be the real, absolute production URL
// (https://investorcircle-public.vercel.app), which fixed the 404s but
// meant every one of those requests was cross-origin from the browser's
// point of view — a fresh DNS+TCP+TLS handshake to a host it had no prior
// connection to, on top of whatever the main document's own TTFB already
// cost (production PageSpeed measured this: FCP 2.4s / LCP 4.7s, TBT 0ms,
// CLS 0 — a network/connection problem, not a JS-execution or layout one;
// a preconnect hint for that host measurably existed but didn't move the
// production numbers, which is the evidence that motivated this change).
//
// A root-relative PATH prefix instead (matching the standard Next.js
// Multi-Zones pattern — see
// node_modules/next/dist/docs/01-app/02-guides/multi-zones.md's "How to
// define a zone") makes Next.js do two things with the SAME config value:
// (1) emit asset URLs as /ASSET_PREFIX/_next/... with no domain, so the
// browser resolves them against whatever origin the HTML document itself
// came from (myinvestorcircle.com) instead of a second host, and (2) make
// this app's own server listen for its static files at that same prefixed
// path rather than the bare /_next/... root. vercel.json (main project)
// then needs exactly one new rewrite — proxying that prefix to this
// project's real URL — mirroring the same external-URL-destination
// mechanism already used for the page-level rewrites above.
//
// Chosen prefix: distinctive and namespaced to this project (not just
// "static" or "assets", which could plausibly collide with a future
// feature route), leading underscore matching Next's own /_next
// convention for "this is infrastructure, not a page" — confirmed against
// every existing route in this repo (src/App.jsx's
// INVESTOR_PATH_TO_PAGE/ADMIN_PATH_TO_PAGE, vercel.json's other rewrites,
// and the main app's public/ folder) that nothing already uses this path.
const ASSET_PREFIX = '/_wpub-static';

/** @type {import('next').NextConfig} */
const nextConfig = {
  assetPrefix: process.env.NODE_ENV === 'production' ? ASSET_PREFIX : undefined,
  // This lives inside the main repo (a separate package.json/lockfile in a
  // subfolder, deployed as its own Vercel project — see README.md), so
  // Turbopack needs telling explicitly that THIS folder, not the repo root
  // one level up, is the workspace root — otherwise it picks up the main
  // app's lockfile and warns on every build.
  turbopack: { root: import.meta.dirname },
  // This app renders member-written text (thesis, names) by hand into pages
  // outside React's normal escaping in a couple of places (JSON-LD) — see
  // lib/format.js. No other special config needed: plain JS, no TypeScript,
  // matching the rest of this repo's convention.
};

export default nextConfig;
