import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "./AuthContext";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "./firebase";
import { sql } from "./supabaseClient";

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

  const [tab,     setTab]     = useState(pendingUsername || referralCode ? "signup" : "login");
  const [busy,    setBusy]    = useState(false);
  const [err,     setErr]     = useState("");
  const [showPw,  setShowPw]  = useState(false);
  const [showCpw, setShowCpw] = useState(false);

  // ── Login fields ────────────────────────────────────────────────────────────
  const [loginEmail,    setLoginEmail]    = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // ── Sign up fields ──────────────────────────────────────────────────────────
  const [firstName,       setFirstName]       = useState("");
  const [lastName,        setLastName]         = useState("");
  const [username,        setUsername]         = useState("");
  const [unStatus,        setUnStatus]         = useState("idle"); // idle|checking|available|taken|invalid
  const [signupEmail,     setSignupEmail]      = useState("");
  const [signupPassword,  setSignupPassword]   = useState("");
  const [confirmPassword, setConfirmPassword]  = useState("");

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword) return;
    setBusy(true); setErr("");
    try {
      await login(loginEmail.trim(), loginPassword);
      // onAuthStateChanged in AuthContext handles everything after this
    } catch (e) {
      setErr(friendlyError(e.code));
      setBusy(false);
    }
  };

  const handleSignup = async () => {
    if (!firstName.trim())                  { setErr("First name is required.");                                  return; }
    if (!username)                           { setErr("Username is required.");                                    return; }
    if (unStatus !== "available")            { setErr("Please choose a valid, available username.");               return; }
    if (!signupEmail.trim())                 { setErr("Email address is required.");                               return; }
    if (!pwValid(signupPassword))            { setErr("Password must be 6–25 characters with a letter and number."); return; }
    if (signupPassword !== confirmPassword)  { setErr("Passwords do not match.");                                  return; }
    setBusy(true); setErr("");
    try {
      // Create Firebase auth account
      const cred = await createUserWithEmailAndPassword(auth, signupEmail.trim(), signupPassword);
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

      // ── CRITICAL ORDER ──────────────────────────────────────────────────────
      // Write the correct name/username to Neon FIRST, before calling
      // Firebase updateProfile. Reason: updateProfile triggers onAuthStateChanged
      // in AuthContext, which reads back the DB. If the DB write hasn't happened
      // yet, AuthContext falls back to email.split("@")[0] as first_name and
      // overwrites the profile state with the wrong name.
      if (sql) {
        try {
          await sql`
            INSERT INTO user_profiles (id, email, full_name, first_name, last_name, is_admin, username)
            VALUES (
              ${cred.user.uid}, ${signupEmail.trim()}, ${fullName},
              ${firstName.trim()}, ${lastName.trim() || ""}, false,
              ${username.trim() || null}
            )
            ON CONFLICT (id) DO UPDATE SET
              first_name = EXCLUDED.first_name,
              last_name  = EXCLUDED.last_name,
              full_name  = EXCLUDED.full_name,
              username   = COALESCE(EXCLUDED.username, user_profiles.username),
              updated_at = now()
          `;
        } catch (dbErr) {
          console.warn("Profile DB write failed:", dbErr.message);
          // Non-fatal — AuthContext will attempt its own upsert on auth state change
        }
      }

      // Now set Firebase displayName — this triggers onAuthStateChanged in AuthContext,
      // which will read back the DB (now already containing the correct names).
      await updateProfile(cred.user, { displayName: fullName });

      // Send welcome / security-confirmation email.
      // Fire-and-forget — email failure must never break the signup flow.
      const emailApi = (import.meta.env.VITE_CAS_API_URL || 'https://investor-circle.vercel.app') + '/api/email';
      fetch(emailApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:       'signup_welcome',
          to_email:   signupEmail.trim(),
          first_name: firstName.trim(),
          full_name:  fullName,
        }),
      }).catch(() => {}); // intentionally not awaited — non-fatal

      // Auth state change fires → AuthContext logs user in → App.jsx referral processing runs
    } catch (e) {
      setErr(friendlyError(e.code, true));
      setBusy(false);
    }
  };

  const switchTab = (t) => { setTab(t); setErr(""); };

  // ── Username availability check (debounced 500ms) ───────────────────────────
  const USERNAME_RE = /^[a-z0-9_]{5,20}$/;
  React.useEffect(() => {
    if (!username) { setUnStatus("idle"); return; }
    if (!USERNAME_RE.test(username)) { setUnStatus("invalid"); return; }
    setUnStatus("checking");
    const t = setTimeout(async () => {
      try {
        if (!sql) { setUnStatus("available"); return; }
        const rows = await sql`SELECT id FROM user_profiles WHERE username = ${username} LIMIT 1`;
        setUnStatus(rows.length === 0 ? "available" : "taken");
      } catch { setUnStatus("available"); } // fail open
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
      padding: 24, position: "relative", overflow: "hidden",
    }}>
      {/* Ambient glow */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: `radial-gradient(700px 500px at 15% -5%, rgba(109,93,245,.45), transparent 55%),
                     radial-gradient(600px 400px at 90% 105%, rgba(207,82,216,.28), transparent 55%)`,
      }}/>

      <div style={{ width: "100%", maxWidth: 420, position: "relative" }}>

        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <img
            src="/mic-logo.png"
            alt="myInvestorCircle"
            style={{ width: 80, height: 80, margin: "0 auto 15px", display: "block" }}
          />
          <div style={{ fontSize: 23, fontWeight: 800, color: "#fff", letterSpacing: "-.3px" }}>
            myInvestorCircle
          </div>
          <div style={{ fontSize: 14, color: "#6a6d90", marginTop: 5 }}>
            Your private investing circle
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

          {/* ── LOGIN TAB ── */}
          {tab === "login" && (<>
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

            <div style={{ textAlign: "center", marginTop: 18, fontSize: 13, color: "#8a8daa" }}>
              New here?{" "}
              <button onClick={() => switchTab("signup")} style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#6d5df5", fontWeight: 700, fontSize: 13, fontFamily: "inherit", padding: 0,
              }}>Create an account →</button>
            </div>
          </>)}

          {/* ── SIGN UP TAB ── */}
          {tab === "signup" && (<>
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
              {/* Status messages */}
              {unStatus === "available" && username && (
                <div style={{ fontSize: 12, color: "#38a169", marginTop: 4 }}>✓ @{username} is available</div>
              )}
              {unStatus === "taken" && (
                <div style={{ fontSize: 12, color: "#c53030", marginTop: 4 }}>@{username} is already taken — try another</div>
              )}
              {unStatus === "invalid" && username && (
                <div style={{ fontSize: 12, color: "#c53030", marginTop: 4 }}>5–20 characters, lowercase letters, numbers and underscores only</div>
              )}
              {/* Always-visible explanation */}
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
                  onKeyDown={e => e.key === "Enter" && handleSignup()}
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

            <button onClick={handleSignup}
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
              {busy ? "Creating account…" : "Create account →"}
            </button>

            <div style={{ textAlign: "center", marginTop: 18, fontSize: 13, color: "#8a8daa" }}>
              Already have an account?{" "}
              <button onClick={() => switchTab("login")} style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#6d5df5", fontWeight: 700, fontSize: 13, fontFamily: "inherit", padding: 0,
              }}>Sign in →</button>
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
