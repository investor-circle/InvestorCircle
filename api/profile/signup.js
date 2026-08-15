/**
 * api/profile/signup.js — Vercel serverless function (Node)
 *
 * Phase 2e of the server-side DB access migration (see CLAUDE.md "Security
 * rules" and api/profile/me.js). Writes the caller's chosen first/last name
 * and username to their own user_profiles row right after Firebase account
 * creation, replacing the direct-Neon INSERT previously run from
 * LoginPage.jsx's handleSignup().
 *
 * POST /api/profile/signup
 *   Authorization: Bearer <Firebase ID token> (the token for the account
 *   just created by createUserWithEmailAndPassword — already authenticated
 *   at this point in the signup flow)
 *   Body: { firstName: string, lastName?: string, username?: string }
 *   (Phase 5.5: username is no longer collected at signup — it's chosen
 *   later during onboarding via lookups.js action=username-save. Still
 *   accepted here, validated/uniqueness-enforced, for any caller that does
 *   pass one.)
 *
 * Responses:
 *   200 { profile: {...} }
 *   400 missing firstName, or username present but fails ^[a-z0-9_]{5,20}$
 *   401 missing/malformed/invalid/expired token
 *   405 method not POST/OPTIONS
 *   409 username already taken
 *   500 server/config/DB error
 *
 * uid and email are derived ONLY from the verified token — never from client
 * input. is_admin is always false here, matching the previous client-side
 * behaviour (signup never creates an admin account).
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

const USERNAME_RE = /^[a-z0-9_]{5,20}$/;

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
    console.error('[profile/signup] Firebase Admin init failed:', e?.message);
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  // uid and email are derived ONLY from the verified token — never from
  // client input.
  let uid, email;
  try {
    const decoded = await getAuth(firebaseApp).verifyIdToken(idToken);
    uid = decoded.uid;
    email = decoded.email;
  } catch (e) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  if (!email) {
    res.status(401).json({ error: 'Token has no verified email' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const firstName = String((body && body.firstName) || '').trim();
  const lastName = String((body && body.lastName) || '').trim();
  // Phase 5.5: username is no longer required at signup — it's chosen later
  // during progressive onboarding (see api/_lib/handlers/lookups.js
  // action=username-save). Still validated/uniqueness-enforced when present,
  // for any caller that does pass one.
  const usernameRaw = String((body && body.username) || '').trim();
  const username = usernameRaw || null;

  if (!firstName) {
    res.status(400).json({ error: 'First name is required' });
    return;
  }
  if (username && !USERNAME_RE.test(username)) {
    res.status(400).json({ error: 'Invalid username' });
    return;
  }
  const fullName = `${firstName} ${lastName}`.trim();

  if (!sql) {
    console.error('[profile/signup] DATABASE_URL not configured');
    res.status(500).json({ error: 'Database not configured' });
    return;
  }

  let rows;
  try {
    rows = await sql`
      INSERT INTO user_profiles
        (id, email, full_name, first_name, last_name, is_admin, username,
         onboarding_cv_done, onboarding_discover_done)
      VALUES
        (${uid}, ${email}, ${fullName}, ${firstName}, ${lastName}, false, ${username},
         false, false)
      ON CONFLICT (id) DO UPDATE SET
        first_name = EXCLUDED.first_name,
        last_name  = EXCLUDED.last_name,
        full_name  = EXCLUDED.full_name,
        username   = COALESCE(EXCLUDED.username, user_profiles.username),
        updated_at = now()
      RETURNING id, email, full_name, first_name, last_name, username, is_admin,
                avatar_url, avatar_color, onboarding_cv_done, onboarding_discover_done
    `;
  } catch (e) {
    // Unique-violation on the username column
    if (e?.code === '23505') {
      res.status(409).json({ error: 'Username already taken' });
      return;
    }
    console.error('[profile/signup] DB query failed:', e?.message);
    res.status(500).json({ error: 'Database error' });
    return;
  }

  res.status(200).json({ profile: rows[0] });
}
