import { callApi, API_BASE } from "../api";

/** Search investors by name/username (server requires q length >= 2). */
export async function searchPeople(q, limit) {
  const qs = limit ? `&limit=${limit}` : "";
  const api = await callApi(`/data?resource=lookups&action=people-search&q=${encodeURIComponent(q)}${qs}`);
  return api.ok ? api.data.people || [] : [];
}

/**
 * Candidate investors to connect with — excludes people the caller already
 * tracks or is connected to. Mirrors src/db.js getDiscoverMore().
 */
export async function getDiscoverMore() {
  const api = await callApi("/data?resource=lookups&action=discover-more");
  return api.ok ? api.data.people || [] : [];
}

/**
 * Public investor profile + performance summary. This endpoint is
 * unauthenticated by design (same as the web's shareable profile page), so
 * it's a plain fetch rather than callApi.
 */
export async function getPublicProfile(username) {
  if (!username) return null;
  try {
    const res = await fetch(`${API_BASE}/data?resource=public-profile&username=${encodeURIComponent(username)}`);
    if (res.ok) return await res.json();
  } catch (_) {}
  return null;
}
