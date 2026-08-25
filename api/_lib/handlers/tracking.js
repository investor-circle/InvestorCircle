/**
 * api/_lib/handlers/tracking.js — tracking resource handler
 *
 * Dispatched by api/data.js (resource=tracking, auth:'user'). "Track" is the
 * one-way, no-approval relationship that replaces Follow for investor/
 * creator content ("I want to see this investor's ideas") — distinct from
 * `connections` (mutual, requires accept) and `ic_groups`/Circles
 * (community membership). See supabase/phase6_relationships.sql
 * (user_tracking table) and supabase/phase7_tracking_network.sql
 * (pagination indexes + the tracking_new notification singleton index).
 *
 * GET  ?resource=tracking                                   -> { tracking: [...] }  (legacy: full list of people I track, unpaginated — kept for callers that just need "am I tracking X" client-side lookups)
 * GET  ?resource=tracking&action=status&targetId=X            -> { tracking: boolean }
 * GET  ?resource=tracking&action=counts                       -> { trackersCount, trackingCount }
 * GET  ?resource=tracking&action=trackers&limit=&offset=&sort=&q=       -> { people: [...], hasMore }  ("Tracking me" — people who track ME)
 * GET  ?resource=tracking&action=tracking-list&limit=&offset=&sort=&q=  -> { people: [...], hasMore }  ("I'm tracking" — people I track)
 *   sort: 'date_desc' (default — newest first) | 'date_asc' | 'name_asc' | 'name_desc'
 *   q: optional case-insensitive substring match against name/username
 *
 * POST ?resource=tracking
 *   Body: { action: 'track'|'untrack', targetId }
 *
 * myId always comes from the verified token (resolved by api/data.js
 * before this handler runs), never from the request body.
 */

import { sql, parseBody } from '../auth.js';

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;

function readPaging(req) {
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query?.limit, 10) || DEFAULT_PAGE_SIZE));
  const offset = Math.max(0, parseInt(req.query?.offset, 10) || 0);
  return { limit, offset };
}

const SORTS = ['date_desc', 'date_asc', 'name_asc', 'name_desc'];
function readSort(req) {
  const s = String(req.query?.sort || 'date_desc');
  return SORTS.includes(s) ? s : 'date_desc';
}

// Bounded so an absurdly long query string can't bloat the ILIKE pattern.
function readSearch(req) {
  return String(req.query?.q || '').trim().slice(0, 100);
}

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

      if (action === 'counts') {
        const [trackers, tracking] = await Promise.all([
          sql`SELECT COUNT(*)::int AS n FROM user_tracking WHERE tracked_id = ${myId}`,
          sql`SELECT COUNT(*)::int AS n FROM user_tracking WHERE tracker_id = ${myId}`,
        ]);
        res.status(200).json({ trackersCount: trackers[0]?.n || 0, trackingCount: tracking[0]?.n || 0 });
        return;
      }

      // ── "Tracking me" — people who track the caller ──
      if (action === 'trackers') {
        const { limit, offset } = readPaging(req);
        const sort = readSort(req);
        const q = readSearch(req);
        const rows = await sql`
          SELECT up.id, up.username, up.full_name, up.avatar_url, up.avatar_color, ut.created_at,
                 EXISTS(
                   SELECT 1 FROM user_tracking back
                   WHERE back.tracker_id = ${myId} AND back.tracked_id = up.id
                 ) AS am_i_tracking,
                 (
                   SELECT c.status FROM connections c
                   WHERE (c.requester_id = ${myId} AND c.addressee_id = up.id)
                      OR (c.addressee_id = ${myId} AND c.requester_id = up.id)
                   LIMIT 1
                 ) AS connection_status
          FROM user_tracking ut
          JOIN user_profiles up ON up.id = ut.tracker_id
          WHERE ut.tracked_id = ${myId}
            AND (${q} = '' OR up.full_name ILIKE ${'%' + q + '%'} OR up.username ILIKE ${'%' + q + '%'})
          ORDER BY
            CASE WHEN ${sort} = 'name_asc'  THEN up.full_name END ASC NULLS LAST,
            CASE WHEN ${sort} = 'name_desc' THEN up.full_name END DESC NULLS LAST,
            CASE WHEN ${sort} = 'date_asc'  THEN ut.created_at END ASC,
            CASE WHEN ${sort} = 'date_desc' THEN ut.created_at END DESC,
            ut.created_at DESC
          LIMIT ${limit + 1} OFFSET ${offset}
        `;
        const hasMore = rows.length > limit;
        res.status(200).json({ people: rows.slice(0, limit), hasMore });
        return;
      }

      // ── "I'm tracking" — people the caller tracks ──
      if (action === 'tracking-list') {
        const { limit, offset } = readPaging(req);
        const sort = readSort(req);
        const q = readSearch(req);
        const rows = await sql`
          SELECT up.id, up.username, up.full_name, up.avatar_url, up.avatar_color, ut.created_at,
                 (
                   SELECT c.status FROM connections c
                   WHERE (c.requester_id = ${myId} AND c.addressee_id = up.id)
                      OR (c.addressee_id = ${myId} AND c.requester_id = up.id)
                   LIMIT 1
                 ) AS connection_status
          FROM user_tracking ut
          JOIN user_profiles up ON up.id = ut.tracked_id
          WHERE ut.tracker_id = ${myId}
            AND (${q} = '' OR up.full_name ILIKE ${'%' + q + '%'} OR up.username ILIKE ${'%' + q + '%'})
          ORDER BY
            CASE WHEN ${sort} = 'name_asc'  THEN up.full_name END ASC NULLS LAST,
            CASE WHEN ${sort} = 'name_desc' THEN up.full_name END DESC NULLS LAST,
            CASE WHEN ${sort} = 'date_asc'  THEN ut.created_at END ASC,
            CASE WHEN ${sort} = 'date_desc' THEN ut.created_at END DESC,
            ut.created_at DESC
          LIMIT ${limit + 1} OFFSET ${offset}
        `;
        const hasMore = rows.length > limit;
        res.status(200).json({ people: rows.slice(0, limit), hasMore });
        return;
      }

      // ── legacy: full unpaginated list (small use sites only) ──
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
      await trackAndNotify(myId, targetId);
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

/**
 * Record a Track relationship (idempotent — a duplicate Track is a no-op)
 * and, only when a genuinely new tracking row was created, notify the
 * tracked user — bundling into a single "smart" notification when they
 * already have an unread one, rather than spamming one row per tracker.
 * Exported so other resources that form a tracking relationship as a side
 * effect (e.g. subscribing to a public Circle — see
 * api/_lib/handlers/groups.js) go through the exact same idempotency
 * logic instead of duplicating it.
 *
 * opts.notify (default true) — pass false when the caller already sends
 * its own, more specific notification for the same user action (e.g.
 * Circle subscribe already notifies the owner via 'circle_join_request';
 * the auto-track side effect of that click should not ALSO produce a
 * separate 'tracking_new' notification for the same click).
 */
export async function trackAndNotify(trackerId, targetId, opts = {}) {
  const notify = opts.notify !== false;
  if (!trackerId || !targetId || trackerId === targetId) return false; // defense-in-depth — callers should already guard this
  const inserted = await sql`
    INSERT INTO user_tracking (tracker_id, tracked_id)
    VALUES (${trackerId}, ${targetId})
    ON CONFLICT (tracker_id, tracked_id) DO NOTHING
    RETURNING tracker_id
  `;
  if (inserted.length === 0) return false; // already tracking — no notification, no duplicate
  if (!notify) return true;

  const trackerRows = await sql`SELECT full_name FROM user_profiles WHERE id = ${trackerId} LIMIT 1`;
  const trackerName = trackerRows[0]?.full_name || 'Someone';

  // Atomic upsert in a single statement: at most one UNREAD 'tracking_new'
  // notification can exist per recipient (enforced by the partial unique
  // index idx_notifications_tracking_singleton), so concurrent Track
  // requests for the same recipient race safely on this one INSERT rather
  // than a read-then-write check-and-set. First tracker while the
  // recipient has no unread bundle -> a fresh individual notification.
  // Any further tracker while that notification is still unread -> bumps
  // its count/lead name and refreshes created_at instead of creating a
  // second row. Reading it resets the bundle for the next new tracker.
  await sql`
    INSERT INTO notifications (user_id, type, from_user_id, reference_id, metadata, is_read)
    VALUES (${targetId}, 'tracking_new', ${trackerId}, NULL, ${JSON.stringify({ count: 1, leadName: trackerName })}, false)
    ON CONFLICT (user_id) WHERE type = 'tracking_new' AND is_read = false
    DO UPDATE SET
      metadata = jsonb_set(
        jsonb_set(notifications.metadata, '{count}', to_jsonb(COALESCE((notifications.metadata->>'count')::int, 1) + 1)),
        '{leadName}', to_jsonb(COALESCE(notifications.metadata->>'leadName', ${trackerName}))
      ),
      from_user_id = ${trackerId},
      created_at = now()
  `;
  return true;
}
