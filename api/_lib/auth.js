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

import { addPhase, timePhase } from './timing.js';
import { neon } from '@neondatabase/serverless';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const { DATABASE_URL, FIREBASE_SERVICE_ACCOUNT_JSON } = process.env;

const rawSql = DATABASE_URL ? neon(DATABASE_URL) : null;

// Every handler in api/_lib/handlers/ calls `sql` as a tagged template — this
// wraps that tag once, here, so every query anywhere is timed under the 'db'
// phase without having to touch each of the ~150 call sites individually.
// Before this, only lookups.js's two queries (public-feed, feed-config)
// timed themselves manually, which made those two look like the only
// endpoints with real DB cost — they were just the only ones instrumented.
export const sql = rawSql
  ? (strings, ...values) => timePhase('db', () => rawSql(strings, ...values))
  : null;

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
  // Timed here rather than at the router because the handlers that matter
  // most for this measurement (lookups: public-feed, feed-config) are
  // registered as auth:'none' and call requireUid themselves — instrumenting
  // the router would have missed exactly the endpoints under investigation.
  // On a cold instance this includes fetching Google's signing certificates.
  const startedAt = Date.now();
  try {
    const decoded = await getAuth(firebaseApp).verifyIdToken(match[1]);
    return decoded.uid;
  } catch (e) {
    throw { status: 401, error: 'Invalid or expired token' };
  } finally {
    addPhase('auth', Date.now() - startedAt);
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

/**
 * Require that `uid` has completed the mandatory username + consent step
 * (see OnboardingGate / MandatorySetupGate, src/features/onboarding/
 * Onboarding.jsx) before allowing an action that creates a new
 * relationship on the caller's behalf (Track, Connect, Circle join/
 * subscribe). Takes an already-verified uid — callers get `uid` from
 * api/data.js's own requireUid() dispatch, so this only adds the
 * profile-completeness check, not a second token verification.
 *
 * Google sign-in creates a bare user_profiles row with these fields NULL
 * (see api/profile/sync.js vs. api/profile/signup.js's own INSERT) and
 * relies on the client-side gate to collect them right after — this is
 * the server-side backstop for a caller reaching the API directly instead
 * of through the gated UI (e.g. a shared idea link that lands a fresh
 * Google sign-in straight on a standalone page, bypassing the app shell
 * the gate is mounted in).
 *
 * Takes `sql` as a parameter rather than using this module's own — same
 * reason api/_lib/deliverPush.js does — so a handler's test can mock its
 * own imported `sql` and have this helper honor it too.
 *
 * Throws 403 if incomplete. Never used to block undoing an action
 * (untrack, reject, leave) — only ones that create new data tied to an
 * unonboarded account.
 */
export async function requireOnboarded(sql, uid) {
  if (!sql) throw { status: 500, error: 'Database not configured' };
  let rows;
  try {
    rows = await sql`
      SELECT username, consent_terms_accepted, consent_data_accepted
      FROM user_profiles WHERE id = ${uid} LIMIT 1
    `;
  } catch (e) {
    console.error('[auth] onboarding check failed:', e?.message);
    throw { status: 500, error: 'Database error' };
  }
  const row = rows[0];
  if (!row?.username || !row.consent_terms_accepted || !row.consent_data_accepted) {
    throw { status: 403, error: 'Please finish setting up your username and consent before doing this.' };
  }
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
