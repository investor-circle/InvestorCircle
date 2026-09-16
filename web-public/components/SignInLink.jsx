'use client';

import { useEffect, useState } from 'react';

/**
 * The top-right "Sign in" link in layout.jsx, shared by every page this app
 * renders (idea, security, search). Unlike Gate.jsx's own "Sign in to take
 * part" CTA, this one previously pointed at a bare
 * https://myinvestorcircle.com/ with no destination memory at all — clicking
 * it dropped a visitor on the generic landing page even after signing in,
 * the same one-extra-click gap Gate.jsx's `next` param already fixed
 * elsewhere. Carries the same `?next=<path>` App.jsx reads back after
 * login/signup (see its own comment) and that now also skips the landing
 * page outright (App.jsx's `cameFromNextParam`).
 *
 * A Client Component (layout.jsx itself stays a plain Server Component)
 * specifically so this reads the current path from the browser rather than
 * next/headers() server-side — idea/security pages set `revalidate` (ISR)
 * because their edge cache is load-bearing (see CLAUDE.md), and a
 * server-side per-request path read would force those routes dynamic for
 * every visitor, crawlers included, just to build this one link's href.
 * Same reasoning, same pattern as Gate.jsx's in-app-browser detection.
 */
export default function SignInLink() {
  const [href, setHref] = useState('https://myinvestorcircle.com/');
  useEffect(() => {
    // window.location doesn't exist during SSR, so this can only be read
    // post-mount — rendering the plain sign-in link first (matching what
    // the server sent) and swapping in the ?next= variant here, same
    // reasoning and pattern as Gate.jsx's in-app-browser detection.
    const path = window.location.pathname + window.location.search;
    if (path && path !== '/') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHref(`https://myinvestorcircle.com/?next=${encodeURIComponent(path)}`);
    }
  }, []);
  return <a className="btn btn-ghost" style={{ marginLeft: 'auto' }} href={href}>Sign in</a>;
}
