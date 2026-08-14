/**
 * api/sharing-prefs.js — Vercel serverless function (Node)
 *
 * Phase 3 of the server-side DB access migration. Replaces the direct-Neon
 * queries previously run from src/db.js (getSharingPrefs, upsertSharingPref).
 *
 * GET  /api/sharing-prefs
 *   Authorization: Bearer <Firebase ID token>
 *   -> 200 { prefs: { [targetId]: { visibility, level, selected } } }
 *
 * POST /api/sharing-prefs
 *   Authorization: Bearer <Firebase ID token>
 *   Body: { targetId, targetType, prefs: { visibility, level, selected? } }
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
        SELECT target_id, visibility, level, selected_holding_ids
        FROM sharing_preferences WHERE user_id = ${userId}
      `;
      const prefs = rows.reduce((acc, r) => {
        acc[r.target_id] = { visibility: r.visibility, level: r.level, selected: r.selected_holding_ids || [] };
        return acc;
      }, {});
      res.status(200).json({ prefs });
      return;
    }

    const body = parseBody(req);
    const targetId = String(body.targetId || '');
    const targetType = String(body.targetType || '');
    const prefs = body.prefs || {};
    const ALLOWED_TARGET_TYPES = ['user', 'group'];
    const ALLOWED_VISIBILITY = ['public', 'private', 'custom', 'none'];
    if (!targetId || !ALLOWED_TARGET_TYPES.includes(targetType)) {
      res.status(400).json({ error: 'targetId and a valid targetType are required' });
      return;
    }
    if (prefs.visibility !== undefined && !ALLOWED_VISIBILITY.includes(prefs.visibility)) {
      res.status(400).json({ error: 'invalid visibility' });
      return;
    }
    await sql`
      INSERT INTO sharing_preferences
        (user_id, target_id, target_type, visibility, level, selected_holding_ids)
      VALUES
        (${userId}, ${targetId}, ${targetType}, ${prefs.visibility}, ${prefs.level}, ${prefs.selected || []})
      ON CONFLICT (user_id, target_id) DO UPDATE SET
        visibility           = EXCLUDED.visibility,
        level                = EXCLUDED.level,
        selected_holding_ids = EXCLUDED.selected_holding_ids,
        updated_at           = now()
    `;
    res.status(200).json({ success: true });
  } catch (e) {
    console.error('[sharing-prefs] error:', e?.message);
    res.status(500).json({ error: 'Database error' });
  }
}
