/**
 * api/_lib/handlers/groups.js — groups (Circles) resource handler
 *
 * Dispatched by api/data.js (resource=groups, auth:'none' at the router
 * level — this resource bundles public and authenticated actions, mirroring
 * the claim-profile.js pattern). Each authenticated action below performs
 * its OWN requireUid() check before touching the database; the two public
 * actions (by-slug, owner-circles) use optionalUid() to personalize the
 * response for a logged-in caller without requiring one.
 *
 * "Circle" (Phase 6) is the product-facing rename of the pre-existing
 * Group concept — this file still operates on the same `ic_groups` /
 * `group_members` tables (extended with circle_type/description/slug/
 * invite_code, see supabase/phase6_relationships.sql) rather than a
 * parallel schema, so existing groups keep working unchanged as private
 * Circles.
 *
 * GET  ?resource=groups                                          (user)   -> { groups: [...] }  (circles I'm an active member of)
 *      ?resource=groups&action=by-slug&slug=<slug>                (public) -> { circle: {...} } | 404
 *      ?resource=groups&action=owner-circles&ownerId=<id>          (public) -> { public: [...], private: [...] }
 *      ?resource=groups&action=join-requests&groupId=<id>          (owner)  -> { requests: [...] }
 *      ?resource=groups&action=eligible-members&groupId=<id>       (owner)  -> { people: [...] }
 *
 * POST ?resource=groups
 *   Body: { action, ... }
 *     create:               { name, color, description, circleType: 'private'|'public', memberIds: [] }
 *     update-settings:      { groupId, name, description }        — admin only
 *     delete:                { groupId }                          — creator only
 *     exit:                  { groupId }                          — caller exits their own membership
 *     add-members:           { groupId, memberIds: [] }            — admin only; server re-validates eligibility
 *     remove-member:         { groupId, memberId }                 — admin only
 *     request-join:          { groupId, inviteCode? }              — public circles only; auto-tracks the owner
 *     approve-join-request:  { requestId }                         — owner only
 *     reject-join-request:   { requestId }                         — owner only
 *     regenerate-invite-link:{ groupId }                           — owner only, public circles only
 */

import { sql, parseBody, requireUid, optionalUid, sendAuthError } from '../auth.js';
import { randomUUID } from 'crypto';
import { trackAndNotify } from './tracking.js';

async function isActiveAdmin(groupId, uid) {
  const rows = await sql`
    SELECT 1 FROM group_members
    WHERE group_id = ${groupId} AND user_id = ${uid} AND role = 'admin' AND status = 'active'
    LIMIT 1
  `;
  return rows.length > 0;
}

/** Eligibility for direct-add / request-to-join: a Connection of the owner,
 * or (public circles only) someone who Tracks the owner. */
async function isEligibleForCircle(ownerId, candidateId, circleType) {
  const conn = await sql`
    SELECT 1 FROM connections
    WHERE status = 'accepted'
      AND ((requester_id = ${ownerId} AND addressee_id = ${candidateId})
        OR (requester_id = ${candidateId} AND addressee_id = ${ownerId}))
    LIMIT 1
  `;
  if (conn.length > 0) return true;
  if (circleType === 'public') {
    const trk = await sql`
      SELECT 1 FROM user_tracking WHERE tracker_id = ${candidateId} AND tracked_id = ${ownerId} LIMIT 1
    `;
    if (trk.length > 0) return true;
  }
  return false;
}

function slugify(name, id) {
  const base = String(name || 'circle').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '') || 'circle';
  return `${base}-${String(id).replace(/-/g, '').slice(0, 8)}`;
}

export default async function handleGroups(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const action = String(req.query?.action || '');

      // ── by-slug: public Circle detail page (works for anonymous visitors) ──
      if (action === 'by-slug') {
        const slug = String(req.query?.slug || '').trim();
        if (!slug) { res.status(400).json({ error: 'slug is required' }); return; }
        const uid = await optionalUid(req);

        const rows = await sql`
          SELECT g.id, g.name, g.color, g.description, g.circle_type, g.slug, g.invite_code,
                 g.created_by, g.created_at,
                 up.full_name AS owner_name, up.username AS owner_username,
                 up.avatar_url AS owner_avatar_url, up.avatar_color AS owner_avatar_color
          FROM ic_groups g
          JOIN user_profiles up ON up.id = g.created_by
          WHERE g.slug = ${slug}
          LIMIT 1
        `;
        const circle = rows[0];
        if (!circle) { res.status(404).json({ error: 'not_found' }); return; }

        const isOwner = !!uid && uid === circle.created_by;
        let myMembership = null;
        if (uid && !isOwner) {
          const mm = await sql`SELECT role, status FROM group_members WHERE group_id = ${circle.id} AND user_id = ${uid} LIMIT 1`;
          myMembership = mm[0] || null;
        }
        const isActiveMember = isOwner || (myMembership?.status === 'active');

        // Private circles never reveal their existence or details to non-members.
        if (circle.circle_type === 'private' && !isActiveMember) {
          res.status(404).json({ error: 'not_found' });
          return;
        }

        const memberRows = await sql`
          SELECT gm.user_id, gm.role, up.full_name AS name, up.username, up.avatar_url, up.avatar_color
          FROM group_members gm
          JOIN user_profiles up ON up.id = gm.user_id
          WHERE gm.group_id = ${circle.id} AND gm.status = 'active'
          ORDER BY gm.joined_at ASC
        `;

        let myJoinRequestStatus = null;
        if (uid && !isActiveMember) {
          const jr = await sql`
            SELECT status FROM circle_join_requests WHERE group_id = ${circle.id} AND user_id = ${uid}
            ORDER BY created_at DESC LIMIT 1
          `;
          myJoinRequestStatus = jr[0]?.status || null;
        }

        let pendingRequestCount = 0;
        if (isOwner && circle.circle_type === 'public') {
          const pr = await sql`
            SELECT COUNT(*)::int AS n FROM circle_join_requests WHERE group_id = ${circle.id} AND status = 'pending'
          `;
          pendingRequestCount = pr[0]?.n || 0;
        }

        res.status(200).json({
          circle: {
            id: circle.id, name: circle.name, color: circle.color, description: circle.description,
            circle_type: circle.circle_type, slug: circle.slug,
            invite_code: isActiveMember ? circle.invite_code : null,
            created_by: circle.created_by,
            owner_name: circle.owner_name, owner_username: circle.owner_username,
            owner_avatar_url: circle.owner_avatar_url, owner_avatar_color: circle.owner_avatar_color,
            created_at: circle.created_at,
            member_count: memberRows.length,
            members: memberRows,
            is_owner: isOwner,
            my_role: myMembership?.role || (isOwner ? 'admin' : null),
            is_member: isActiveMember,
            my_join_request_status: myJoinRequestStatus,
            pending_request_count: pendingRequestCount,
          },
        });
        return;
      }

      // ── owner-circles: for an investor's public profile page ──
      if (action === 'owner-circles') {
        const ownerId = String(req.query?.ownerId || '');
        if (!ownerId) { res.status(400).json({ error: 'ownerId is required' }); return; }
        const uid = await optionalUid(req);

        const pub = await sql`
          SELECT g.id, g.name, g.description, g.color, g.slug, g.created_at,
                 (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id AND gm.status = 'active')::int AS member_count
          FROM ic_groups g
          WHERE g.created_by = ${ownerId} AND g.circle_type = 'public'
          ORDER BY g.created_at DESC
        `;

        let priv = [];
        if (uid) {
          priv = await sql`
            SELECT g.id, g.name, g.description, g.color, g.slug, g.created_at,
                   (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id AND gm2.status = 'active')::int AS member_count
            FROM ic_groups g
            JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ${uid} AND gm.status = 'active'
            WHERE g.created_by = ${ownerId} AND g.circle_type = 'private'
            ORDER BY g.created_at DESC
          `;
        }
        res.status(200).json({ public: pub, private: priv });
        return;
      }

      // ── everything else requires a verified caller ──
      let uid;
      try { uid = await requireUid(req); } catch (e) { sendAuthError(res, e); return; }

      if (action === 'join-requests') {
        const groupId = String(req.query?.groupId || '');
        if (!groupId) { res.status(400).json({ error: 'groupId is required' }); return; }
        if (!(await isActiveAdmin(groupId, uid))) { res.status(403).json({ error: 'Not authorized for this circle' }); return; }
        const rows = await sql`
          SELECT jr.id, jr.user_id, jr.status, jr.source, jr.created_at,
                 up.full_name, up.username, up.avatar_url, up.avatar_color
          FROM circle_join_requests jr
          JOIN user_profiles up ON up.id = jr.user_id
          WHERE jr.group_id = ${groupId} AND jr.status = 'pending'
          ORDER BY jr.created_at ASC
        `;
        res.status(200).json({ requests: rows });
        return;
      }

      if (action === 'eligible-members') {
        const groupId = String(req.query?.groupId || '');
        if (!groupId) { res.status(400).json({ error: 'groupId is required' }); return; }
        if (!(await isActiveAdmin(groupId, uid))) { res.status(403).json({ error: 'Not authorized for this circle' }); return; }
        const grp = await sql`SELECT circle_type FROM ic_groups WHERE id = ${groupId} LIMIT 1`;
        if (!grp[0]) { res.status(404).json({ error: 'not_found' }); return; }
        const circleType = grp[0].circle_type;

        const connCandidates = await sql`
          SELECT CASE WHEN c.requester_id = ${uid} THEN c.addressee_id ELSE c.requester_id END AS id,
                 up.full_name, up.username, up.avatar_url, up.avatar_color
          FROM connections c
          JOIN user_profiles up ON up.id = CASE WHEN c.requester_id = ${uid} THEN c.addressee_id ELSE c.requester_id END
          WHERE c.status = 'accepted' AND (c.requester_id = ${uid} OR c.addressee_id = ${uid})
        `;
        let people = connCandidates;
        if (circleType === 'public') {
          const trackerCandidates = await sql`
            SELECT up.id, up.full_name, up.username, up.avatar_url, up.avatar_color
            FROM user_tracking ut
            JOIN user_profiles up ON up.id = ut.tracker_id
            WHERE ut.tracked_id = ${uid}
          `;
          const seen = new Set(people.map(p => p.id));
          for (const t of trackerCandidates) { if (!seen.has(t.id)) { people.push(t); seen.add(t.id); } }
        }
        const already = await sql`
          SELECT user_id FROM group_members WHERE group_id = ${groupId} AND status = 'active'
        `;
        const alreadyIds = new Set(already.map(a => a.user_id));
        people = people.filter(p => !alreadyIds.has(p.id));
        res.status(200).json({ people });
        return;
      }

      // ── default: circles I'm an active member of ──
      const groups = await sql`
        SELECT g.id, g.name, g.color, g.description, g.circle_type, g.slug, g.invite_code,
               g.created_by, g.created_at, gm.role AS my_role
        FROM ic_groups g
        JOIN group_members gm ON gm.group_id = g.id
        WHERE gm.user_id = ${uid} AND gm.status = 'active'
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
      const pending = await sql`
        SELECT group_id, COUNT(*)::int AS n FROM circle_join_requests
        WHERE group_id = ANY(${groupIds}::uuid[]) AND status = 'pending'
        GROUP BY group_id
      `;
      const membersByGroup = members.reduce((acc, m) => { (acc[m.group_id] ??= []).push(m); return acc; }, {});
      const pendingByGroup = pending.reduce((acc, p) => { acc[p.group_id] = p.n; return acc; }, {});
      groups.forEach(g => {
        g.members = membersByGroup[g.id] || [];
        g.pending_request_count = pendingByGroup[g.id] || 0;
        // Invite links only exist for public circles — any active member
        // (not just the owner) may share one. Private circles never expose one.
        g.invite_code = g.circle_type === 'public' ? g.invite_code : null;
      });
      res.status(200).json({ groups });
      return;
    }

    // ── POST — every action requires a verified caller ──
    let myId;
    try { myId = await requireUid(req); } catch (e) { sendAuthError(res, e); return; }

    const body = parseBody(req);
    const action = String(body.action || '');

    if (action === 'create') {
      const name = String(body.name || '').trim();
      const color = String(body.color || '').trim();
      const description = body.description != null ? String(body.description).trim() : '';
      const circleType = body.circleType === 'public' ? 'public' : 'private';
      const requestedMemberIds = Array.isArray(body.memberIds) ? [...new Set(body.memberIds.map(String))] : [];
      if (!name) { res.status(400).json({ error: 'name is required' }); return; }

      // Server re-validates eligibility for any members the client tried to
      // pre-add at creation time — never trust the client-supplied list.
      const memberIds = [];
      for (const candidateId of requestedMemberIds) {
        if (candidateId === myId) continue;
        if (await isEligibleForCircle(myId, candidateId, circleType)) memberIds.push(candidateId);
      }

      const g = await sql`
        INSERT INTO ic_groups (name, color, description, circle_type, created_by)
        VALUES (${name}, ${color || null}, ${description || null}, ${circleType}, ${myId})
        RETURNING id, name, color, description, circle_type, created_by, created_at
      `;
      const groupId = g[0].id;
      const slug = slugify(name, groupId);
      const inviteCode = randomUUID().replace(/-/g, '');
      await sql`UPDATE ic_groups SET slug = ${slug}, invite_code = ${inviteCode} WHERE id = ${groupId}`;

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
      res.status(200).json({ group: { ...g[0], slug, invite_code: inviteCode } });
      return;
    }

    if (action === 'update-settings') {
      const groupId = String(body.groupId || '');
      const name = String(body.name || '').trim();
      const description = body.description != null ? String(body.description).trim() : '';
      if (!groupId || !name) { res.status(400).json({ error: 'groupId and name are required' }); return; }
      const rows = await sql`
        UPDATE ic_groups SET name = ${name}, description = ${description || null}, updated_at = now()
        WHERE id = ${groupId}
          AND EXISTS (
            SELECT 1 FROM group_members
            WHERE group_id = ${groupId} AND user_id = ${myId} AND role = 'admin' AND status = 'active'
          )
        RETURNING id, name, color, description, circle_type, slug, invite_code, created_by, created_at
      `;
      if (!rows[0]) { res.status(403).json({ error: 'Not authorized for this circle' }); return; }
      res.status(200).json({ group: rows[0] });
      return;
    }

    if (action === 'delete') {
      const groupId = String(body.groupId || '');
      if (!groupId) { res.status(400).json({ error: 'groupId is required' }); return; }
      const rows = await sql`
        DELETE FROM ic_groups WHERE id = ${groupId} AND created_by = ${myId} RETURNING id
      `;
      if (!rows[0]) { res.status(403).json({ error: 'Not authorized for this circle' }); return; }
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
      const requestedMemberIds = Array.isArray(body.memberIds) ? [...new Set(body.memberIds.map(String))] : [];
      if (!groupId || requestedMemberIds.length === 0) { res.status(400).json({ error: 'groupId and memberIds are required' }); return; }
      if (!(await isActiveAdmin(groupId, myId))) { res.status(403).json({ error: 'Not authorized for this circle' }); return; }
      const grp = await sql`SELECT name, circle_type FROM ic_groups WHERE id = ${groupId} LIMIT 1`;
      if (!grp[0]) { res.status(404).json({ error: 'not_found' }); return; }
      const { name: groupName, circle_type: circleType } = grp[0];

      // Never trust the client's eligibility claim — a Circle owner can only
      // directly add people who Track them or are Connections (public), or
      // Connections only (private).
      const memberIds = [];
      for (const candidateId of requestedMemberIds) {
        if (candidateId === myId) continue;
        if (await isEligibleForCircle(myId, candidateId, circleType)) memberIds.push(candidateId);
      }
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
      res.status(200).json({ success: true, added: memberIds.length, skipped: requestedMemberIds.length - memberIds.length });
      return;
    }

    if (action === 'remove-member') {
      const groupId = String(body.groupId || '');
      const memberId = String(body.memberId || '');
      if (!groupId || !memberId) { res.status(400).json({ error: 'groupId and memberId are required' }); return; }
      if (!(await isActiveAdmin(groupId, myId))) { res.status(403).json({ error: 'Not authorized for this circle' }); return; }
      await sql`
        UPDATE group_members SET status = 'exited', exited_at = now()
        WHERE group_id = ${groupId} AND user_id = ${memberId}
      `;
      res.status(200).json({ success: true });
      return;
    }

    if (action === 'request-join') {
      const groupId = String(body.groupId || '');
      const inviteCode = body.inviteCode ? String(body.inviteCode) : null;
      if (!groupId) { res.status(400).json({ error: 'groupId is required' }); return; }
      const grp = await sql`SELECT id, name, slug, created_by, circle_type, invite_code FROM ic_groups WHERE id = ${groupId} LIMIT 1`;
      const circle = grp[0];
      if (!circle) { res.status(404).json({ error: 'not_found' }); return; }
      if (circle.circle_type !== 'public') { res.status(403).json({ error: 'Not a public circle' }); return; }
      if (circle.created_by === myId) { res.status(400).json({ error: 'You already own this circle' }); return; }

      // No eligibility gate here: a PUBLIC circle is, by definition,
      // subscribable by anyone who finds it (e.g. from the owner's public
      // profile) — that's the entire discovery/growth mechanic. Requiring
      // an existing Track/Connection first would make it impossible for a
      // new visitor to ever subscribe, since Subscribe is what CREATES the
      // Track relationship. isEligibleForCircle() is still used by the
      // create/add-members actions above, for the owner's own "add
      // eligible people directly" action, where the owner (not the person
      // themselves) is choosing who to add — a different, intentionally
      // narrower operation.
      const viaInvite = !!inviteCode && inviteCode === circle.invite_code;

      const existingMember = await sql`
        SELECT 1 FROM group_members WHERE group_id = ${groupId} AND user_id = ${myId} AND status = 'active' LIMIT 1
      `;
      if (existingMember.length > 0) { res.status(200).json({ already_member: true }); return; }

      // Clicking Subscribe/Join always tracks the circle owner, regardless of
      // whether the join request itself still needs approval (product spec).
      // Goes through the same idempotent track path as the profile Track
      // button, but suppressed notification (notify: false) — the
      // 'circle_join_request' notification below already tells the owner
      // about this exact click; a second 'tracking_new' notification for
      // the same action would be a duplicate, not genuinely new information.
      await trackAndNotify(myId, circle.created_by, { notify: false });

      const jr = await sql`
        INSERT INTO circle_join_requests (group_id, user_id, source, status)
        VALUES (${groupId}, ${myId}, ${viaInvite ? 'invite_link' : 'direct'}, 'pending')
        ON CONFLICT (group_id, user_id) DO UPDATE SET status = 'pending', source = EXCLUDED.source, updated_at = now()
        RETURNING id, status
      `;
      await sql`
        INSERT INTO notifications (user_id, type, from_user_id, reference_id, metadata)
        VALUES (${circle.created_by}, 'circle_join_request', ${myId}, ${groupId}, ${JSON.stringify({ groupName: circle.name, groupSlug: circle.slug })})
      `;
      res.status(200).json({ request: jr[0], tracking: true });
      return;
    }

    if (action === 'approve-join-request' || action === 'reject-join-request') {
      const requestId = String(body.requestId || '');
      if (!requestId) { res.status(400).json({ error: 'requestId is required' }); return; }
      const rows = await sql`
        SELECT jr.id, jr.group_id, jr.user_id, jr.status, g.created_by, g.name
        FROM circle_join_requests jr
        JOIN ic_groups g ON g.id = jr.group_id
        WHERE jr.id = ${requestId}
        LIMIT 1
      `;
      const jr = rows[0];
      if (!jr) { res.status(404).json({ error: 'not_found' }); return; }
      if (jr.created_by !== myId) { res.status(403).json({ error: 'Not authorized for this circle' }); return; }
      if (jr.status !== 'pending') { res.status(400).json({ error: 'Request already reviewed' }); return; }

      const approve = action === 'approve-join-request';
      await sql`
        UPDATE circle_join_requests SET status = ${approve ? 'approved' : 'rejected'}, updated_at = now()
        WHERE id = ${requestId}
      `;
      if (approve) {
        await sql`
          INSERT INTO group_members (group_id, user_id, role)
          VALUES (${jr.group_id}, ${jr.user_id}, 'member')
          ON CONFLICT (group_id, user_id) DO UPDATE SET status = 'active', exited_at = null, joined_at = now()
        `;
      }
      await sql`
        INSERT INTO notifications (user_id, type, from_user_id, reference_id, metadata)
        VALUES (${jr.user_id}, ${approve ? 'circle_join_approved' : 'circle_join_rejected'}, ${myId}, ${jr.group_id}, ${JSON.stringify({ groupName: jr.name })})
      `;
      res.status(200).json({ success: true });
      return;
    }

    if (action === 'regenerate-invite-link') {
      const groupId = String(body.groupId || '');
      if (!groupId) { res.status(400).json({ error: 'groupId is required' }); return; }
      const code = randomUUID().replace(/-/g, '');
      const rows = await sql`
        UPDATE ic_groups SET invite_code = ${code}
        WHERE id = ${groupId} AND created_by = ${myId} AND circle_type = 'public'
        RETURNING invite_code
      `;
      if (!rows[0]) { res.status(403).json({ error: 'Not authorized for this circle' }); return; }
      res.status(200).json({ invite_code: rows[0].invite_code });
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[groups] error:', e?.message);
    res.status(500).json({ error: 'Database error' });
  }
}
