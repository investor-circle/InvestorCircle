import { callApi } from "../api";

/** All connections for the current user (all statuses). */
export async function getMyConnections() {
  const api = await callApi("/data?resource=connections");
  if (api.ok) return api.data.connections || [];
  return [];
}

/** Send a connection request. */
export async function sendConnectionRequest(addresseeId) {
  const api = await callApi("/data?resource=connections", {
    method: "POST",
    body: { action: "send", addresseeId },
  });
  if (api.ok) return api.data;
  if (api.denied) return { error: "not_authorized" };
  return { error: "unreachable" };
}

/** Accept an incoming connection request. */
export async function acceptConnection(connectionId) {
  const api = await callApi("/data?resource=connections", {
    method: "POST",
    body: { action: "accept", connectionId },
  });
  if (api.ok) return api.data.connection ? { connection: api.data.connection } : { error: "not_found" };
  return { error: "not_authorized" };
}

/** Reject an incoming connection request. */
export async function rejectConnection(connectionId) {
  const api = await callApi("/data?resource=connections", {
    method: "POST",
    body: { action: "reject", connectionId },
  });
  if (api.ok) return api.data.connection ? { connection: api.data.connection } : { error: "not_found" };
  return { error: "not_authorized" };
}

/** Remove an accepted connection. */
export async function removeConnection(connectionId) {
  const api = await callApi("/data?resource=connections", {
    method: "POST",
    body: { action: "remove", connectionId },
  });
  if (api.ok) return { success: true };
  return { error: "not_authorized" };
}
