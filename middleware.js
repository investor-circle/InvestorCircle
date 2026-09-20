/**
 * Vercel Edge Middleware — the only place the routing-token cookie
 * (api/_lib/routingToken.js, api/_lib/handlers/session.js) is actually
 * verified. Runs before vercel.json's rewrites resolve, for the paths that
 * are otherwise unconditionally proxied to the anonymous web-public app:
 * /security/:symbol, /idea/:id, /investor/:username, and (Stage 3) the bare
 * homepage "/".
 *
 * What this decides: which app renders a FRESH request for one of those
 * paths — the main, authenticated app (valid cookie present) or web-public
 * (everyone else: crawlers, WhatsApp's link-preview fetcher, strangers,
 * signed-out visitors, an expired/absent/tampered cookie). That's the
 * entire decision. It rewrites (not redirects), so the URL bar — and the
 * exact resource requested — never changes.
 *
 * What this does NOT decide, ever: whether the request is actually
 * authorized to see or do anything. That remains api/_lib/auth.js's
 * requireUid/requireAdmin, verifying the real Firebase ID token, completely
 * untouched by this file. A forged, tampered, or expired routing token
 * cannot grant access to anything — the worst outcome of a bad token is a
 * visitor landing on the main app's own shell, which then resolves its own
 * real client-side Firebase auth state exactly like every other page in
 * the app already does, and correctly renders as signed-out if that's what
 * it finds.
 *
 * Verification here is pure signature + expiry math via Web Crypto
 * (crypto.subtle) — no Node `crypto`, no firebase-admin, no database call.
 * That's deliberate: this needs to be cheap enough to run on every request
 * to these paths, and a DB lookup here would be exactly the per-page-view
 * cost this design exists to avoid. It also means there is no live
 * revocation check — a token remains "valid" for routing purposes until it
 * expires, which is a deliberate trade-off api/_lib/handlers/session.js's
 * own comment explains (and why the token can never be an authorization
 * grant — only ever a hint about which UI to render first).
 *
 * The HMAC scheme here is a deliberate DUPLICATE of api/_lib/routingToken.js
 * (payload shape, base64url encoding, HMAC-SHA256), not an import — this
 * runs in Vercel's Edge Runtime, which cannot load that file (Node `crypto`,
 * `firebase-admin`, and `@neondatabase/serverless` are not available here).
 * Changing the token format in one place without the other breaks routing
 * silently (every token fails verification) — change both together.
 *
 * ── "/" specifically (Stage 3) ───────────────────────────────────────────
 * Bare "/" with no special query params and no valid routing cookie is the
 * one new case that falls through to web-public's real, server-rendered
 * marketing homepage instead of the SPA's own client-rendered LandingPage —
 * see web-public/app/page.jsx. Everything else about "/" is unconditionally
 * sent to the SPA (rewritten to /index.html) regardless of cookie state,
 * via BYPASS_PARAMS below: a referral link (?ref=), a "sign in to take
 * part"/"create account" hop from web-public (?next=, ?signup=), the
 * creator-claim flow (?claim_token=), and any Firebase auth action link
 * (?oobCode=, ?mode= — password reset, email verification, etc. all carry
 * one or both). App.jsx's own existing handling of every one of these is
 * completely untouched by this file — this only decides which document is
 * served; App.jsx still reads the exact same URL either way.
 */
import { rewrite, next } from '@vercel/edge';

const COOKIE_NAME = 'mic_route';

// Any of these present on "/" means this visitor is mid-flow for something
// only the SPA can do, regardless of whether they also happen to have a
// valid (or invalid, or no) routing cookie. Checked by presence only, not
// value — e.g. any `mode=` (resetPassword, verifyEmail, recoverEmail, ...)
// is Firebase action-link territory, not just the resetPassword case.
const BYPASS_PARAMS = ['ref', 'next', 'signup', 'claim_token', 'oobCode', 'mode'];

export const config = {
  matcher: ['/', '/security/:symbol', '/idea/:id', '/investor/:username'],
  // Vercel's build warns that the implicit "edge" runtime here is
  // deprecated in favor of the Node.js runtime. That was tried and
  // reverted: on this account's Hobby plan (already at the 12-Serverless-
  // Function cap api/data.js's own header comment explains), a Node.js-
  // runtime middleware counts as an additional Function and the deployment
  // is rejected outright ("No more than 12 Serverless Functions..."). The
  // edge runtime doesn't count against that cap, so this stays on it
  // despite the deprecation warning until either the function count drops
  // or the account moves off Hobby.
};

function base64urlToBytes(b64url) {
  const pad = (4 - (b64url.length % 4)) % 4;
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Exported for unit testing — pure function, no Vercel runtime needed. */
export async function isValidRoutingToken(token, secret) {
  if (!token || !secret) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;

  let key;
  try {
    key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
  } catch {
    return false;
  }

  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64urlToBytes(sigB64),
      new TextEncoder().encode(payloadB64)
    );
  } catch {
    return false; // malformed base64/signature — never treat as valid
  }
  if (!valid) return false;

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64urlToBytes(payloadB64)));
  } catch {
    return false;
  }
  return typeof payload?.exp === 'number' && payload.exp > Math.floor(Date.now() / 1000);
}

export default async function middleware(request) {
  const url = new URL(request.url);

  // TEMPORARY diagnostic, to be removed before merge: forces the same
  // rewrite the valid-cookie path takes, on any matched route, without
  // needing a real signed-in cookie. Lets us test via a plain unauthenticated
  // curl whether rewrite() takes effect at all under the current vercel.json
  // routes format + edge runtime, isolating "the rewrite mechanism itself is
  // broken here" from "cookie validity/minting is the problem" — a
  // distinction we can't otherwise make without a real browser session.
  if (url.searchParams.get('mic_debug') === 'force-rewrite') {
    return rewrite(new URL('/index.html', url));
  }

  // "/" only: a bypass param always wins, regardless of cookie state — see
  // this file's own header comment for why each one is here. This check is
  // free (no crypto, no cookie read) so it happens first.
  if (url.pathname === '/' && BYPASS_PARAMS.some((p) => url.searchParams.has(p))) {
    return rewrite(new URL('/index.html', url));
  }

  const secret = process.env.ROUTING_TOKEN_SECRET;
  const token = readCookie(request, COOKIE_NAME);

  const ok = await isValidRoutingToken(token, secret);
  if (!ok) return next(); // -> falls through to vercel.json's existing web-public rewrite

  return rewrite(new URL('/index.html', url));
}
