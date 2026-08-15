import React, { useEffect, useState } from "react";
import { ChevronDown, Check, UserPlus, Loader } from "lucide-react";
import { markOnboardingStep as dbMarkOnboardingStep } from "../../services/api/profileApi";
import { getSuggestedPeople as dbGetSuggestedPeople } from "../../services/api/lookupsApi";
import { sendConnectionRequest as dbSendConnectionRequest } from "../../services/api/connectionsApi";
import { computeIci } from "../../services/api/recommendationsApi";
import { Avatar } from "../../components/common";
import { initialsOf } from "../../utils/format";

/**
 * Phase 5.5 (revised) — persistent, non-blocking setup checklist.
 *
 * Replaces the earlier two-step full-screen modal flow. That version had to
 * add session-only "don't show this again" state to work around its own
 * design flaw: navigating away from step 1 (e.g. to Track Record) caused the
 * component to re-render and immediately pop step 2's full-screen overlay on
 * top of the destination page. Rendering as an in-flow bar under the topbar
 * (see App.jsx) rather than a fixed/portal overlay removes the entire class
 * of problem — there is nothing to stack on top of, so there is nothing to
 * suppress. Visibility is driven ONLY by server-persisted state
 * (profile.onboarding_cv_done / onboarding_discover_done); no client-only
 * "session dismissed" flag exists anymore.
 */
export function SetupChecklist({ profile, ME, patchProfile, setPage }) {
  const [open, setOpen] = useState(false);

  const cvDone = !!profile?.onboarding_cv_done;
  const discoverDone = !!profile?.onboarding_discover_done;

  // TEMPORARY diagnostic — remove once the "checklist doesn't show" report
  // is root-caused. Logs exactly what this component received so we can see
  // from the browser console whether onboarding_cv_done/onboarding_discover_done
  // are present at all, and what value they hold, rather than guessing.
  if (typeof window !== "undefined" && !window.__micSetupChecklistLogged) {
    window.__micSetupChecklistLogged = true;
    console.info("[SetupChecklist] profile received:", profile, {
      hasProfile: !!profile,
      cvDoneRaw: profile?.onboarding_cv_done,
      discoverDoneRaw: profile?.onboarding_discover_done,
      cvDone, discoverDone,
      willRender: !!profile && !(cvDone && discoverDone),
    });
  }

  // Nothing left to do (or profile not loaded yet) — render nothing. This is
  // the ONLY thing that hides the checklist; there is no separate "dismiss"
  // action, so an incomplete step always survives navigation, refresh, and
  // logout/login until it's actually completed or skipped server-side.
  if (!profile || (cvDone && discoverDone)) return null;

  const activeStep = !cvDone ? "cv" : "discover";
  const doneCount = (cvDone ? 1 : 0) + (discoverDone ? 1 : 0);

  const markDone = async (step) => {
    patchProfile?.({ [step === "cv" ? "onboarding_cv_done" : "onboarding_discover_done"]: true });
    try {
      const ok = await dbMarkOnboardingStep(step);
      if (!ok) console.warn(`[onboarding] failed to persist step "${step}" as done — it may reappear next login`);
    } catch (e) {
      console.warn(`[onboarding] failed to persist step "${step}":`, e?.message || e);
    }
  };

  const buildCv = () => { markDone("cv"); setPage?.("trackrecord"); };
  const skipCv = () => markDone("cv");
  const exploreNetwork = () => { markDone("discover"); setPage?.("network"); };
  const skipDiscover = () => markDone("discover");

  const primaryLabel = activeStep === "cv" ? "Build My Investor CV" : "Discover people";
  const primaryAction = activeStep === "cv" ? buildCv : () => setOpen(true);

  return (
    <div style={wrapStyle}>
      <div className="mic-setup-bar" style={barStyle}>
        <ProgressRing done={doneCount} total={2} />
        <button onClick={() => setOpen(o => !o)} style={headlineBtnStyle}>
          <div style={{ textAlign: "left" }}>
            <div style={headlineStyle}>Complete your Investor Circle setup</div>
            <div style={subStyle}>{doneCount} of 2 complete</div>
          </div>
          <ChevronDown size={16} color="var(--muted)" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }} />
        </button>
        <button onClick={primaryAction} className="btn btn-pri btn-sm" style={{ flexShrink: 0, whiteSpace: "nowrap" }}>{primaryLabel} →</button>
      </div>

      {open && (
        <div className="mic-setup-panel" style={panelStyle}>
          <ChecklistRow
            title="Build your Investor CV"
            subtitle="Showcase your investment journey and track record."
            done={cvDone}
            active={activeStep === "cv"}
            onGo={buildCv}
            onSkip={skipCv}
          />
          <ChecklistRow
            title="Discover your Investor Circle"
            subtitle={cvDone ? "Meet a few people worth following." : "Complete Build CV first."}
            done={discoverDone}
            active={activeStep === "discover"}
            locked={!cvDone}
          >
            {activeStep === "discover" && (
              <DiscoverPanel me={ME} onExplore={exploreNetwork} onSkip={skipDiscover} />
            )}
          </ChecklistRow>
        </div>
      )}
    </div>
  );
}

function ChecklistRow({ title, subtitle, done, active, locked, onGo, onSkip, children }) {
  return (
    <div style={{ opacity: locked ? 0.5 : 1 }}>
      <div style={rowStyle}>
        <div style={done ? checkDoneStyle : checkTodoStyle}>{done ? <Check size={12} color="#06240f" /> : null}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={rowTitleStyle}>{title}</div>
          <div style={rowSubStyle}>{subtitle}</div>
        </div>
        {done && <span style={completedTagStyle}>Completed</span>}
        {active && !done && !children && (
          <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
            <button onClick={onSkip} style={skipLinkStyle}>Skip</button>
            <button onClick={onGo} style={goLinkStyle}>Go →</button>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

/** Curated people list for the Discover step — reuses the existing
 * discover-people query, ICI computation and connection-request API
 * unchanged; only the presentation (inline panel vs. full-screen modal)
 * differs from the earlier implementation. */
function DiscoverPanel({ me, onExplore, onSkip }) {
  const [people, setPeople] = useState(null); // null = loading
  const [connecting, setConnecting] = useState({});
  const [connected, setConnected] = useState({});

  useEffect(() => {
    let cancelled = false;
    dbGetSuggestedPeople().then(rows => { if (!cancelled) setPeople(rows); }).catch(() => { if (!cancelled) setPeople([]); });
    return () => { cancelled = true; };
  }, []);

  const connect = async (uid) => {
    setConnecting(c => ({ ...c, [uid]: true }));
    try {
      // sendConnectionRequest resolves (doesn't throw) with { error } on a
      // denied/unauthorized response — only mark connected on genuine success.
      const result = await dbSendConnectionRequest(me?.id, uid);
      if (!result?.error) setConnected(c => ({ ...c, [uid]: true }));
    } catch (_) { /* non-fatal — button just stays enabled */ }
    setConnecting(c => ({ ...c, [uid]: false }));
  };

  return (
    <div style={{ marginTop: 10, paddingLeft: 32 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
        {people === null && (
          <div style={{ padding: "14px 0", display: "flex", justifyContent: "center", color: "var(--muted)" }}>
            <Loader size={16} className="spin" />
          </div>
        )}
        {people?.length === 0 && (
          <div style={{ padding: "8px 0", fontSize: 12.5, color: "var(--muted)" }}>
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
            <div key={p.id} style={personCardStyle}>
              <Avatar f={{ initials: initialsOf(p.full_name || p.username || "?"), avatarUrl: p.avatar_url, color: p.avatar_color }} size={30} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={personNameStyle}>{p.full_name || p.username}</div>
                <div style={personMetaStyle}>
                  {p.username ? `@${p.username}` : ""}{p.total ? ` · ${p.total} recs` : ""}{p.total ? ` · ICI ${ici.score}` : ""}
                </div>
              </div>
              {isConnected || isPending ? (
                <span style={connectedTagStyle}><Check size={12} /> {isConnected ? "Connected" : "Pending"}</span>
              ) : (
                <button onClick={() => connect(p.id)} disabled={connecting[p.id]} className="btn btn-soft btn-sm" style={{ flexShrink: 0 }}>
                  {connecting[p.id] ? <Loader size={11} className="spin" /> : <UserPlus size={11} />} Connect
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
        <button onClick={onExplore} style={goLinkStyle}>Explore Network →</button>
        <button onClick={onSkip} style={skipLinkStyle}>Skip for now</button>
      </div>
    </div>
  );
}

function ProgressRing({ done, total }) {
  const r = 12, circ = 2 * Math.PI * r;
  const filled = (done / total) * circ;
  return (
    <div style={{ position: "relative", width: 30, height: 30, flexShrink: 0 }}>
      <svg width={30} height={30} viewBox="0 0 30 30" style={{ transform: "rotate(-90deg)" }}>
        <circle cx={15} cy={15} r={r} fill="none" stroke="rgba(120,120,140,.25)" strokeWidth={3} />
        <circle cx={15} cy={15} r={r} fill="none" stroke="url(#mic-setup-ring)" strokeWidth={3}
          strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round" />
        <defs>
          <linearGradient id="mic-setup-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6d5df5" />
            <stop offset="100%" stopColor="#cf52d8" />
          </linearGradient>
        </defs>
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 800, color: "var(--ink)" }}>
        {done}/{total}
      </div>
    </div>
  );
}

// Styled with the app's existing design tokens (see src/styles/globalStyles.js
// :root) — the authenticated app shell (.app/.main/.content) is a LIGHT
// theme (--bg:#f5f5fb, --ink:#13142b); only the sidebar is dark. Reuses
// --accent-soft/--accent-line/--grad/--gain and the existing .btn/.btn-pri/
// .btn-soft classes rather than inventing new colors, so this reads as part
// of the app rather than a pasted-in component.
const wrapStyle = { background: "var(--accent-soft)", borderBottom: "1px solid var(--accent-line)" };
const barStyle = { display: "flex", alignItems: "center", gap: 14 };
const headlineBtnStyle = { flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" };
const headlineStyle = { fontSize: 13, fontWeight: 700, color: "var(--ink)" };
const subStyle = { fontSize: 11.5, color: "var(--muted)", marginTop: 1 };
const panelStyle = { display: "flex", flexDirection: "column", gap: 10 };
const rowStyle = { display: "flex", alignItems: "center", gap: 10, padding: "8px 0" };
const checkDoneStyle = { width: 20, height: 20, borderRadius: "50%", flexShrink: 0, background: "var(--gain)", display: "flex", alignItems: "center", justifyContent: "center" };
const checkTodoStyle = { width: 20, height: 20, borderRadius: "50%", flexShrink: 0, border: "1.5px solid var(--line-2)" };
const rowTitleStyle = { fontSize: 13, fontWeight: 700, color: "var(--ink)" };
const rowSubStyle = { fontSize: 11.5, color: "var(--muted)", marginTop: 1 };
const completedTagStyle = { fontSize: 11, fontWeight: 700, color: "var(--gain)", flexShrink: 0 };
const goLinkStyle = { background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "var(--accent-ink)", padding: 0, fontFamily: "inherit" };
const skipLinkStyle = { background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--muted)", padding: 0, fontFamily: "inherit" };
const personCardStyle = { display: "flex", alignItems: "center", gap: 9, padding: "7px 9px", background: "var(--surface-2)", borderRadius: 10 };
const personNameStyle = { fontSize: 12.5, fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const personMetaStyle = { fontSize: 11, color: "var(--muted)" };
const connectedTagStyle = { display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "var(--gain)", flexShrink: 0 };
