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
import { recordRequest, SLOW_REQUEST_MS, STALL_WARN_MS } from "../utils/perf";
import { parseServerTiming, describeServerTiming } from "../utils/serverTiming";

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

/**
 * Requests that have not come back yet.
 *
 * A screen stuck on a spinner is almost always one of these, and until now
 * that was invisible: the log recorded a request only once it finished, so a
 * request still in flight left no trace at all. Each entry announces itself
 * once if it is still outstanding after STALL_WARN_MS, which turns "the app
 * hangs on this screen" into a line naming the call it is waiting for.
 */
let inFlightSeq = 0;
const inFlight = new Map();

/** What the app is currently waiting for — shown on the Diagnostics screen. */
export function pendingRequests() {
  const now = Date.now();
  return [...inFlight.values()].map((r) => ({ label: r.label, waitingMs: now - r.startedAt }));
}

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
  const label = `${method} ${path}`;
  const startedAt = Date.now();
  const seq = ++inFlightSeq;
  inFlight.set(seq, { label, startedAt });
  const stallTimer = setTimeout(() => {
    if (inFlight.has(seq)) addLog("warn", `api ${label} still waiting after ${STALL_WARN_MS}ms`);
  }, STALL_WARN_MS);
  const settle = (ok, res) => {
    clearTimeout(stallTimer);
    inFlight.delete(seq);
    const ms = Date.now() - startedAt;
    // What the SERVER says it spent, so a slow call can be attributed
    // instead of guessed at. The difference between this total and the wall
    // time measured here is network plus platform cold start — the two
    // things the server cannot see and the client cannot separate alone.
    const server = parseServerTiming(res);
    recordRequest(path, ms, ok, server);
    if (ms >= SLOW_REQUEST_MS) {
      addLog("warn", `api ${label} slow: ${ms}ms${server ? ` (${describeServerTiming(server, ms)})` : ""}`);
    }
    return ms;
  };

  try {
    let res = await doFetch(await auth.currentUser.getIdToken());
    // Same stale-token retry as the web app's callApi() — see src/db.js.
    if (res.status === 401 || res.status === 403) {
      res = await doFetch(await auth.currentUser.getIdToken(true));
    }
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      settle(true, res);
      return { ok: true, data };
    }
    if (res.status === 401 || res.status === 403) {
      const data = await res.json().catch(() => ({}));
      settle(false, res);
      addLog("error", `api ${label} denied (${res.status})`);
      return { ok: false, denied: true, status: res.status, data };
    }
    settle(false, res);
    addLog("error", `api ${label} failed (HTTP ${res.status})`);
    return { ok: false, infra: true, status: res.status };
  } catch (e) {
    const ms = settle(false);
    const aborted = e?.name === "AbortError";
    addLog(
      "error",
      `api ${label} ${aborted ? `timed out after ${REQUEST_TIMEOUT_MS}ms` : `threw: ${e?.message || e}`} (${ms}ms)`
    );
    return { ok: false, infra: true, timeout: aborted, error: e };
  }
}
