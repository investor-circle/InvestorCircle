/** @type {import('next').NextConfig} */
const nextConfig = {
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
