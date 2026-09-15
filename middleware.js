/**
 * Vercel Edge Middleware — the only place the routing-token cookie
 * (api/_lib/routingToken.js, api/_lib/handlers/session.js) is actually
 * verified. Runs before vercel.json's rewrites resolve, for exactly the two
 * paths that are otherwise unconditionally proxied to the anonymous
 * web-public app: /security/:symbol and /idea/:id.
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
 * to these two paths, and a DB lookup here would be exactly the
 * per-page-view cost this design exists to avoid. It also means there is
 * no live revocation check — a token remains "valid" for routing purposes
 * until it expires, which is why api/_lib/handlers/session.js mints it
 * short-lived rather than long-lived. See that file's own comment.
 *
 * The HMAC scheme here is a deliberate DUPLICATE of api/_lib/routingToken.js
 * (payload shape, base64url encoding, HMAC-SHA256), not an import — this
 * runs in Vercel's Edge Runtime, which cannot load that file (Node `crypto`,
 * `firebase-admin`, and `@neondatabase/serverless` are not available here).
 * Changing the token format in one place without the other breaks routing
 * silently (every token fails verification) — change both together.
 */
import { rewrite, next } from '@vercel/edge';

const COOKIE_NAME = 'mic_route';

export const config = {
  matcher: ['/security/:symbol', '/idea/:id'],
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
  const secret = process.env.ROUTING_TOKEN_SECRET;
  const token = readCookie(request, COOKIE_NAME);

  const ok = await isValidRoutingToken(token, secret);
  if (!ok) return next(); // -> falls through to vercel.json's existing web-public rewrite

  const url = new URL(request.url);
  return rewrite(new URL('/index.html', url));
}
