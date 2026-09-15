/**
 * A short-lived, HMAC-signed token used for exactly one purpose: deciding,
 * at Vercel's edge (see /middleware.js), whether a fresh hit on
 * /security/:symbol or /idea/:id should be routed to the main app instead
 * of the anonymous web-public SSR page.
 *
 * This is NOT an authentication mechanism. It is never accepted as proof of
 * identity anywhere else in the system — api/_lib/auth.js's
 * requireUid/requireAdmin are the sole source of truth for identity, and
 * only ever accept the Bearer Firebase ID token. A forged or expired
 * routing token cannot grant access to anything; the worst case of a bad
 * token is a visitor landing on the (slower) main app shell, which then
 * resolves its own real, client-side Firebase auth state exactly as every
 * other page in the app already does. See CLAUDE.md's Routing section.
 *
 * The verification half of this scheme is deliberately DUPLICATED, not
 * imported, in /middleware.js — that file runs in Vercel's Edge Runtime,
 * which has no Node `crypto` module, no firebase-admin, and no database
 * access. Keeping the two in sync means: same payload shape
 * ({uid, exp} as JSON), same base64url encoding, same HMAC-SHA256 scheme.
 * Changing one without the other breaks routing silently (every token
 * would fail verification), so change both together.
 */
import crypto from 'crypto';

const SECRET = process.env.ROUTING_TOKEN_SECRET;

/**
 * @param {string} uid - verified Firebase uid (caller must already have
 *   authenticated this via requireUid/optionalUid before calling)
 * @param {number} ttlSeconds - how long the token is valid for
 * @returns {string} `${payloadB64}.${signatureB64}`, both base64url
 */
export function mintRoutingToken(uid, ttlSeconds) {
  if (!SECRET) throw new Error('ROUTING_TOKEN_SECRET env var is not set');
  if (!uid) throw new Error('mintRoutingToken requires a uid');
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payloadB64 = Buffer.from(JSON.stringify({ uid, exp }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}
