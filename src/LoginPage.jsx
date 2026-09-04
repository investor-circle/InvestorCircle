import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "./AuthContext";
import {
  createUserWithEmailAndPassword, updateProfile,
  GoogleAuthProvider, signInWithPopup, linkWithCredential,
  signInWithEmailAndPassword as fbSignInWithEmailAndPassword,
  fetchSignInMethodsForEmail,
} from "firebase/auth";
import { auth, track } from "./firebase";
import { API_ORIGIN } from "./db";

/* ── Transactional email helper ─── */
// API_ORIGIN (see src/db.js) resolves to the same-origin api/ on Vercel
// Preview deployments — so a Preview build of a branch with backend changes
// (e.g. this one) talks to its own freshly-deployed api/, not a stale
// hardcoded production URL.
const RESET_API = API_ORIGIN + '/api/reset';

/* ── Phase 2e: authenticated server-side profile endpoints ─── */
const SIGNUP_API             = API_ORIGIN + '/api/profile/signup';
const USERNAME_AVAILABLE_API = API_ORIGIN + '/api/profile/username-available';
/* Translate Firebase error codes into plain-English messages */
function friendlyError(code, isSignup = false) {
  switch (code) {
    case "auth/user-not-found":       return "No account found with this email.";
    case "auth/wrong-password":       return "Incorrect password. Please try again.";
    case "auth/invalid-email":        return "Please enter a valid email address.";
    case "auth/invalid-credential":   return "Incorrect email or password.";
    case "auth/too-many-requests":    return "Too many attempts — please wait a moment, then try again.";
    case "auth/user-disabled":        return "This account has been disabled. Contact your admin.";
    case "auth/email-already-in-use": return "An account with this email already exists. Try signing in instead.";
    case "auth/weak-password":        return "Password must be at least 6 characters.";
    case "auth/operation-not-allowed":return "Sign-ups are not enabled. Contact your admin.";
    default: return isSignup
      ? "Sign up failed. Please check your details and try again."
      : "Sign in failed. Please check your credentials and try again.";
  }
}

/**
 * Translate Google sign-in errors specifically — kept separate from
 * friendlyError() above because the generic isSignup wording ("Sign up
 * failed...") is misleading for Google (there's no separate signup step,
 * and the real cause is almost always something more specific than "check
 * your details"). Every branch stays safe to show the user — these are all
 * standard, publicly-documented Firebase Auth error codes, never database
 * or server internals — and the raw code is appended so a genuine failure
 * is diagnosable instead of a dead end.
 */
function googleErrorMessage(code) {
  switch (code) {
    case "auth/unauthorized-domain":
      return "Google sign-in isn't enabled for this domain yet. This usually means the current URL needs to be added to Firebase's authorized domains list. Please try email sign-in for now, or contact support.";
    case "auth/operation-not-allowed":
      return "Google sign-in isn't enabled for this app yet. Please try email sign-in for now, or contact support.";
    case "auth/popup-blocked":
      return "Your browser blocked the Google sign-in popup. Please allow popups for this site and try again.";
    case "auth/network-request-failed":
      return "Network error while contacting Google. Please check your connection and try again.";
    case "auth/internal-error":
    case "auth/invalid-api-key":
    case "auth/configuration-not-found":
      return "Google sign-in is temporarily unavailable. Please try email sign-in, or try again shortly.";
    default:
      return `Google sign-in failed${code ? ` (${code})` : ""}. Please try email sign-in for now, or contact support if this continues.`;
  }
}

/* Validate password against all rules — returns per-rule booleans */
function pwCheck(pw) {
  return {
    length:    pw.length >= 6 && pw.length <= 25,
    hasLetter: /[a-zA-Z]/.test(pw),
    hasNumber: /[0-9]/.test(pw),
  };
}
function pwValid(pw) {
  const c = pwCheck(pw);
  return c.length && c.hasLetter && c.hasNumber;
}

export default function LoginPage() {
  const { login } = useAuth();

  // If user arrived from a public profile "Join to connect" button,
  // the username is stored in sessionStorage — default to Sign Up tab.
  const pendingUsername = sessionStorage.getItem("pending_connect_username");

  // If user arrived via a referral link (?ref=username), also default to Sign Up.
  const referralCode = localStorage.getItem("mic_ref");

  // tab: "login" | "signup" | "forgot"
  const [tab,        setTab]        = useState(pendingUsername || referralCode ? "signup" : "login");
  const [busy,       setBusy]       = useState(false);
  const [err,        setErr]        = useState("");
  const [showPw,     setShowPw]     = useState(false);
  const [showCpw,    setShowCpw]    = useState(false);

  // Set when Google sign-in hits an email that already has a password
  // account: { email, pendingCredential }. Prompts the user for their
  // existing password so the two sign-in methods can be linked onto one
  // account rather than creating a duplicate profile.
  const [linkPending,  setLinkPending]  = useState(null);
  const [linkPassword, setLinkPassword] = useState("");

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotDone,  setForgotDone]  = useState(false);

  // ── Login fields ────────────────────────────────────────────────────────────
  const [loginEmail,    setLoginEmail]    = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // ── Sign up fields ──────────────────────────────────────────────────────────
  // Phase 5.5 (revised): username and consent are mandatory again. Consent is
  // shown as a separate step (showConsent) on "Create account" click, rather
  // than adding two more checkboxes to an already-busy form — the account is
  // only actually created once that step is agreed to.
  const [firstName,       setFirstName]       = useState("");
  const [lastName,        setLastName]         = useState("");
  const [username,        setUsername]         = useState("");
  const [unStatus,        setUnStatus]         = useState("idle"); // idle|checking|available|taken|invalid
  const [signupEmail,     setSignupEmail]      = useState("");
  const [signupPassword,  setSignupPassword]   = useState("");
  const [confirmPassword, setConfirmPassword]  = useState("");
  const [showConsent,     setShowConsent]      = useState(false);
  const [consentTerms,    setConsentTerms]     = useState(false);
  const [consentData,     setConsentData]      = useState(false);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword) return;
    setBusy(true); setErr("");
    try {
      await login(loginEmail.trim(), loginPassword);
      track('login', { method: 'email' });
      // onAuthStateChanged in AuthContext handles everything after this
    } catch (e) {
      // If this email has no password sign-in method (it was created via
      // Google), give a targeted hint instead of a generic "wrong password".
      // Best-effort: some Firebase projects enable email-enumeration
      // protection, in which case this always returns [] and we just fall
      // back to the generic message.
      if (e.code === "auth/user-not-found" || e.code === "auth/invalid-credential") {
        try {
          const methods = await fetchSignInMethodsForEmail(auth, loginEmail.trim());
          if (methods.length && methods.includes("google.com") && !methods.includes("password")) {
            setErr("This account uses Google Sign-In. Click \"Continue with Google\" below instead.");
            setBusy(false);
            return;
          }
        } catch (_) { /* fall through to generic message */ }
      }
      setErr(friendlyError(e.code));
      setBusy(false);
    }
  };

  // Step 1 of 2: validate the form, then reveal the consent step. Nothing is
  // created yet — the Firebase account only gets created once consent is
  // explicitly agreed to, in completeSignup() below.
  const beginSignup = () => {
    if (!firstName.trim())                  { setErr("First name is required.");                                    return; }
    if (!username)                           { setErr("Username is required.");                                     return; }
    if (unStatus !== "available")            { setErr("Please choose a valid, available username.");                return; }
    if (!signupEmail.trim())                 { setErr("Email address is required.");                                return; }
    if (!pwValid(signupPassword))            { setErr("Password must be 6–25 characters with a letter and number."); return; }
    if (signupPassword !== confirmPassword)  { setErr("Passwords do not match.");                                   return; }
    setErr("");
    setShowConsent(true);
  };

  // Step 2 of 2: consent agreed — now actually create the account.
  const completeSignup = async () => {
    if (!consentTerms || !consentData) { setErr("Please accept both consent statements to continue."); return; }
    setBusy(true); setErr("");
    try {
      // Create Firebase auth account
      const cred = await createUserWithEmailAndPassword(auth, signupEmail.trim(), signupPassword);
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

      // ── CRITICAL ORDER ──────────────────────────────────────────────────────
      // Write the correct name/username/consent to Neon FIRST, before calling
      // Firebase updateProfile. Reason: updateProfile triggers onAuthStateChanged
      // in AuthContext, which reads back the DB. If the DB write hasn't happened
      // yet, AuthContext falls back to email.split("@")[0] as first_name and
      // overwrites the profile state with the wrong name.
      let signupOk = false;
      try {
        const idToken = await cred.user.getIdToken();
        const res = await fetch(SIGNUP_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            username,
            consentTerms: true,
            consentData: true,
          }),
        });
        signupOk = res.ok;
        if (!res.ok) console.warn("Profile signup write failed:", res.status);
      } catch (dbErr) {
        console.warn("Profile signup write failed:", dbErr.message);
      }

      // Non-fatal at the Firebase-auth level, but username/consent are
      // mandatory — if the write above failed, the mandatory setup gate
      // (see App.jsx/OnboardingGate) will correctly catch it and ask again
      // on next login rather than silently letting an incomplete account in.
      if (!signupOk) console.warn("Signup completed but profile write may be incomplete — OnboardingGate will resume it.");

      // Now set Firebase displayName — this triggers onAuthStateChanged in AuthContext,
      // which will read back the DB (now already containing the correct names).
      await updateProfile(cred.user, { displayName: fullName });
      track('sign_up', { method: 'email' });

      // The welcome email is sent server-side by /api/profile/signup, on a
      // genuine first signup only. It used to be sent from here, which meant
      // an account created in the mobile app got no welcome at all.

      // Auth state change fires → AuthContext logs user in → App.jsx referral processing runs
    } catch (e) {
      setErr(friendlyError(e.code, true));
      setBusy(false);
    }
  };

  // ── Google Sign-In / Sign-Up ─────────────────────────────────────────────────
  // Works for both new and returning users — Firebase creates the account on
  // first use, and AuthContext's onAuthStateChanged handler creates/syncs the
  // Neon profile row identically to email/password (see api/profile/sync.js).
  const handleGoogleSignIn = async () => {
    setBusy(true); setErr("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      track('login', { method: 'google' });
      // onAuthStateChanged in AuthContext handles everything after this
    } catch (e) {
      if (e.code === "auth/account-exists-with-different-credential") {
        // An email/password account already exists with this email. Firebase
        // won't silently merge them — the documented safe path is: sign the
        // user in with their existing method, then link the Google credential
        // onto that same account so there's exactly one InvestorCircle profile.
        const pendingCredential = GoogleAuthProvider.credentialFromError(e);
        const email = e.customData?.email || "";
        setLinkPending({ email, pendingCredential });
        setErr("");
      } else if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") {
        // User dismissed the popup — not an error worth surfacing.
      } else {
        console.error("[Google sign-in] failed:", e.code, e.message);
        setErr(googleErrorMessage(e.code));
      }
      setBusy(false);
    }
  };

  // Complete the account-link flow: verify the existing password account,
  // then attach the Google credential to it.
  const handleLinkGoogleAccount = async () => {
    if (!linkPending || !linkPassword) return;
    setBusy(true); setErr("");
    try {
      const existingCred = await fbSignInWithEmailAndPassword(auth, linkPending.email, linkPassword);
      await linkWithCredential(existingCred.user, linkPending.pendingCredential);
      track('google_account_linked');
      setLinkPending(null);
      setLinkPassword("");
      // onAuthStateChanged already fired from the sign-in above — user is in.
    } catch (e) {
      setErr(friendlyError(e.code));
      setBusy(false);
    }
  };

  const handleForgot = async () => {
    if (!forgotEmail.trim()) { setErr("Please enter your email address."); return; }
    setBusy(true); setErr("");
    try {
      const res = await fetch(RESET_API, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      });
      // Always show "check your inbox" — even if the email doesn't exist
      // (prevents revealing which emails are registered).
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // Only surface server config errors, not "user not found"
        if (res.status === 500) throw new Error(data.error || "Server error");
      }
      setForgotDone(true);
      track('password_reset_requested');
    } catch (e) {
      setErr("Something went wrong. Please try again or contact support.");
    } finally {
      setBusy(false);
    }
  };

  const switchTab = (t) => { setTab(t); setErr(""); setForgotDone(false); setForgotEmail(""); setShowConsent(false); };

  // ── Username availability check (debounced 500ms) ───────────────────────────
  // No Firebase account/token exists yet at this point in the flow, so this
  // hits the public, availability-only server endpoint (see
  // api/profile/username-available.js).
  const USERNAME_RE = /^[a-z0-9_]{5,20}$/;
  React.useEffect(() => {
    if (!username) { setUnStatus("idle"); return; }
    if (!USERNAME_RE.test(username)) { setUnStatus("invalid"); return; }
    setUnStatus("checking");
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${USERNAME_AVAILABLE_API}?username=${encodeURIComponent(username)}`);
        if (res.ok) {
          const data = await res.json();
          if (typeof data?.available === "boolean") {
            setUnStatus(data.available ? "available" : "taken");
            return;
          }
        }
        setUnStatus("available"); // fail open on unexpected response shape
      } catch { setUnStatus("available"); } // fail open on network error
    }, 500);
    return () => clearTimeout(t);
  }, [username]);

  const inputStyle = {
    width: "100%", padding: "11px 14px", borderRadius: 10,
    border: "1.5px solid #e8e8f2", fontSize: 14, outline: "none",
    fontFamily: "inherit", color: "#13142b", background: "#fff",
    boxSizing: "border-box", transition: "border-color .15s",
  };
  const focusOn  = e => e.target.style.borderColor = "#6d5df5";
  const focusOff = e => e.target.style.borderColor = "#e8e8f2";
  const label    = { display: "block", fontSize: 13, fontWeight: 700, color: "#4a4d6a", marginBottom: 6 };
  const field    = { marginBottom: 14 };
  const eyeBtn   = {
    position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
    background: "none", border: "none", cursor: "pointer", padding: 4,
    color: "#8a8daa", display: "flex", alignItems: "center",
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0b18",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Plus Jakarta Sans',-apple-system,system-ui,sans-serif",
      padding: "16px 24px", position: "relative", overflowY: "auto",
    }}>
      {/* Ambient glow */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: `radial-gradient(700px 500px at 15% -5%, rgba(109,93,245,.45), transparent 55%),
                     radial-gradient(600px 400px at 90% 105%, rgba(207,82,216,.28), transparent 55%)`,
      }}/>

      <div style={{ width: "100%", maxWidth: 420, position: "relative" }}>

        {/* Brand */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 13 }}>
            <img src="/mic-logo.png" alt="myInvestorCircle" style={{ width: 52, height: 52, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-.3px", lineHeight: 1.1 }}>
                myInvestorCircle
              </div>
              <div style={{ fontSize: 13, color: "#6a6d90", marginTop: 3 }}>
                Your private investing circle
              </div>
            </div>
          </div>
        </div>

        {/* Context banner — shown when arriving from a public profile */}
        {pendingUsername && (
          <div style={{
            background: "rgba(109,93,245,.18)", border: "1px solid rgba(109,93,245,.4)",
            borderRadius: 14, padding: "12px 16px", marginBottom: 16,
            display: "flex", gap: 10, alignItems: "center",
          }}>
            <span style={{ fontSize: 18 }}>🔗</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#c5bcff" }}>
                Connect with @{pendingUsername}
              </div>
              <div style={{ fontSize: 12, color: "#8a8daa", marginTop: 2 }}>
                Create an account or sign in — we'll send your connection request automatically.
              </div>
            </div>
          </div>
        )}

        {/* Referral welcome banner — shown when arriving via an invite link */}
        {!pendingUsername && referralCode && (
          <div style={{
            background: "rgba(21,146,78,.15)", border: "1px solid rgba(21,146,78,.35)",
            borderRadius: 14, padding: "12px 16px", marginBottom: 16,
            display: "flex", gap: 10, alignItems: "center",
          }}>
            <span style={{ fontSize: 18 }}>🎁</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#6ee7a8" }}>
                You've been invited to myInvestorCircle!
              </div>
              <div style={{ fontSize: 12, color: "#8a8daa", marginTop: 2 }}>
                Create your account below — your friend will be added to your circle automatically once you sign up.
              </div>
            </div>
          </div>
        )}

        {/* Card */}
        <div style={{
          background: "#ffffff", borderRadius: 22,
          padding: "28px 30px 26px",
          boxShadow: "0 32px 90px rgba(0,0,0,.45)",
        }}>

          {/* Tabs */}
          <div style={{
            display: "flex", gap: 0, marginBottom: 24,
            background: "#f2f2fa", borderRadius: 12, padding: 4,
          }}>
            {[["login", "Sign in"], ["signup", "Create account"]].map(([t, label]) => (
              <button key={t} onClick={() => switchTab(t)} style={{
                flex: 1, padding: "9px 0", borderRadius: 9,
                border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 700,
                background: tab === t ? "#fff" : "transparent",
                color: tab === t ? "#13142b" : "#8a8daa",
                boxShadow: tab === t ? "0 1px 6px rgba(0,0,0,.1)" : "none",
                fontFamily: "inherit", transition: "all .15s",
              }}>{label}</button>
            ))}
          </div>

          {/* ── Account-linking flow: existing password account, Google attempted with same email ── */}
          {linkPending && (<>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#13142b", marginBottom: 4 }}>Confirm it's you</div>
            <div style={{ fontSize: 14, color: "#8a8daa", marginBottom: 22, lineHeight: 1.5 }}>
              <strong>{linkPending.email}</strong> already has a myInvestorCircle account with a
              password. Enter that password to link Google sign-in to it — you'll be able to use either from now on.
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={label}>Password</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"} value={linkPassword} autoFocus
                  onChange={e => setLinkPassword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleLinkGoogleAccount()}
                  placeholder="••••••••"
                  style={{ ...inputStyle, paddingRight: 44 }}
                  onFocus={focusOn} onBlur={focusOff}/>
                <button onClick={() => setShowPw(v => !v)} style={eyeBtn}>
                  {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>
            {err && <ErrorBox msg={err}/>}
            <button onClick={handleLinkGoogleAccount}
              disabled={!linkPassword || busy}
              style={btnStyle(!linkPassword || busy)}>
              {busy ? "Linking…" : "Confirm & link Google →"}
            </button>
            <div style={{ textAlign: "center", marginTop: 14, fontSize: 13, color: "#8a8daa" }}>
              <button onClick={() => { setLinkPending(null); setLinkPassword(""); setErr(""); }} style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#8a8daa", fontSize: 13, fontFamily: "inherit", padding: 0,
                textDecoration: "underline", textUnderlineOffset: 3,
              }}>Cancel</button>
            </div>
          </>)}

          {/* ── Google Sign-In — prominent, works for both new and returning users ── */}
          {!linkPending && tab !== "forgot" && !showConsent && (<>
            <button onClick={handleGoogleSignIn} disabled={busy} style={{
              width: "100%", padding: "12px", borderRadius: 11, marginBottom: 16,
              background: "#fff", border: "1.5px solid #e8e8f2",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              fontSize: 14, fontWeight: 700, color: "#13142b",
              cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1,
              fontFamily: "inherit", transition: "border-color .15s",
            }}>
              <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.94v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.94A9 9 0 0 0 0 9c0 1.45.35 2.83.94 4.03l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .94 4.97l3.01 2.33C4.66 5.17 6.65 3.58 9 3.58z"/></svg>
              Continue with Google
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <div style={{ flex: 1, height: 1, background: "#e8e8f2" }}/>
              <span style={{ fontSize: 11, color: "#b0b3cc", fontWeight: 700 }}>OR</span>
              <div style={{ flex: 1, height: 1, background: "#e8e8f2" }}/>
            </div>
          </>)}

          {/* ── LOGIN TAB ── */}
          {!linkPending && tab === "login" && (<>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#13142b", marginBottom: 4 }}>Welcome back</div>
            <div style={{ fontSize: 14, color: "#8a8daa", marginBottom: 22 }}>
              Sign in to your myInvestorCircle account.
            </div>

            <div style={field}>
              <label style={label}>Email address</label>
              <input type="email" value={loginEmail} autoFocus
                onChange={e => setLoginEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                placeholder="you@example.com"
                style={inputStyle} onFocus={focusOn} onBlur={focusOff}/>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={label}>Password</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"} value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                  placeholder="••••••••"
                  style={{ ...inputStyle, paddingRight: 44 }}
                  onFocus={focusOn} onBlur={focusOff}/>
                <button onClick={() => setShowPw(v => !v)} style={eyeBtn}>
                  {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>

            {err && <ErrorBox msg={err}/>}

            <button onClick={handleLogin}
              disabled={!loginEmail.trim() || !loginPassword || busy}
              style={btnStyle(!loginEmail.trim() || !loginPassword || busy)}>
              {busy ? "Signing in…" : "Sign in →"}
            </button>

            <div style={{ textAlign: "center", marginTop: 14, fontSize: 13, color: "#8a8daa" }}>
              <button onClick={() => switchTab("forgot")} style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#8a8daa", fontSize: 13, fontFamily: "inherit", padding: 0,
                textDecoration: "underline", textUnderlineOffset: 3,
              }}>Forgot password?</button>
            </div>

            <div style={{ textAlign: "center", marginTop: 10, fontSize: 13, color: "#8a8daa" }}>
              New here?{" "}
              <button onClick={() => switchTab("signup")} style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#6d5df5", fontWeight: 700, fontSize: 13, fontFamily: "inherit", padding: 0,
              }}>Create an account →</button>
            </div>
          </>)}

          {/* ── FORGOT PASSWORD TAB ── */}
          {!linkPending && tab === "forgot" && (<>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#13142b", marginBottom: 4 }}>Reset your password</div>
            <div style={{ fontSize: 14, color: "#8a8daa", marginBottom: 22 }}>
              {forgotDone
                ? "Check your inbox for next steps."
                : "Enter your account email and we'll send you a reset link."}
            </div>

            {forgotDone ? (
              /* ── Confirmation state ── */
              <div style={{
                background: "#f0fdf4", border: "1px solid #86efac",
                borderRadius: 12, padding: "20px 18px", marginBottom: 20, textAlign: "center",
              }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📬</div>
                <div style={{ fontWeight: 700, color: "#166534", marginBottom: 6 }}>Email sent!</div>
                <div style={{ fontSize: 13, color: "#15803d", lineHeight: 1.6 }}>
                  If <strong>{forgotEmail}</strong> is registered, you'll receive a
                  password reset link within a minute. Check your spam folder if you
                  don't see it.
                </div>
              </div>
            ) : (
              /* ── Email input form ── */
              <>
                <div style={{ marginBottom: 16 }}>
                  <label style={label}>Email address</label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={e => { setForgotEmail(e.target.value); setErr(""); }}
                    onKeyDown={e => e.key === "Enter" && handleForgot()}
                    placeholder="you@example.com"
                    autoFocus
                    style={inputStyle}
                    onFocus={focusOn} onBlur={focusOff}
                  />
                </div>

                {err && <ErrorBox msg={err}/>}

                <button
                  onClick={handleForgot}
                  disabled={!forgotEmail.trim() || busy}
                  style={btnStyle(!forgotEmail.trim() || busy)}>
                  {busy ? "Sending…" : "Send reset link →"}
                </button>
              </>
            )}

            <div style={{ textAlign: "center", marginTop: 18, fontSize: 13, color: "#8a8daa" }}>
              <button onClick={() => switchTab("login")} style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#6d5df5", fontWeight: 700, fontSize: 13, fontFamily: "inherit", padding: 0,
              }}>← Back to sign in</button>
            </div>
          </>)}

          {/* ── SIGN UP TAB ── */}
          {!linkPending && tab === "signup" && !showConsent && (<>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#13142b", marginBottom: 4 }}>Create your account</div>
            <div style={{ fontSize: 14, color: "#8a8daa", marginBottom: 22 }}>
              Join myInvestorCircle and start sharing ideas with trusted contacts.
            </div>

            {/* Name row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={label}>First name <span style={{ color: "#c53030" }}>*</span></label>
                <input value={firstName} autoFocus
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="Ankur"
                  style={inputStyle} onFocus={focusOn} onBlur={focusOff}/>
              </div>
              <div>
                <label style={label}>Last name</label>
                <input value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Gupta"
                  style={inputStyle} onFocus={focusOn} onBlur={focusOff}/>
              </div>
            </div>

            {/* Username — mandatory */}
            <div style={field}>
              <label style={label}>
                Username <span style={{ color: "#c53030" }}>*</span>
              </label>
              <div style={{ position: "relative" }}>
                <span style={{
                  position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)",
                  color: "#8a8daa", fontSize: 14, pointerEvents: "none", userSelect: "none",
                }}>@</span>
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  placeholder="your_username"
                  maxLength={20}
                  style={{ ...inputStyle, paddingLeft: 28, paddingRight: 32 }}
                  onFocus={focusOn} onBlur={focusOff}
                />
                <span style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", fontSize: 14 }}>
                  {unStatus === "checking"  && <span style={{ color: "#8a8daa", fontSize: 12 }}>…</span>}
                  {unStatus === "available" && <span style={{ color: "#38a169" }}>✓</span>}
                  {unStatus === "taken"     && <span style={{ color: "#c53030" }}>✗</span>}
                  {unStatus === "invalid"   && <span style={{ color: "#c53030" }}>✗</span>}
                </span>
              </div>
              {unStatus === "available" && username && (
                <div style={{ fontSize: 12, color: "#38a169", marginTop: 4 }}>✓ @{username} is available</div>
              )}
              {unStatus === "taken" && (
                <div style={{ fontSize: 12, color: "#c53030", marginTop: 4 }}>@{username} is already taken — try another</div>
              )}
              {unStatus === "invalid" && username && (
                <div style={{ fontSize: 12, color: "#c53030", marginTop: 4 }}>5–20 characters, lowercase letters, numbers and underscores only</div>
              )}
              <div style={{ fontSize: 12, color: "#8a8daa", marginTop: 5, lineHeight: 1.5 }}>
                This creates your <strong>permanent public profile link</strong> — e.g.{" "}
                <span style={{ fontFamily: "monospace", fontSize: 11 }}>myinvestorcircle.app/#/investor/<em>yourname</em></span>.
                Choose wisely — it cannot be changed once set.
              </div>
            </div>

            <div style={field}>
              <label style={label}>Email address <span style={{ color: "#c53030" }}>*</span></label>
              <input type="email" value={signupEmail}
                onChange={e => setSignupEmail(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle} onFocus={focusOn} onBlur={focusOff}/>
            </div>

            <div style={field}>
              <label style={label}>Password <span style={{ color: "#c53030" }}>*</span></label>
              <div style={{ position: "relative" }}>
                <input type={showPw ? "text" : "password"} value={signupPassword}
                  onChange={e => setSignupPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  maxLength={25}
                  style={{ ...inputStyle, paddingRight: 44 }} onFocus={focusOn} onBlur={focusOff}/>
                <button onClick={() => setShowPw(v => !v)} style={eyeBtn}>
                  {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
              {/* Always-visible requirements checklist */}
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                {[
                  { key: "length",    met: pwCheck(signupPassword).length,    text: "6–25 characters" },
                  { key: "hasLetter", met: pwCheck(signupPassword).hasLetter, text: "At least one letter (a–z)" },
                  { key: "hasNumber", met: pwCheck(signupPassword).hasNumber, text: "At least one number (0–9)" },
                ].map(({ key, met, text }) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                    <span style={{
                      width: 16, height: 16, borderRadius: "50%", flexShrink: 0, fontSize: 10,
                      display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
                      background: met ? "#38a16920" : "#f2f2fa",
                      color: met ? "#38a169" : "#b0b3cc",
                      border: `1px solid ${met ? "#38a169" : "#dde0f0"}`,
                      transition: "all .2s",
                    }}>
                      {met ? "✓" : "·"}
                    </span>
                    <span style={{ color: met ? "#38a169" : "#8a8daa", transition: "color .2s" }}>{text}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={label}>Confirm password <span style={{ color: "#c53030" }}>*</span></label>
              <div style={{ position: "relative" }}>
                <input type={showCpw ? "text" : "password"} value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && beginSignup()}
                  placeholder="••••••••"
                  maxLength={25}
                  style={{ ...inputStyle, paddingRight: 44 }} onFocus={focusOn} onBlur={focusOff}/>
                <button onClick={() => setShowCpw(v => !v)} style={eyeBtn}>
                  {showCpw ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
              {confirmPassword.length > 0 && confirmPassword !== signupPassword && (
                <div style={{ fontSize: 12, color: "#c53030", marginTop: 4 }}>Passwords do not match</div>
              )}
              {confirmPassword.length > 0 && confirmPassword === signupPassword && pwValid(signupPassword) && (
                <div style={{ fontSize: 12, color: "#38a169", marginTop: 4 }}>✓ Passwords match</div>
              )}
            </div>

            {err && <ErrorBox msg={err}/>}

            <button onClick={beginSignup}
              disabled={
                !firstName.trim() ||
                !username || unStatus !== "available" ||
                !signupEmail.trim() ||
                !pwValid(signupPassword) ||
                signupPassword !== confirmPassword ||
                busy
              }
              style={btnStyle(
                !firstName.trim() ||
                !username || unStatus !== "available" ||
                !signupEmail.trim() ||
                !pwValid(signupPassword) ||
                signupPassword !== confirmPassword ||
                busy
              )}>
              Continue →
            </button>

            <div style={{ textAlign: "center", marginTop: 18, fontSize: 13, color: "#8a8daa" }}>
              Already have an account?{" "}
              <button onClick={() => switchTab("login")} style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#6d5df5", fontWeight: 700, fontSize: 13, fontFamily: "inherit", padding: 0,
              }}>Sign in →</button>
            </div>
          </>)}

          {/* ── SIGN UP TAB — Step 2: consent (account not created until agreed) ── */}
          {!linkPending && tab === "signup" && showConsent && (<>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#13142b", marginBottom: 4 }}>Just one more thing</div>
            <div style={{ fontSize: 14, color: "#8a8daa", marginBottom: 22, lineHeight: 1.5 }}>
              Confirm you're okay with how myInvestorCircle works. You can fill in the rest of your
              profile anytime from Track Record.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 22 }}>
              {[
                [consentTerms, setConsentTerms, "I agree to the Terms of Service and Privacy Policy"],
                [consentData, setConsentData, "I consent to myInvestorCircle storing and publicly displaying my investment ideas"],
              ].map(([checked, setChecked, text], i) => (
                <label key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", fontSize: 13, color: "#4a4d6a", lineHeight: 1.5 }}>
                  <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
                    style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, accentColor: "#6d5df5" }}/>
                  <span>{text} <span style={{ color: "#c53030" }}>*</span></span>
                </label>
              ))}
            </div>

            {err && <ErrorBox msg={err}/>}

            <button onClick={completeSignup}
              disabled={!consentTerms || !consentData || busy}
              style={btnStyle(!consentTerms || !consentData || busy)}>
              {busy ? "Creating account…" : "Agree & create account →"}
            </button>

            <div style={{ textAlign: "center", marginTop: 14, fontSize: 13, color: "#8a8daa" }}>
              <button onClick={() => { setShowConsent(false); setErr(""); }} style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#8a8daa", fontSize: 13, fontFamily: "inherit", padding: 0,
                textDecoration: "underline", textUnderlineOffset: 3,
              }}>← Back</button>
            </div>
          </>)}

        </div>

        <div style={{ textAlign: "center", marginTop: 18, fontSize: 11.5, color: "#2a2c44" }}>
          Your data stays private · Invite-only community
        </div>
      </div>
    </div>
  );
}

/* ── Shared small components ─────────────────────────────────────────────── */
function ErrorBox({ msg }) {
  return (
    <div style={{
      background: "#fff3f3", border: "1px solid #ffd0d0",
      borderRadius: 10, padding: "10px 13px", marginBottom: 16,
      fontSize: 13.5, color: "#c53030",
      display: "flex", alignItems: "flex-start", gap: 8,
    }}>
      <span style={{ fontSize: 16, marginTop: -1 }}>⚠</span>
      <span>{msg}</span>
    </div>
  );
}

function btnStyle(disabled) {
  return {
    width: "100%", padding: "13px", borderRadius: 11,
    background: "linear-gradient(120deg,#6d5df5,#9a55ee 55%,#cf52d8)",
    border: "none", color: "#fff", fontSize: 15, fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    fontFamily: "inherit", transition: "opacity .15s",
    letterSpacing: "-.1px",
  };
}
