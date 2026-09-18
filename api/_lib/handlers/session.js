/**
 * Mint/clear the routing-token cookie (see ../routingToken.js and the root
 * /middleware.js for what it is and, just as importantly, what it is NOT:
 * it never authenticates anything, it only steers which app renders a
 * fresh hit on /security/:symbol, /idea/:id, or "/").
 *
 * Registered as auth:'none' in api/data.js because `clear` must succeed
 * even when the caller's Firebase token is already invalid/expired (e.g.
 * mid-logout cleanup) — `mint` checks for a valid token itself, via
 * optionalUid, and simply mints nothing if there isn't one.
 */
import { optionalUid } from '../auth.js';
import { mintRoutingToken } from '../routingToken.js';

export const ROUTING_COOKIE_NAME = 'mic_route';
// Verification at the edge is pure signature+expiry math, with no
// revocation check (that would mean a database call on every /security,
// /idea, or "/" hit, which defeats the point of routing this way at all) —
// see /middleware.js's own comment. That's exactly why a longer TTL here
// carries no new *authorization* exposure: this token has never granted
// access to anything, so its only failure mode, at any TTL, is "the wrong
// UI renders for a bit" (a signed-out-by-then visitor briefly reaching the
// SPA shell, which then resolves its own real Firebase auth state and
// correctly shows them as signed out) — never "the wrong person sees
// private data."
//
// Was 15 minutes. Raised to 7 days once homepage routing (Stage 3) made the
// short TTL a real UX problem: "/" is this app's single most common
// "returning after being away" entry point (a bookmark opened the next
// morning, a browser reopened after the weekend), far more so than
// /security or /idea links — and 15 minutes only covered a *continuously
// open* tab. 7 days keeps a comfortable margin under Firebase's own
// browserLocalPersistence default (which persists indefinitely on a device
// until explicit sign-out) rather than trying to match it exactly, so a
// truly abandoned/very old session still ages out on its own instead of
// staying "routing-fresh" forever. See src/AuthContext.jsx for the refresh
// triggers that keep an active user's cookie well inside this window.
export const ROUTING_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

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
