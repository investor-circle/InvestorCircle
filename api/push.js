/**
 * api/push.js — Vercel serverless function for Web Push notifications
 *
 * POST body: { userId, title, body, url, tag }
 *
 * Looks up all push subscriptions for userId and sends via VAPID.
 * Stale subscriptions (410 Gone) are automatically removed.
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

  // Load subscriptions for this user
  let subs = [];
  try {
    subs = await sql`
      SELECT endpoint, p256dh, auth_key FROM push_subscriptions
      WHERE user_id = ${userId}
    `;
  } catch (e) {
    console.error('[push] DB lookup failed:', e?.message);
    res.status(500).json({ error: 'DB error' });
    return;
  }

  if (!subs.length) {
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

  // Send to all subscriptions in parallel
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
  console.log(`[push] userId=${userId} sent=${sent}/${subs.length} failed=${failed}`);
  res.status(200).json({ sent, total: subs.length });
}
