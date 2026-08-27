/**
 * Mobile API client — mirrors src/db.js's callApi() in the web app.
 *
 * Same rules as the web app (see CLAUDE.md "Security rules" and
 * "Prohibition on browser-side Neon access"): the app never talks to Neon
 * directly. Every call goes through the same authenticated Vercel endpoint
 * (api/data.js) the web app uses, with identity derived from a verified
 * Firebase ID token — never a client-supplied uid.
 */
import { auth } from "../config/firebase";

export const API_ORIGIN = process.env.EXPO_PUBLIC_API_ORIGIN || "https://investor-circle.vercel.app";
export const API_BASE = API_ORIGIN + "/api";

export async function callApi(path, { method = "GET", body } = {}) {
  if (!auth.currentUser) return { ok: false, infra: true };
  const doFetch = (idToken) =>
    fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${idToken}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  try {
    let res = await doFetch(await auth.currentUser.getIdToken());
    // Same stale-token retry as the web app's callApi() — see src/db.js.
    if (res.status === 401 || res.status === 403) {
      res = await doFetch(await auth.currentUser.getIdToken(true));
    }
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
