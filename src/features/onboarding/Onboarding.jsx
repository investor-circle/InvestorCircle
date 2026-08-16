import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X, UserPlus, Loader, Radar, Search } from "lucide-react";
import { checkUsername as dbCheckUsername, saveUsername as dbSaveUsername, markOnboardingStep as dbMarkOnboardingStep } from "../../services/api/profileApi";
import { getSuggestedPeople as dbGetSuggestedPeople, getDiscoverMore as dbGetDiscoverMore } from "../../services/api/lookupsApi";
import { sendConnectionRequest as dbSendConnectionRequest } from "../../services/api/connectionsApi";
import { trackInvestor as dbTrackInvestor } from "../../services/api/trackingApi";
import { computeIci } from "../../services/api/recommendationsApi";
import { Avatar } from "../../components/common";
import { initialsOf } from "../../utils/format";
import { openProfile } from "../../utils/navigation";

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
    return (
      <DiscoverModal
        ME={ME}
        patchProfile={patchProfile}
        markOnboardingDone
        onClose={()=>{}}
        onDiscoverMore={()=>setPage?.("discover")}
      />
    );
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

/* ── Discover modal — shared by the mandatory one-time onboarding gate AND
   the always-available top-nav discover icon. Exported so App.jsx can
   render it standalone (markOnboardingDone omitted/false in that case). ── */

export function DiscoverModal({ ME, patchProfile, onClose, onDiscoverMore, markOnboardingDone=false }) {
  const [people, setPeople] = useState(null); // null = loading
  const [connecting, setConnecting] = useState({});
  const [connected, setConnected] = useState({});
  const [tracking, setTracking] = useState({});
  const [trackBusy, setTrackBusy] = useState({});
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    dbGetSuggestedPeople().then(rows => { if (!cancelled) setPeople(rows); }).catch(() => { if (!cancelled) setPeople([]); });
    return () => { cancelled = true; };
  }, []);

  if (dismissed) return null;

  const markDone = () => {
    if (!markOnboardingDone) return;
    patchProfile?.({ onboarding_discover_done: true });
    // Best-effort persistence — UI already moved on regardless; a failure
    // here just means the modal could reappear on next login.
    dbMarkOnboardingStep("discover").catch(() => {});
  };
  const finish = () => { markDone(); setDismissed(true); onClose?.(); };
  const discoverMore = () => { markDone(); setDismissed(true); onDiscoverMore?.(); };

  const connect = async (uid) => {
    setConnecting(c => ({ ...c, [uid]: true }));
    try {
      const result = await dbSendConnectionRequest(ME?.id, uid);
      if (!result?.error) setConnected(c => ({ ...c, [uid]: true }));
    } catch (_) { /* non-fatal — button just stays enabled */ }
    setConnecting(c => ({ ...c, [uid]: false }));
  };
  const track = async (uid) => {
    setTrackBusy(b => ({ ...b, [uid]: true }));
    try {
      await dbTrackInvestor(uid);
      setTracking(t => ({ ...t, [uid]: true }));
    } catch (_) { /* non-fatal — button just stays enabled */ }
    setTrackBusy(b => ({ ...b, [uid]: false }));
  };

  return createPortal(
    <div style={overlayStyle} onClick={finish}>
      <div style={discoverCardStyle} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 19, fontWeight: 800, color: "#fff", marginBottom: 6 }}>Grow your Investor Circle</div>
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
              No new investors to suggest just yet — check back soon.
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
            const isTracking = tracking[p.id];
            return (
              <div key={p.id} style={personRowStyle}>
                <Avatar f={{ initials: initialsOf(p.full_name || p.username || "?"), avatarUrl: p.avatar_url, color: p.avatar_color }} size={38} />
                <div style={{ flex: 1, minWidth: 0, cursor: p.username ? "pointer" : "default" }} onClick={()=>p.username && openProfile(p.username)}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.full_name || p.username}
                  </div>
                  <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.45)" }}>
                    {p.username ? `@${p.username}` : ""}{p.total ? ` · ${p.total} ideas` : ""}{p.total ? ` · ICI ${ici.score}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {isTracking ? (
                    <span style={trackedPillStyle}><Check size={12} /> Tracking</span>
                  ) : (
                    <button onClick={() => track(p.id)} disabled={trackBusy[p.id]} style={trackBtnStyle}>
                      {trackBusy[p.id] ? <Loader size={12} className="spin" /> : <Radar size={12} />} Track
                    </button>
                  )}
                  {isConnected || isPending ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#4ade80", fontWeight: 700 }}>
                      <Check size={13} /> {isConnected ? "Connected" : "Pending"}
                    </span>
                  ) : (
                    <button onClick={() => connect(p.id)} disabled={connecting[p.id]} style={connectBtnStyle}>
                      {connecting[p.id] ? <Loader size={12} className="spin" /> : <UserPlus size={12} />} Connect
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <button onClick={discoverMore} style={gateBtnStyle(false)}>Discover more →</button>
        <button onClick={finish} style={laterBtnStyle}>{markOnboardingDone ? "I'll do this later" : "Close"}</button>
      </div>
    </div>,
    document.body
  );
}

/* ── Full Discovery page — reached via "Discover more" or the top-nav icon.
   Same exclusion rules as the modal (never re-surfaces the caller's
   existing Tracking/Connections), but the full candidate list, with
   search, sort, and a "Recommended for you" / "Explore more investors"
   split. ── */

export function DiscoverPeoplePage({ ME }) {
  const [people, setPeople] = useState(null); // null = loading
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("recommended"); // recommended | name | ici | ideas
  const [connecting, setConnecting] = useState({});
  const [connected, setConnected] = useState({});
  const [tracking, setTracking] = useState({});
  const [trackBusy, setTrackBusy] = useState({});

  useEffect(() => {
    dbGetDiscoverMore().then(setPeople).catch(() => setPeople([]));
  }, []);

  const withIci = useMemo(() => (people || []).map(p => {
    const hitPct = p.closed > 0 ? (p.wins / p.closed * 100) : 0;
    const riskAdj = Number(p.ret_stddev) > 0 ? Math.max(Number(p.median_ret) / Number(p.ret_stddev), 0) : 0;
    const ici = computeIci({
      years_history: Number(p.years_history) || 0, total: p.total,
      hit_rate_pct: hitPct, median_return: Number(p.median_ret) || 0,
      risk_adjusted_return: riskAdj, deleted_count: 0,
    });
    return { ...p, ici };
  }), [people]);

  const filtered = useMemo(() => {
    if (!q.trim()) return withIci;
    const s = q.trim().toLowerCase();
    return withIci.filter(p => (p.full_name || "").toLowerCase().includes(s) || (p.username || "").toLowerCase().includes(s));
  }, [withIci, q]);

  const sorted = useMemo(() => {
    const r = [...filtered];
    if (sort === "name") r.sort((a, b) => (a.full_name || a.username || "").localeCompare(b.full_name || b.username || ""));
    else if (sort === "ici") r.sort((a, b) => b.ici.score - a.ici.score);
    else if (sort === "ideas") r.sort((a, b) => (b.total || 0) - (a.total || 0));
    else r.sort((a, b) => (b.ici.score + (b.total || 0) * 2) - (a.ici.score + (a.total || 0) * 2)); // blended "recommended" ranking
    return r;
  }, [filtered, sort]);

  const showSplit = sort === "recommended" && !q.trim();
  const recommended = showSplit ? sorted.slice(0, 6) : [];
  const rest = showSplit ? sorted.slice(6) : sorted;

  const connect = async (uid) => {
    setConnecting(c => ({ ...c, [uid]: true }));
    try {
      const result = await dbSendConnectionRequest(ME?.id, uid);
      if (!result?.error) setConnected(c => ({ ...c, [uid]: true }));
    } catch (_) {}
    setConnecting(c => ({ ...c, [uid]: false }));
  };
  const track = async (uid) => {
    setTrackBusy(b => ({ ...b, [uid]: true }));
    try { await dbTrackInvestor(uid); setTracking(t => ({ ...t, [uid]: true })); } catch (_) {}
    setTrackBusy(b => ({ ...b, [uid]: false }));
  };

  const PersonCard = ({ p }) => {
    const isConnected = connected[p.id] || p.connection_status === "accepted";
    const isPending = connected[p.id] || p.connection_status === "pending";
    const isTracking = tracking[p.id];
    return (
      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: p.username ? "pointer" : "default", flex: 1, minWidth: 180 }}
            onClick={() => p.username && openProfile(p.username)}>
            <Avatar f={{ name: p.full_name, avatarUrl: p.avatar_url, color: p.avatar_color, initials: initialsOf(p.full_name || p.username || "?") }} size={40} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--accent-ink)", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3 }}>{p.full_name || p.username}</div>
              <div className="muted small">@{p.username || "—"}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: p.ici.band === "Strong" ? "#4ade80" : p.ici.band === "Good" ? "#a78bfa" : p.ici.band === "Building" ? "#fbbf24" : "var(--muted)" }}>{p.ici.score}</div>
              <div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".04em" }}>ICI</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{p.total || 0}</div>
              <div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".04em" }}>Ideas</div>
            </div>
            {isTracking
              ? <span className="pill accent" style={{ fontSize: 11 }}><Check size={11} style={{ verticalAlign: -1, marginRight: 2 }} />Tracking</span>
              : <button className="btn btn-pri btn-sm" disabled={trackBusy[p.id]} onClick={() => track(p.id)}>
                  {trackBusy[p.id] ? <Loader size={13} className="spin" /> : <><Radar size={13} /> Track</>}
                </button>}
            {isConnected || isPending
              ? <span className="pill" style={{ fontSize: 11, background: isConnected ? "var(--gain-soft)" : undefined, color: isConnected ? "var(--gain)" : undefined }}>{isConnected ? "Connected" : "Pending"}</span>
              : <button className="btn btn-ghost btn-sm" disabled={connecting[p.id]} onClick={() => connect(p.id)}>
                  {connecting[p.id] ? <Loader size={13} className="spin" /> : <><UserPlus size={13} /> Connect</>}
                </button>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Discover</div>
          <div className="page-title">Grow your Investor Circle</div>
          <div className="page-sub">Find new investors to Track or Connect with — never your existing network.</div>
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="searchbox grow"><Search size={16} color="var(--muted)" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or username…" /></div>
        <select className="inline-select sm" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="recommended">Recommended</option>
          <option value="name">Name (A–Z)</option>
          <option value="ici">ICI score</option>
          <option value="ideas">Ideas posted</option>
        </select>
      </div>

      {people === null && <div className="card"><div className="empty"><Loader size={16} className="spin" /> Loading…</div></div>}
      {people !== null && sorted.length === 0 && (
        <div className="card"><div className="empty">
          {q.trim() ? `No investors match "${q}".` : "No new investors to discover right now — check back soon."}
        </div></div>
      )}

      {recommended.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Recommended for you</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recommended.map(p => <PersonCard key={p.id} p={p} />)}
          </div>
        </div>
      )}
      {rest.length > 0 && (
        <div>
          {showSplit && <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Explore more investors</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rest.map(p => <PersonCard key={p.id} p={p} />)}
          </div>
        </div>
      )}
    </>
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
const trackBtnStyle = {
  display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8,
  background: "rgba(74,222,128,.14)", border: "1px solid rgba(74,222,128,.35)",
  color: "#86efac", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
};
const trackedPillStyle = {
  display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 8,
  fontSize: 11, color: "#86efac", fontWeight: 700, flexShrink: 0,
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
