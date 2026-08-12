import React, { createContext, useContext, useState, useEffect } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "./firebase";
import { sql } from "./supabaseClient";

const AuthContext = createContext(null);

const ADMIN_EMAILS = ["ankur.citm@gmail.com"];

// Phase 2 authenticated server-side profile endpoints (see api/profile/*.js).
// Each falls back to the direct-Neon path below when unavailable (network
// error, misconfiguration, etc) so a server-side issue never itself breaks
// login.
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
        // Phase 2b: try the authenticated server check first; fall back to
        // the direct-Neon query, unchanged, if the API is unreachable.
        let blacklistChecked = false;
        try {
          const idToken = await firebaseUser.getIdToken();
          const res = await fetch(PROFILE_BLACKLIST_API, {
            headers: { Authorization: `Bearer ${idToken}` },
          });
          if (res.ok) {
            const data = await res.json();
            blacklistChecked = true;
            if (data?.blocked) {
              await signOut(auth);      // force sign-out
              setAuthLoading(false);
              return;
            }
          }
        } catch (_) { /* fall through to legacy path */ }

        if (!blacklistChecked && sql) {
          try {
            const blocked = await sql`
              SELECT id FROM deleted_users WHERE id = ${firebaseUser.uid} LIMIT 1
            `;
            if (blocked.length > 0) {
              await signOut(auth);      // force sign-out
              setAuthLoading(false);
              return;
            }
          } catch (_) {}               // deleted_users table may not exist yet
        }

        setUser(firebaseUser);
        const isAdminEmail = ADMIN_EMAILS.includes(firebaseUser.email?.toLowerCase());
        const fullName = firebaseUser.displayName || firebaseUser.email.split("@")[0];
        setRole(isAdminEmail ? "admin" : "investor");

        // Phase 2a: try the authenticated server read first. Only an existing
        // profile row (200) is treated as a hit; anything else (404 = no
        // profile yet, network error, non-200) falls through to the existing
        // direct-Neon create/sync path unchanged below.
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
        } catch (_) { /* fall through to legacy path */ }

        // Phase 2c: if no existing profile was found via the read API above,
        // try the authenticated server-side create/sync next, before falling
        // back to the direct-Neon upsert unchanged below.
        let syncedViaApi = false;
        if (!profileFromApi) {
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
          } catch (_) { /* fall through to legacy path */ }
        }

        if (profileFromApi) {
          setProfile(profileFromApi);
        } else if (!syncedViaApi && sql) {
          try {
            const rows = await sql`
              INSERT INTO user_profiles (id, email, full_name, is_admin, first_name, last_name)
              VALUES (
                ${firebaseUser.uid}, ${firebaseUser.email}, ${fullName}, ${isAdminEmail},
                ${fullName.split(" ")[0]},
                ${fullName.split(" ").slice(1).join(" ") || ""}
              )
              ON CONFLICT (id) DO UPDATE SET
                email      = EXCLUDED.email,
                first_name = CASE
                               WHEN user_profiles.first_name IS NULL OR user_profiles.first_name = ''
                               THEN EXCLUDED.first_name
                               ELSE user_profiles.first_name
                             END,
                last_name  = CASE
                               WHEN user_profiles.last_name IS NULL OR user_profiles.last_name = ''
                               THEN EXCLUDED.last_name
                               ELSE user_profiles.last_name
                             END,
                updated_at = now()
              RETURNING *
            `;
            setProfile(rows[0] ?? { id: firebaseUser.uid, email: firebaseUser.email,
              full_name: fullName, is_admin: isAdminEmail,
              first_name: fullName.split(" ")[0], last_name: fullName.split(" ").slice(1).join(" ") || "" });
          } catch (e) {
            console.warn("Profile sync skipped:", e.message);
            setProfile({ id: firebaseUser.uid, email: firebaseUser.email,
              full_name: fullName, is_admin: isAdminEmail,
              first_name: fullName.split(" ")[0], last_name: fullName.split(" ").slice(1).join(" ") || "" });
          }
        } else {
          setProfile({ id: firebaseUser.uid, email: firebaseUser.email,
            full_name: fullName, is_admin: isAdminEmail,
            first_name: fullName.split(" ")[0], last_name: fullName.split(" ").slice(1).join(" ") || "" });
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
  // Phase 2d: try the authenticated server-side update first; fall back to
  // the direct-Neon UPDATE, unchanged, if the API is unreachable.
  const updateProfile = async (firstName, lastName) => {
    if (!user || !firstName.trim()) return { error: "First name is required" };
    const fn = firstName.trim();
    const ln = (lastName || "").trim();
    const fullName = `${fn} ${ln}`.trim();

    let updatedViaApi = false;
    try {
      console.log('[DEBUG updateProfile] calling', PROFILE_UPDATE_API);
      const idToken = await user.getIdToken();
      const res = await fetch(PROFILE_UPDATE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ firstName: fn, lastName: ln }),
      });
      console.log('[DEBUG updateProfile] response status', res.status);
      if (res.ok) {
        updatedViaApi = true;
      } else if (res.status === 400) {
        const data = await res.json().catch(() => ({}));
        return { error: data.error || "First name is required" };
      } else {
        console.log('[DEBUG updateProfile] non-ok, non-400 status, falling back');
      }
    } catch (e) {
      console.log('[DEBUG updateProfile] threw exception, falling back:', e);
    }

    if (!updatedViaApi && sql) {
      try {
        await sql`
          UPDATE user_profiles
          SET first_name = ${fn}, last_name = ${ln}, full_name = ${fullName}, updated_at = now()
          WHERE id = ${user.uid}
        `;
      } catch (e) {
        return { error: e.message };
      }
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
