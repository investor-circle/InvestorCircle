/**
 * api/notifications.js — Vercel serverless function (Node)
 *
 * Phase 3 of the server-side DB access migration. Replaces the direct-Neon
 * queries previously run from src/db.js (getMyNotifications, markNotifRead,
 * markAllNotifRead).
 *
 * GET  /api/notifications
 *   Authorization: Bearer <Firebase ID token>
 *   -> 200 { notifications: [...] }  (last 50 for the caller, newest first)
 *
 * POST /api/notifications
 *   Authorization: Bearer <Firebase ID token>
 *   Body: { action: 'mark-read', notifId } | { action: 'mark-all-read' }
 */

import { sql, setCors, requireUid, parseBody, sendAuthError } from './_lib/auth.js';

export default async function handler(req, res) {
  setCors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let userId;
  try {
    userId = await requireUid(req);
  } catch (e) {
    sendAuthError(res, e);
    return;
  }

  if (!sql) {
    res.status(500).json({ error: 'Database not configured' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT n.id, n.user_id, n.type, n.from_user_id, n.reference_id, n.metadata,
               n.is_read, n.created_at,
               up.full_name AS from_name, up.email AS from_email
        FROM notifications n
        LEFT JOIN user_profiles up ON up.id = n.from_user_id
        WHERE n.user_id = ${userId}
        ORDER BY n.created_at DESC
        LIMIT 50
      `;
      res.status(200).json({ notifications: rows });
      return;
    }

    const body = parseBody(req);
    const action = String(body.action || '');

    if (action === 'mark-read') {
      const notifId = String(body.notifId || '');
      if (!notifId) { res.status(400).json({ error: 'notifId is required' }); return; }
      await sql`UPDATE notifications SET is_read = true WHERE id = ${notifId} AND user_id = ${userId}`;
      res.status(200).json({ success: true });
      return;
    }

    if (action === 'mark-all-read') {
      await sql`UPDATE notifications SET is_read = true WHERE user_id = ${userId}`;
      res.status(200).json({ success: true });
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[notifications] error:', e?.message);
    res.status(500).json({ error: 'Database error' });
  }
}
