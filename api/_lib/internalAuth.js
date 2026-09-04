/**
 * Shared secret for our own backend calling our own HTTP endpoints.
 *
 * Almost every internal call is now in-process (see deliverPush.js), which
 * needs no secret at all. The exception is /api/email: it is a Python
 * function, so a Node handler cannot call it except over HTTP, and it has no
 * user token to present — the "sender" is the server itself, reacting to a
 * comment it just recorded.
 *
 * So /api/email accepts either a verified Firebase ID token (browser and app)
 * or this header. The secret lives only in Vercel's environment; it is never
 * a VITE_/EXPO_PUBLIC_ variable and so never reaches a client bundle.
 *
 * FAIL CLOSED: when INTERNAL_API_SECRET is unset, internalSecret() returns
 * null, the header is omitted, and the email endpoint refuses the call. The
 * cost is a missed comment notification. The alternative — treating "no
 * secret configured" as "allow" — would leave the endpoint open to anyone,
 * which is precisely what this change exists to stop.
 */

export const INTERNAL_SECRET_HEADER = 'x-internal-secret';

/** The configured secret, or null when it has not been set. */
export function internalSecret() {
  const s = (process.env.INTERNAL_API_SECRET || '').trim();
  return s.length ? s : null;
}
