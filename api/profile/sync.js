/**
 * api/profile/sync.js — Vercel serverless function (Node)
 *
 * Phase 2c of the server-side DB access migration (see CLAUDE.md "Security
 * rules" and api/profile/me.js). Performs the same login-time
 * create-or-refresh of the caller's own user_profiles row that
 * AuthContext.jsx used to run directly against Neon with VITE_DATABASE_URL —
 * now done server-side with the caller's identity taken only from their
 * verified Firebase ID token.
 *
 * POST /api/profile/sync
 *   Authorization: Bearer <Firebase ID token>
 *   (no request body required — email/name are read from the verified token,
 *   never trusted from client input, so a caller cannot sync an is_admin
 *   flag or identity that isn't their own)
 *
 * Responses:
 *   200 { profile: {...} }
 *   401 missing/malformed/invalid/expired token
 *   405 method not POST/OPTIONS
 *   500 server/config/DB error
 *
 * Business logic (first_name/last_name "don't overwrite if already set",
 * is_admin membership list) is copied verbatim from the previous client-side
 * implementation in AuthContext.jsx — do not "improve" it here.
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

// Kept in sync with ADMIN_EMAILS in src/AuthContext.jsx. is_admin is always
// computed server-side from the verified token's email — never trusted from
// the client.
const ADMIN_EMAILS = ['ankur.citm@gmail.com'];

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
    console.error('[profile/sync] Firebase Admin init failed:', e?.message);
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  // Identity (uid, email, display name, avatar) is derived ONLY from the
  // verified token — never from client input. `picture` is populated by
  // Firebase for federated sign-ins (e.g. Google) — this is how a brand-new
  // Google sign-up gets its avatar without asking the user to upload one.
  let uid, email, displayName, picture;
  try {
    const decoded = await getAuth(firebaseApp).verifyIdToken(idToken);
    uid = decoded.uid;
    email = decoded.email;
    displayName = decoded.name;
    picture = decoded.picture || null;
  } catch (e) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  if (!email) {
    res.status(401).json({ error: 'Token has no verified email' });
    return;
  }

  if (!sql) {
    console.error('[profile/sync] DATABASE_URL not configured');
    res.status(500).json({ error: 'Database not configured' });
    return;
  }

  const isAdminEmail = ADMIN_EMAILS.includes(email.toLowerCase());
  const fullName = displayName || email.split('@')[0];
  const firstName = fullName.split(' ')[0];
  const lastName = fullName.split(' ').slice(1).join(' ') || '';

  let rows;
  try {
    rows = await sql`
      INSERT INTO user_profiles
        (id, email, full_name, is_admin, first_name, last_name, avatar_url,
         onboarding_cv_done, onboarding_discover_done)
      VALUES
        (${uid}, ${email}, ${fullName}, ${isAdminEmail}, ${firstName}, ${lastName}, ${picture},
         false, false)
      ON CONFLICT (id) DO UPDATE SET
        email      = EXCLUDED.email,
        first_name = CASE
                       WHEN user_profiles.first_name IS NULL OR user_profiles.first_name = ''
                       THEN EXCLUDED.first_name
                       ELSE user_profiles.first_name
                     END,
        last_name  = CASE
                       WHEN user_profiles.last_name IS NULL OR user_profiles.last_name = ''
                       THEN EXCLUDED.last_name
                       ELSE user_profiles.last_name
                     END,
        avatar_url = CASE
                       WHEN user_profiles.avatar_url IS NULL OR user_profiles.avatar_url = ''
                       THEN EXCLUDED.avatar_url
                       ELSE user_profiles.avatar_url
                     END,
        updated_at = now()
      RETURNING id, email, full_name, first_name, last_name, username, is_admin,
                avatar_url, avatar_color, onboarding_cv_done, onboarding_discover_done
    `;
  } catch (e) {
    console.error('[profile/sync] DB query failed:', e?.message);
    res.status(500).json({ error: 'Database error' });
    return;
  }

  res.status(200).json({ profile: rows[0] });
}
