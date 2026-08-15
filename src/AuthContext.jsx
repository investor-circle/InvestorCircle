import React, { createContext, useContext, useState, useEffect } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth";
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
const PROFILE_ME_API         = `${API_BASE}/me`;
const PROFILE_BLACKLIST_API  = `${API_BASE}/blacklist-check`;
const PROFILE_SYNC_API       = `${API_BASE}/sync`;
const PROFILE_UPDATE_API     = `${API_BASE}/update`;

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
        const isAdminEmail = ADMIN_EMAILS.includes(firebaseUser.email?.toLowerCase());
        const fullName = firebaseUser.displayName || firebaseUser.email.split("@")[0];
        setRole(isAdminEmail ? "admin" : "investor");

        // Only an existing profile row (200 with a profile) is treated as a
        // hit; anything else (404 = no profile yet, network error, non-200)
        // falls through to create/sync below.
        const profileFromApi = profileSettled.status === 'fulfilled' ? (profileSettled.value?.profile || null) : null;

        if (profileFromApi) {
          setProfile(profileFromApi);
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

  const login  = (email, password) => signInWithEmailAndPassword(auth, email, password);
  // onAuthStateChanged above handles profile create/sync for both new and
  // returning Google users identically — no separate signup path needed.
  const loginWithGoogle = () => signInWithPopup(auth, new GoogleAuthProvider());
  const logout = () => signOut(auth);

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
