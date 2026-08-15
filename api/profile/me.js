/**
 * api/profile/me.js — Vercel serverless function (Node)
 *
 * Phase 1 of the server-side DB access migration (see CLAUDE.md "Security rules").
 * Returns the authenticated caller's own user_profiles row, read server-side
 * from Neon instead of the privileged VITE_DATABASE_URL used by the browser
 * today. This endpoint is additive only — it is not yet called from the app.
 *
 * GET /api/profile/me
 *   Authorization: Bearer <Firebase ID token>
 *
 * Responses:
 *   200 { profile: {...} }
 *   401 missing/malformed/invalid/expired token
 *   404 token valid, no matching user_profiles row
 *   405 method not GET/OPTIONS
 *   500 server/config/DB error
 *
 * Env vars required (Vercel dashboard — server-side only):
 *   FIREBASE_SERVICE_ACCOUNT_JSON  — full JSON of a Firebase service account key
 *                                    (same var already used by api/reset.py)
 *   DATABASE_URL                   — Neon connection string (same var already
 *                                    used by api/push.js). Temporary: Phase 1
 *                                    uses the existing privileged credential;
 *                                    a scoped read-only role is a separate,
 *                                    later provisioning step.
 */

import { neon } from '@neondatabase/serverless';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const { DATABASE_URL, FIREBASE_SERVICE_ACCOUNT_JSON } = process.env;

const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

// ── Firebase Admin: initialise once per cold start ────────────────────────────
function getFirebaseApp() {
  if (getApps().length) return getApp();
  if (!FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON env var is not set');
  }
  const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
  return initializeApp({ credential: cert(serviceAccount) });
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS — scoped to this endpoint only; Authorization is needed here but not
  // added to the repo-wide vercel.json CORS block for unrelated endpoints.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/);
  if (!match) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }
  const idToken = match[1];

  let firebaseApp;
  try {
    firebaseApp = getFirebaseApp();
  } catch (e) {
    console.error('[profile/me] Firebase Admin init failed:', e?.message);
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  // UID is derived ONLY from the verified token — never from client input.
  let uid;
  try {
    const decoded = await getAuth(firebaseApp).verifyIdToken(idToken);
    uid = decoded.uid;
  } catch (e) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  if (!sql) {
    console.error('[profile/me] DATABASE_URL not configured');
    res.status(500).json({ error: 'Database not configured' });
    return;
  }

  let rows;
  try {
    rows = await sql`
      SELECT id, email, full_name, first_name, last_name, username, is_admin,
             avatar_url, avatar_color, onboarding_cv_done, onboarding_discover_done
      FROM user_profiles
      WHERE id = ${uid}
      LIMIT 1
    `;
  } catch (e) {
    console.error('[profile/me] DB query failed:', e?.message);
    res.status(500).json({ error: 'Database error' });
    return;
  }

  if (!rows.length) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }

  res.status(200).json({ profile: rows[0] });
}
