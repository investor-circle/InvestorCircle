import webpush from 'web-push';
import { sendExpoPush } from './expoPush.js';

/**
 * Deliver one composed notification to one user, on every transport they have.
 *
 * Extracted from api/push.js so that BOTH ways in share it:
 *
 *   - api/push.js — the HTTP endpoint the browser and the app call. It
 *     authenticates the sender and checks they may notify this recipient.
 *   - api/_lib/handlers/engagement.js — server-side notifications for likes
 *     and comments. It runs inside an already-authenticated request and has
 *     worked out the recipient itself, so it calls this directly.
 *
 * Before this split, engagement.js POSTed to /api/push over HTTP. That was a
 * pointless round-trip even when the endpoint was open, and once the endpoint
 * started requiring a caller token it would have been a 401 — the server has
 * no user token to present. Calling the same function in-process removes both
 * problems without giving anything a way to bypass the endpoint's checks:
 * this module does no authorization of its own and is not reachable from
 * outside.
 *
 * Never throws. A notification that cannot be delivered must never fail the
 * action that triggered it.
 *
 * @param sql       the Neon tagged-template client
 * @param userId    recipient
 * @param message   { title, body, url, tag } — already composed, see pushTemplates.js
 * @returns { web: {sent,total}, expo: {sent,total}, webLookupFailed }
 */
export async function deliverPush(sql, userId, message) {
  const out = {
    web: { sent: 0, total: 0 },
    expo: { sent: 0, total: 0 },
    webLookupFailed: false,
  };
  if (!sql || !userId || !message) return out;

  // Load Web Push subscriptions (browsers) and Expo tokens (mobile app)
  // independently: neither failure is allowed to suppress the other.
  let subs = [];
  try {
    subs = await sql`
      SELECT endpoint, p256dh, auth_key FROM push_subscriptions
      WHERE user_id = ${userId}
    `;
  } catch (e) {
    console.error('[push] DB lookup failed:', e?.message);
    out.webLookupFailed = true;
  }

  // A missing expo_push_tokens table is an expected state (this code may be
  // deployed before phase10_expo_push_tokens.sql has been run), not an
  // error — degrade to "no device tokens" and let Web Push proceed.
  let expoTokens = [];
  try {
    const rows = await sql`SELECT token FROM expo_push_tokens WHERE user_id = ${userId}`;
    expoTokens = rows.map(r => r.token).filter(Boolean);
  } catch (e) {
    console.warn('[push] expo token lookup skipped:', e?.message);
  }

  out.web.total = subs.length;
  out.expo.total = expoTokens.length;
  if (!subs.length && !expoTokens.length) return out;

  const payload = JSON.stringify(message);

  const results = await Promise.allSettled(
    subs.map(async sub => {
      const pushSub = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } };
      try {
        await webpush.sendNotification(pushSub, payload);
      } catch (err) {
        // 410 Gone = subscription expired/unsubscribed — remove it.
        if (err.statusCode === 410 || err.statusCode === 404) {
          await sql`DELETE FROM push_subscriptions WHERE endpoint = ${sub.endpoint}`.catch(() => {});
          console.log('[push] removed stale subscription:', sub.endpoint.slice(0, 40));
        }
        throw err;
      }
    })
  );
  out.web.sent = results.filter(r => r.status === 'fulfilled').length;

  // sendExpoPush never throws, so a problem reaching Expo cannot turn a
  // delivered browser notification into a failure.
  if (expoTokens.length) {
    const expo = await sendExpoPush(expoTokens, message);
    out.expo.sent = expo.sent;

    // DeviceNotRegistered is the mobile equivalent of Web Push's 410 Gone:
    // the app was uninstalled or the token rotated. Clean up, same as above.
    for (const dead of expo.unregistered) {
      await sql`DELETE FROM expo_push_tokens WHERE token = ${dead}`.catch(() => {});
      console.log('[push] removed stale expo token:', String(dead).slice(0, 30));
    }
  }

  console.log(
    `[push] userId=${userId} web=${out.web.sent}/${out.web.total} ` +
    `expo=${out.expo.sent}/${out.expo.total}`
  );
  return out;
}
