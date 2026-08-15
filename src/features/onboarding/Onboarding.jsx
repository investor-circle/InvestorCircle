import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X, UserPlus, Loader } from "lucide-react";
import { checkUsername as dbCheckUsername, saveUsername as dbSaveUsername, markOnboardingStep as dbMarkOnboardingStep } from "../../services/api/profileApi";
import { getSuggestedPeople as dbGetSuggestedPeople } from "../../services/api/lookupsApi";
import { sendConnectionRequest as dbSendConnectionRequest } from "../../services/api/connectionsApi";
import { computeIci } from "../../services/api/recommendationsApi";
import { Avatar } from "../../components/common";
import { initialsOf } from "../../utils/format";

const USERNAME_RE = /^[a-z0-9_]{5,20}$/;

/**
 * Phase 5.5 (revised again) — mandatory username + consent, one-time Discover.
 *
 * Product decision change from the earlier checklist design: username and
 * consent are no longer a skippable nudge — they're required before the
 * account can be used at all. Email signup collects both directly in
 * LoginPage.jsx (username on the form, consent as a step shown on "Create
 * account" click, before the Firebase account is even created), so by the
 * time an email-signup user lands here their profile is already complete
 * and MandatorySetupGate has nothing to do. Google sign-in has no signup
 * form, so those users — and anyone who drops off mid-setup on either path
 * before this completes — see MandatorySetupGate right after auth resolves,
 * gated purely on server-persisted profile state
 * (username / consent_terms_accepted / consent_data_accepted), so it
 * correctly resumes from wherever they left off on next login rather than
 * losing progress or re-asking for things already saved.
 *
 * Once that's satisfied, DiscoverModal shows exactly once (gated on
 * onboarding_discover_done) — a curated people list with Connect actions,
 * skippable, and never shown again once dismissed either way.
 *
 * Both render as portal overlays, not in-flow bars — this also means
 * neither needs to coordinate height with Home Feed's mobile fixed header
 * the way the old persistent checklist did (see git history if curious;
 * that whole coordination mechanism — --mic-setup-bar-h etc. — is gone).
 */
export function OnboardingGate({ user, profile, ME, patchProfile, setPage }) {
  const setupIncomplete = !profile?.username || !profile?.consent_terms_accepted || !profile?.consent_data_accepted;

  if (!profile) return null;
  if (setupIncomplete) {
    return <MandatorySetupGate user={user} profile={profile} patchProfile={patchProfile} />;
  }
  if (!profile.onboarding_discover_done) {
    return <DiscoverModal ME={ME} patchProfile={patchProfile} setPage={setPage} />;
  }
  return null;
}

/* ── Mandatory setup gate — username + consent ─────────────────────────── */

function MandatorySetupGate({ user, profile, patchProfile }) {
  const [username, setUsername] = useState("");
  const [unStatus, setUnStatus] = useState("idle"); // idle|checking|available|taken|invalid
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentData, setConsentData] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const usernameAlreadySet = !!profile?.username;

  useEffect(() => {
    if (usernameAlreadySet) { setUnStatus("available"); return; }
    if (!username) { setUnStatus("idle"); return; }
    if (!USERNAME_RE.test(username)) { setUnStatus("invalid"); return; }
    setUnStatus("checking");
    const t = setTimeout(async () => {
      const ok = await dbCheckUsername(username, user?.uid);
      setUnStatus(ok ? "available" : "taken");
    }, 500);
    return () => clearTimeout(t);
  }, [username, usernameAlreadySet, user?.uid]);

  const canContinue = unStatus === "available" && consentTerms && consentData && !busy;

  const submit = async () => {
    if (!canContinue) return;
    setBusy(true); setErr("");
    try {
      await dbSaveUsername(user.uid, usernameAlreadySet ? profile.username : username, { terms: true, data: true });
      patchProfile?.({
        username: usernameAlreadySet ? profile.username : username,
        consent_terms_accepted: true,
        consent_data_accepted: true,
      });
    } catch (e) {
      setErr(e.message || "Could not save — please try again.");
      setBusy(false);
    }
  };

  return createPortal(
    <div style={overlayStyle}>
      <div style={gateCardStyle}>
        <div style={{ fontSize: 19, fontWeight: 800, color: "#fff", marginBottom: 6 }}>Just two quick things</div>
        <div style={{ fontSize: 13.5, color: "rgba(255,255,255,.65)", lineHeight: 1.6, marginBottom: 22 }}>
          Set your username and confirm you're okay with how myInvestorCircle works.
          You can fill in the rest of your profile anytime from Track Record.
        </div>

        {!usernameAlreadySet && (
          <div style={{ marginBottom: 18 }}>
            <label style={gateLabelStyle}>Username</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,.4)", fontSize: 14, pointerEvents: "none" }}>@</span>
              <input
                value={username} autoFocus
                onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                maxLength={20} placeholder="your_username"
                style={{ ...gateInputStyle, paddingLeft: 28 }}
              />
            </div>
            <div style={{ marginTop: 6, fontSize: 12, minHeight: 16 }}>
              {unStatus === "checking" && <span style={{ color: "rgba(255,255,255,.4)", display: "flex", alignItems: "center", gap: 5 }}><Loader size={11} className="spin" /> Checking…</span>}
              {unStatus === "available" && username && <span style={{ color: "#4ade80", display: "flex", alignItems: "center", gap: 5 }}><Check size={11} /> Available</span>}
              {unStatus === "taken" && <span style={{ color: "#f87171", display: "flex", alignItems: "center", gap: 5 }}><X size={11} /> Already taken — try another</span>}
              {unStatus === "invalid" && username && <span style={{ color: "#f87171" }}>5–20 chars, lowercase letters, numbers and underscores only</span>}
            </div>
            <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.4)", marginTop: 6, lineHeight: 1.5 }}>
              This becomes your public profile link and can't be changed once set.
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>
          {[
            [consentTerms, setConsentTerms, "I agree to the Terms of Service and Privacy Policy"],
            [consentData, setConsentData, "I consent to myInvestorCircle storing and publicly displaying my investment recommendations"],
          ].map(([checked, setChecked, label], i) => (
            <label key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", fontSize: 12.5, color: "rgba(255,255,255,.75)", lineHeight: 1.5 }}>
              <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
                style={{ marginTop: 2, width: 15, height: 15, flexShrink: 0, accentColor: "#6d5df5" }} />
              <span>{label} <span style={{ color: "#c53030" }}>*</span></span>
            </label>
          ))}
        </div>

        {err && <div style={gateErrStyle}>{err}</div>}

        <button onClick={submit} disabled={!canContinue} style={gateBtnStyle(!canContinue)}>
          {busy ? <><Loader size={14} className="spin" /> Saving…</> : "Continue →"}
        </button>
      </div>
    </div>,
    document.body
  );
}

/* ── One-time Discover modal ────────────────────────────────────────────── */

function DiscoverModal({ ME, patchProfile, setPage }) {
  const [people, setPeople] = useState(null); // null = loading
  const [connecting, setConnecting] = useState({});
  const [connected, setConnected] = useState({});
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    dbGetSuggestedPeople().then(rows => { if (!cancelled) setPeople(rows); }).catch(() => { if (!cancelled) setPeople([]); });
    return () => { cancelled = true; };
  }, []);

  if (dismissed) return null;

  const finish = () => {
    patchProfile?.({ onboarding_discover_done: true });
    setDismissed(true);
    // Best-effort persistence — UI already moved on regardless; a failure
    // here just means the modal could reappear on next login.
    dbMarkOnboardingStep("discover").catch(() => {});
  };
  const exploreNetwork = () => { finish(); setPage?.("network"); };

  const connect = async (uid) => {
    setConnecting(c => ({ ...c, [uid]: true }));
    try {
      const result = await dbSendConnectionRequest(ME?.id, uid);
      if (!result?.error) setConnected(c => ({ ...c, [uid]: true }));
    } catch (_) { /* non-fatal — button just stays enabled */ }
    setConnecting(c => ({ ...c, [uid]: false }));
  };

  return createPortal(
    <div style={overlayStyle} onClick={finish}>
      <div style={discoverCardStyle} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 19, fontWeight: 800, color: "#fff", marginBottom: 6 }}>Discover your Investor Circle</div>
        <div style={{ fontSize: 13.5, color: "rgba(255,255,255,.65)", lineHeight: 1.6, marginBottom: 18 }}>
          Meet a few investors, explore their thinking, and find people you'd like in your circle.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto", marginBottom: 20 }}>
          {people === null && (
            <div style={{ padding: "24px 0", display: "flex", justifyContent: "center", color: "rgba(255,255,255,.4)" }}>
              <Loader size={18} className="spin" />
            </div>
          )}
          {people?.length === 0 && (
            <div style={{ padding: "16px 0", textAlign: "center", fontSize: 13, color: "rgba(255,255,255,.4)" }}>
              No investors to suggest just yet — check back soon.
            </div>
          )}
          {people?.map(p => {
            const hitPct = p.closed > 0 ? (p.wins / p.closed * 100) : 0;
            const riskAdj = Number(p.ret_stddev) > 0 ? Math.max(Number(p.median_ret) / Number(p.ret_stddev), 0) : 0;
            const ici = computeIci({
              years_history: Number(p.years_history) || 0, total: p.total,
              hit_rate_pct: hitPct, median_return: Number(p.median_ret) || 0,
              risk_adjusted_return: riskAdj, deleted_count: 0,
            });
            const isConnected = connected[p.id] || p.connection_status === "accepted";
            const isPending = connected[p.id] || p.connection_status === "pending";
            return (
              <div key={p.id} style={personRowStyle}>
                <Avatar f={{ initials: initialsOf(p.full_name || p.username || "?"), avatarUrl: p.avatar_url, color: p.avatar_color }} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.full_name || p.username}
                  </div>
                  <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.45)" }}>
                    {p.username ? `@${p.username}` : ""}{p.total ? ` · ${p.total} recs` : ""}{p.total ? ` · ICI ${ici.score}` : ""}
                  </div>
                </div>
                {isConnected || isPending ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#4ade80", fontWeight: 700, flexShrink: 0 }}>
                    <Check size={13} /> {isConnected ? "Connected" : "Pending"}
                  </span>
                ) : (
                  <button onClick={() => connect(p.id)} disabled={connecting[p.id]} style={connectBtnStyle}>
                    {connecting[p.id] ? <Loader size={12} className="spin" /> : <UserPlus size={12} />} Connect
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <button onClick={exploreNetwork} style={gateBtnStyle(false)}>Explore Network →</button>
        <button onClick={finish} style={laterBtnStyle}>I'll do this later</button>
      </div>
    </div>,
    document.body
  );
}

const overlayStyle = {
  position: "fixed", inset: 0, background: "rgba(13,14,30,.7)", backdropFilter: "blur(4px)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9500, padding: 20,
  overflowY: "auto",
};
const cardBase = {
  width: "100%", maxWidth: 440, background: "#16182a", borderRadius: 22,
  border: "1px solid rgba(255,255,255,.1)", boxShadow: "0 24px 80px rgba(0,0,0,.6)",
  padding: "28px 26px 24px",
};
const gateCardStyle = { ...cardBase };
const discoverCardStyle = { ...cardBase, maxWidth: 480 };
const gateLabelStyle = { display: "block", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.6)", marginBottom: 6 };
const gateInputStyle = {
  width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,.15)",
  background: "rgba(255,255,255,.06)", color: "#fff", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
};
const gateErrStyle = { background: "rgba(248,113,113,.12)", border: "1px solid rgba(248,113,113,.3)", borderRadius: 10, padding: "9px 12px", fontSize: 12.5, color: "#f87171", marginBottom: 14 };
const laterBtnStyle = {
  width: "100%", padding: "10px", marginTop: 10, background: "none", border: "none",
  color: "rgba(255,255,255,.5)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};
const personRowStyle = { display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "rgba(255,255,255,.05)", borderRadius: 12 };
const connectBtnStyle = {
  display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8,
  background: "rgba(109,93,245,.18)", border: "1px solid rgba(109,93,245,.4)",
  color: "#c5bcff", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
};

function gateBtnStyle(disabled) {
  return {
    width: "100%", padding: "13px", borderRadius: 11,
    background: "linear-gradient(120deg,#6d5df5,#9a55ee 55%,#cf52d8)",
    border: "none", color: "#fff", fontSize: 15, fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
    fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  };
}
