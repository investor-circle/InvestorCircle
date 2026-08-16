/**
 * InvestorCircle — Database helpers (v2 shared data model)
 *
 * All functions here talk to the Neon tables defined in migration_v2.sql.
 * Each function is responsible for ONE logical operation: it writes the data
 * AND inserts any notifications that operation should generate.
 *
 * Phase 5: feature code should import from the feature-scoped barrels in
 * src/services/api/ (connectionsApi.js, recommendationsApi.js, etc.) instead
 * of importing this file directly — they re-export the relevant subset of
 * functions below, grouped the way the frontend actually consumes them.
 * This file remains the single implementation (still funnelled through
 * callApi()) so there is exactly one place that talks to the server API.
 *
 * Usage:
 *   import { sendConnectionRequest, getMyConnections } from "./services/api/connectionsApi";
 *
 * Every exported function:
 *   - Takes typed arguments (no raw SQL in components)
 *   - Returns a plain object the component can put straight into state
 *   - Throws on unexpected DB errors (catch in the component)
 */

import { auth } from "./firebase";

// ─────────────────────────────────────────────────────────────────────────────
// All application database access goes through these authenticated
// server-side API endpoints (see api/data.js and api/_lib/handlers/) — the
// browser never connects to Neon directly. An explicit 401/403 from the API
// is an authorization decision (never trust a client-supplied uid); an
// infrastructure failure (network error, 5xx, unreachable) degrades to a
// safe default (empty list/null) rather than any privileged fallback.
//
// API origin resolution:
//   1. VITE_CAS_API_URL, when explicitly set, always wins — this is how the
//      real production frontend (GitHub Pages, a static host with no
//      co-located backend) reaches the separate Vercel-hosted api/.
//   2. Otherwise, on any *.vercel.app deployment (a Vercel Preview or the
//      Vercel project's own domain), the api/ functions are served from the
//      SAME origin as the built frontend — use a same-origin relative path
//      so each Preview deployment talks to its own freshly-deployed backend
//      instead of a stale hardcoded production URL. Without this, a Preview
//      build of a branch that changes api/ (new columns, new actions, new
//      required fields) silently keeps calling old production endpoints —
//      new actions 400 as "Unknown action", new response fields are simply
//      absent, and any client code that reads them sees `undefined`.
//   3. Everywhere else (localhost dev without VITE_CAS_API_URL set), fall
//      back to the same fixed reference URL this always used.
function resolveApiOrigin() {
  if (import.meta.env.VITE_CAS_API_URL) return import.meta.env.VITE_CAS_API_URL;
  if (typeof window !== "undefined" && /(^|\.)vercel\.app$/.test(window.location.hostname)) return "";
  return "https://investor-circle.vercel.app";
}
export const API_ORIGIN = resolveApiOrigin();
export const API_BASE = API_ORIGIN + "/api";

export async function callApi(path, { method = "GET", body } = {}) {
  if (!auth.currentUser) return { ok: false, infra: true };
  try {
    const idToken = await auth.currentUser.getIdToken();
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${idToken}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: true, data };
    }
    if (res.status === 401 || res.status === 403) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, denied: true, status: res.status, data };
    }
    return { ok: false, infra: true, status: res.status };
  } catch (e) {
    return { ok: false, infra: true, error: e };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONNECTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load all connections for the current user (all statuses).
 * Returns an array ready to use as the `connections` React state.
 *
 * Each element:
 *   { connectionId, userId, name, email, status, direction }
 *   direction: 'sent' = I requested | 'received' = they requested
 */
export async function getMyConnections(myId) {
  const api = await callApi("/data?resource=connections");
  if (api.ok) return api.data.connections || [];
  if (api.denied) return [];
  return [];
}

/**
 * Send a connection request from myId to addresseeId.
 * Returns { connection } on success, { error } if one already exists.
 */
export async function sendConnectionRequest(myId, addresseeId) {
  const api = await callApi("/data?resource=connections", { method: "POST", body: { action: "send", addresseeId } });
  if (api.ok) return api.data;
  if (api.denied) return { error: "not_authorized" };
  throw new Error("Neon not configured");
}

/** Accept an incoming connection request. */
export async function acceptConnection(connectionId, myId) {
  const api = await callApi("/data?resource=connections", { method: "POST", body: { action: "accept", connectionId } });
  if (api.ok) return api.data.connection ? { connection: api.data.connection } : { error: "not_found" };
  if (api.denied) return { error: "not_authorized" };
  throw new Error("Neon not configured");
}

/** Reject an incoming connection request. */
export async function rejectConnection(connectionId, myId) {
  const api = await callApi("/data?resource=connections", { method: "POST", body: { action: "reject", connectionId } });
  if (api.ok) return api.data.connection ? { connection: api.data.connection } : { error: "not_found" };
  if (api.denied) return { error: "not_authorized" };
  throw new Error("Neon not configured");
}

/** Remove an accepted connection (unfriend). */
export async function removeConnection(connectionId, myId) {
  const api = await callApi("/data?resource=connections", { method: "POST", body: { action: "remove", connectionId } });
  if (api.ok) return { success: true };
  if (api.denied) return { error: "not_authorized" };
  throw new Error("Neon not configured");
}

// ─────────────────────────────────────────────────────────────────────────────
// TRACKING — one-way, no-approval "Track an investor" relationship.
// Distinct from `connections` (mutual, requires accept) and from the
// per-recommendation "track"/trackReco functions below (Phase 4 engagement —
// marking a specific recommendation as tracked/invested). This section is
// about tracking a *person's* ideas, i.e. the Follow replacement.
// ─────────────────────────────────────────────────────────────────────────────

/** Start tracking an investor/creator (no approval required). */
export async function trackInvestor(targetId) {
  const api = await callApi('/data?resource=tracking', { method: 'POST', body: { action: 'track', targetId } });
  return api.ok;
}

/** Stop tracking an investor/creator. */
export async function untrackInvestor(targetId) {
  const api = await callApi('/data?resource=tracking', { method: 'POST', body: { action: 'untrack', targetId } });
  return api.ok;
}

/** Whether the current user is tracking targetId. */
export async function getTrackingStatus(targetId) {
  const api = await callApi(`/data?resource=tracking&action=status&targetId=${encodeURIComponent(targetId)}`);
  return api.ok ? !!api.data.tracking : false;
}

/** List of investors the current user tracks (legacy, unpaginated — small use sites only). */
export async function getMyTracking() {
  const api = await callApi('/data?resource=tracking');
  return api.ok ? (api.data.tracking || []) : [];
}

/** Lightweight counts for the Network page tab badges — cheap indexed COUNTs, no list payload. */
export async function getTrackingCounts() {
  const api = await callApi('/data?resource=tracking&action=counts');
  return api.ok ? { trackersCount: api.data.trackersCount || 0, trackingCount: api.data.trackingCount || 0 } : { trackersCount: 0, trackingCount: 0 };
}

/** Paginated "Tracking me" list — people who track the current user. sort: 'date_desc'(default)|'date_asc'|'name_asc'|'name_desc'. */
export async function getMyTrackers(limit=20, offset=0, sort='date_desc') {
  const api = await callApi(`/data?resource=tracking&action=trackers&limit=${limit}&offset=${offset}&sort=${sort}`);
  return api.ok ? { people: api.data.people || [], hasMore: !!api.data.hasMore } : { people: [], hasMore: false };
}

/** Paginated "I'm tracking" list — people the current user tracks. sort: 'date_desc'(default)|'date_asc'|'name_asc'|'name_desc'. */
export async function getMyTrackingList(limit=20, offset=0, sort='date_desc') {
  const api = await callApi(`/data?resource=tracking&action=tracking-list&limit=${limit}&offset=${offset}&sort=${sort}`);
  return api.ok ? { people: api.data.people || [], hasMore: !!api.data.hasMore } : { people: [], hasMore: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// CIRCLES — community around an investor/creator or group of people.
// Product-facing rename of the pre-existing Group concept; still backed by
// the same ic_groups/group_members tables (see api/_lib/handlers/groups.js
// and supabase/phase6_relationships.sql). Private circles: owner-managed
// membership, added from Connections. Public circles: subscribable via
// request-to-join (owner approves) or a shareable invite link.
// ─────────────────────────────────────────────────────────────────────────────

/** Look up a Circle's full detail by its shareable slug (public if the circle is public; 404-equivalent otherwise for non-members). */
export async function getCircleBySlug(slug) {
  try {
    const res = await fetch(`${API_BASE}/data?resource=groups&action=by-slug&slug=${encodeURIComponent(slug)}`, {
      headers: auth.currentUser ? { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` } : {},
    });
    if (res.ok) return (await res.json()).circle;
    return null;
  } catch (_) { return null; }
}

/** Public + (viewer-visible) private Circles owned by a given user — for the investor profile page. */
export async function getOwnerCircles(ownerId) {
  try {
    const res = await fetch(`${API_BASE}/data?resource=groups&action=owner-circles&ownerId=${encodeURIComponent(ownerId)}`, {
      headers: auth.currentUser ? { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` } : {},
    });
    if (res.ok) return await res.json();
    return { public: [], private: [] };
  } catch (_) { return { public: [], private: [] }; }
}

/** Pending join requests for a Circle the caller owns. */
export async function getCircleJoinRequests(groupId) {
  const api = await callApi(`/data?resource=groups&action=join-requests&groupId=${encodeURIComponent(groupId)}`);
  return api.ok ? (api.data.requests || []) : [];
}

/** People eligible for direct-add to a Circle the caller owns (Connections, plus Trackers for public circles). */
export async function getCircleEligibleMembers(groupId) {
  const api = await callApi(`/data?resource=groups&action=eligible-members&groupId=${encodeURIComponent(groupId)}`);
  return api.ok ? (api.data.people || []) : [];
}

/** Request to join / subscribe to a public Circle. Auto-tracks the owner regardless of approval outcome. */
export async function requestJoinCircle(groupId, inviteCode) {
  const api = await callApi('/data?resource=groups', { method: 'POST', body: { action: 'request-join', groupId, inviteCode } });
  if (api.ok) return api.data;
  if (api.denied) return { error: api.data?.error || 'not_authorized' };
  throw new Error('Neon not configured');
}

/** Circle owner approves/rejects a pending join request. */
export async function reviewCircleJoinRequest(requestId, approve) {
  const api = await callApi('/data?resource=groups', { method: 'POST', body: { action: approve ? 'approve-join-request' : 'reject-join-request', requestId } });
  return api.ok;
}

/** Circle owner regenerates the shareable invite code (invalidates the old link). */
export async function regenerateCircleInviteLink(groupId) {
  const api = await callApi('/data?resource=groups', { method: 'POST', body: { action: 'regenerate-invite-link', groupId } });
  return api.ok ? api.data.invite_code : null;
}

/** Update a Circle's name/description. Only the owner may do this. */
export async function updateCircleSettings(groupId, name, description) {
  const api = await callApi('/data?resource=groups', { method: 'POST', body: { action: 'update-settings', groupId, name, description } });
  if (api.ok) return api.data.group;
  if (api.denied) return null;
  throw new Error('Neon not configured');
}

// ─────────────────────────────────────────────────────────────────────────────
// GROUPS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load all groups where the current user is an active member.
 * Returns array ready for the `groups` React state.
 */
export async function getMyGroups(myId) {
  const api = await callApi("/data?resource=groups");
  if (api.ok) return api.data.groups || [];
  if (api.denied) return [];
  return [];
}

/**
 * Create a new Circle. Creator is automatically owner/admin.
 * memberIds: array of user IDs to add initially — the server re-validates
 * eligibility (Connections for a private circle; Connections or Trackers
 * for a public circle) rather than trusting this list.
 * circleType: 'private' (default) or 'public'.
 * Returns the new group/circle object.
 */
export async function createGroup(name, color, creatorId, memberIds, circleType, description) {
  const api = await callApi("/data?resource=groups", { method: "POST", body: { action: "create", name, color, memberIds, circleType, description } });
  if (api.ok) return api.data.group;
  if (api.denied) throw new Error("Not authorized");
  throw new Error("Neon not configured");
}

/** Rename a group / update a Circle's name+description. Only the owner may do this. */
export async function renameGroup(groupId, newName, myId) {
  const api = await callApi("/data?resource=groups", { method: "POST", body: { action: "update-settings", groupId, name: newName } });
  if (api.ok) return api.data.group;
  if (api.denied) return null;
  throw new Error("Neon not configured");
}

/** Delete a group entirely. Only the creator may do this. */
export async function deleteGroup(groupId, myId) {
  const api = await callApi("/data?resource=groups", { method: "POST", body: { action: "delete", groupId } });
  if (api.ok) return { id: groupId };
  if (api.denied) return null;
  throw new Error("Neon not configured");
}

/** A member voluntarily exits a group. Notifies group admins. */
export async function exitGroup(groupId, myId) {
  const api = await callApi("/data?resource=groups", { method: "POST", body: { action: "exit", groupId } });
  if (api.ok) return { group_id: groupId, user_id: myId };
  if (api.denied) return null;
  throw new Error("Neon not configured");
}

/** Admin adds more members to an existing group. */
export async function addGroupMembers(groupId, memberIds, addedById) {
  const api = await callApi("/data?resource=groups", { method: "POST", body: { action: "add-members", groupId, memberIds } });
  if (api.ok) return;
  if (api.denied) throw new Error("Not authorized");
  throw new Error("Neon not configured");
}

/** Admin removes a member from a group (soft-exit). */
export async function removeGroupMember(groupId, memberId) {
  const api = await callApi("/data?resource=groups", { method: "POST", body: { action: "remove-member", groupId, memberId } });
  if (api.ok) return;
  if (api.denied) throw new Error("Not authorized");
  throw new Error("Neon not configured");
}

// ─────────────────────────────────────────────────────────────────────────────
// RECOMMENDATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a recommendation and deliver it to recipients.
 *
 * recipients: array of { type: 'user'|'group', id: string }
 *   - type 'user'  → deliver directly to that user
 *   - type 'group' → deliver to all active members of that group
 */
export async function createRecommendation(reco, senderId, recipients) {
  const api = await callApi("/data?resource=recommendations", { method: "POST", body: { action: "create", reco, recipients } });
  if (api.ok) return api.data.recommendation;
  if (api.denied) throw new Error("Not authorized");
  throw new Error("Neon not configured");
}

/**
 * Load all recommendations received by a user.
 * Returns rows that map directly to the recsReceived UI state shape.
 */
export async function getMyReceivedRecos(userId) {
  const api = await callApi("/data?resource=recommendations&scope=received");
  if (api.ok) return api.data.recommendations || [];
  if (api.denied) return [];
  return [];
}

/** Load all recommendations made by a user (for "Made by me" tab). */
export async function getMyMadeRecos(userId) {
  const api = await callApi("/data?resource=recommendations&scope=made");
  if (api.ok) return api.data.recommendations || [];
  if (api.denied) return [];
  return [];
}

/** Update a delivery row (mark invested, react, hide). */
export async function updateDelivery(deliveryId, patch, userId) {
  const api = await callApi("/data?resource=recommendations", { method: "POST", body: { action: "update-delivery", deliveryId, patch } });
  if (api.ok) return api.data.delivery;
  if (api.denied) return null;
  throw new Error("Neon not configured");
}

/** Set exit signal with an auto-stamped price from the market data service. */
export async function setExitSignal(recommendationId, userId, exitPrice, exitPriceSource) {
  const api = await callApi("/data?resource=recommendations", { method: "POST", body: { action: "set-exit-signal", recommendationId, exitPrice, exitPriceSource } });
  if (api.ok) return api.data.recommendation;
  if (api.denied) return null;
  throw new Error("Neon not configured");
}

/** Cancel an exit (undo). Clears all exit fields. */
export async function cancelExitSignal(recommendationId, userId) {
  const api = await callApi("/data?resource=recommendations", { method: "POST", body: { action: "cancel-exit-signal", recommendationId } });
  if (api.ok) return api.data.recommendation;
  if (api.denied) return null;
  throw new Error("Neon not configured");
}

/** Notify all contacts (not just recipients) about a new public recommendation. */
export async function notifyPublicContacts(recommendationId, contactIds, metadata) {
  const api = await callApi('/data?resource=recommendations', {
    method: 'POST',
    body: { action: 'notify-public-contacts', recommendationId, contactIds, metadata },
  });
  return api.ok;
}

/** Forward a recommendation to additional recipients. */
export async function forwardRecommendation(recommendationId, forwarderId, recipients) {
  const api = await callApi("/data?resource=recommendations", { method: "POST", body: { action: "forward", recommendationId, recipients } });
  if (api.ok) return;
  if (api.denied) throw new Error("Not authorized");
  throw new Error("Neon not configured");
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

/** Load recent notifications for a user (last 50, newest first). */
export async function getMyNotifications(userId) {
  const api = await callApi("/data?resource=notifications");
  if (api.ok) return api.data.notifications || [];
  if (api.denied) return [];
  return [];
}

/** Mark a single notification as read. */
export async function markNotifRead(notifId, userId) {
  const api = await callApi("/data?resource=notifications", { method: "POST", body: { action: "mark-read", notifId } });
  if (api.ok || api.denied) return;
  return;
}

/** Mark all notifications as read for a user. */
export async function markAllNotifRead(userId) {
  const api = await callApi("/data?resource=notifications", { method: "POST", body: { action: "mark-all-read" } });
  if (api.ok || api.denied) return;
  return;
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARING PREFERENCES
// ─────────────────────────────────────────────────────────────────────────────

/** Load all sharing preferences for a user as { targetId → {visibility, level, selected} }. */
export async function getSharingPrefs(userId) {
  const api = await callApi("/data?resource=sharing-prefs");
  if (api.ok) return api.data.prefs || {};
  if (api.denied) return {};
  return {};
}

/** Save (upsert) a sharing preference for one target. */
export async function upsertSharingPref(userId, targetId, targetType, prefs) {
  const api = await callApi("/data?resource=sharing-prefs", { method: "POST", body: { targetId, targetType, prefs } });
  if (api.ok || api.denied) return;
  return;
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hard-delete a recommendation the current user made.
 * CASCADE removes all delivery rows and notifications automatically.
 * Only the recommender can delete their own recommendation.
 */
export async function deleteRecommendation(recommendationId, userId) {
  const api = await callApi("/data?resource=recommendations", { method: "POST", body: { action: "delete-reco", recommendationId } });
  if (api.ok || api.denied) return;
  return;
}

/**
 * Remove a received recommendation from this user's list.
 * Deletes only THIS user's delivery row — other recipients are unaffected.
 * The underlying recommendation (and the recommender's record) is preserved.
 */
export async function deleteDelivery(deliveryId, userId) {
  const api = await callApi("/data?resource=recommendations", { method: "POST", body: { action: "delete-delivery", deliveryId } });
  if (api.ok || api.denied) return;
  return;
}

// ─────────────────────────────────────────────────────────────────────────────
// USERNAME
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check whether a username is available.
 * Returns true if nobody else has it, false if taken.
 * Excludes the current user's own ID so they can "re-save" their existing username.
 */
export async function checkUsername(username, myId) {
  try {
    const res = await fetch(
      `${API_BASE}/data?resource=lookups&action=username-available&username=${encodeURIComponent(username)}&excludeId=${encodeURIComponent(myId || '')}`
    );
    if (res.ok) {
      const data = await res.json();
      return !!data.available;
    }
  } catch (_) { /* fall through */ }
  return true; // can't check without an API response — assume available
}

/**
 * Persist a username for the current user (call only once availability has
 * been verified). Pass `consent` ({ terms: true, data: true }) only when
 * this call is also completing the mandatory post-signup setup gate (see
 * MandatorySetupGate in src/features/onboarding/Onboarding.jsx) — omit it
 * for a plain username save from an already-consented account (e.g.
 * ProfileEditModal, for legacy users who never set one).
 */
export async function saveUsername(userId, username, consent) {
  const body = { action: "username-save", username };
  if (consent) { body.consentTerms = consent.terms === true; body.consentData = consent.data === true; }
  const api = await callApi("/data?resource=lookups", { method: "POST", body });
  if (api.ok) return;
  if (api.denied) {
    const code = api.data?.error;
    if (code === 'taken') throw new Error('Username already taken');
    if (code === 'invalid_username') throw new Error('Invalid username');
    throw new Error(code || 'Not authorized');
  }
  throw new Error("Neon not configured");
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC PROFILE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load everything needed to render a user's public profile page.
 * No authentication required — called with just a username string.
 *
 * Return logic for "in/out of money":
 *   • Active rec (not expired, no exit signal): compare current_price to reco_price
 *   • Expired OR exited: still compare current_price (best available; no historical prices stored)
 *   • No price at all: treat as 0% return (not in money, not out of money)
 *
 * All stats filter to is_public = true only.
 */
// ─────────────────────────────────────────────────────────────────────────────
// ICI SCORE — computed in JS from summary data
// ─────────────────────────────────────────────────────────────────────────────
export function computeIci({ years_history, total, hit_rate_pct, median_return, risk_adjusted_return, deleted_count }) {
  const yrs    = Math.max(Number(years_history)       || 0, 0);
  const recs   = Math.max(Number(total)               || 0, 0);
  const hr     = Math.max(Number(hit_rate_pct)        || 0, 0);
  const med    = Math.max(Number(median_return)       || 0, 0);
  const ra     = Math.max(Number(risk_adjusted_return)|| 0, 0);
  const dels   = Math.max(Number(deleted_count)       || 0, 0);

  const trackLen    = Math.min(yrs  / 3,  1) * 15;   // 3 yrs = full marks
  const volume      = Math.min(recs / 20, 1) * 15;   // 20 recs = full marks
  const hitRate     = (hr / 100)               * 20;
  const medianRet   = Math.min(med / 15, 1)    * 15;  // 15% median = full
  const riskAdj     = Math.min(ra  / 2,  1)    * 15;  // Sharpe 2 = full
  const transparency = (1 - Math.min(dels / Math.max(recs, 1), 1)) * 10;
  const profileVerif = 10; // upgraded later when identity verification is built

  const score = Math.min(Math.round(trackLen + volume + hitRate + medianRet + riskAdj + transparency + profileVerif), 100);
  const band  = score >= 75 ? 'Strong' : score >= 55 ? 'Good' : score >= 35 ? 'Building' : 'Early';

  return {
    score, band,
    components: [
      { label: 'Track record length',   score: Math.round(trackLen),    max: 15 },
      { label: 'Recommendation volume', score: Math.round(volume),      max: 15 },
      { label: 'Hit rate',              score: Math.round(hitRate),      max: 20 },
      { label: 'Median return',         score: Math.round(medianRet),    max: 15 },
      { label: 'Risk-adjusted return',  score: Math.round(riskAdj),     max: 15 },
      { label: 'Transparency',          score: Math.round(transparency), max: 10 },
      { label: 'Profile verification',  score: Math.round(profileVerif), max: 10 },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC PROFILE — full data for the public profile page
// Status rules (per product spec):
//   Active  = NOT exit_signal AND (target_date IS NULL OR target_date >= today)
//   Closed  = exit_signal = true
//   Expired = NOT exit_signal AND target_date IS NOT NULL AND target_date < today
// ─────────────────────────────────────────────────────────────────────────────
export async function getPublicProfile(username) {
  if (!username) return null;

  // Unauthenticated-by-design server-side endpoint — runs against
  // DATABASE_URL server-side, never the browser.
  try {
    const res = await fetch(`${API_BASE}/data?resource=public-profile&username=${encodeURIComponent(username)}`);
    if (res.ok) {
      return await res.json();
    }
    if (res.status === 404) return null;
  } catch (_) { /* fall through to legacy path */ }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4: ENGAGEMENT (reactions, comments, tracking)
// API-only — no direct-Neon fallback (Phase 4 removes browser Neon access).
// ─────────────────────────────────────────────────────────────────────────────

export async function getEngagement(recoId) {
  const api = await callApi(`/data?resource=engagement&recoId=${encodeURIComponent(recoId)}`);
  if (api.ok) return api.data;
  return { likes: 0, commentsCount: 0, myReaction: null, tracking: null, comments: [] };
}

export async function getReactionsBatch(recoIds) {
  if (!recoIds || recoIds.length === 0) return {};
  const api = await callApi(`/data?resource=engagement&action=reactions-batch&recoIds=${encodeURIComponent(recoIds.join(','))}`);
  if (api.ok) return api.data.reactions || {};
  return {};
}

export async function reactToReco(recoId, reaction, notifyOpts) {
  const body = { action: 'react', recoId, reaction };
  if (notifyOpts) { body.notify = true; body.likerName = notifyOpts.likerName; }
  const api = await callApi('/data?resource=engagement', { method: 'POST', body });
  return api.ok ? api.data : { success: false };
}

export async function commentOnReco(recoId, comment) {
  const api = await callApi('/data?resource=engagement', { method: 'POST', body: { action: 'comment', recoId, comment } });
  if (api.ok) return api.data.comment;
  throw new Error(api.data?.error || 'Could not post comment');
}

export async function trackReco(recoId, isInvested, investedPrice) {
  const api = await callApi('/data?resource=engagement', { method: 'POST', body: { action: 'track', recoId, isInvested, investedPrice } });
  return api.ok;
}

export async function untrackReco(recoId) {
  const api = await callApi('/data?resource=engagement', { method: 'POST', body: { action: 'untrack', recoId } });
  return api.ok;
}

export async function getMyTrackedRecoIds() {
  const api = await callApi('/data?resource=engagement&action=my-tracked');
  return api.ok ? (api.data.recoIds || []) : [];
}

export async function getMyTrackedRecos() {
  const api = await callApi('/data?resource=engagement&action=my-tracked-recos');
  return api.ok ? (api.data.recos || []) : [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4: CLAIM-PROFILE FLOW
// ─────────────────────────────────────────────────────────────────────────────

export async function getClaimStatus(username) {
  try {
    const res = await fetch(`${API_BASE}/data?resource=claim-profile&action=status&username=${encodeURIComponent(username)}`);
    if (res.ok) return await res.json();
  } catch (_) { /* ignore */ }
  return null;
}

export async function getClaimAdminLink(username) {
  const api = await callApi(`/data?resource=claim-profile&action=admin-link&username=${encodeURIComponent(username)}`);
  return api.ok ? api.data : null;
}

export async function lookupClaimToken(token) {
  try {
    const res = await fetch(`${API_BASE}/data?resource=claim-profile&action=lookup&token=${encodeURIComponent(token)}`);
    if (res.ok) {
      const data = await res.json();
      return data.profile || null;
    }
  } catch (_) { /* ignore */ }
  return null;
}

export async function getMyPendingClaimStatus() {
  const api = await callApi('/data?resource=claim-profile&action=my-pending-status');
  return api.ok ? !!api.data.hasPending : false;
}

export async function submitClaim(payload) {
  const api = await callApi('/data?resource=claim-profile', { method: 'POST', body: { action: 'submit-claim', ...payload } });
  if (api.ok) return api.data;
  throw new Error(api.data?.error || 'Could not submit claim');
}

export async function getUnclaimedProfiles() {
  const api = await callApi('/data?resource=claim-profile&action=list-unclaimed');
  return api.ok ? api.data : { unclaimed: [], recoCounts: {} };
}

export async function createUnclaimedProfile(payload) {
  const api = await callApi('/data?resource=claim-profile', { method: 'POST', body: { action: 'create-unclaimed', ...payload } });
  if (api.ok) return api.data;
  throw new Error(api.data?.error || 'Failed to create profile');
}

export async function deleteUnclaimedProfile(id) {
  const api = await callApi('/data?resource=claim-profile', { method: 'POST', body: { action: 'delete-unclaimed', id } });
  if (!api.ok) throw new Error(api.data?.error || 'Delete failed');
}

export async function getClaimRequests() {
  const api = await callApi('/data?resource=claim-profile&action=list-requests');
  return api.ok ? (api.data.requests || []) : [];
}

export async function reviewClaimRequest(requestId, action, reviewNote) {
  const api = await callApi('/data?resource=claim-profile', {
    method: 'POST',
    body: { action: action === 'approve' ? 'approve-claim' : 'reject-claim', requestId, reviewNote },
  });
  if (!api.ok) throw new Error(api.data?.error || 'Action failed');
  return api.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4: ADMIN CONFIG (feed config, instruments, admin user ops)
// ─────────────────────────────────────────────────────────────────────────────

export async function toggleFeedConfig(key, field, value) {
  const api = await callApi('/data?resource=admin-config', { method: 'POST', body: { action: 'feed-config-toggle', key, field, value } });
  if (!api.ok) throw new Error(api.data?.error || 'Update failed');
}

export async function getAdminInstruments(search, page, pageSize) {
  const qs = new URLSearchParams({ scope: 'instruments', search: search || '', page: String(page || 0), pageSize: String(pageSize || 50) });
  const api = await callApi(`/data?resource=admin-config&${qs.toString()}`);
  return api.ok ? api.data : { instruments: [], total: 0 };
}

export async function getInstrumentsExport() {
  const api = await callApi('/data?resource=admin-config&scope=instruments-export');
  return api.ok ? (api.data.instruments || []) : [];
}

export async function upsertInstrument(instrument) {
  const api = await callApi('/data?resource=admin-config', { method: 'POST', body: { action: 'instrument-upsert', ...instrument } });
  if (!api.ok) throw new Error(api.data?.error || 'Save failed');
  return api.data.instrument;
}

export async function deactivateInstrument(id) {
  const api = await callApi('/data?resource=admin-config', { method: 'POST', body: { action: 'instrument-deactivate', id } });
  if (!api.ok) throw new Error(api.data?.error || 'Delete failed');
}

export async function bulkSeedProfiles(profiles) {
  const api = await callApi('/data?resource=admin-config', { method: 'POST', body: { action: 'bulk-seed-profiles', profiles } });
  if (!api.ok) throw new Error(api.data?.error || 'Seed failed');
  return api.data.results || [];
}

export async function bulkSeedRecos(recos, seedMode) {
  const api = await callApi('/data?resource=admin-config', { method: 'POST', body: { action: 'bulk-seed-recos', recos, seedMode } });
  if (!api.ok) throw new Error(api.data?.error || 'Seed failed');
  return api.data.results || [];
}

export async function adminCreateUserProfile(profile) {
  const api = await callApi('/data?resource=admin-config', { method: 'POST', body: { action: 'create-user-profile', ...profile } });
  return api.ok ? api.data.user : null;
}

export async function adminGetUserByEmail(email) {
  const api = await callApi(`/data?resource=admin-config&scope=user-by-email&email=${encodeURIComponent(email)}`);
  return api.ok ? api.data.user : null;
}

export async function seedCreatorRecos(creatorId, recos) {
  const api = await callApi('/data?resource=admin-config', { method: 'POST', body: { action: 'seed-creator-recos', creatorId, recos } });
  if (!api.ok) throw new Error(api.data?.error || 'Seed failed');
  return api.data.count || 0;
}

export async function adminDeleteUser(userId) {
  const api = await callApi('/data?resource=admin-config', { method: 'POST', body: { action: 'delete-user', userId } });
  if (!api.ok) throw new Error(api.data?.error || 'Delete failed');
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4: MISC LOOKUPS (sectors, portfolio, feature votes, contact, about-us,
// user lookups by id/username/email)
// ─────────────────────────────────────────────────────────────────────────────

export async function getInstrumentsList() {
  const api = await callApi('/data?resource=lookups&action=instruments-list');
  return api.ok ? (api.data.instruments || []) : [];
}

export async function getSectors() {
  const api = await callApi('/data?resource=lookups&action=sectors');
  return api.ok ? (api.data.sectors || []) : [];
}

export async function getPortfolioHoldings() {
  const api = await callApi('/data?resource=lookups&action=portfolio-list');
  return api.ok ? (api.data.holdings || []) : [];
}

export async function addPortfolioHolding(holding) {
  const api = await callApi('/data?resource=lookups', { method: 'POST', body: { action: 'portfolio-add', holding } });
  return api.ok;
}

export async function deletePortfolioHolding(id) {
  const api = await callApi('/data?resource=lookups', { method: 'POST', body: { action: 'portfolio-delete', id } });
  return api.ok;
}

export async function deleteAllPortfolioHoldings() {
  const api = await callApi('/data?resource=lookups', { method: 'POST', body: { action: 'portfolio-delete-all' } });
  return api.ok;
}

export async function getFeedConfigAndPrefs() {
  const api = await callApi('/data?resource=lookups&action=feed-config');
  return api.ok ? api.data : { options: [], prefs: [] };
}

export async function setFeedPref(configKey, enabled) {
  const api = await callApi('/data?resource=lookups', { method: 'POST', body: { action: 'feed-pref-set', configKey, enabled } });
  return api.ok;
}

export async function getNetworkEngagementFeed(activeConnIds) {
  if (!activeConnIds || activeConnIds.length === 0) return [];
  const api = await callApi(`/data?resource=lookups&action=network-engagement-feed&connIds=${encodeURIComponent(activeConnIds.join(','))}`);
  return api.ok ? (api.data.recos || []) : [];
}

export async function getPublicFeed() {
  const api = await callApi('/data?resource=lookups&action=public-feed');
  return api.ok ? (api.data.recos || []) : [];
}

export async function getAllUsersAdmin() {
  const api = await callApi('/data?resource=admin-config&scope=all-users');
  return api.ok ? (api.data.users || []) : [];
}

export async function getConsensusRecosAll() {
  const api = await callApi('/data?resource=lookups&action=consensus-all');
  return api.ok ? (api.data.recos || []) : [];
}

export async function getConsensusRecosPublic() {
  const api = await callApi('/data?resource=lookups&action=consensus-public');
  return api.ok ? (api.data.recos || []) : [];
}

export async function getTickerRecos(ticker) {
  const api = await callApi(`/data?resource=lookups&action=ticker-recos&ticker=${encodeURIComponent(ticker)}`);
  return api.ok ? (api.data.recos || []) : [];
}

export async function getInvestorIciBatch(uids) {
  const api = await callApi('/data?resource=lookups', { method: 'POST', body: { action: 'investor-ici-batch', uids } });
  return api.ok ? (api.data.stats || []) : [];
}

export async function searchPeople(q, limit) {
  const qs = limit ? `&limit=${limit}` : '';
  const api = await callApi(`/data?resource=lookups&action=people-search&q=${encodeURIComponent(q)}${qs}`);
  return api.ok ? (api.data.people || []) : [];
}

/** Small curated list of active investors for the "Discover your Investor Circle" activation card. */
export async function getSuggestedPeople() {
  const api = await callApi('/data?resource=lookups&action=discover-people');
  return api.ok ? (api.data.people || []) : [];
}

/** Upload a profile picture (client-compressed data: URI — see src/utils/image.js). */
export async function uploadAvatar(dataUrl) {
  const api = await callApi('/data?resource=lookups', { method: 'POST', body: { action: 'avatar-upload', dataUrl } });
  if (api.ok) return api.data.avatarUrl;
  throw new Error(api.data?.error || 'Could not upload image');
}

/** Mark the one-time Discover activation card as done/skipped so it never shows again. */
export async function markOnboardingStep(step) {
  const api = await callApi('/data?resource=lookups', { method: 'POST', body: { action: 'onboarding-complete', step } });
  return api.ok;
}

export async function savePushSubscription(endpoint, p256dh, authKey) {
  const api = await callApi('/data?resource=lookups', { method: 'POST', body: { action: 'push-subscribe', endpoint, p256dh, auth: authKey } });
  return api.ok;
}

export async function removePushSubscription(endpoint) {
  const api = await callApi('/data?resource=lookups', { method: 'POST', body: { action: 'push-unsubscribe', endpoint } });
  return api.ok;
}

export async function saveProfileEdit(profile) {
  const api = await callApi('/data?resource=lookups', { method: 'POST', body: { action: 'profile-edit-save', profile } });
  if (!api.ok) throw new Error(api.data?.error || 'Could not save');
  return api.data.profile;
}

export async function getRegOptions() {
  const api = await callApi('/data?resource=lookups&action=reg-options');
  return api.ok ? api.data : { options: [], verifyMessage: '' };
}

export async function getAboutUsContent() {
  try {
    const res = await fetch(`${API_BASE}/data?resource=lookups&action=about-us`);
    if (res.ok) {
      const data = await res.json();
      return data.html || null;
    }
  } catch (_) { /* ignore */ }
  return null;
}

export async function saveAboutUsContent(html) {
  const api = await callApi('/data?resource=lookups', { method: 'POST', body: { action: 'about-us-save', html } });
  if (!api.ok) throw new Error(api.data?.error || 'Save failed');
}

export async function voteFeature(featureKey) {
  try {
    await fetch(`${API_BASE}/data?resource=lookups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'feature-vote', featureKey }),
    });
  } catch (_) { /* fire-and-forget */ }
}

export async function submitContactForm(payload) {
  const res = await fetch(`${API_BASE}/data?resource=lookups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'contact-submit', ...payload }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || 'Could not submit');
  }
}

export async function getProfileNavInfo(userId) {
  const api = await callApi(`/data?resource=lookups&action=profile-nav-info&userId=${encodeURIComponent(userId)}`);
  return api.ok ? api.data.info : null;
}

export async function processReferral(refUsername) {
  const api = await callApi('/data?resource=lookups', { method: 'POST', body: { action: 'process-referral', refUsername } });
  return api.ok ? api.data : { referred: false };
}

export async function getRecommenderUsername(recoId) {
  const api = await callApi(`/data?resource=lookups&action=reco-recommender-username&recoId=${encodeURIComponent(recoId)}`);
  return api.ok ? api.data.username : null;
}

export async function lookupUser(by, value) {
  const api = await callApi('/data?resource=lookups', { method: 'POST', body: { action: 'user-lookup', by, value } });
  return api.ok ? api.data.user : null;
}

