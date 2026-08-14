/**
 * api/_lib/handlers/notifications.js — notifications resource handler
 *
 * Dispatched by api/data.js (resource=notifications). See connections.js
 * for why this lives under api/_lib/ instead of being its own route.
 *
 * GET  ?resource=notifications
 *   -> 200 { notifications: [...] }  (last 50 for the caller, newest first)
 *
 * POST ?resource=notifications
 *   Body: { action: 'mark-read', notifId } | { action: 'mark-all-read' }
 */

import { sql, parseBody } from '../auth.js';

export default async function handleNotifications(req, res, userId) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
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
