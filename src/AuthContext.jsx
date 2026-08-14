import React, { createContext, useContext, useState, useEffect } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "./firebase";

const AuthContext = createContext(null);

const ADMIN_EMAILS = ["ankur.citm@gmail.com"];

// Authenticated server-side profile endpoints (see api/profile/*.js). All
// browser-to-Neon direct access has been removed (Phase 4 security
// migration) — if these are unreachable, auth degrades to a locally-derived
// profile shape rather than falling back to a direct-Neon query.
const API_BASE = (import.meta.env.VITE_CAS_API_URL || 'https://investor-circle.vercel.app') + '/api/profile';
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
        // ── Blacklist check ───────────────────────────────────────
        // Hard-deleted users are blocked immediately on any login attempt.
        try {
          const idToken = await firebaseUser.getIdToken();
          const res = await fetch(PROFILE_BLACKLIST_API, {
            headers: { Authorization: `Bearer ${idToken}` },
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.blocked) {
              await signOut(auth);      // force sign-out
              setAuthLoading(false);
              return;
            }
          }
        } catch (_) { /* non-fatal — infra failure, not an authorization decision */ }

        setUser(firebaseUser);
        const isAdminEmail = ADMIN_EMAILS.includes(firebaseUser.email?.toLowerCase());
        const fullName = firebaseUser.displayName || firebaseUser.email.split("@")[0];
        setRole(isAdminEmail ? "admin" : "investor");

        // Try the authenticated server read first. Only an existing profile
        // row (200) is treated as a hit; anything else (404 = no profile
        // yet, network error, non-200) falls through to create/sync below.
        let profileFromApi = null;
        try {
          const idToken = await firebaseUser.getIdToken();
          const res = await fetch(PROFILE_ME_API, {
            headers: { Authorization: `Bearer ${idToken}` },
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.profile) profileFromApi = data.profile;
          }
        } catch (_) { /* fall through to sync */ }

        if (profileFromApi) {
          setProfile(profileFromApi);
        } else {
          // No existing profile — create/sync it server-side.
          let syncedViaApi = false;
          try {
            const idToken = await firebaseUser.getIdToken();
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

          if (!syncedViaApi) {
            setProfile({ id: firebaseUser.uid, email: firebaseUser.email,
              full_name: fullName, is_admin: isAdminEmail,
              first_name: fullName.split(" ")[0], last_name: fullName.split(" ").slice(1).join(" ") || "" });
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
      user, profile, authLoading, login, logout,
      userIsAdmin, role, setRole, updateProfile, patchProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
