import React, { useState } from "react";
import { useAuth } from "./AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState("");
  const [showPw, setShowPw]     = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) return;
    setBusy(true); setErr("");
    try {
      await login(email.trim(), password);
      // onAuthStateChanged in AuthContext handles the rest
    } catch (e) {
      const msg =
        e.code === "auth/user-not-found"     ? "No account found with this email." :
        e.code === "auth/wrong-password"     ? "Incorrect password. Please try again." :
        e.code === "auth/invalid-email"      ? "Please enter a valid email address." :
        e.code === "auth/invalid-credential" ? "Incorrect email or password." :
        e.code === "auth/too-many-requests"  ? "Too many attempts — please wait a moment, then try again." :
        e.code === "auth/user-disabled"      ? "This account has been disabled. Contact your admin." :
        "Sign in failed. Please check your credentials and try again.";
      setErr(msg);
      setBusy(false);
    }
  };

  const f = { // common input style
    width:"100%", padding:"11px 14px", borderRadius:10,
    border:"1.5px solid #e8e8f2", fontSize:14, outline:"none",
    fontFamily:"inherit", color:"#13142b", background:"#fff",
    boxSizing:"border-box", transition:"border-color .15s",
  };

  return (
    <div style={{
      minHeight:"100vh", background:"#0a0b18",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"'Plus Jakarta Sans',-apple-system,system-ui,sans-serif",
      padding:24, position:"relative", overflow:"hidden",
    }}>
      {/* Ambient glow */}
      <div style={{ position:"absolute", inset:0, pointerEvents:"none",
        background:`radial-gradient(700px 500px at 15% -5%, rgba(109,93,245,.45), transparent 55%),
                   radial-gradient(600px 400px at 90% 105%, rgba(207,82,216,.28), transparent 55%)`,
      }}/>

      <div style={{ width:"100%", maxWidth:400, position:"relative" }}>

        {/* Brand */}
        <div style={{ textAlign:"center", marginBottom:34 }}>
          <div style={{
            width:58, height:58, borderRadius:17,
            background:"linear-gradient(135deg,#6d5df5,#cf52d8)",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:23, fontWeight:800, color:"#fff",
            margin:"0 auto 15px",
            boxShadow:"0 12px 40px rgba(109,93,245,.45)",
          }}>ic</div>
          <div style={{ fontSize:23, fontWeight:800, color:"#fff", letterSpacing:"-.3px" }}>
            InvestorCircle
          </div>
          <div style={{ fontSize:14, color:"#6a6d90", marginTop:5 }}>
            Your private investing circle
          </div>
        </div>

        {/* Card */}
        <div style={{
          background:"#ffffff", borderRadius:22,
          padding:"32px 30px 28px",
          boxShadow:"0 32px 90px rgba(0,0,0,.45)",
        }}>
          <div style={{ fontSize:19, fontWeight:800, color:"#13142b", marginBottom:4 }}>
            Welcome back
          </div>
          <div style={{ fontSize:14, color:"#8a8daa", marginBottom:26 }}>
            Sign in with the email and password your admin set up for you.
          </div>

          {/* Email */}
          <div style={{ marginBottom:14 }}>
            <label style={{ display:"block", fontSize:13, fontWeight:700, color:"#4a4d6a", marginBottom:6 }}>
              Email address
            </label>
            <input
              type="email" value={email} autoFocus
              onChange={e=>setEmail(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&handleLogin()}
              placeholder="you@example.com"
              style={f}
              onFocus={e=>e.target.style.borderColor="#6d5df5"}
              onBlur={e=>e.target.style.borderColor="#e8e8f2"}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom:20 }}>
            <label style={{ display:"block", fontSize:13, fontWeight:700, color:"#4a4d6a", marginBottom:6 }}>
              Password
            </label>
            <div style={{ position:"relative" }}>
              <input
                type={showPw?"text":"password"} value={password}
                onChange={e=>setPassword(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                placeholder="••••••••"
                style={{ ...f, paddingRight:44 }}
                onFocus={e=>e.target.style.borderColor="#6d5df5"}
                onBlur={e=>e.target.style.borderColor="#e8e8f2"}
              />
              <button
                onClick={()=>setShowPw(v=>!v)}
                style={{
                  position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
                  background:"none", border:"none", cursor:"pointer", padding:4,
                  color:"#8a8daa", fontSize:12, fontWeight:600,
                }}
              >{showPw?"Hide":"Show"}</button>
            </div>
          </div>

          {/* Error */}
          {err && (
            <div style={{
              background:"#fff3f3", border:"1px solid #ffd0d0",
              borderRadius:10, padding:"10px 13px", marginBottom:16,
              fontSize:13.5, color:"#c53030",
              display:"flex", alignItems:"flex-start", gap:8,
            }}>
              <span style={{ fontSize:16, marginTop:-1 }}>⚠</span>
              <span>{err}</span>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleLogin}
            disabled={!email.trim() || !password || busy}
            style={{
              width:"100%", padding:"13px", borderRadius:11,
              background:"linear-gradient(120deg,#6d5df5,#9a55ee 55%,#cf52d8)",
              border:"none", color:"#fff", fontSize:15, fontWeight:700,
              cursor: (!email.trim()||!password||busy) ? "not-allowed":"pointer",
              opacity: (!email.trim()||!password||busy) ? 0.6 : 1,
              fontFamily:"inherit", transition:"opacity .15s",
              letterSpacing:"-.1px",
            }}
          >
            {busy ? "Signing in…" : "Sign in →"}
          </button>

          <div style={{ textAlign:"center", marginTop:20, fontSize:13, color:"#8a8daa" }}>
            No account?&nbsp;
            <strong style={{ color:"#6d5df5" }}>Ask your admin for access.</strong>
          </div>
        </div>

        <div style={{ textAlign:"center", marginTop:18, fontSize:11.5, color:"#2a2c44" }}>
          Invite only · Your data stays private
        </div>
      </div>
    </div>
  );
}
