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
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile as fbUpdateProfile,
  signOut,
} from "firebase/auth";
import { auth } from "../config/firebase";
import { unregisterCurrentDevice } from "../services/pushNotifications";
import { clearAvatarCache } from "../services/avatarCache";
import { clearReactions } from "../services/reactionStore";
import { identify } from "../services/analytics";
import { clearFeedCache } from "../services/feedCache";
import { API_ORIGIN } from "../services/api";
import { completeSignup } from "../services/api/authApi";

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
        // Tie events to the member, using the SAME uid the web sets — one
        // person on both clients is one user in the reports, not two. Only
        // the uid: user properties ride on every event and are retained by
        // Google, so a name or address here would export member identity for
        // no analytical gain.
        identify(firebaseUser.uid);
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
              // Not a profile the server confirmed — a shape assembled locally
              // so the app still works when the profile API is unreachable.
              // The consent flags below are placeholders, NOT a record of
              // anything the user agreed to, which is why the setup gate
              // refuses to make decisions from this shape (see SetupGate.js).
              __local: true,
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
        identify(null);
      }
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
  // Detach this device's push token BEFORE signing out: unregistering is an
  // authenticated call, so doing it afterwards silently no-ops and leaves
  // the token attached to the account that just left — the next person to
  // use the phone would get their notifications. Never blocks sign-out.
  const logout = async () => {
    try {
      await unregisterCurrentDevice();
    } catch (_) {
      /* sign out regardless */
    }
    // Cached feed rows and other people's profile pictures were fetched with
    // this account's token. On a shared phone the next person to sign in must
    // not inherit either. Failures here never block sign-out.
    clearReactions();
    await Promise.allSettled([clearAvatarCache(), clearFeedCache(user?.uid)]);
    return signOut(auth);
  };

  /**
   * Create an account, then write name/username/consent to the profile row.
   * Order matters (same as the web signup): the profile write happens before
   * onAuthStateChanged's own sync would fall back to email.split("@")[0] as
   * the display name.
   */
  const signup = async ({ email, password, firstName, lastName, username, consentTerms, consentData }) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const fullName = `${firstName.trim()} ${(lastName || "").trim()}`.trim();
    try {
      await fbUpdateProfile(cred.user, { displayName: fullName });
    } catch (_) {
      /* display name is cosmetic — the profile row below is the source of truth */
    }
    const idToken = await cred.user.getIdToken();
    const res = await completeSignup(idToken, { firstName, lastName, username, consentTerms, consentData });
    if (res.ok) {
      setProfile((p) => ({
        ...(p || {}),
        first_name: firstName.trim(),
        last_name: (lastName || "").trim(),
        full_name: fullName,
        username: username.trim(),
      }));
    }
    return res;
  };

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
      value={{ user, profile, authLoading, login, signup, logout, userIsAdmin, updateProfile, patchProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
