import React, { createContext, useContext, useState, useEffect } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "./firebase";
import { sql } from "./supabaseClient";

const AuthContext = createContext(null);

// Emails that always have admin privileges (checked locally — no DB round-trip needed)
const ADMIN_EMAILS = ["ankur.citm@gmail.com"];

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const isAdminEmail = ADMIN_EMAILS.includes(firebaseUser.email);
        const fullName = firebaseUser.displayName || firebaseUser.email.split("@")[0];

        // Upsert profile in Neon (silently skips if Neon not configured or
        // migration_auth.sql hasn't been run yet)
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
            // Common on first run before migration_auth.sql is applied
            console.warn("Profile sync skipped — run supabase/migration_auth.sql in Neon:", e.message);
            setProfile({ id: firebaseUser.uid, email: firebaseUser.email, full_name: fullName, is_admin: isAdminEmail });
          }
        } else {
          setProfile({ id: firebaseUser.uid, email: firebaseUser.email, full_name: fullName, is_admin: isAdminEmail });
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub; // cleanup listener on unmount
  }, []);

  const login  = (email, password) => signInWithEmailAndPassword(auth, email, password);
  const logout = () => signOut(auth);

  // isAdmin: hardcoded email list takes priority; DB is secondary
  const isAdmin = ADMIN_EMAILS.includes(user?.email) || profile?.is_admin === true;

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
