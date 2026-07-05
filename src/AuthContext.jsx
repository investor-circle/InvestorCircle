import React, { createContext, useContext, useState, useEffect } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "./firebase";
import { sql } from "./supabaseClient";

const AuthContext = createContext(null);

const ADMIN_EMAILS = ["ankur.citm@gmail.com"];

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
        if (sql) {
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

        if (sql) {
          try {
            const rows = await sql`
              INSERT INTO user_profiles (id, email, full_name, is_admin, first_name, last_name)
              VALUES (
                ${firebaseUser.uid}, ${firebaseUser.email}, ${fullName}, ${isAdminEmail},
                ${fullName.split(" ")[0]},
                ${fullName.split(" ").slice(1).join(" ") || ""}
              )
              ON CONFLICT (id) DO UPDATE
                SET email = EXCLUDED.email, updated_at = now()
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

  // Update first/last name in Neon and local profile state
  const updateProfile = async (firstName, lastName) => {
    if (!user || !firstName.trim()) return { error: "First name is required" };
    const fn = firstName.trim();
    const ln = (lastName || "").trim();
    const fullName = `${fn} ${ln}`.trim();
    if (sql) {
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

  return (
    <AuthContext.Provider value={{
      user, profile, authLoading, login, logout,
      userIsAdmin, role, setRole, updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
