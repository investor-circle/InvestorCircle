'use client';

import { useEffect, useState } from 'react';

/**
 * The top-right "Create account" link in layout.jsx, next to SignInLink —
 * same idea, same reasoning, distinct only in the destination and the
 * `signup=1` flag App.jsx reads to open the signup tab instead of the
 * default login one (see App.jsx's nextWantsSignup). No marginLeft:'auto'
 * here — SignInLink already carries that to push the pair as a group to
 * the right of the nav row; .navrow's own `gap` spaces the two apart.
 *
 * A Client Component (layout.jsx itself stays a plain Server Component)
 * specifically so this reads the current path from the browser rather than
 * next/headers() server-side — idea/security pages set `revalidate` (ISR)
 * because their edge cache is load-bearing (see CLAUDE.md), and a
 * server-side per-request path read would force those routes dynamic for
 * every visitor, crawlers included, just to build this one link's href.
 * Same reasoning, same pattern as Gate.jsx's in-app-browser detection.
 */
export default function SignUpLink() {
  const [href, setHref] = useState('https://myinvestorcircle.com/?signup=1');
  useEffect(() => {
    // window.location doesn't exist during SSR, so this can only be read
    // post-mount — rendering the plain (no ?next=) signup link first
    // (matching what the server sent) and swapping in the full variant
    // here, same reasoning and pattern as Gate.jsx's in-app-browser
    // detection.
    const path = window.location.pathname + window.location.search;
    if (path && path !== '/') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHref(`https://myinvestorcircle.com/?next=${encodeURIComponent(path)}&signup=1`);
    }
  }, []);
  return <a className="btn btn-pri" href={href}>Create account</a>;
}
