/**
 * Mirrors src/AuthContext.jsx in the web app — same Firebase project, same
 * server-side profile endpoints (api/profile/*.js), same blacklist-before-
 * setUser security control.
 *
 * Email/password only for this first pass. Google sign-in on native needs
 * expo-auth-session (native auth flow, not signInWithPopup — that's web
 * only) plus a native OAuth client ID from the Firebase/Google Cloud
 * console — deliberately deferred rather than half-wired.
 */
import React, { createContext, useContext, useState, useEffect } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "../config/firebase";
import { API_ORIGIN } from "../services/api";

const AuthContext = createContext(null);

const ADMIN_EMAILS = ["ankur.citm@gmail.com"];

const API_BASE = API_ORIGIN + "/api/profile";
const PROFILE_ME_API = `${API_BASE}/me`;
const PROFILE_BLACKLIST_API = `${API_BASE}/blacklist-check`;
const PROFILE_SYNC_API = `${API_BASE}/sync`;
const PROFILE_UPDATE_API = `${API_BASE}/update`;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        let idToken = null;
        try {
          idToken = await firebaseUser.getIdToken();
        } catch (_) {
          /* fall through to local fallback shape */
        }

        let blacklistSettled = { status: "rejected" };
        let profileSettled = { status: "rejected" };
        if (idToken) {
          [blacklistSettled, profileSettled] = await Promise.allSettled([
            fetch(PROFILE_BLACKLIST_API, { headers: { Authorization: `Bearer ${idToken}` } }).then((res) =>
              res.ok ? res.json() : null
            ),
            fetch(PROFILE_ME_API, { headers: { Authorization: `Bearer ${idToken}` } }).then((res) =>
              res.ok ? res.json() : null
            ),
          ]);
        }

        // Blacklist check must gate setUser — same security control as web.
        if (blacklistSettled.status === "fulfilled" && blacklistSettled.value?.blocked) {
          await signOut(auth);
          setAuthLoading(false);
          return;
        }

        setUser(firebaseUser);
        const isAdminEmail = ADMIN_EMAILS.includes(firebaseUser.email?.toLowerCase());
        const fullName = firebaseUser.displayName || firebaseUser.email.split("@")[0];

        const profileFromApi = profileSettled.status === "fulfilled" ? profileSettled.value?.profile || null : null;

        if (profileFromApi) {
          setProfile(profileFromApi);
        } else {
          let syncedViaApi = false;
          if (idToken) {
            try {
              const res = await fetch(PROFILE_SYNC_API, {
                method: "POST",
                headers: { Authorization: `Bearer ${idToken}` },
              });
              if (res.ok) {
                const data = await res.json();
                if (data?.profile) {
                  setProfile(data.profile);
                  syncedViaApi = true;
                }
              }
            } catch (_) {
              /* fall through to local fallback shape */
            }
          }

          if (!syncedViaApi) {
            setProfile({
              id: firebaseUser.uid,
              email: firebaseUser.email,
              full_name: fullName,
              is_admin: isAdminEmail,
              first_name: fullName.split(" ")[0],
              last_name: fullName.split(" ").slice(1).join(" ") || "",
              avatar_url: firebaseUser.photoURL || null,
              onboarding_cv_done: true,
              onboarding_discover_done: true,
              consent_terms_accepted: true,
              consent_data_accepted: true,
            });
          }
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
  const logout = () => signOut(auth);

  const updateProfile = async (firstName, lastName) => {
    if (!user || !firstName.trim()) return { error: "First name is required" };
    const fn = firstName.trim();
    const ln = (lastName || "").trim();
    const fullName = `${fn} ${ln}`.trim();

    try {
      const idToken = await user.getIdToken();
      const res = await fetch(PROFILE_UPDATE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ firstName: fn, lastName: ln }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { error: data.error || "Could not save" };
      }
    } catch (e) {
      return { error: e.message || "Could not save" };
    }
    setProfile((p) => ({ ...p, first_name: fn, last_name: ln, full_name: fullName }));
    return { success: true };
  };

  const userIsAdmin = ADMIN_EMAILS.includes(user?.email?.toLowerCase()) || profile?.is_admin === true;
  const patchProfile = (patch) => setProfile((p) => ({ ...p, ...patch }));

  return (
    <AuthContext.Provider
      value={{ user, profile, authLoading, login, logout, userIsAdmin, updateProfile, patchProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
