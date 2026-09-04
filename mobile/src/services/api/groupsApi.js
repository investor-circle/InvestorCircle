import { callApi } from "../api";

/** Circles (groups) the caller is an active member/owner of. */
export async function getMyGroups() {
  const api = await callApi("/data?resource=groups");
  return api.ok ? api.data.groups || [] : [];
}

/**
 * Ideas shared with one Circle, newest-activity-first. The server enforces
 * that the caller is an active member/owner — never trust the client here.
 *
 * Returns null — not [] — when the server refuses because the caller is not a
 * member. The two are genuinely different states: an empty Circle should show
 * "no ideas yet", while one you cannot see should offer a way to ask to join
 * (see app/circle/[id].js). Collapsing both into [] made a Circle you had
 * merely found look like a Circle that was empty.
 */
export async function getCircleIdeas(groupId) {
  const api = await callApi(`/data?resource=recommendations&scope=circle&groupId=${encodeURIComponent(groupId)}`);
  if (api.ok) return api.data.ideas || [];
  return api.denied ? null : [];
}

/**
 * Create a Circle. The caller becomes owner/admin. `memberIds` is a
 * convenience — the server re-validates every id against its own eligibility
 * rules (Connections for a private Circle; Connections or Trackers for a
 * public one) rather than trusting this list.
 * circleType: 'private' (default) | 'public'.
 */
export async function createGroup({ name, color, memberIds = [], circleType = "private", description = "" }) {
  const api = await callApi("/data?resource=groups", {
    method: "POST",
    body: { action: "create", name, color, memberIds, circleType, description },
  });
  if (api.ok) return { ok: true, group: api.data.group };
  return { ok: false, error: api.denied ? "not_authorized" : "unreachable" };
}

/** People the caller may add to this Circle (server-computed eligibility). */
export async function getCircleEligibleMembers(groupId) {
  const api = await callApi(`/data?resource=groups&action=eligible-members&groupId=${encodeURIComponent(groupId)}`);
  return api.ok ? api.data.people || [] : [];
}

/** Pending requests to join a Circle the caller owns. */
export async function getCircleJoinRequests(groupId) {
  const api = await callApi(`/data?resource=groups&action=join-requests&groupId=${encodeURIComponent(groupId)}`);
  return api.ok ? api.data.requests || [] : [];
}

/** Approve or reject one join request. */
export async function reviewCircleJoinRequest(requestId, approve) {
  const api = await callApi("/data?resource=groups", {
    method: "POST",
    body: { action: approve ? "approve-join-request" : "reject-join-request", requestId },
  });
  return api.ok;
}

/** Add members to a Circle (server re-validates eligibility). */
export async function addGroupMembers(groupId, memberIds) {
  const api = await callApi("/data?resource=groups", {
    method: "POST",
    body: { action: "add-members", groupId, memberIds },
  });
  return api.ok;
}

/** Remove one member from a Circle. */
export async function removeGroupMember(groupId, memberId) {
  const api = await callApi("/data?resource=groups", {
    method: "POST",
    body: { action: "remove-member", groupId, memberId },
  });
  return api.ok;
}

/** Rename / re-describe a Circle (owner only, enforced server-side). */
export async function updateCircleSettings(groupId, name, description) {
  const api = await callApi("/data?resource=groups", {
    method: "POST",
    body: { action: "update-settings", groupId, name, description },
  });
  return api.ok;
}

/** Delete a Circle (owner only). */
export async function deleteGroup(groupId) {
  const api = await callApi("/data?resource=groups", { method: "POST", body: { action: "delete", groupId } });
  return api.ok;
}

/** Leave a Circle the caller is a member (not owner) of. */
export async function exitGroup(groupId) {
  const api = await callApi("/data?resource=groups", { method: "POST", body: { action: "exit", groupId } });
  return api.ok;
}

/** Rotate a Circle's invite code, invalidating the previous link. */
export async function regenerateCircleInviteLink(groupId) {
  const api = await callApi("/data?resource=groups", {
    method: "POST",
    body: { action: "regenerate-invite-link", groupId },
  });
  return api.ok ? api.data : null;
}

/**
 * Ask to join a Circle you found rather than were invited to. The owner then
 * approves or rejects it (see app/circle/manage.js). An inviteCode, when
 * present, is what lets a link-holder join a Circle that isn't open.
 */
export async function requestJoinCircle(groupId, inviteCode) {
  const api = await callApi("/data?resource=groups", {
    method: "POST",
    body: { action: "request-join", groupId, inviteCode },
  });
  if (api.ok) return api.data;
  return { error: api.data?.error || "not_authorized" };
}

/**
 * A Circle by its shareable slug — the target of an invite link.
 *
 * The server decides what a given viewer may see: a private Circle 404s for
 * anyone who is not a member, and the invite code is only returned to
 * members. Mirrors getCircleBySlug() in the web app.
 */
export async function getCircleBySlug(slug) {
  const api = await callApi(`/data?resource=groups&action=by-slug&slug=${encodeURIComponent(slug)}`);
  return api.ok ? api.data.circle : null;
}

/**
 * Circles a given person owns, for their public profile.
 *
 * Returns { public, private } — private only contains Circles the CALLER is
 * already a member of, so this cannot be used to enumerate someone's private
 * Circles. Mirrors getOwnerCircles() in the web app.
 */
export async function getOwnerCircles(ownerId) {
  const api = await callApi(`/data?resource=groups&action=owner-circles&ownerId=${encodeURIComponent(ownerId)}`);
  return api.ok ? { public: api.data.public || [], private: api.data.private || [] } : { public: [], private: [] };
}
