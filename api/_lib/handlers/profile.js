/**
 * api/_lib/handlers/profile.js — profile resource handler
 *
 * Dispatched by api/data.js (resource=profile, auth:'user' — the caller's
 * uid is already verified by api/data.js's own requireUid() before this
 * handler runs).
 *
 * Consolidates what used to be two standalone Vercel functions
 * (api/profile/me.js, api/profile/blacklist-check.js) that each
 * independently re-initialized Firebase Admin and opened their own Neon
 * connection — on the hot path of EVERY app load, since
 * src/AuthContext.jsx's onAuthStateChanged calls both in parallel on every
 * sign-in/session restore. Folding them in here means they share this
 * dispatcher's already-warm Firebase Admin instance and sql connection
 * (api/_lib/auth.js) instead of each paying their own cold-start cost, and
 * removes a redundant second token verification (api/data.js's requireUid
 * already did it once) — this was the concrete cause of a slow/stuck
 * sign-in spinner reported in production.
 *
 * The original api/profile/me.js and api/profile/blacklist-check.js are
 * deliberately left in place, unchanged: the mobile app (mobile/src/context/
 * AuthContext.js) still calls them directly, and there's no reason to force
 * a mobile release just to land this. Only src/AuthContext.jsx (web) has
 * been repointed at the actions below.
 *
 * GET ?resource=profile&action=me
 *   -> 200 { profile: {...} } | 404 { error: 'Profile not found' }
 * GET ?resource=profile&action=blacklist-check
 *   -> 200 { blocked: true|false }  (fails open on any DB error — a
 *      transient issue must never itself lock someone out of signing in)
 */
import { sql } from '../auth.js';

export default async function handleProfile(req, res, uid) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const action = String(req.query?.action || '');

  if (action === 'me') {
    if (!sql) { res.status(500).json({ error: 'Database not configured' }); return; }
    let rows;
    try {
      rows = await sql`
        SELECT id, email, full_name, first_name, last_name, username, is_admin,
               avatar_url, avatar_color, onboarding_cv_done, onboarding_discover_done,
               consent_terms_accepted, consent_data_accepted,
               bio, twitter_url, linkedin_url, telegram_url, instagram_url,
               registration_status, sebi_reg_number, sebi_reg_valid_till,
               sebi_firm_name, sebi_approval_status
        FROM user_profiles
        WHERE id = ${uid}
        LIMIT 1
      `;
    } catch (e) {
      console.error('[profile] me query failed:', e?.message);
      res.status(500).json({ error: 'Database error' });
      return;
    }
    if (!rows.length) { res.status(404).json({ error: 'Profile not found' }); return; }
    res.status(200).json({ profile: rows[0] });
    return;
  }

  if (action === 'blacklist-check') {
    if (!sql) { res.status(200).json({ blocked: false }); return; }
    try {
      const rows = await sql`SELECT id FROM deleted_users WHERE id = ${uid} LIMIT 1`;
      res.status(200).json({ blocked: rows.length > 0 });
    } catch (e) {
      // deleted_users table may not exist yet — fail open, matching the
      // original standalone endpoint's behaviour.
      console.warn('[profile] blacklist-check query failed, failing open:', e?.message);
      res.status(200).json({ blocked: false });
    }
    return;
  }

  res.status(400).json({ error: 'Unknown or missing action' });
}
