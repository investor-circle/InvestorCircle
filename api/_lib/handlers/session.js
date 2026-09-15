/**
 * Mint/clear the routing-token cookie (see ../routingToken.js and the root
 * /middleware.js for what it is and, just as importantly, what it is NOT:
 * it never authenticates anything, it only steers which app renders a
 * fresh hit on /security/:symbol or /idea/:id).
 *
 * Registered as auth:'none' in api/data.js because `clear` must succeed
 * even when the caller's Firebase token is already invalid/expired (e.g.
 * mid-logout cleanup) — `mint` checks for a valid token itself, via
 * optionalUid, and simply mints nothing if there isn't one.
 */
import { optionalUid } from '../auth.js';
import { mintRoutingToken } from '../routingToken.js';

export const ROUTING_COOKIE_NAME = 'mic_route';
// Short-lived on purpose: verification at the edge is pure signature+expiry
// math, with no revocation check (that would mean a database call on every
// /security or /idea hit, which defeats the point of routing this way at
// all). A short TTL, refreshed periodically while the app is open (see
// src/AuthContext.jsx), bounds how long a token can keep routing to the
// main app after the underlying Firebase session actually ends.
export const ROUTING_TOKEN_TTL_SECONDS = 15 * 60;

function cookieAttrs(maxAge) {
  const isProd = process.env.NODE_ENV === 'production';
  return [
    `Path=/`,
    `Max-Age=${maxAge}`,
    `HttpOnly`,
    `SameSite=Lax`,
    isProd ? `Secure` : null,
  ].filter(Boolean).join('; ');
}

export default async function handleSession(req, res) {
  const action = String(req.query?.action || '');

  if (action === 'mint') {
    const uid = await optionalUid(req);
    if (!uid) { res.status(401).json({ error: 'Not signed in' }); return; }
    let token;
    try {
      token = mintRoutingToken(uid, ROUTING_TOKEN_TTL_SECONDS);
    } catch (e) {
      console.error('[session] mint failed:', e?.message);
      res.status(500).json({ error: 'Server configuration error' });
      return;
    }
    res.setHeader('Set-Cookie', `${ROUTING_COOKIE_NAME}=${token}; ${cookieAttrs(ROUTING_TOKEN_TTL_SECONDS)}`);
    res.status(200).json({ ok: true, expiresIn: ROUTING_TOKEN_TTL_SECONDS });
    return;
  }

  if (action === 'clear') {
    res.setHeader('Set-Cookie', `${ROUTING_COOKIE_NAME}=; ${cookieAttrs(0)}`);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(400).json({ error: 'Unknown or missing action' });
}
