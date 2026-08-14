/**
 * api/data.js — Vercel serverless function (Node)
 *
 * Single consolidated Phase 3 entry point for connections, groups,
 * recommendations, notifications, sharing-prefs, public-profile and the
 * admin SEBI screen (?resource=...).
 *
 * Vercel's Hobby plan caps a deployment at 12 Serverless Functions. Before
 * this consolidation, Phase 3 shipped 7 new top-level api/*.js routes on top
 * of the 11 already deployed (push, reset, cas, email, price, profile/*),
 * totaling 18 functions and failing deployment. Routing all seven Phase 3
 * domains through this one function (with per-domain logic kept in
 * api/_lib/handlers/*.js, which — like all of api/_lib/ — is excluded from
 * Vercel's file-system routing and does not count as a function) keeps the
 * total at 12.
 *
 * GET/POST /api/data?resource=connections|groups|recommendations|
 *                              notifications|sharing-prefs|public-profile|
 *                              admin-sebi
 *
 * Auth model per resource:
 *   - connections, groups, recommendations, notifications, sharing-prefs:
 *     Bearer Firebase ID token required; identity (uid) is derived from the
 *     verified token and passed to the handler — never trusted from the
 *     request body/query.
 *   - public-profile: intentionally unauthenticated (public profile pages
 *     are viewable by anyone, same as before this migration).
 *   - admin-sebi: Bearer Firebase ID token required AND the verified uid
 *     must have user_profiles.is_admin = true (checked server-side here,
 *     before the handler runs) — non-admins get 403.
 *
 * See api/_lib/auth.js and api/profile/me.js for the token-verification
 * boilerplate this reuses, and the individual files under
 * api/_lib/handlers/ for each resource's request validation, SQL, and
 * response shape (all use explicit column lists — never SELECT-star or
 * RETURNING-star).
 */

import { setCors, requireUid, requireAdmin, sendAuthError } from './_lib/auth.js';
import handleConnections from './_lib/handlers/connections.js';
import handleGroups from './_lib/handlers/groups.js';
import handleRecommendations from './_lib/handlers/recommendations.js';
import handleNotifications from './_lib/handlers/notifications.js';
import handleSharingPrefs from './_lib/handlers/sharing-prefs.js';
import handlePublicProfile from './_lib/handlers/public-profile.js';
import handleAdminSebi from './_lib/handlers/admin-sebi.js';

const RESOURCES = {
  'connections':      { handler: handleConnections,     auth: 'user'  },
  'groups':           { handler: handleGroups,           auth: 'user'  },
  'recommendations':  { handler: handleRecommendations,  auth: 'user'  },
  'notifications':    { handler: handleNotifications,    auth: 'user'  },
  'sharing-prefs':    { handler: handleSharingPrefs,     auth: 'user'  },
  'public-profile':   { handler: handlePublicProfile,    auth: 'none'  },
  'admin-sebi':       { handler: handleAdminSebi,        auth: 'admin' },
};

export default async function handler(req, res) {
  setCors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const resource = String(req.query?.resource || '');
  const entry = RESOURCES[resource];
  if (!entry) { res.status(400).json({ error: 'Unknown or missing resource' }); return; }

  let uid = null;
  if (entry.auth === 'user') {
    try { uid = await requireUid(req); } catch (e) { sendAuthError(res, e); return; }
  } else if (entry.auth === 'admin') {
    try { uid = await requireAdmin(req); } catch (e) { sendAuthError(res, e); return; }
  }

  await entry.handler(req, res, uid);
}
