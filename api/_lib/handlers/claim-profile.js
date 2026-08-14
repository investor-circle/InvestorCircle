/**
 * api/_lib/handlers/claim-profile.js — claim-profile resource handler
 *
 * Dispatched by api/data.js (resource=claim-profile) with auth:'none' at the
 * router level, because this resource bundles actions with different auth
 * requirements (public token lookup, authenticated claim submission, admin
 * management). Each action below performs its OWN auth check via
 * requireUid()/requireAdmin() from ../auth.js — mirroring exactly how
 * api/data.js itself gates 'user'/'admin' resources — before touching the
 * database. Never trust a client-supplied uid for identity; the only source
 * of "who is calling" is the verified Firebase ID token.
 *
 * Claim tokens, claim status, claimed_by_uid and related fields are
 * security-sensitive (see CLAUDE.md "Claim-profile security" and "Data
 * minimization"):
 *   - claim_token is NEVER returned to an unauthenticated caller or to a
 *     non-admin authenticated caller. The previous direct-Neon frontend code
 *     fetched claim_token into React state for ANY visitor viewing a public
 *     profile page (gating only the *display* of the copy-link button on an
 *     is-admin flag computed client-side) — that was a real over-exposure.
 *     This migration fixes it: only the admin-link action (requireAdmin)
 *     ever returns a token.
 *   - Claiming a profile is a single atomic UPDATE gated on
 *     `WHERE claim_token = ${token} AND claim_status = 'unclaimed'`, so a
 *     token can never be consumed twice (race-safe: the second concurrent
 *     UPDATE simply matches zero rows).
 *
 * GET  ?resource=claim-profile&action=status&username=<username>        (public)
 *      ?resource=claim-profile&action=lookup&token=<token>              (public)
 *      ?resource=claim-profile&action=admin-link&username=<username>    (admin)
 *      ?resource=claim-profile&action=my-pending-status                 (user)
 *      ?resource=claim-profile&action=list-unclaimed                    (admin)
 *      ?resource=claim-profile&action=list-requests                     (admin)
 *
 * POST ?resource=claim-profile
 *   Body: { action, ... }
 *     submit-claim:     { token, firstName, lastName, bio?, registrationStatus, username? }  (user)
 *     create-unclaimed: { firstName, lastName, username, bio?, registrationStatus }           (admin)
 *     delete-unclaimed: { id }                                                                (admin)
 *     approve-claim:    { requestId, reviewNote? }                                            (admin)
 *     reject-claim:     { requestId, reviewNote? }                                             (admin)
 */

import { sql, parseBody, requireUid, requireAdmin, sendAuthError } from '../auth.js';
import { randomUUID } from 'crypto';

const USERNAME_RE = /^[a-z0-9_]{5,20}$/;
const ALLOWED_REG_STATUS = ['self_directed', 'sebi_ra', 'sebi_ria'];

async function usernameAvailable(username, excludeId) {
  const rows = excludeId
    ? await sql`SELECT id FROM user_profiles WHERE username = ${username} AND id != ${excludeId} LIMIT 1`
    : await sql`SELECT id FROM user_profiles WHERE username = ${username} LIMIT 1`;
  return rows.length === 0;
}

export default async function handleClaimProfile(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const action = String(req.query?.action || '');

      if (action === 'status') {
        const username = String(req.query?.username || '').trim();
        if (!username) { res.status(400).json({ error: 'username is required' }); return; }
        const rows = await sql`
          SELECT is_unclaimed, claim_status FROM user_profiles WHERE username = ${username} LIMIT 1
        `;
        if (!rows[0]) { res.status(404).json({ error: 'not_found' }); return; }
        res.status(200).json({ is_unclaimed: !!rows[0].is_unclaimed, claim_status: rows[0].claim_status || null });
        return;
      }

      if (action === 'lookup') {
        const token = String(req.query?.token || '').trim();
        if (!token) { res.status(400).json({ error: 'token is required' }); return; }
        const rows = await sql`
          SELECT id, full_name, first_name, last_name, username, bio,
                 registration_status, sebi_approval_status, claim_status
          FROM user_profiles
          WHERE claim_token = ${token} AND claim_status = 'unclaimed'
          LIMIT 1
        `;
        if (!rows[0]) { res.status(404).json({ error: 'not_found' }); return; }
        res.status(200).json({ profile: rows[0] });
        return;
      }

      if (action === 'admin-link') {
        try { await requireAdmin(req); } catch (e) { sendAuthError(res, e); return; }
        const username = String(req.query?.username || '').trim();
        if (!username) { res.status(400).json({ error: 'username is required' }); return; }
        const rows = await sql`
          SELECT claim_token, claim_status FROM user_profiles WHERE username = ${username} LIMIT 1
        `;
        if (!rows[0]) { res.status(404).json({ error: 'not_found' }); return; }
        res.status(200).json({ claim_token: rows[0].claim_token || null, claim_status: rows[0].claim_status || null });
        return;
      }

      if (action === 'my-pending-status') {
        let uid;
        try { uid = await requireUid(req); } catch (e) { sendAuthError(res, e); return; }
        const rows = await sql`
          SELECT id FROM claim_requests WHERE claimer_uid = ${uid} AND status = 'pending' LIMIT 1
        `;
        res.status(200).json({ hasPending: rows.length > 0 });
        return;
      }

      if (action === 'list-unclaimed') {
        try { await requireAdmin(req); } catch (e) { sendAuthError(res, e); return; }
        const rows = await sql`
          SELECT id, full_name, username, claim_token, claim_status, claimed_by_uid, claimed_at, created_at, bio
          FROM user_profiles
          WHERE is_unclaimed = true
          ORDER BY created_at DESC
        `;
        let recoCounts = {};
        if (rows.length) {
          const ids = rows.map(r => r.id);
          const counts = await sql`
            SELECT recommender_id, COUNT(*)::int AS n
            FROM ic_recommendations
            WHERE recommender_id = ANY(${ids})
            GROUP BY recommender_id
          `;
          recoCounts = counts.reduce((acc, c) => { acc[c.recommender_id] = c.n; return acc; }, {});
        }
        res.status(200).json({ unclaimed: rows, recoCounts });
        return;
      }

      if (action === 'list-requests') {
        try { await requireAdmin(req); } catch (e) { sendAuthError(res, e); return; }
        const rows = await sql`
          SELECT cr.id, cr.profile_id, cr.profile_username, cr.profile_full_name,
                 cr.claimer_uid, cr.claimer_email, cr.claimer_full_name, cr.status,
                 cr.created_at, cr.reviewed_at, cr.reviewed_by, cr.admin_note,
                 up.full_name AS profile_name, up.username AS profile_username_live
          FROM claim_requests cr
          LEFT JOIN user_profiles up ON cr.profile_id = up.id
          WHERE cr.status = 'pending'
          ORDER BY cr.created_at DESC
        `;
        res.status(200).json({ requests: rows });
        return;
      }

      res.status(400).json({ error: 'Unknown action' });
      return;
    }

    // POST
    const body = parseBody(req);
    const action = String(body.action || '');

    if (action === 'submit-claim') {
      let uid;
      try { uid = await requireUid(req); } catch (e) { sendAuthError(res, e); return; }

      const token = String(body.token || '').trim();
      const firstName = String(body.firstName || '').trim();
      const lastName = String(body.lastName || '').trim();
      const bio = body.bio != null ? String(body.bio).trim() : '';
      const registrationStatus = String(body.registrationStatus || 'self_directed');
      const requestedUsername = body.username != null ? String(body.username).trim().toLowerCase() : '';

      if (!token) { res.status(400).json({ error: 'token is required' }); return; }
      if (!firstName) { res.status(400).json({ error: 'First name is required' }); return; }
      if (!ALLOWED_REG_STATUS.includes(registrationStatus)) {
        res.status(400).json({ error: 'Invalid registration status' });
        return;
      }
      if (requestedUsername && !USERNAME_RE.test(requestedUsername)) {
        res.status(400).json({ error: 'Invalid username' });
        return;
      }

      // Look up the still-unclaimed profile behind this token — server-derived,
      // never trust a client-supplied "reserved username" claim.
      const unclaimedRows = await sql`
        SELECT id, username FROM user_profiles
        WHERE claim_token = ${token} AND claim_status = 'unclaimed'
        LIMIT 1
      `;
      if (!unclaimedRows[0]) {
        res.status(400).json({ error: 'This profile has already been claimed. Contact hello@myinvestorcircle.com.' });
        return;
      }
      const reservedUsername = unclaimedRows[0].username;

      // Only write a username on the claimer's own row when it differs from the
      // reserved one (avoids a UNIQUE conflict while the unclaimed row still holds it).
      const chosenUsername = (requestedUsername && requestedUsername !== reservedUsername) ? requestedUsername : null;
      if (chosenUsername) {
        const available = await usernameAvailable(chosenUsername, unclaimedRows[0].id);
        if (!available) { res.status(400).json({ error: 'Username already taken' }); return; }
      }

      const fullName = [firstName, lastName].filter(Boolean).join(' ');

      // Need the claimer's own email — Firebase Auth account already exists
      // client-side by this point (createUserWithEmailAndPassword ran before
      // this call); the verified token doesn't carry email reliably for brand
      // new accounts, so accept it from the body but only for the caller's OWN
      // profile row (never used for authorization).
      const claimerEmail = String(body.email || '').trim().toLowerCase();
      if (!claimerEmail || !claimerEmail.includes('@')) {
        res.status(400).json({ error: 'A valid email is required' });
        return;
      }

      await sql`
        INSERT INTO user_profiles (id, email, full_name, first_name, last_name, username, bio, registration_status, is_admin)
        VALUES (${uid}, ${claimerEmail}, ${fullName}, ${firstName}, ${lastName || ''}, ${chosenUsername}, ${bio || null}, ${registrationStatus}, false)
        ON CONFLICT (id) DO UPDATE SET
          full_name = EXCLUDED.full_name, first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          username = COALESCE(user_profiles.username, EXCLUDED.username),
          updated_at = NOW()
      `;

      const link = await sql`
        UPDATE user_profiles SET
          claimed_by_uid = ${uid}, claim_status = 'pending_approval',
          claimed_at = NOW(), claim_token = NULL
        WHERE claim_token = ${token} AND claim_status = 'unclaimed'
        RETURNING id
      `;
      if (!link.length) {
        res.status(400).json({ error: 'This profile has already been claimed. Contact hello@myinvestorcircle.com.' });
        return;
      }

      await sql`
        INSERT INTO claim_requests (profile_id, profile_username, profile_full_name, claimer_uid, claimer_email, claimer_full_name, status)
        SELECT id, username, full_name, ${uid}, ${claimerEmail}, ${fullName}, 'pending'
        FROM user_profiles WHERE claimed_by_uid = ${uid} AND claim_status = 'pending_approval' LIMIT 1
      `;

      res.status(200).json({ success: true, profileUsername: reservedUsername, profileFullName: fullName });
      return;
    }

    if (action === 'create-unclaimed') {
      let adminUid;
      try { adminUid = await requireAdmin(req); } catch (e) { sendAuthError(res, e); return; }

      const firstName = String(body.firstName || '').trim();
      const lastName = String(body.lastName || '').trim();
      const username = String(body.username || '').trim().toLowerCase();
      const bio = body.bio != null ? String(body.bio).trim() : '';
      const registrationStatus = String(body.registrationStatus || 'self_directed');

      if (!firstName) { res.status(400).json({ error: 'First name is required' }); return; }
      if (!USERNAME_RE.test(username)) { res.status(400).json({ error: 'Invalid username' }); return; }
      if (!ALLOWED_REG_STATUS.includes(registrationStatus)) {
        res.status(400).json({ error: 'Invalid registration status' });
        return;
      }

      const available = await usernameAvailable(username, null);
      if (!available) { res.status(400).json({ error: 'Username already taken. Choose another.' }); return; }

      const token = randomUUID().replace(/-/g, '');
      const profileId = `unc_${token.slice(0, 16)}`;
      const fullName = `${firstName} ${lastName}`.trim();
      const placeholder = `creator-${username}@myinvestorcircle.com`;

      await sql`
        INSERT INTO user_profiles (
          id, email, full_name, first_name, last_name, username, bio,
          registration_status, is_admin, is_unclaimed, claim_token, claim_status
        ) VALUES (
          ${profileId}, ${placeholder}, ${fullName},
          ${firstName}, ${lastName || ''}, ${username}, ${bio || null},
          ${registrationStatus}, false,
          true, ${token}, 'unclaimed'
        )
      `;

      res.status(200).json({ claimToken: token, profileId, username, fullName });
      return;
    }

    if (action === 'delete-unclaimed') {
      try { await requireAdmin(req); } catch (e) { sendAuthError(res, e); return; }
      const id = String(body.id || '');
      if (!id) { res.status(400).json({ error: 'id is required' }); return; }
      // Verify this is actually an unclaimed staging profile BEFORE deleting
      // anything — never cascade-delete a real (claimed) user's recommendations.
      const target = await sql`SELECT id FROM user_profiles WHERE id = ${id} AND is_unclaimed = true LIMIT 1`;
      if (!target.length) { res.status(404).json({ error: 'not_found' }); return; }
      await sql`DELETE FROM ic_recommendations WHERE recommender_id = ${id}`;
      await sql`DELETE FROM user_profiles WHERE id = ${id} AND is_unclaimed = true`;
      res.status(200).json({ success: true });
      return;
    }

    if (action === 'approve-claim' || action === 'reject-claim') {
      let adminUid;
      try { adminUid = await requireAdmin(req); } catch (e) { sendAuthError(res, e); return; }

      const requestId = String(body.requestId || '');
      const reviewNote = body.reviewNote != null ? String(body.reviewNote).trim() : null;
      if (!requestId) { res.status(400).json({ error: 'requestId is required' }); return; }

      const reqRows = await sql`
        SELECT id, profile_id, profile_username, claimer_uid, claimer_email, claimer_full_name, status
        FROM claim_requests WHERE id = ${requestId} LIMIT 1
      `;
      const claimReq = reqRows[0];
      if (!claimReq) { res.status(404).json({ error: 'not_found' }); return; }
      if (claimReq.status !== 'pending') { res.status(400).json({ error: 'Request already reviewed' }); return; }

      if (action === 'approve-claim') {
        const oldId = claimReq.profile_id;
        const newId = claimReq.claimer_uid;

        const unc = await sql`
          SELECT username, bio, registration_status, sebi_approval_status
          FROM user_profiles WHERE id = ${oldId} LIMIT 1
        `;
        if (!unc[0]) { res.status(404).json({ error: 'Unclaimed profile not found' }); return; }
        const u = unc[0];

        await sql`UPDATE ic_recommendations SET recommender_id = ${newId} WHERE recommender_id = ${oldId}`;
        await sql`UPDATE connections SET requester_id = ${newId} WHERE requester_id = ${oldId}`;
        await sql`UPDATE connections SET addressee_id = ${newId} WHERE addressee_id = ${oldId}`;
        await sql`UPDATE group_members SET user_id = ${newId} WHERE user_id = ${oldId}`;
        await sql`UPDATE notifications SET user_id = ${newId} WHERE user_id = ${oldId}`;
        await sql`UPDATE notifications SET from_user_id = ${newId} WHERE from_user_id = ${oldId}`;
        await sql`UPDATE portfolio_holdings SET owner_id = ${newId} WHERE owner_id = ${oldId}`;

        // Step A: free the username on the unclaimed row first (UNIQUE index).
        await sql`
          UPDATE user_profiles SET
            username = NULL, claim_status = 'claimed', is_unclaimed = FALSE, claim_token = NULL
          WHERE id = ${oldId}
        `;

        // Step B: transfer username + copy profile details to the creator's real account.
        await sql`
          UPDATE user_profiles SET
            username = COALESCE(user_profiles.username, ${u.username}),
            bio = COALESCE(NULLIF(user_profiles.bio, ''), ${u.bio || null}),
            registration_status = CASE WHEN user_profiles.registration_status IS NULL
                                       OR user_profiles.registration_status = 'self_directed'
                                  THEN ${u.registration_status || 'self_directed'}
                                  ELSE user_profiles.registration_status END,
            sebi_approval_status = CASE WHEN user_profiles.sebi_approval_status IS NULL
                                        OR user_profiles.sebi_approval_status = 'not_applied'
                                   THEN ${u.sebi_approval_status || 'not_applied'}
                                   ELSE user_profiles.sebi_approval_status END
          WHERE id = ${newId}
        `;

        await sql`
          UPDATE claim_requests SET status = 'approved', reviewed_at = NOW(), reviewed_by = ${adminUid}, admin_note = ${reviewNote}
          WHERE id = ${requestId}
        `;

        res.status(200).json({
          success: true,
          claimerEmail: claimReq.claimer_email,
          claimerFullName: claimReq.claimer_full_name,
          profileUsername: claimReq.profile_username,
        });
        return;
      }

      // reject-claim: reset + regenerate token so admin can re-share a fresh link.
      const newToken = randomUUID().replace(/-/g, '');
      await sql`
        UPDATE user_profiles SET
          claim_status = 'unclaimed', claimed_by_uid = NULL, claimed_at = NULL, claim_token = ${newToken}
        WHERE id = ${claimReq.profile_id}
      `;
      await sql`
        UPDATE claim_requests SET status = 'rejected', reviewed_at = NOW(), reviewed_by = ${adminUid}, admin_note = ${reviewNote}
        WHERE id = ${requestId}
      `;
      res.status(200).json({
        success: true,
        claimerEmail: claimReq.claimer_email,
        claimerFullName: claimReq.claimer_full_name,
      });
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[claim-profile] error:', e?.message);
    res.status(500).json({ error: 'Database error' });
  }
}
