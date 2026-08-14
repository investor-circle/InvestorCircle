/**
 * api/_lib/handlers/groups.js — groups resource handler
 *
 * Dispatched by api/data.js (resource=groups). See connections.js for why
 * this lives under api/_lib/ instead of being its own route.
 *
 * GET  ?resource=groups
 *   -> 200 { groups: [...] }  (groups the caller is an active member of, with members[])
 *
 * POST ?resource=groups
 *   Body: { action, ... }
 *     create:        { name, color, memberIds: [] }
 *     rename:        { groupId, name }                  — caller must be an active admin member
 *     delete:        { groupId }                         — caller must be the creator
 *     exit:          { groupId }                         — caller exits their own membership
 *     add-members:   { groupId, memberIds: [] }           — caller must be an active admin member
 *     remove-member: { groupId, memberId }                — caller must be an active admin member
 */

import { sql, parseBody } from '../auth.js';

async function isActiveAdmin(groupId, uid) {
  const rows = await sql`
    SELECT 1 FROM group_members
    WHERE group_id = ${groupId} AND user_id = ${uid} AND role = 'admin' AND status = 'active'
    LIMIT 1
  `;
  return rows.length > 0;
}

export default async function handleGroups(req, res, myId) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const groups = await sql`
        SELECT g.id, g.name, g.color, g.created_by, g.created_at, gm.role AS my_role
        FROM ic_groups g
        JOIN group_members gm ON gm.group_id = g.id
        WHERE gm.user_id = ${myId} AND gm.status = 'active'
        ORDER BY g.created_at DESC
      `;
      if (groups.length === 0) { res.status(200).json({ groups: [] }); return; }
      const groupIds = groups.map(g => g.id);
      const members = await sql`
        SELECT gm.group_id, gm.user_id, gm.role, gm.status, up.full_name AS name, up.email
        FROM group_members gm
        JOIN user_profiles up ON up.id = gm.user_id
        WHERE gm.group_id = ANY(${groupIds}::uuid[])
        ORDER BY gm.joined_at ASC
      `;
      const membersByGroup = members.reduce((acc, m) => {
        (acc[m.group_id] ??= []).push(m);
        return acc;
      }, {});
      groups.forEach(g => { g.members = membersByGroup[g.id] || []; });
      res.status(200).json({ groups });
      return;
    }

    const body = parseBody(req);
    const action = String(body.action || '');

    if (action === 'create') {
      const name = String(body.name || '').trim();
      const color = String(body.color || '').trim();
      const memberIds = Array.isArray(body.memberIds) ? body.memberIds.map(String) : [];
      if (!name) { res.status(400).json({ error: 'name is required' }); return; }

      const g = await sql`
        INSERT INTO ic_groups (name, color, created_by)
        VALUES (${name}, ${color || null}, ${myId})
        RETURNING id, name, color, created_by, created_at
      `;
      const groupId = g[0].id;
      await sql`
        INSERT INTO group_members (group_id, user_id, role)
        VALUES (${groupId}, ${myId}, 'admin')
      `;
      for (const memberId of memberIds) {
        await sql`
          INSERT INTO group_members (group_id, user_id, role)
          VALUES (${groupId}, ${memberId}, 'member')
          ON CONFLICT (group_id, user_id) DO NOTHING
        `;
        await sql`
          INSERT INTO notifications (user_id, type, from_user_id, reference_id, metadata)
          VALUES (${memberId}, 'group_added', ${myId}, ${groupId}, ${JSON.stringify({ groupName: name })})
        `;
      }
      res.status(200).json({ group: g[0] });
      return;
    }

    if (action === 'rename') {
      const groupId = String(body.groupId || '');
      const name = String(body.name || '').trim();
      if (!groupId || !name) { res.status(400).json({ error: 'groupId and name are required' }); return; }
      const rows = await sql`
        UPDATE ic_groups SET name = ${name}, updated_at = now()
        WHERE id = ${groupId}
          AND EXISTS (
            SELECT 1 FROM group_members
            WHERE group_id = ${groupId} AND user_id = ${myId} AND role = 'admin' AND status = 'active'
          )
        RETURNING id, name, color, created_by, created_at
      `;
      if (!rows[0]) { res.status(403).json({ error: 'Not authorized for this group' }); return; }
      res.status(200).json({ group: rows[0] });
      return;
    }

    if (action === 'delete') {
      const groupId = String(body.groupId || '');
      if (!groupId) { res.status(400).json({ error: 'groupId is required' }); return; }
      const rows = await sql`
        DELETE FROM ic_groups WHERE id = ${groupId} AND created_by = ${myId} RETURNING id
      `;
      if (!rows[0]) { res.status(403).json({ error: 'Not authorized for this group' }); return; }
      res.status(200).json({ success: true });
      return;
    }

    if (action === 'exit') {
      const groupId = String(body.groupId || '');
      if (!groupId) { res.status(400).json({ error: 'groupId is required' }); return; }
      const rows = await sql`
        UPDATE group_members SET status = 'exited', exited_at = now()
        WHERE group_id = ${groupId} AND user_id = ${myId}
        RETURNING group_id, user_id, role, status
      `;
      if (!rows[0]) { res.status(404).json({ error: 'not_found' }); return; }
      const admins = await sql`
        SELECT gm.user_id FROM group_members gm
        WHERE gm.group_id = ${groupId} AND gm.role = 'admin' AND gm.status = 'active' AND gm.user_id != ${myId}
      `;
      const grp = await sql`SELECT name FROM ic_groups WHERE id = ${groupId} LIMIT 1`;
      const groupName = grp[0]?.name || '';
      for (const a of admins) {
        await sql`
          INSERT INTO notifications (user_id, type, from_user_id, reference_id, metadata)
          VALUES (${a.user_id}, 'group_member_exit', ${myId}, ${groupId}, ${JSON.stringify({ groupName })})
        `;
      }
      res.status(200).json({ success: true });
      return;
    }

    if (action === 'add-members') {
      const groupId = String(body.groupId || '');
      const memberIds = Array.isArray(body.memberIds) ? body.memberIds.map(String) : [];
      if (!groupId || memberIds.length === 0) { res.status(400).json({ error: 'groupId and memberIds are required' }); return; }
      if (!(await isActiveAdmin(groupId, myId))) { res.status(403).json({ error: 'Not authorized for this group' }); return; }
      const grp = await sql`SELECT name FROM ic_groups WHERE id = ${groupId} LIMIT 1`;
      const groupName = grp[0]?.name || '';
      for (const memberId of memberIds) {
        await sql`
          INSERT INTO group_members (group_id, user_id, role)
          VALUES (${groupId}, ${memberId}, 'member')
          ON CONFLICT (group_id, user_id) DO UPDATE
            SET status = 'active', exited_at = null, joined_at = now()
        `;
        await sql`
          INSERT INTO notifications (user_id, type, from_user_id, reference_id, metadata)
          VALUES (${memberId}, 'group_added', ${myId}, ${groupId}, ${JSON.stringify({ groupName })})
        `;
      }
      res.status(200).json({ success: true });
      return;
    }

    if (action === 'remove-member') {
      const groupId = String(body.groupId || '');
      const memberId = String(body.memberId || '');
      if (!groupId || !memberId) { res.status(400).json({ error: 'groupId and memberId are required' }); return; }
      if (!(await isActiveAdmin(groupId, myId))) { res.status(403).json({ error: 'Not authorized for this group' }); return; }
      await sql`
        UPDATE group_members SET status = 'exited', exited_at = now()
        WHERE group_id = ${groupId} AND user_id = ${memberId}
      `;
      res.status(200).json({ success: true });
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[groups] error:', e?.message);
    res.status(500).json({ error: 'Database error' });
  }
}
