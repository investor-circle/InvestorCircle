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
