import { callApi } from "../api";

/** Circles (groups) the caller is an active member/owner of. */
export async function getMyGroups() {
  const api = await callApi("/data?resource=groups");
  return api.ok ? api.data.groups || [] : [];
}

/**
 * Ideas shared with one Circle, newest-activity-first. The server enforces
 * that the caller is an active member/owner — never trust the client here.
 */
export async function getCircleIdeas(groupId) {
  const api = await callApi(`/data?resource=recommendations&scope=circle&groupId=${encodeURIComponent(groupId)}`);
  return api.ok ? api.data.ideas || [] : [];
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
