/**
 * api/push.js — Vercel serverless function for Web Push notifications
 *
 * POST body: { userId, type, deepLink? }
 * Header:    Authorization: Bearer <Firebase ID token>   (REQUIRED)
 *
 * SECURITY (2026-09): this endpoint used to be unauthenticated and to take
 * the notification's title/body/url straight from the request. Anyone on the
 * internet could therefore push arbitrary text — including text impersonating
 * another member — to any user's lock screen, under this app's name. Three
 * things now prevent that:
 *
 *   1. A verified Firebase ID token is required, and the SENDER is that
 *      token's uid — never a request field.
 *   2. The sender must already have a connections row with the recipient, so
 *      a member cannot push to strangers.
 *   3. The message text is composed server-side from a fixed template chosen
 *      by `type` (api/_lib/pushTemplates.js), using the sender's own profile
 *      name read from the database. No caller-supplied text is ever sent.
 *
 * `deepLink` is an optional in-app path; it is resolved against this app's
 * own origin, so it cannot point a notification at another site.
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
import { deliverPush } from './_lib/deliverPush.js';
import { requireUid, sendAuthError } from './_lib/auth.js';
import { PUSH_TYPES, buildPushPayload } from './_lib/pushTemplates.js';

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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

  // ── Who is asking, and may they? ───────────────────────────────────────────
  let senderUid;
  try { senderUid = await requireUid(req); } catch (e) { sendAuthError(res, e); return; }

  const { userId, type, deepLink } = req.body || {};
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  if (!PUSH_TYPES.includes(type)) { res.status(400).json({ error: 'unknown notification type' }); return; }

  // You may only notify someone you have a connection with. Every legitimate
  // caller satisfies this: a connection request writes its row before pushing,
  // and the accepted/new-idea notifications go to existing connections.
  let sender;
  try {
    const [link] = await sql`
      SELECT 1 FROM connections
      WHERE (requester_id = ${senderUid} AND addressee_id = ${userId})
         OR (requester_id = ${userId}   AND addressee_id = ${senderUid})
      LIMIT 1
    `;
    if (!link) { res.status(403).json({ error: 'not_connected' }); return; }

    // Display name from the DB, not the request — this is what stops one
    // member sending a notification that appears to come from another.
    const [profile] = await sql`
      SELECT full_name, username FROM user_profiles WHERE id = ${senderUid} LIMIT 1
    `;
    sender = profile || {};
  } catch (e) {
    console.error('[push] authorization lookup failed:', e?.message);
    res.status(500).json({ error: 'DB error' });
    return;
  }

  // Composed here from a fixed template — see api/_lib/pushTemplates.js.
  // Generic by construction: no prices, amounts, or account-specific data,
  // because the caller has no way to put any there.
  const message = buildPushPayload(type, sender, deepLink);

  // Delivery itself is shared with the server-side notification path (see
  // api/_lib/deliverPush.js) so both go out identically.
  const out = await deliverPush(sql, userId, message);

  if (!out.web.total && !out.expo.total) {
    // Preserve the original failure signal: if the browser-subscription
    // lookup genuinely errored, that is still a 500, not "nothing to send".
    if (out.webLookupFailed) { res.status(500).json({ error: 'DB error' }); return; }
    res.status(200).json({ sent: 0, reason: 'no_subscriptions' });
    return;
  }

  res.status(200).json({
    sent: out.web.sent + out.expo.sent,
    total: out.web.total + out.expo.total,
    web: out.web,
    expo: out.expo,
  });
}
