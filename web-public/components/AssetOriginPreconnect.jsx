'use client';

import ReactDOM from 'react-dom';

/**
 * Emits <link rel="preconnect"> for the cross-origin host every CSS/JS/font
 * asset on this app actually loads from in production (see assetPrefix in
 * next.config.mjs — its own comment explains why that's necessary at all).
 *
 * Why this needs to be a (tiny, render-nothing) Client Component rather than
 * a literal <link> tag in RootLayout's own <head> JSX: confirmed against
 * this Next.js version's own bundled docs
 * (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md,
 * "Resource hints" section) — the Metadata API does not support
 * rel="preconnect" tags at all, and a hand-written <link> there is placed
 * AFTER Next's own metadata block in the rendered <head>, i.e. after the
 * very font/CSS/script tags it's meant to precede (confirmed empirically:
 * curling the built output showed the hand-written tag at head position 32,
 * behind the font preloads at 2-3 and the render-blocking stylesheet at 5).
 * ReactDOM.preconnect() is React's float API specifically for this: it's
 * hoisted into <head> ahead of those resources regardless of where in the
 * tree it's called from. Per that same doc, "these methods are currently
 * only supported in Client Components, which are still Server Side
 * Rendered on initial page load" — so this still lands in the raw HTML on
 * the first response, with no hydration wait; only rendering nothing
 * (returning null) with no visible/interactive content is the actual cost
 * of the 'use client' boundary here.
 *
 * crossOrigin: 'anonymous' matches the crossorigin="" next/font already
 * puts on its own font <link rel="preload"> tags (see app/layout.jsx) — a
 * mismatched credentials mode would open a second, separate connection
 * instead of reusing this one.
 */
export default function AssetOriginPreconnect() {
  ReactDOM.preconnect('https://investorcircle-public.vercel.app', { crossOrigin: 'anonymous' });
  return null;
}
