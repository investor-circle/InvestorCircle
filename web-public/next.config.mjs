// vercel.json on the MAIN project proxies only the page paths
// (/security/:symbol, /idea/:id, /search) to this project's real URL — a
// visitor's browser still thinks it's on myinvestorcircle.com. Next.js by
// default writes its CSS/JS <link>/<script> tags as root-relative paths
// (/_next/static/...), which the browser then requests from
// myinvestorcircle.com/_next/... — a path nothing proxies, since only the
// page itself is rewritten, not its assets. The page loads with every
// style and script silently 404ing: exactly the bare, unstyled HTML a
// visitor sees, on every request through the real domain, not just in
// incognito. assetPrefix makes Next.js emit the real, absolute URL for
// every asset instead, so it's fetched directly from this project
// regardless of what domain the HTML document was served through.
const ASSET_PREFIX = 'https://investorcircle-public.vercel.app';

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
