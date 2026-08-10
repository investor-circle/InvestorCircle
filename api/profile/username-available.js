/**
 * api/profile/username-available.js — Vercel serverless function (Node)
 *
 * Phase 2e of the server-side DB access migration (see CLAUDE.md "Security
 * rules" and api/profile/me.js). Checks whether a username is free, replacing
 * the direct-Neon SELECT previously run from LoginPage.jsx's live-typing
 * availability check.
 *
 * Deliberately UNAUTHENTICATED: this check runs while a visitor is choosing a
 * username on the signup form, before any Firebase account (and therefore any
 * ID token) exists — there is no login to verify yet. It returns only a
 * boolean availability flag, no other user_profiles data, mirroring exactly
 * what the previous direct-to-Neon query exposed (username -> exists/not).
 *
 * GET /api/profile/username-available?username=<username>
 *
 * Responses:
 *   200 { available: true|false }
 *   400 missing/invalid username (same regex as LoginPage.jsx: ^[a-z0-9_]{5,20}$)
 *   405 method not GET/OPTIONS
 *   500 server/config/DB error
 *
 * Env vars required (Vercel dashboard — server-side only), same as
 * api/profile/me.js:
 *   DATABASE_URL
 */

import { neon } from '@neondatabase/serverless';

const { DATABASE_URL } = process.env;

const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

const USERNAME_RE = /^[a-z0-9_]{5,20}$/;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const username = String(req.query?.username || '');
  if (!USERNAME_RE.test(username)) {
    res.status(400).json({ error: 'Invalid username' });
    return;
  }

  if (!sql) {
    console.error('[profile/username-available] DATABASE_URL not configured');
    res.status(500).json({ error: 'Database not configured' });
    return;
  }

  try {
    const rows = await sql`SELECT id FROM user_profiles WHERE username = ${username} LIMIT 1`;
    res.status(200).json({ available: rows.length === 0 });
  } catch (e) {
    console.error('[profile/username-available] DB query failed:', e?.message);
    res.status(500).json({ error: 'Database error' });
    return;
  }
}
