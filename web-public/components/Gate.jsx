'use client';

import { useEffect, useState } from 'react';
import { isInAppBrowser } from '../lib/inAppBrowser';

/**
 * `next` is the exact path (e.g. /security/RELIANCE, /idea/42) this visitor
 * was looking at — carried through sign-in as a query param on the root
 * URL so the main app can land them back on it afterward instead of the
 * generic home feed. Read back in src/App.jsx's pending-navigation effect.
 * Optional: falls back to a plain sign-in link with no destination memory.
 *
 * A Client Component (not the server-rendered default here) specifically
 * so the in-app-browser check below reads navigator.userAgent in the
 * browser rather than the request's User-Agent header server-side —
 * idea/security pages set `revalidate` (ISR) because their edge cache is
 * load-bearing (see CLAUDE.md), and reading the UA server-side via
 * next/headers() would force the whole route dynamic, defeating that
 * cache for every visitor, crawlers included, just to serve the one
 * WhatsApp-style visitor this banner is for. Rendering the plain Gate
 * first and swapping to the in-app variant post-mount (see useEffect
 * below) keeps SSR output identical for hydration and costs nothing extra
 * server-side.
 */
export default function Gate({ line, next }) {
  const [inApp, setInApp] = useState(false);
  useEffect(() => {
    // navigator.userAgent doesn't exist during SSR, so this can only be
    // read post-mount — rendering the default Gate first (matching what
    // the server sent) and swapping to the in-app variant here, exactly as
    // React's own docs recommend for server/client-only content:
    // https://react.dev/reference/react-dom/client/hydrateRoot#handling-different-client-and-server-content
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInApp(isInAppBrowser(navigator.userAgent));
  }, []);

  const href = next
    ? `https://myinvestorcircle.com/?next=${encodeURIComponent(next)}`
    : 'https://myinvestorcircle.com/';

  // Chat/social in-app browsers (WhatsApp's own included — see
  // lib/inAppBrowser.js) run in a sandboxed cookie jar isolated from the
  // visitor's real browser, so the mic_route routing cookie a signed-in
  // visitor already has never reaches this page even seconds after they
  // set it elsewhere — no server-side fix can hand a cookie across that
  // sandbox boundary. target="_blank" is what actually helps: most of
  // these in-app browsers (WhatsApp's included) hand a new-tab navigation
  // off to the visitor's actual system/default browser instead of opening
  // a second internal tab, landing them on a browser that already has
  // that cookie.
  if (inApp) {
    return (
      <div className="gate" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', width: '100%' }}>
          <span>Already signed in on your phone? This in-app browser can&apos;t see that — open this page in your browser instead.</span>
          <a className="btn btn-pri" href={href} target="_blank" rel="noopener noreferrer">Open in browser →</a>
        </div>
        <span style={{ fontSize: 12.5, opacity: 0.75 }}>{line}</span>
      </div>
    );
  }

  return (
    <div className="gate">
      <span>{line}</span>
      <a className="btn btn-pri" href={href}>Sign in to take part</a>
    </div>
  );
}
