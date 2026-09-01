/**
 * api/push.js — Vercel serverless function for Web Push notifications
 *
 * POST body: { userId, title, body, url, tag }
 *
 * Looks up all push subscriptions for userId and sends via VAPID.
 * Stale subscriptions (410 Gone) are automatically removed.
 *
 * ALSO delivers to the mobile app's Expo push tokens (expo_push_tokens,
 * added in supabase/phase10_expo_push_tokens.sql). The two transports are
 * independent: browsers cannot receive Expo pushes and devices cannot
 * receive Web Push, so a user with both gets one of each. Everything about
 * the Web Push path below is unchanged — the Expo path is additive and
 * fails soft, including when the expo_push_tokens table does not exist yet,
 * so this file can be deployed before the migration is run without
 * affecting web notifications.
 *
 * PII note: notification body must NOT contain prices, amounts, or
 * account-specific financial data — content may appear on lock screens.
 *
 * Env vars required (set in Vercel project settings):
 *   VAPID_PUBLIC_KEY   — from: npx web-push generate-vapid-keys
 *   VAPID_PRIVATE_KEY  — from: npx web-push generate-vapid-keys
 *   VAPID_EMAIL        — e.g.  mailto:hello@myinvestorcircle.com
 *   DATABASE_URL       — Neon connection string
 */

import webpush from 'web-push';
import { neon }  from '@neondatabase/serverless';
import { sendExpoPush } from './_lib/expoPush.js';

// ── VAPID setup ───────────────────────────────────────────────────────────────
const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL, DATABASE_URL } = process.env;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_EMAIL) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'Method not allowed' }); return; }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.error('[push] VAPID keys not configured');
    res.status(500).json({ error: 'Push not configured' });
    return;
  }
  if (!sql) {
    console.error('[push] DATABASE_URL not set');
    res.status(500).json({ error: 'Database not configured' });
    return;
  }

  const { userId, title, body, url, tag } = req.body || {};
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }

  // Load Web Push subscriptions (browsers) and Expo tokens (mobile app).
  // Independently, and neither failure is allowed to suppress the other:
  // before this, a DB error here returned 500 and sent nothing, which was
  // correct when there was only one transport.
  let subs = [];
  let webLookupFailed = false;
  try {
    subs = await sql`
      SELECT endpoint, p256dh, auth_key FROM push_subscriptions
      WHERE user_id = ${userId}
    `;
  } catch (e) {
    console.error('[push] DB lookup failed:', e?.message);
    webLookupFailed = true;
  }

  // A missing expo_push_tokens table is an expected state (this code may be
  // deployed before phase10_expo_push_tokens.sql has been run), not an
  // error — degrade to "no device tokens" and let Web Push proceed exactly
  // as it did before.
  let expoTokens = [];
  try {
    const rows = await sql`
      SELECT token FROM expo_push_tokens WHERE user_id = ${userId}
    `;
    expoTokens = rows.map(r => r.token).filter(Boolean);
  } catch (e) {
    console.warn('[push] expo token lookup skipped:', e?.message);
  }

  if (!subs.length && !expoTokens.length) {
    // Preserve the original failure signal: if the browser-subscription
    // lookup genuinely errored, that is still a 500, not "nothing to send".
    if (webLookupFailed) {
      res.status(500).json({ error: 'DB error' });
      return;
    }
    res.status(200).json({ sent: 0, reason: 'no_subscriptions' });
    return;
  }

  // Payload — keep generic, no PII or financial specifics
  const payload = JSON.stringify({
    title: title || 'myInvestorCircle',
    body:  body  || 'You have a new notification',
    url:   url   || 'https://myinvestorcircle.com',
    tag:   tag   || 'mic-general',
  });

  // Send to all browser subscriptions in parallel — unchanged.
  const results = await Promise.allSettled(
    subs.map(async sub => {
      const pushSub = {
        endpoint: sub.endpoint,
        keys:     { p256dh: sub.p256dh, auth: sub.auth_key },
      };
      try {
        await webpush.sendNotification(pushSub, payload);
      } catch (err) {
        // 410 Gone = subscription expired/unsubscribed — remove it
        if (err.statusCode === 410 || err.statusCode === 404) {
          await sql`DELETE FROM push_subscriptions WHERE endpoint = ${sub.endpoint}`.catch(() => {});
          console.log('[push] removed stale subscription:', sub.endpoint.slice(0, 40));
        }
        throw err;
      }
    })
  );

  const sent   = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.length - sent;

  // Mobile devices. sendExpoPush never throws, so a problem reaching Expo
  // cannot turn a delivered browser notification into a failed request.
  let expo = { sent: 0, failed: 0, unregistered: [] };
  if (expoTokens.length) {
    expo = await sendExpoPush(expoTokens, { title, body, url, tag });

    // DeviceNotRegistered is the mobile equivalent of Web Push's 410 Gone:
    // the app was uninstalled or the token rotated. Clean up, same as above.
    for (const dead of expo.unregistered) {
      await sql`DELETE FROM expo_push_tokens WHERE token = ${dead}`.catch(() => {});
      console.log('[push] removed stale expo token:', String(dead).slice(0, 30));
    }
  }

  console.log(
    `[push] userId=${userId} web=${sent}/${subs.length} failed=${failed} ` +
    `expo=${expo.sent}/${expoTokens.length} failed=${expo.failed}`
  );
  res.status(200).json({
    sent: sent + expo.sent,
    total: subs.length + expoTokens.length,
    web: { sent, total: subs.length },
    expo: { sent: expo.sent, total: expoTokens.length },
  });
}
