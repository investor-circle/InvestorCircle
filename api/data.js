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
import { withTiming, serverTimingHeader } from './_lib/timing.js';
import handleConnections from './_lib/handlers/connections.js';
import handleGroups from './_lib/handlers/groups.js';
import handleRecommendations from './_lib/handlers/recommendations.js';
import handleNotifications from './_lib/handlers/notifications.js';
import handleSharingPrefs from './_lib/handlers/sharing-prefs.js';
import handlePublicProfile from './_lib/handlers/public-profile.js';
import handlePublicIdeas from './_lib/handlers/public-ideas.js';
import handleAdminSebi from './_lib/handlers/admin-sebi.js';
import handleEngagement from './_lib/handlers/engagement.js';
import handleClaimProfile from './_lib/handlers/claim-profile.js';
import handleAdminConfig from './_lib/handlers/admin-config.js';
import handleLookups from './_lib/handlers/lookups.js';
import handleTracking from './_lib/handlers/tracking.js';
import handlePricing from './_lib/handlers/pricing.js';
import handleSeo from './_lib/seo.js';
import handleSitemap from './_lib/sitemap.js';
import handleSession from './_lib/handlers/session.js';

const RESOURCES = {
  'connections':      { handler: handleConnections,     auth: 'user'  },
  // groups (Circles) bundles mixed auth needs: viewing a public Circle by
  // slug, or the public/member-visible Circles on an investor's profile,
  // must work for logged-out visitors (e.g. a WhatsApp invite-link open),
  // while every write and the "my circles" list require a verified user.
  // handleGroups performs its own per-action requireUid()/optionalUid()
  // check — see api/_lib/handlers/groups.js.
  'groups':           { handler: handleGroups,           auth: 'none'  },
  'recommendations':  { handler: handleRecommendations,  auth: 'user'  },
  'notifications':    { handler: handleNotifications,    auth: 'user'  },
  'sharing-prefs':    { handler: handleSharingPrefs,     auth: 'user'  },
  'public-profile':   { handler: handlePublicProfile,    auth: 'none'  },
  // public-ideas backs the pages search engines and link-preview crawlers
  // read (/stock/:symbol, /idea/:id, /search), so it is unauthenticated by
  // design. Every one of its statements filters is_public = true, and its
  // test fails if one stops — see api/_lib/handlers/public-ideas.js.
  'public-ideas':     { handler: handlePublicIdeas,      auth: 'none'  },
  'admin-sebi':       { handler: handleAdminSebi,        auth: 'admin' },
  'engagement':       { handler: handleEngagement,       auth: 'user'  },
  'tracking':         { handler: handleTracking,         auth: 'user'  },
  // claim-profile and lookups bundle mixed auth needs (public/user/admin
  // actions in one resource) — each handler performs its own per-action
  // requireUid()/requireAdmin() check, so they're registered as 'none' here.
  'claim-profile':    { handler: handleClaimProfile,     auth: 'none'  },
  'admin-config':     { handler: handleAdminConfig,      auth: 'admin' },
  'lookups':          { handler: handleLookups,          auth: 'none'  },
  // pricing (Phase 9 instrument daily-price layer) is now READ-ONLY: its one
  // action, `daily`, is a normal authenticated user read and calls
  // requireUid() itself, which is why it stays registered as 'none' here.
  // (The former `collect` write action and its Vercel Cron were retired —
  // scripts/stamp-prices.js is the sole price writer.) See
  // api/_lib/handlers/pricing.js.
  'pricing':          { handler: handlePricing,          auth: 'none'  },
  // seo/sitemap serve the server-rendered public pages (/stock/:symbol,
  // /sitemap.xml — see vercel.json's rewrites) and, like everything else
  // here, are unauthenticated by design. Moved into this dispatcher (from
  // being their own top-level api/*.js routes) specifically to stay under
  // Vercel's Hobby-plan cap of 12 Serverless Functions — see api/_lib/seo.js.
  'seo':              { handler: handleSeo,              auth: 'none'  },
  'sitemap':          { handler: handleSitemap,           auth: 'none'  },
  // Mints/clears the routing-token cookie middleware.js checks at the edge
  // to decide whether /security/:symbol and /idea/:id go to the main app
  // or to web-public. Registered 'none' because `clear` must work even with
  // an already-invalid token; `mint` does its own optionalUid check — see
  // api/_lib/handlers/session.js. This cookie is never itself an auth
  // mechanism: requireUid/requireAdmin above never accept it.
  'session':          { handler: handleSession,           auth: 'none'  },
};

export default async function handler(req, res) {
  // Every request runs inside a timing context so the response can report
  // where its milliseconds went — see api/_lib/timing.js for why guessing
  // between the four possible causes was not good enough.
  return withTiming(async () => {
    setCors(res, 'GET, POST, OPTIONS');
    // Server-Timing is not a CORS-safelisted response header, so without
    // this the browser (and the app's fetch) can see the header exists but
    // not read it.
    res.setHeader('Access-Control-Expose-Headers', 'Server-Timing');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }

    // Handlers write their own responses, so the header has to be attached
    // on the way out rather than after the fact. Patching the two methods
    // they use keeps that in one place instead of touching every handler.
    for (const method of ['json', 'end']) {
      const original = res[method].bind(res);
      res[method] = (...args) => {
        try {
          if (!res.headersSent) {
            const value = serverTimingHeader();
            if (value) res.setHeader('Server-Timing', value);
          }
        } catch (_) {
          // Diagnostics must never be the reason a response fails to send.
        }
        return original(...args);
      };
    }

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
  });
}
