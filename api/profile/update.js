/**
 * api/profile/update.js — Vercel serverless function (Node)
 *
 * Phase 2d of the server-side DB access migration (see CLAUDE.md "Security
 * rules" and api/profile/me.js). Updates the caller's own first/last name in
 * user_profiles, replacing the direct-Neon UPDATE previously run from
 * AuthContext.jsx's updateProfile().
 *
 * POST /api/profile/update
 *   Authorization: Bearer <Firebase ID token>
 *   Body: { firstName: string, lastName?: string }
 *
 * Responses:
 *   200 { profile: {...} }
 *   400 missing/invalid firstName
 *   401 missing/malformed/invalid/expired token
 *   405 method not POST/OPTIONS
 *   500 server/config/DB error
 *
 * UID is derived only from the verified token — a caller can only ever
 * update their own row (WHERE id = <token uid>).
 *
 * Env vars required (Vercel dashboard — server-side only), same as
 * api/profile/me.js:
 *   FIREBASE_SERVICE_ACCOUNT_JSON
 *   DATABASE_URL
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

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
    console.error('[profile/update] Firebase Admin init failed:', e?.message);
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

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const firstNameRaw = (body && body.firstName) || '';
  const lastNameRaw = (body && body.lastName) || '';

  // Same validation as the previous client-side updateProfile().
  const fn = String(firstNameRaw).trim();
  const ln = String(lastNameRaw).trim();
  if (!fn) {
    res.status(400).json({ error: 'First name is required' });
    return;
  }
  const fullName = `${fn} ${ln}`.trim();

  if (!sql) {
    console.error('[profile/update] DATABASE_URL not configured');
    res.status(500).json({ error: 'Database not configured' });
    return;
  }

  let rows;
  try {
    rows = await sql`
      UPDATE user_profiles
      SET first_name = ${fn}, last_name = ${ln}, full_name = ${fullName}, updated_at = now()
      WHERE id = ${uid}
      RETURNING id, email, full_name, first_name, last_name, username, is_admin
    `;
  } catch (e) {
    console.error('[profile/update] DB query failed:', e?.message);
    res.status(500).json({ error: 'Database error' });
    return;
  }

  res.status(200).json({ profile: rows[0] ?? null });
}
