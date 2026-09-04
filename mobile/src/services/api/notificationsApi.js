import { callApi } from "../api";

/** The caller's 50 most recent notifications (newest first). */
export async function getMyNotifications() {
  const api = await callApi("/data?resource=notifications");
  return api.ok ? api.data.notifications || [] : [];
}

/** Mark a single notification read. */
export async function markNotifRead(notifId) {
  const api = await callApi("/data?resource=notifications", {
    method: "POST",
    body: { action: "mark-read", notifId },
  });
  return api.ok;
}

/** Mark all of the caller's notifications read. */
export async function markAllNotifRead() {
  const api = await callApi("/data?resource=notifications", {
    method: "POST",
    body: { action: "mark-all-read" },
  });
  return api.ok;
}
