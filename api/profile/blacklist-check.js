/**
 * api/profile/blacklist-check.js — Vercel serverless function (Node)
 *
 * Phase 2b of the server-side DB access migration (see CLAUDE.md "Security
 * rules" and api/profile/me.js). Tells the caller whether their own uid is
 * present in `deleted_users` (hard-deleted accounts are blocked from logging
 * back in), read server-side from Neon instead of the browser querying
 * directly with VITE_DATABASE_URL.
 *
 * GET /api/profile/blacklist-check
 *   Authorization: Bearer <Firebase ID token>
 *
 * Responses:
 *   200 { blocked: true|false }
 *   401 missing/malformed/invalid/expired token
 *   405 method not GET/OPTIONS
 *   500 server/config error
 *
 * Matches the original client-side behaviour in AuthContext.jsx: any DB
 * error (e.g. the deleted_users table not existing yet) is treated as
 * "not blocked" rather than surfaced as an error, so a transient DB issue
 * never itself locks a user out of signing in.
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
    console.error('[profile/blacklist-check] Firebase Admin init failed:', e?.message);
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
    console.error('[profile/blacklist-check] DATABASE_URL not configured');
    res.status(200).json({ blocked: false });
    return;
  }

  try {
    const rows = await sql`SELECT id FROM deleted_users WHERE id = ${uid} LIMIT 1`;
    res.status(200).json({ blocked: rows.length > 0 });
  } catch (e) {
    // deleted_users table may not exist yet — fail open, matching the
    // existing client-side behaviour.
    console.warn('[profile/blacklist-check] query failed, failing open:', e?.message);
    res.status(200).json({ blocked: false });
  }
}
