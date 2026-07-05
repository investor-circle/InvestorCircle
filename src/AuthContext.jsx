import React, { createContext, useContext, useState, useEffect } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "./firebase";
import { sql } from "./supabaseClient";

const AuthContext = createContext(null);

// Emails that always have admin privileges (checked locally — no DB round-trip needed)
const ADMIN_EMAILS = ["ankur.citm@gmail.com"];

export function AuthProvider({ children }) {
  const [user,        setUser]        = useState(null);
  const [profile,     setProfile]     = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  // role: "investor" | "admin" — admins can switch; non-admins are always "investor"
  const [role,        setRole]        = useState("investor");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const isAdminEmail = ADMIN_EMAILS.includes(firebaseUser.email?.toLowerCase());
        const fullName = firebaseUser.displayName || firebaseUser.email.split("@")[0];

        // Non-admin users are always "investor".
        // Admin users start in "admin" view; they can toggle via the sidebar button.
        setRole(isAdminEmail ? "admin" : "investor");

        if (sql) {
          try {
            const rows = await sql`
              INSERT INTO user_profiles (id, email, full_name, is_admin)
              VALUES (${firebaseUser.uid}, ${firebaseUser.email}, ${fullName}, ${isAdminEmail})
              ON CONFLICT (id) DO UPDATE
                SET email = EXCLUDED.email, updated_at = now()
              RETURNING *
            `;
            setProfile(rows[0] ?? { id: firebaseUser.uid, email: firebaseUser.email, full_name: fullName, is_admin: isAdminEmail });
          } catch (e) {
            console.warn("Profile sync skipped — run supabase/migration_auth.sql in Neon:", e.message);
            setProfile({ id: firebaseUser.uid, email: firebaseUser.email, full_name: fullName, is_admin: isAdminEmail });
          }
        } else {
          setProfile({ id: firebaseUser.uid, email: firebaseUser.email, full_name: fullName, is_admin: isAdminEmail });
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

  // userIsAdmin: hardcoded email list takes priority; DB profile is secondary
  const userIsAdmin = ADMIN_EMAILS.includes(user?.email?.toLowerCase()) || profile?.is_admin === true;

  return (
    <AuthContext.Provider value={{
      user, profile, authLoading, login, logout,
      userIsAdmin,   // ← was "isAdmin" — renamed to match App.jsx
      role, setRole, // ← new: lets App.jsx toggle investor↔admin view
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

