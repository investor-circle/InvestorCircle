/**
 * api/_lib/handlers/admin-sebi.js — admin-sebi resource handler
 *
 * Dispatched by api/data.js (resource=admin-sebi). Admin authorization is
 * enforced by api/data.js (requireAdmin) BEFORE this handler ever runs — the
 * caller's identity is derived from their verified Firebase ID token, then
 * their user_profiles.is_admin flag is looked up server-side (never trusted
 * from the client); non-admins never reach this code.
 *
 * This endpoint legitimately returns sebi_* fields (registration number,
 * validity, firm name) to admins reviewing verification requests — that is
 * an approved exception per CLAUDE.md. It never returns claim_token or any
 * other unrelated sensitive column, and never exposes sebi_* data to
 * non-admin callers (enforced upstream).
 *
 * GET ?resource=admin-sebi
 *   -> 200 { pending: [...], approved: [...], verifyMessage, regOptions: [...] }
 *
 * POST ?resource=admin-sebi
 *   Body: { action, ... }
 *     approve:        { userId }
 *     reject:          { userId }
 *     save-message:    { message }
 *     save-reg-options:{ options: [{ id, label, description, is_active, sort_order }] }
 */

import { sql, parseBody } from '../auth.js';

export default async function handleAdminSebi(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const [pending, approved, msg, opts] = await Promise.all([
        sql`SELECT id, full_name, first_name, last_name, email, registration_status,
                   sebi_reg_number, sebi_reg_valid_till, sebi_firm_name, sebi_submitted_at
            FROM user_profiles WHERE sebi_approval_status = 'pending' ORDER BY sebi_submitted_at`,
        sql`SELECT id, full_name, first_name, last_name, email, registration_status,
                   sebi_reg_number, sebi_reg_valid_till, sebi_firm_name, sebi_approved_at
            FROM user_profiles WHERE sebi_approval_status = 'approved' ORDER BY sebi_approved_at DESC`,
        sql`SELECT value FROM app_settings WHERE key = 'sebi_verification_message' LIMIT 1`,
        sql`SELECT id, code, label, description, is_active, sort_order FROM registration_status_options ORDER BY sort_order`,
      ]);
      res.status(200).json({
        pending, approved,
        verifyMessage: msg[0]?.value || '',
        regOptions: opts,
      });
      return;
    }

    const body = parseBody(req);
    const action = String(body.action || '');

    if (action === 'approve' || action === 'reject') {
      const userId = String(body.userId || '');
      if (!userId) { res.status(400).json({ error: 'userId is required' }); return; }
      if (action === 'approve') {
        await sql`UPDATE user_profiles SET sebi_approval_status='approved', sebi_approved_at=now() WHERE id=${userId}`;
      } else {
        await sql`UPDATE user_profiles SET sebi_approval_status='rejected', sebi_approved_at=null WHERE id=${userId}`;
      }
      res.status(200).json({ success: true });
      return;
    }

    if (action === 'save-message') {
      const message = String(body.message || '');
      await sql`
        INSERT INTO app_settings(key,value) VALUES('sebi_verification_message',${message})
        ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()
      `;
      res.status(200).json({ success: true });
      return;
    }

    if (action === 'save-reg-options') {
      const options = Array.isArray(body.options) ? body.options : [];
      for (const o of options) {
        if (!o || !o.id) continue;
        await sql`
          UPDATE registration_status_options
          SET label = ${String(o.label || '')},
              description = ${String(o.description || '')},
              is_active = ${!!o.is_active},
              sort_order = ${Number(o.sort_order) || 0}
          WHERE id = ${o.id}
        `;
      }
      res.status(200).json({ success: true });
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[admin-sebi] error:', e?.message);
    res.status(500).json({ error: 'Database error' });
  }
}
