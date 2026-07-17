import React, { useState } from "react";
import { Eye, EyeOff, ChevronDown, ChevronUp, Shield } from "lucide-react";
import { useAuth } from "./AuthContext";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "./firebase";
import { sql } from "./supabaseClient";

/* ── Consent version — bump this string whenever terms change.
   The version is persisted to user_profiles so you can identify
   which users consented to which version. ─────────────────────── */
const CONSENT_VERSION = "v1.0-2025";

/* ── Full platform consent text ─────────────────────────────────
   Written to be future-proof: covers all current and future data
   types without enumerating them exhaustively. Language avoids
   unenforceable waivers while placing responsibility on users
   where appropriate.                                            ── */
const PLATFORM_TERMS = [
  {
    heading: "User Responsibility",
    body: `You are solely responsible for all information, content, documents, recommendations, opinions, comments, portfolio information, holdings, watchlists, investment preferences, profile information, and any other data that you submit, upload, import, approve, or publish on the platform ("User Content").

You represent and warrant that you own, control, or have the necessary rights, permissions, and authority to submit or authorise the use of such User Content.

You agree not to knowingly submit false, misleading, manipulated, fraudulent, defamatory, unlawful, or infringing information.`,
  },
  {
    heading: "Authorisation to Process Your Data",
    body: `You authorise My Investor Circle to collect, store, process, analyse, organise, index, calculate, aggregate, display, reproduce, and otherwise use your User Content for the purpose of operating, maintaining, securing, improving, and enhancing the platform and its services.

You understand that My Investor Circle may use your User Content to generate analytics, performance metrics, historical records, portfolio insights, credibility scores, rankings, benchmarks, AI-generated summaries, research insights, recommendations history, community statistics, and other product features that may be introduced from time to time.

You acknowledge that such analytics and derived insights may continue to be displayed even if the underlying methodology evolves over time.`,
  },
  {
    heading: "Imported & Connected Data",
    body: `Where you choose to import information from external sources (including but not limited to CAS statements, broker statements, spreadsheets, documents, social platforms, APIs, or other supported sources), you expressly authorise My Investor Circle to retrieve, extract, process, structure, analyse, and display such information as part of your account and profile.

Imported information may require your review and approval before being made publicly visible, where applicable.`,
  },
  {
    heading: "Public Information",
    body: `Information that you choose, or authorise, to make public may be viewed, searched, indexed, shared, quoted, or referenced by other users, visitors, and search engines.

My Investor Circle cannot control how third parties may use information that has already been made publicly available, and this limitation applies irrespective of any future deletion of your content.`,
  },
  {
    heading: "Historical Record & Platform Integrity",
    body: `My Investor Circle may preserve historical records of your investment recommendations, portfolio snapshots (where applicable), profile changes, edits, timestamps, activity logs, and other platform interactions in order to maintain transparency, auditability, platform integrity, and historical accuracy.

Corrections or updates may be displayed together with historical records where appropriate, to accurately reflect how your information has changed over time.`,
  },
  {
    heading: "Platform Analytics",
    body: `My Investor Circle may calculate investment performance, portfolio statistics, recommendation performance, credibility indicators, rankings, and other analytical measures using methodologies determined by the platform.

Such calculations are intended for informational purposes only and may be updated or refined over time. They do not constitute financial advice.`,
  },
  {
    heading: "No Investment Advice",
    body: `My Investor Circle is a technology platform designed to record, organise, analyse, and present user-generated investment information.

My Investor Circle does not provide investment advice, research recommendations, portfolio management services, or personalised financial advice unless explicitly stated otherwise under applicable law.

You remain solely responsible for your own investment decisions, and nothing on the platform should be construed as a recommendation to buy or sell any security or asset.`,
  },
  {
    heading: "Security & Data Processing",
    body: `My Investor Circle implements reasonable administrative, technical, and organisational safeguards designed to protect user information in accordance with its Privacy Policy.

However, no electronic system or method of data transmission or storage can be guaranteed to be completely secure. By using the platform you acknowledge this inherent limitation of digital services.

Your personal information will be processed in accordance with the Privacy Policy, which is incorporated into these terms by reference.`,
  },
  {
    heading: "Suspension & Enforcement",
    body: `My Investor Circle may suspend, restrict, remove, or terminate your account or remove content if it reasonably believes that you have violated applicable laws, these Terms, the Community Guidelines, or the rights of others.

Where practicable, My Investor Circle will notify you of such action and the reason for it, except where disclosure would be contrary to law or prejudicial to an ongoing investigation.`,
  },
];

/* ── Helpers ─────────────────────────────────────────────────── */
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

/* ── ConsentCheckbox — summary + expandable full clause ─────── */
function ConsentCheckbox({ checked, onChange, required, label, sublabel, expandedContent, id }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      border: `1.5px solid ${checked ? "#6d5df5" : "#e8e8f2"}`,
      borderRadius: 12,
      overflow: "hidden",
      transition: "border-color .2s",
      marginBottom: 10,
    }}>
      {/* Summary row */}
      <div style={{ display: "flex", gap: 12, padding: "12px 14px", alignItems: "flex-start" }}>
        {/* Custom checkbox */}
        <div
          role="checkbox"
          aria-checked={checked}
          tabIndex={0}
          onClick={() => onChange(!checked)}
          onKeyDown={e => (e.key === " " || e.key === "Enter") && onChange(!checked)}
          style={{
            width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
            border: `2px solid ${checked ? "#6d5df5" : "#c0c4e0"}`,
            background: checked ? "#6d5df5" : "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "all .15s", outline: "none",
          }}
        >
          {checked && (
            <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
              <path d="M1 4L4 7.5L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>

        {/* Label block */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span
              onClick={() => onChange(!checked)}
              style={{ fontSize: 13, fontWeight: 700, color: "#13142b", cursor: "pointer", lineHeight: 1.4 }}
            >
              {label}
            </span>
            {required && (
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: ".04em",
                background: "#f0eeff", color: "#6d5df5",
                padding: "2px 6px", borderRadius: 4,
              }}>REQUIRED</span>
            )}
            {!required && (
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: ".04em",
                background: "#f2f9f5", color: "#38a169",
                padding: "2px 6px", borderRadius: 4,
              }}>OPTIONAL</span>
            )}
          </div>
          {sublabel && (
            <div style={{ fontSize: 12, color: "#8a8daa", marginTop: 3, lineHeight: 1.5 }}>
              {sublabel}
            </div>
          )}
          {/* Expand toggle */}
          {expandedContent && (
            <button
              type="button"
              onClick={() => setOpen(v => !v)}
              style={{
                marginTop: 6, padding: 0, background: "none", border: "none",
                cursor: "pointer", fontSize: 12, color: "#6d5df5", fontWeight: 700,
                display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit",
              }}
            >
              {open ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
              {open ? "Hide full terms" : "Read full terms"}
            </button>
          )}
        </div>
      </div>

      {/* Expanded full text */}
      {open && expandedContent && (
        <div style={{
          borderTop: "1.5px solid #f0f0fa",
          background: "#fafafa",
          maxHeight: 320,
          overflowY: "auto",
          padding: "14px 16px",
        }}>
          {expandedContent}
        </div>
      )}
    </div>
  );
}

/* ── Full terms body component ───────────────────────────────── */
function PlatformTermsBody() {
  return (
    <div style={{ fontFamily: "inherit" }}>
      <p style={{ fontSize: 12.5, color: "#4a4d6a", lineHeight: 1.6, marginTop: 0, marginBottom: 14 }}>
        By creating an account on My Investor Circle ("the platform"), you acknowledge and agree to the following:
      </p>
      {PLATFORM_TERMS.map((section, i) => (
        <div key={i} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#13142b", marginBottom: 5, letterSpacing: ".01em" }}>
            {i + 1}. {section.heading}
          </div>
          {section.body.split("\n\n").map((para, j) => (
            <p key={j} style={{ fontSize: 12, color: "#4a4d6a", lineHeight: 1.65, margin: "0 0 8px" }}>
              {para}
            </p>
          ))}
        </div>
      ))}
      <p style={{ fontSize: 11.5, color: "#8a8daa", marginTop: 8, marginBottom: 0, fontStyle: "italic" }}>
        These terms are subject to change. Continued use of the platform after notice of changes constitutes acceptance of the revised terms.
      </p>
    </div>
  );
}

/* ── Main LoginPage ──────────────────────────────────────────── */
export default function LoginPage() {
  const { login } = useAuth();
  const pendingUsername = sessionStorage.getItem("pending_connect_username");

  const [tab,     setTab]     = useState(pendingUsername ? "signup" : "login");
  const [busy,    setBusy]    = useState(false);
  const [err,     setErr]     = useState("");
  const [showPw,  setShowPw]  = useState(false);
  const [showCpw, setShowCpw] = useState(false);

  // Login fields
  const [loginEmail,    setLoginEmail]    = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Sign-up fields
  const [firstName,       setFirstName]      = useState("");
  const [lastName,        setLastName]       = useState("");
  const [username,        setUsername]       = useState("");
  const [unStatus,        setUnStatus]       = useState("idle");
  const [signupEmail,     setSignupEmail]    = useState("");
  const [signupPassword,  setSignupPassword] = useState("");
  const [confirmPassword, setConfirmPassword]= useState("");

  // Consent state
  const [consentTerms,     setConsentTerms]     = useState(false);
  const [consentPrivacy,   setConsentPrivacy]   = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);

  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword) return;
    setBusy(true); setErr("");
    try {
      await login(loginEmail.trim(), loginPassword);
    } catch (e) {
      setErr(friendlyError(e.code));
      setBusy(false);
    }
  };

  const handleSignup = async () => {
    if (!firstName.trim())                 { setErr("First name is required.");                                   return; }
    if (!username)                          { setErr("Username is required.");                                     return; }
    if (unStatus !== "available")           { setErr("Please choose a valid, available username.");                return; }
    if (!signupEmail.trim())                { setErr("Email address is required.");                                return; }
    if (!pwValid(signupPassword))           { setErr("Password must be 6–25 characters with a letter and number."); return; }
    if (signupPassword !== confirmPassword) { setErr("Passwords do not match.");                                   return; }
    if (!consentTerms)                      { setErr("Please accept the Platform Terms & Data Consent to continue."); return; }
    if (!consentPrivacy)                    { setErr("Please accept the Privacy Consent to continue.");            return; }

    setBusy(true); setErr("");
    try {
      const cred = await createUserWithEmailAndPassword(auth, signupEmail.trim(), signupPassword);
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      await updateProfile(cred.user, { displayName: fullName });

      if (sql) {
        try {
          await sql`
            INSERT INTO user_profiles (
              id, email, full_name, first_name, last_name, is_admin, username,
              platform_consent, privacy_consent, marketing_consent,
              consent_version, consent_at
            )
            VALUES (
              ${cred.user.uid}, ${signupEmail.trim()}, ${fullName},
              ${firstName.trim()}, ${lastName.trim() || ""}, false,
              ${username.trim() || null},
              ${consentTerms}, ${consentPrivacy}, ${consentMarketing},
              ${CONSENT_VERSION}, NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
              first_name        = EXCLUDED.first_name,
              last_name         = EXCLUDED.last_name,
              full_name         = EXCLUDED.full_name,
              username          = COALESCE(EXCLUDED.username, user_profiles.username),
              platform_consent  = EXCLUDED.platform_consent,
              privacy_consent   = EXCLUDED.privacy_consent,
              marketing_consent = EXCLUDED.marketing_consent,
              consent_version   = EXCLUDED.consent_version,
              consent_at        = EXCLUDED.consent_at,
              updated_at        = NOW()
          `;
        } catch (_) { /* non-fatal — AuthContext will upsert basic fields on auth state change */ }
      }
    } catch (e) {
      setErr(friendlyError(e.code, true));
      setBusy(false);
    }
  };

  const switchTab = (t) => { setTab(t); setErr(""); };

  // Username availability check (debounced 500ms)
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
      } catch { setUnStatus("available"); }
    }, 500);
    return () => clearTimeout(t);
  }, [username]);

  // Computed: is signup form valid (all required fields + required consents)
  const signupReady =
    firstName.trim() &&
    username && unStatus === "available" &&
    signupEmail.trim() &&
    pwValid(signupPassword) &&
    signupPassword === confirmPassword &&
    consentTerms && consentPrivacy &&
    !busy;

  const inputStyle = {
    width: "100%", padding: "11px 14px", borderRadius: 10,
    border: "1.5px solid #e8e8f2", fontSize: 14, outline: "none",
    fontFamily: "inherit", color: "#13142b", background: "#fff",
    boxSizing: "border-box", transition: "border-color .15s",
  };
  const focusOn  = e => e.target.style.borderColor = "#6d5df5";
  const focusOff = e => e.target.style.borderColor = "#e8e8f2";
  const labelSt  = { display: "block", fontSize: 13, fontWeight: 700, color: "#4a4d6a", marginBottom: 6 };
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

      <div style={{ width: "100%", maxWidth: 440, position: "relative" }}>

        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            width: 58, height: 58, borderRadius: 17,
            background: "linear-gradient(135deg,#6d5df5,#cf52d8)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 23, fontWeight: 800, color: "#fff",
            margin: "0 auto 15px",
            boxShadow: "0 12px 40px rgba(109,93,245,.45)",
          }}>mic</div>
          <div style={{ fontSize: 23, fontWeight: 800, color: "#fff", letterSpacing: "-.3px" }}>
            myInvestorCircle
          </div>
          <div style={{ fontSize: 14, color: "#6a6d90", marginTop: 5 }}>
            Your private investing circle
          </div>
        </div>

        {/* Pending-connect banner */}
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

        {/* Card */}
        <div style={{
          background: "#ffffff", borderRadius: 22,
          padding: "28px 30px 26px",
          boxShadow: "0 32px 90px rgba(0,0,0,.45)",
        }}>

          {/* Tab switcher */}
          <div style={{
            display: "flex", marginBottom: 24,
            background: "#f2f2fa", borderRadius: 12, padding: 4,
          }}>
            {[["login", "Sign in"], ["signup", "Create account"]].map(([t, lbl]) => (
              <button key={t} onClick={() => switchTab(t)} style={{
                flex: 1, padding: "9px 0", borderRadius: 9,
                border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 700,
                background: tab === t ? "#fff" : "transparent",
                color: tab === t ? "#13142b" : "#8a8daa",
                boxShadow: tab === t ? "0 1px 6px rgba(0,0,0,.1)" : "none",
                fontFamily: "inherit", transition: "all .15s",
              }}>{lbl}</button>
            ))}
          </div>

          {/* ── LOGIN ── */}
          {tab === "login" && (<>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#13142b", marginBottom: 4 }}>Welcome back</div>
            <div style={{ fontSize: 14, color: "#8a8daa", marginBottom: 22 }}>
              Sign in to your myInvestorCircle account.
            </div>

            <div style={field}>
              <label style={labelSt}>Email address</label>
              <input type="email" value={loginEmail} autoFocus
                onChange={e => setLoginEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                placeholder="you@example.com"
                style={inputStyle} onFocus={focusOn} onBlur={focusOff}/>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelSt}>Password</label>
              <div style={{ position: "relative" }}>
                <input type={showPw ? "text" : "password"} value={loginPassword}
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
              <button onClick={() => switchTab("signup")} style={linkBtn}>Create an account →</button>
            </div>
          </>)}

          {/* ── SIGN UP ── */}
          {tab === "signup" && (<>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#13142b", marginBottom: 4 }}>Create your account</div>
            <div style={{ fontSize: 14, color: "#8a8daa", marginBottom: 22 }}>
              Join myInvestorCircle and start sharing ideas with trusted contacts.
            </div>

            {/* Name row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={labelSt}>First name <Req/></label>
                <input value={firstName} autoFocus
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="Ankur"
                  style={inputStyle} onFocus={focusOn} onBlur={focusOff}/>
              </div>
              <div>
                <label style={labelSt}>Last name</label>
                <input value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Gupta"
                  style={inputStyle} onFocus={focusOn} onBlur={focusOff}/>
              </div>
            </div>

            {/* Username */}
            <div style={field}>
              <label style={labelSt}>Username <Req/></label>
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
                  {(unStatus === "taken" || unStatus === "invalid") && <span style={{ color: "#c53030" }}>✗</span>}
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
                Your permanent public profile URL — e.g.{" "}
                <span style={{ fontFamily: "monospace", fontSize: 11 }}>myinvestorcircle.com/#/investor/<em>yourname</em></span>.
                Cannot be changed once set.
              </div>
            </div>

            {/* Email */}
            <div style={field}>
              <label style={labelSt}>Email address <Req/></label>
              <input type="email" value={signupEmail}
                onChange={e => setSignupEmail(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle} onFocus={focusOn} onBlur={focusOff}/>
            </div>

            {/* Password */}
            <div style={field}>
              <label style={labelSt}>Password <Req/></label>
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

            {/* Confirm password */}
            <div style={{ marginBottom: 22 }}>
              <label style={labelSt}>Confirm password <Req/></label>
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

            {/* ── Consent Section ───────────────────────────────── */}
            <div style={{
              borderTop: "1.5px solid #f0f0fa",
              paddingTop: 18,
              marginBottom: 16,
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 14,
              }}>
                <Shield size={15} color="#6d5df5"/>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#13142b" }}>
                  Consent & Legal Agreement
                </span>
              </div>

              {/* Consent 1: Platform Terms + Data */}
              <ConsentCheckbox
                id="consent-terms"
                checked={consentTerms}
                onChange={setConsentTerms}
                required
                label="Platform Terms & Data Consent"
                sublabel="I have read and agree to the Terms of Service, Community Guidelines, and authorise My Investor Circle to process my data as described."
                expandedContent={<PlatformTermsBody/>}
              />

              {/* Consent 2: Privacy */}
              <ConsentCheckbox
                id="consent-privacy"
                checked={consentPrivacy}
                onChange={setConsentPrivacy}
                required
                label="Privacy Policy Consent"
                sublabel="I consent to My Investor Circle collecting, storing, processing, and using my personal information in accordance with the Privacy Policy."
                expandedContent={
                  <div style={{ fontSize: 12, color: "#4a4d6a", lineHeight: 1.65 }}>
                    <p style={{ marginTop: 0 }}>
                      My Investor Circle collects personal information including your name, email address, username, investment activity, imported data, and usage data when you create an account or use the platform.
                    </p>
                    <p>
                      This information is used to operate the platform, personalise your experience, provide analytics and performance insights, ensure platform security, and comply with legal obligations.
                    </p>
                    <p>
                      My Investor Circle implements reasonable technical and organisational safeguards to protect your personal information. Your data will not be sold to third parties.
                    </p>
                    <p style={{ marginBottom: 0 }}>
                      You may request access to, correction of, or deletion of your personal data at any time by contacting the platform administrators. Certain data may be retained for legal or audit purposes even after account deletion.
                    </p>
                  </div>
                }
              />

              {/* Consent 3: Marketing (optional) */}
              <ConsentCheckbox
                id="consent-marketing"
                checked={consentMarketing}
                onChange={setConsentMarketing}
                required={false}
                label="Product & Marketing Updates"
                sublabel="I'd like to receive product updates, newsletters, feature announcements, research content, and other communications from My Investor Circle."
              />
            </div>

            {err && <ErrorBox msg={err}/>}

            <button onClick={handleSignup} disabled={!signupReady} style={btnStyle(!signupReady)}>
              {busy ? "Creating account…" : "Create account →"}
            </button>

            <p style={{
              fontSize: 11, color: "#a0a3bc", textAlign: "center",
              marginTop: 12, marginBottom: 0, lineHeight: 1.6,
            }}>
              By creating an account you confirm you are at least 18 years of age
              and accept the terms above. Consent version: {CONSENT_VERSION}.
            </p>

            <div style={{ textAlign: "center", marginTop: 14, fontSize: 13, color: "#8a8daa" }}>
              Already have an account?{" "}
              <button onClick={() => switchTab("login")} style={linkBtn}>Sign in →</button>
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

/* ── Shared small components ─────────────────────────────────── */
function Req() {
  return <span style={{ color: "#c53030" }}>*</span>;
}

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

const linkBtn = {
  background: "none", border: "none", cursor: "pointer",
  color: "#6d5df5", fontWeight: 700, fontSize: 13,
  fontFamily: "inherit", padding: 0,
};

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
