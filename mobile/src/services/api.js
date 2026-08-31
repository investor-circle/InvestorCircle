/**
 * Mobile API client — mirrors src/db.js's callApi() in the web app.
 *
 * Same rules as the web app (see CLAUDE.md "Security rules" and
 * "Prohibition on browser-side Neon access"): the app never talks to Neon
 * directly. Every call goes through the same authenticated Vercel endpoint
 * (api/data.js) the web app uses, with identity derived from a verified
 * Firebase ID token — never a client-supplied uid.
 */
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../config/firebase";
import { addLog } from "../utils/logger";

/**
 * Resolves once Firebase has finished restoring the persisted session.
 *
 * Without this, every call made during app startup raced auth: screens mount
 * and fetch immediately, but `auth.currentUser` is still null for the first
 * few hundred ms while the session is read back out of AsyncStorage, so each
 * request bailed out as "no signed-in user" and the screen rendered empty
 * even though the user was signed in. Confirmed from an on-device log where
 * all six startup requests were skipped while the session was valid.
 */
let authReadyPromise = null;
function authReady() {
  if (!authReadyPromise) {
    authReadyPromise =
      typeof auth.authStateReady === "function"
        ? auth.authStateReady()
        : new Promise((resolve) => {
            const unsub = onAuthStateChanged(auth, () => {
              unsub();
              resolve();
            });
          });
  }
  return authReadyPromise;
}

export const API_ORIGIN = process.env.EXPO_PUBLIC_API_ORIGIN || "https://investor-circle.vercel.app";
export const API_BASE = API_ORIGIN + "/api";

// A request that never settles is worse than one that fails: callers use
// Promise.all/allSettled (the Feed merges five endpoints), so a single
// hanging fetch would leave the whole screen stuck on partial data forever
// with no error and no way to recover except restarting the app. React
// Native's fetch has no default timeout, so impose one explicitly.
const REQUEST_TIMEOUT_MS = 15000;

export async function callApi(path, { method = "GET", body } = {}) {
  // Wait for the persisted session to be restored before concluding the
  // caller is signed out — see authReady() above.
  await authReady();
  if (!auth.currentUser) {
    addLog("warn", `api ${method} ${path} skipped — no signed-in user`);
    return { ok: false, infra: true };
  }
  const doFetch = async (idToken) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(`${API_BASE}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${idToken}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } finally {
      clearTimeout(timer);
    }
  };
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
      addLog("error", `api ${method} ${path} denied (${res.status})`);
      return { ok: false, denied: true, status: res.status, data };
    }
    addLog("error", `api ${method} ${path} failed (HTTP ${res.status})`);
    return { ok: false, infra: true, status: res.status };
  } catch (e) {
    const aborted = e?.name === "AbortError";
    addLog(
      "error",
      `api ${method} ${path} ${aborted ? `timed out after ${REQUEST_TIMEOUT_MS}ms` : `threw: ${e?.message || e}`}`
    );
    return { ok: false, infra: true, timeout: aborted, error: e };
  }
}
