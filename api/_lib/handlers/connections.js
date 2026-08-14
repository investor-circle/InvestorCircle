/**
 * api/_lib/handlers/connections.js — connections resource handler
 *
 * Dispatched by api/data.js (resource=connections). Not itself a Vercel
 * route — api/_lib/ is excluded from file-system routing, which is why this
 * logic lives here instead of as its own api/connections.js function (see
 * "Vercel function count" note in api/data.js for why the Phase 3 endpoints
 * were consolidated into one route).
 *
 * GET  ?resource=connections
 *   -> 200 { connections: [...] }  (both directions, all statuses, for the caller)
 *
 * POST ?resource=connections
 *   Body: { action: 'send'|'accept'|'reject'|'remove', ... }
 *     send:   { addresseeId }
 *     accept: { connectionId }
 *     reject: { connectionId }
 *     remove: { connectionId }
 *
 * myId always comes from the verified token (resolved by api/data.js before
 * this handler runs), never from the request body.
 */

import { sql, parseBody } from '../auth.js';

export default async function handleConnections(req, res, myId) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT
          c.id                                                          AS connection_id,
          c.status,
          c.created_at,
          c.updated_at,
          CASE WHEN c.requester_id = ${myId} THEN 'sent'
               ELSE 'received' END                                      AS direction,
          CASE WHEN c.requester_id = ${myId} THEN c.addressee_id
               ELSE c.requester_id END                                  AS user_id,
          up.full_name                                                  AS name,
          up.email
        FROM connections c
        JOIN user_profiles up
          ON up.id = CASE WHEN c.requester_id = ${myId}
                          THEN c.addressee_id
                          ELSE c.requester_id END
        WHERE c.requester_id = ${myId} OR c.addressee_id = ${myId}
        ORDER BY c.updated_at DESC
      `;
      res.status(200).json({ connections: rows });
      return;
    }

    const body = parseBody(req);
    const action = String(body.action || '');

    if (action === 'send') {
      const addresseeId = String(body.addresseeId || '');
      if (!addresseeId) { res.status(400).json({ error: 'addresseeId is required' }); return; }
      if (addresseeId === myId) { res.status(400).json({ error: 'Cannot connect to yourself' }); return; }

      const existing = await sql`
        SELECT id, status FROM connections
        WHERE (requester_id = ${myId} AND addressee_id = ${addresseeId})
           OR (requester_id = ${addresseeId} AND addressee_id = ${myId})
        LIMIT 1
      `;
      if (existing.length > 0) {
        res.status(200).json({ error: 'already_exists', existing: existing[0] });
        return;
      }
      const conn = await sql`
        INSERT INTO connections (requester_id, addressee_id, status)
        VALUES (${myId}, ${addresseeId}, 'pending')
        RETURNING id, requester_id, addressee_id, status, created_at, updated_at
      `;
      await sql`
        INSERT INTO notifications (user_id, type, from_user_id, reference_id)
        VALUES (${addresseeId}, 'connection_request', ${myId}, ${conn[0].id})
      `;
      res.status(200).json({ connection: conn[0] });
      return;
    }

    if (action === 'accept' || action === 'reject') {
      const connectionId = String(body.connectionId || '');
      if (!connectionId) { res.status(400).json({ error: 'connectionId is required' }); return; }
      const newStatus = action === 'accept' ? 'accepted' : 'rejected';
      const rows = await sql`
        UPDATE connections
        SET status = ${newStatus}, updated_at = now()
        WHERE id = ${connectionId} AND addressee_id = ${myId} AND status = 'pending'
        RETURNING id, requester_id, addressee_id, status, created_at, updated_at
      `;
      if (!rows[0]) { res.status(404).json({ error: 'not_found' }); return; }
      if (action === 'accept') {
        await sql`
          INSERT INTO notifications (user_id, type, from_user_id, reference_id)
          VALUES (${rows[0].requester_id}, 'connection_accepted', ${myId}, ${connectionId})
        `;
      }
      res.status(200).json({ connection: rows[0] });
      return;
    }

    if (action === 'remove') {
      const connectionId = String(body.connectionId || '');
      if (!connectionId) { res.status(400).json({ error: 'connectionId is required' }); return; }
      await sql`
        DELETE FROM connections
        WHERE id = ${connectionId}
          AND (requester_id = ${myId} OR addressee_id = ${myId})
      `;
      res.status(200).json({ success: true });
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[connections] error:', e?.message);
    res.status(500).json({ error: 'Database error' });
  }
}
