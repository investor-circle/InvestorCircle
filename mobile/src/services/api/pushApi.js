import { callApi } from "../api";

/**
 * Register this device's Expo push token against the signed-in account.
 * Identity is derived server-side from the verified Firebase token — the
 * uid is never sent from here.
 */
export async function registerExpoPushToken(token, platform) {
  const api = await callApi("/data?resource=lookups", {
    method: "POST",
    body: { action: "expo-push-register", token, platform },
  });
  return api.ok;
}

/** Detach this device's token from the account (called on sign-out). */
export async function unregisterExpoPushToken(token) {
  const api = await callApi("/data?resource=lookups", {
    method: "POST",
    body: { action: "expo-push-unregister", token },
  });
  return api.ok;
}
