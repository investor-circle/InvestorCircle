/**
 * api/_lib/handlers/tracking.js — tracking resource handler
 *
 * Dispatched by api/data.js (resource=tracking, auth:'user'). "Track" is the
 * one-way, no-approval relationship that replaces Follow for investor/
 * creator content ("I want to see this investor's ideas") — distinct from
 * `connections` (mutual, requires accept) and `ic_groups`/Circles
 * (community membership). See supabase/phase6_relationships.sql
 * (user_tracking table).
 *
 * GET  ?resource=tracking                          -> { tracking: [...] }  (people I track)
 * GET  ?resource=tracking&action=status&targetId=X  -> { tracking: boolean }
 *
 * POST ?resource=tracking
 *   Body: { action: 'track'|'untrack', targetId }
 *
 * myId always comes from the verified token (resolved by api/data.js
 * before this handler runs), never from the request body.
 */

import { sql, parseBody } from '../auth.js';

export default async function handleTracking(req, res, myId) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const action = String(req.query?.action || '');

      if (action === 'status') {
        const targetId = String(req.query?.targetId || '');
        if (!targetId) { res.status(400).json({ error: 'targetId is required' }); return; }
        const rows = await sql`
          SELECT 1 FROM user_tracking WHERE tracker_id = ${myId} AND tracked_id = ${targetId} LIMIT 1
        `;
        res.status(200).json({ tracking: rows.length > 0 });
        return;
      }

      const rows = await sql`
        SELECT up.id, up.username, up.full_name, up.avatar_url, up.avatar_color, ut.created_at
        FROM user_tracking ut
        JOIN user_profiles up ON up.id = ut.tracked_id
        WHERE ut.tracker_id = ${myId}
        ORDER BY ut.created_at DESC
      `;
      res.status(200).json({ tracking: rows });
      return;
    }

    const body = parseBody(req);
    const action = String(body.action || '');
    const targetId = String(body.targetId || '');
    if (!targetId) { res.status(400).json({ error: 'targetId is required' }); return; }
    if (targetId === myId) { res.status(400).json({ error: 'Cannot track yourself' }); return; }

    if (action === 'track') {
      await sql`
        INSERT INTO user_tracking (tracker_id, tracked_id)
        VALUES (${myId}, ${targetId})
        ON CONFLICT (tracker_id, tracked_id) DO NOTHING
      `;
      res.status(200).json({ success: true, tracking: true });
      return;
    }

    if (action === 'untrack') {
      await sql`
        DELETE FROM user_tracking WHERE tracker_id = ${myId} AND tracked_id = ${targetId}
      `;
      res.status(200).json({ success: true, tracking: false });
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[tracking] error:', e?.message);
    res.status(500).json({ error: 'Database error' });
  }
}
