/**
 * api/_lib/auth.js — shared Firebase Admin + CORS helpers for Phase 3 API
 * endpoints (see CLAUDE.md "Security rules" and api/profile/me.js, the
 * original Phase 1 template this boilerplate is copied from).
 *
 * Not itself a route: files under api/_lib/ are not treated as Vercel
 * serverless functions (no default export matching the api/ convention is
 * required, and the directory is excluded from file-system routing).
 *
 * Env vars required (Vercel dashboard — server-side only):
 *   FIREBASE_SERVICE_ACCOUNT_JSON — same var used by api/reset.py / api/profile/*.js
 *   DATABASE_URL                  — Neon connection string (server-only; never
 *                                   VITE_DATABASE_URL)
 */

import { neon } from '@neondatabase/serverless';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const { DATABASE_URL, FIREBASE_SERVICE_ACCOUNT_JSON } = process.env;

export const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

function getFirebaseApp() {
  if (getApps().length) return getApp();
  if (!FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON env var is not set');
  }
  const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
  return initializeApp({ credential: cert(serviceAccount) });
}

/** Set the standard CORS headers used across api/profile/*.js. */
export function setCors(res, methods = 'GET, POST, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * Verify the Bearer Firebase ID token on `req` and return the verified UID.
 * Throws { status, error } shaped errors — callers should catch and respond
 * with those exact status/error fields (never leak the underlying message).
 */
export async function requireUid(req) {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/);
  if (!match) {
    throw { status: 401, error: 'Missing or malformed Authorization header' };
  }
  let firebaseApp;
  try {
    firebaseApp = getFirebaseApp();
  } catch (e) {
    console.error('[auth] Firebase Admin init failed:', e?.message);
    throw { status: 500, error: 'Server configuration error' };
  }
  try {
    const decoded = await getAuth(firebaseApp).verifyIdToken(match[1]);
    return decoded.uid;
  } catch (e) {
    throw { status: 401, error: 'Invalid or expired token' };
  }
}

/**
 * Best-effort identity check for endpoints that behave differently for a
 * logged-in caller but must still work for anonymous visitors (e.g. a
 * public Circle page opened from a shared/invite link). Returns the
 * verified uid if a valid Bearer token is present, or null otherwise —
 * never throws. Never used to gate a privileged action; only to decide
 * what to show to a caller who may or may not be authenticated.
 */
export async function optionalUid(req) {
  const authHeader = req.headers.authorization || '';
  if (!/^Bearer\s+.+/.test(authHeader)) return null;
  try { return await requireUid(req); } catch { return null; }
}

/**
 * Verify the caller and require them to be an admin (server-side
 * user_profiles.is_admin lookup — never trust a client-supplied flag).
 * Returns the verified uid. Throws 401 (bad/missing token) or 403 (not admin).
 */
export async function requireAdmin(req) {
  const uid = await requireUid(req);
  if (!sql) throw { status: 500, error: 'Database not configured' };
  let rows;
  try {
    rows = await sql`SELECT is_admin FROM user_profiles WHERE id = ${uid} LIMIT 1`;
  } catch (e) {
    console.error('[auth] admin lookup failed:', e?.message);
    throw { status: 500, error: 'Database error' };
  }
  if (!rows[0]?.is_admin) {
    throw { status: 403, error: 'Admin access required' };
  }
  return uid;
}

/** Parse a JSON body that may arrive as a raw string (mirrors profile/*.js). */
export function parseBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  return body || {};
}

/** Standard error responder for the {status, error} shape thrown above. */
export function sendAuthError(res, e) {
  if (e && typeof e.status === 'number' && typeof e.error === 'string') {
    res.status(e.status).json({ error: e.error });
    return;
  }
  console.error('[auth] unexpected error:', e?.message || e);
  res.status(500).json({ error: 'Server error' });
}
