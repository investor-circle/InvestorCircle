import React, { createContext, useContext, useState, useEffect } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut, setPersistence, browserLocalPersistence, browserSessionPersistence } from "firebase/auth";
import { auth } from "./firebase";
import { API_ORIGIN } from "./db";

const AuthContext = createContext(null);

const ADMIN_EMAILS = ["ankur.citm@gmail.com"];

// Authenticated server-side profile endpoints (see api/profile/*.js). All
// browser-to-Neon direct access has been removed (Phase 4 security
// migration) — if these are unreachable, auth degrades to a locally-derived
// profile shape rather than falling back to a direct-Neon query.
// API_ORIGIN (see src/db.js) resolves to the same-origin api/ on Vercel
// Preview deployments so this always talks to the deployment's own backend.
const API_BASE = API_ORIGIN + '/api/profile';
const PROFILE_SYNC_API       = `${API_BASE}/sync`;
const PROFILE_UPDATE_API     = `${API_BASE}/update`;
// `me`/`blacklist-check` are the two calls onAuthStateChanged below fires on
// EVERY app load — routed through the consolidated api/data.js dispatcher
// (api/_lib/handlers/profile.js) instead of their own standalone functions,
// which were each independently paying a cold-start Firebase Admin/Neon
// init on this hot path (the concrete cause of a slow/stuck sign-in
// spinner). The original standalone api/profile/me.js and
// api/profile/blacklist-check.js are untouched — mobile still calls them
// directly.
const PROFILE_ME_API         = `${API_ORIGIN}/api/data?resource=profile&action=me`;
const PROFILE_BLACKLIST_API  = `${API_ORIGIN}/api/data?resource=profile&action=blacklist-check`;

// Mints/clears the routing-token cookie /middleware.js checks to decide
// whether a fresh hit on /security/:symbol, /idea/:id, or "/" goes to the
// main app or to web-public — see api/_lib/handlers/session.js and
// /middleware.js for what this is and, just as importantly, what it is
// NOT: it never authenticates anything, and its failure here is never
// treated as a sign-in failure — a signed-in user just falls back to the
// same (slower, still correct) web-public path a signed-out visitor
// always gets if this call doesn't succeed.
//
// Deliberately NOT API_ORIGIN (unlike every other API_BASE above): a
// cookie is scoped to whichever origin actually answers the request, and
// API_ORIGIN on the real custom domain resolves to a DIFFERENT origin
// (https://investor-circle.vercel.app — see its own comment in db.js, a
// holdover from the GitHub-Pages-hosted-frontend era) than the page the
// visitor is actually on (myinvestorcircle.com). A same-origin-scoped
// fetch (`credentials: 'same-origin'`, correct below) to a cross-origin
// URL is treated as `omit` by the browser — no cookie is sent OR stored,
// so this cookie was silently never being set on myinvestorcircle.com at
// all, for anyone, regardless of browser. A relative path always resolves
// against the page's own origin, whatever that is (production custom
// domain, a Vercel Preview's own *.vercel.app URL, or localhost), which
// is exactly what a same-origin-only cookie needs.
const SESSION_API = `/api/data?resource=session`;
// Comfortably inside the server-side token TTL (7 days — see
// api/_lib/handlers/session.js) so a long-running tab keeps a fresh token
// rather than silently falling back to web-public mid-session. This is now
// a background safety net, not the primary freshness mechanism — see the
// visibilitychange/pageshow listeners below, which are what actually keep
// an intermittently-used tab fresh; this interval only matters for a tab
// left open and untouched (no tab-switch, no minimize, nothing to fire
// those) for the interval's full duration. Was 10 minutes when the TTL was
// 15 — kept comfortably shorter than the new 7-day TTL without polling
// anywhere near as often as that short-TTL era required.
const ROUTING_TOKEN_REFRESH_MS = 6 * 60 * 60 * 1000;
// Shared across every refresh trigger (interval, visibilitychange,
// pageshow) so a burst of them firing close together — e.g. rapid tab
// switching — mints at most once per window instead of once per event.
const ROUTING_TOKEN_REFRESH_MIN_GAP_MS = 60 * 1000;

// Exported only so AuthContext.test.jsx can pin the fetch URL as
// same-origin — the exact class of bug this function shipped with once
// already (see SESSION_API's own comment).
//
// keepalive: true matters specifically on mobile: this call is fire-and-
// forget, fired right as the app is loading (onAuthStateChanged resolving,
// or a tab returning from the background) — exactly when a mobile browser
// is most likely to freeze or discard the page (switching apps, locking the
// screen) before an in-flight fetch completes. Without keepalive, that
// aborts the request and the cookie silently never gets (re)minted, so the
// next full-page hit on "/" falls back to web-public's marketing page even
// though the underlying Firebase session is still perfectly valid — which
// is what "getting signed out" turned out to actually be. keepalive tells
// the browser to let this specific request finish in the background instead
// of killing it with the page (same mechanism analytics beacons rely on);
// it has no body here, so the platform's small keepalive-request body cap
// doesn't apply.
export function mintRoutingCookie(idToken) {
  if (!idToken) return;
  fetch(`${SESSION_API}&action=mint`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
    credentials: 'same-origin',
    keepalive: true,
  }).catch(() => {});
}

export function clearRoutingCookie() {
  return fetch(`${SESSION_API}&action=clear`, { method: 'POST', credentials: 'same-origin', keepalive: true }).catch(() => {});
}

// Exported (not just used inline in AuthProvider below) so
// AuthContext.test.jsx can pin the persistence choice directly — a "remember
// me" bug here is invisible until someone's session outlives (or doesn't
// outlive) their expectation, which is not something a component-level test
// would catch reliably. rememberMe defaults true, matching Firebase Auth's
// own default (browserLocalPersistence — survives closing the browser) so
// existing behavior doesn't change for a caller that doesn't pass it.
// Unchecked, the session clears when the browser closes
// (browserSessionPersistence) — the standard "not this device" choice for a
// shared/public computer. Neither path stores the password anywhere; this
// only controls how long the resulting Firebase session itself is kept.
export function login(email, password, rememberMe = true) {
  return setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence)
    .then(() => signInWithEmailAndPassword(auth, email, password));
}

export function AuthProvider({ children }) {
  const [user,        setUser]        = useState(null);
  const [profile,     setProfile]     = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [role,        setRole]        = useState("investor");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Non-fatal: if we can't even get an ID token, skip straight to the
        // local fallback profile shape below rather than throwing (which
        // would leave authLoading stuck true forever).
        let idToken = null;
        try { idToken = await firebaseUser.getIdToken(); } catch (_) { /* fall through */ }

        // Blacklist check and the profile read below both only need the ID
        // token — neither depends on the other's result — so fire them
        // together instead of waiting for the blacklist check to finish
        // first. We still gate on the blacklist result before committing to
        // a session (setUser/setProfile), exactly as before: a blocked user
        // is signed out and the profile response is simply discarded.
        let blacklistSettled = { status: 'rejected' };
        let profileSettled   = { status: 'rejected' };
        if (idToken) {
          [blacklistSettled, profileSettled] = await Promise.allSettled([
            fetch(PROFILE_BLACKLIST_API, { headers: { Authorization: `Bearer ${idToken}` } })
              .then(res => res.ok ? res.json() : null),
            fetch(PROFILE_ME_API, { headers: { Authorization: `Bearer ${idToken}` } })
              .then(res => res.ok ? res.json() : null),
          ]);
        }

        // ── Blacklist check ───────────────────────────────────────
        // Hard-deleted users are blocked immediately on any login attempt.
        if (blacklistSettled.status === 'fulfilled' && blacklistSettled.value?.blocked) {
          await signOut(auth);      // force sign-out
          setAuthLoading(false);
          return;
        }

        setUser(firebaseUser);
        mintRoutingCookie(idToken);
        const isAdminEmail = ADMIN_EMAILS.includes(firebaseUser.email?.toLowerCase());
        const fullName = firebaseUser.displayName || firebaseUser.email.split("@")[0];
        setRole(isAdminEmail ? "admin" : "investor");

        // Only an existing profile row (200 with a profile) is treated as a
        // hit; anything else (404 = no profile yet, network error, non-200)
        // falls through to create/sync below.
        const profileFromApi = profileSettled.status === 'fulfilled' ? (profileSettled.value?.profile || null) : null;

        if (profileFromApi) {
          // The stored profile.email is a display copy of the Firebase Auth
          // email, written once at signup (api/profile/sync.js) — it never
          // updates on its own after a verifyBeforeUpdateEmail change lands
          // (that only updates auth.currentUser.email, on whatever session
          // clicks the confirmation link, which isn't necessarily this one).
          // Re-run sync — safe to call for an existing row, see its own
          // ON CONFLICT clause — whenever the two disagree, so "your email"
          // in the app catches up with the one that actually signs you in.
          const emailChanged = idToken && firebaseUser.email && profileFromApi.email &&
            profileFromApi.email.toLowerCase() !== firebaseUser.email.toLowerCase();
          if (emailChanged) {
            try {
              const res = await fetch(PROFILE_SYNC_API, {
                method: 'POST',
                headers: { Authorization: `Bearer ${idToken}` },
              });
              const data = res.ok ? await res.json().catch(() => null) : null;
              setProfile(data?.profile || profileFromApi);
            } catch (_) {
              setProfile(profileFromApi);
            }
          } else {
            setProfile(profileFromApi);
          }
        } else {
          // No existing profile — create/sync it server-side.
          let syncedViaApi = false;
          if (idToken) {
            try {
              const res = await fetch(PROFILE_SYNC_API, {
                method: 'POST',
                headers: { Authorization: `Bearer ${idToken}` },
              });
              if (res.ok) {
                const data = await res.json();
                if (data?.profile) {
                  setProfile(data.profile);
                  syncedViaApi = true;
                }
              }
            } catch (_) { /* fall through to local fallback shape */ }
          }

          if (!syncedViaApi) {
            // Server profile create/sync is unreachable — degrade to a
            // client-only shape. Treat onboarding/consent as already-handled
            // here rather than showing the mandatory setup gate or the
            // Discover modal during what is likely an infrastructure outage
            // (any save attempt would fail anyway) — this is not persisted,
            // so the real state is re-checked correctly the next time the
            // server is reachable.
            setProfile({ id: firebaseUser.uid, email: firebaseUser.email,
              full_name: fullName, is_admin: isAdminEmail,
              first_name: fullName.split(" ")[0], last_name: fullName.split(" ").slice(1).join(" ") || "",
              avatar_url: firebaseUser.photoURL || null,
              onboarding_cv_done: true, onboarding_discover_done: true,
              consent_terms_accepted: true, consent_data_accepted: true });
          }
        }
      } else {
        setUser(null);
        setProfile(null);
        setRole("investor");
      }
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // Keep the routing-token cookie fresh for as long as this tab stays open
  // and signed in — see the mintRoutingCookie call above (fired once,
  // immediately, whenever onAuthStateChanged resolves to a user — covering
  // both a fresh sign-in and Firebase restoring a persisted session on
  // startup) and its own comment for why an actively-refreshed token is the
  // point, not an oversight.
  //
  // Three triggers keep it fresh from here on, all sharing one throttle
  // (lastRefreshAtRef) so they can't pile up into redundant requests:
  //   - the interval below, a background safety net for a tab left open
  //     and genuinely untouched;
  //   - visibilitychange -> visible, for "switched back to this tab" (the
  //     normal case: another tab, another app, screen was off);
  //   - pageshow, specifically for bfcache restores (event.persisted) —
  //     Chrome/Safari can restore a whole page, DOM and JS heap included,
  //     from an in-memory snapshot on back/forward navigation without
  //     re-running any mount effect, so nothing above would otherwise fire.
  useEffect(() => {
    if (!user) return;

    const lastRefreshAtRef = { current: 0 };
    const refresh = async () => {
      const now = Date.now();
      if (now - lastRefreshAtRef.current < ROUTING_TOKEN_REFRESH_MIN_GAP_MS) return;
      lastRefreshAtRef.current = now;
      try {
        mintRoutingCookie(await user.getIdToken());
      } catch (_) { /* best-effort — see mintRoutingCookie */ }
    };

    const iv = setInterval(refresh, ROUTING_TOKEN_REFRESH_MS);
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') refresh(); };
    const onPageShow = (event) => { if (event.persisted) refresh(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onPageShow);

    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // onAuthStateChanged above handles profile create/sync for both new and
  // returning Google users identically — no separate signup path needed.
  const loginWithGoogle = () => signInWithPopup(auth, new GoogleAuthProvider());
  const logout = () => { clearRoutingCookie(); return signOut(auth); };

  // Update first/last name in Neon and local profile state.
  const updateProfile = async (firstName, lastName) => {
    if (!user || !firstName.trim()) return { error: "First name is required" };
    const fn = firstName.trim();
    const ln = (lastName || "").trim();
    const fullName = `${fn} ${ln}`.trim();

    try {
      const idToken = await user.getIdToken();
      const res = await fetch(PROFILE_UPDATE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ firstName: fn, lastName: ln }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { error: data.error || "Could not save" };
      }
    } catch (e) {
      return { error: e.message || "Could not save" };
    }
    setProfile(p => ({ ...p, first_name: fn, last_name: ln, full_name: fullName }));
    return { success: true };
  };

  const userIsAdmin = ADMIN_EMAILS.includes(user?.email?.toLowerCase()) || profile?.is_admin === true;

  // Allow components to patch the profile state directly after a username save
  const patchProfile = (patch) => setProfile(p => ({ ...p, ...patch }));

  return (
    <AuthContext.Provider value={{
      user, profile, authLoading, login, loginWithGoogle, logout,
      userIsAdmin, role, setRole, updateProfile, patchProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
