import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Trophy, Users, UserPlus, Check, Loader } from "lucide-react";
import { markOnboardingStep as dbMarkOnboardingStep } from "../../services/api/profileApi";
import { getSuggestedPeople as dbGetSuggestedPeople } from "../../services/api/lookupsApi";
import { sendConnectionRequest as dbSendConnectionRequest } from "../../services/api/connectionsApi";
import { computeIci } from "../../services/api/recommendationsApi";
import { Avatar } from "../../components/common";
import { initialsOf } from "../../utils/format";

/**
 * Phase 5.5 — lightweight two-step new-user activation flow.
 *
 * Shown once per step, gated by profile.onboarding_cv_done /
 * onboarding_discover_done (persisted server-side — see
 * api/_lib/handlers/lookups.js action=onboarding-complete). Renders as a
 * portal overlay, entirely independent of the Home Feed's own data-load
 * effect in App.jsx — it neither reads nor blocks feed state.
 */
export function NewUserActivation({ profile, ME, patchProfile, setPage }) {
  // Once a step is marked done for THIS render tree, don't flash it again
  // before the server round-trip confirms and profile state updates.
  const [closing, setClosing] = useState(null); // 'cv' | 'discover' | null
  // Set the moment a CTA navigates the user away (Build CV → Track Record,
  // Explore Network → Network). Without this, completing step 1 by clicking
  // "Build My Investor CV" navigates to Track Record underneath, but this
  // component re-renders immediately afterward, sees onboarding_discover_done
  // still false, and pops the full-screen Discover Circle overlay right on
  // top of the page the user was just sent to — it looks like "the button
  // did nothing, and now there's a different popup". Once the user has
  // actively chosen to go do something, get out of their way for the rest of
  // the session; the next incomplete step still surfaces on their next visit.
  const [dismissedForSession, setDismissedForSession] = useState(false);

  if (!profile || dismissedForSession) return null;

  const markDone = async (step) => {
    setClosing(step);
    patchProfile?.({ [step === 'cv' ? 'onboarding_cv_done' : 'onboarding_discover_done']: true });
    try {
      const ok = await dbMarkOnboardingStep(step);
      if (!ok) console.warn(`[onboarding] failed to persist step "${step}" as done — it may reappear next login`);
    } catch (e) {
      console.warn(`[onboarding] failed to persist step "${step}":`, e?.message || e);
    }
  };

  const goTo = (page, step) => { setDismissedForSession(true); markDone(step); setPage?.(page); };

  if (!profile.onboarding_cv_done && closing !== 'cv') {
    return (
      <BuildCvCard
        onBuild={() => goTo('trackrecord', 'cv')}
        onSkip={() => markDone('cv')}
      />
    );
  }

  if (!profile.onboarding_discover_done && closing !== 'discover') {
    return (
      <DiscoverCircleCard
        me={ME}
        onExplore={() => goTo('network', 'discover')}
        onSkip={() => markDone('discover')}
      />
    );
  }

  return null;
}

function OverlayShell({ onDismiss, children }) {
  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(13,14,30,.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9500, padding: 20,
    }} onClick={onDismiss}>
      <div style={{
        width: '100%', maxWidth: 480, background: '#16182a', borderRadius: 22,
        border: '1px solid rgba(255,255,255,.1)', boxShadow: '0 24px 80px rgba(0,0,0,.6)',
        padding: '30px 28px 26px', position: 'relative', textAlign: 'center',
      }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  );
}

function BuildCvCard({ onBuild, onSkip }) {
  return (
    <OverlayShell onDismiss={onSkip}>
      <button onClick={onSkip} style={closeBtnStyle}><X size={16}/></button>
      <div style={{
        width: 60, height: 60, borderRadius: 16, margin: '0 auto 18px',
        background: 'linear-gradient(135deg,#6d5df5,#cf52d8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 8px 24px rgba(109,93,245,.4)',
      }}>
        <Trophy size={28} color="#fff"/>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 10 }}>
        Build your Investor Profile
      </div>
      <div style={{ fontSize: 14, color: 'rgba(255,255,255,.65)', lineHeight: 1.6, marginBottom: 26 }}>
        Create your personalized Investor CV and showcase your investment journey,
        track record and thinking to your investment circle.
      </div>
      <button onClick={onBuild} style={primaryBtnStyle}>
        Build My Investor CV →
      </button>
      <button onClick={onSkip} style={laterBtnStyle}>I'll do this later</button>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', marginTop: 14 }}>
        You can always do this later from Track Record.
      </div>
    </OverlayShell>
  );
}

function DiscoverCircleCard({ me, onExplore, onSkip }) {
  const [people, setPeople] = useState(null); // null = loading
  const [connecting, setConnecting] = useState({}); // { [uid]: true }
  const [connected, setConnected] = useState({});   // { [uid]: true }

  useEffect(() => {
    dbGetSuggestedPeople().then(setPeople).catch(() => setPeople([]));
  }, []);

  const connect = async (uid) => {
    setConnecting(c => ({ ...c, [uid]: true }));
    try {
      await dbSendConnectionRequest(me?.id, uid);
      setConnected(c => ({ ...c, [uid]: true }));
    } catch (_) { /* non-fatal — button just stays enabled */ }
    setConnecting(c => ({ ...c, [uid]: false }));
  };

  return (
    <OverlayShell onDismiss={onSkip}>
      <button onClick={onSkip} style={closeBtnStyle}><X size={16}/></button>
      <div style={{
        width: 60, height: 60, borderRadius: 16, margin: '0 auto 18px',
        background: 'linear-gradient(135deg,#0ea5b7,#15924e)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 8px 24px rgba(14,165,183,.4)',
      }}>
        <Users size={28} color="#fff"/>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 10 }}>
        Discover your Investor Circle
      </div>
      <div style={{ fontSize: 14, color: 'rgba(255,255,255,.65)', lineHeight: 1.6, marginBottom: 20 }}>
        Meet investors, explore their investment thinking and find people you'd
        like in your circle.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22, maxHeight: 300, overflowY: 'auto', textAlign: 'left' }}>
        {people === null && (
          <div style={{ padding: '20px 0', display: 'flex', justifyContent: 'center', color: 'rgba(255,255,255,.4)' }}>
            <Loader size={18} className="spin"/>
          </div>
        )}
        {people?.length === 0 && (
          <div style={{ padding: '12px 0', textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,.4)' }}>
            No investors to suggest just yet — check back soon.
          </div>
        )}
        {people?.map(p => {
          const hitPct  = p.closed > 0 ? (p.wins / p.closed * 100) : 0;
          const riskAdj = Number(p.ret_stddev) > 0 ? Math.max(Number(p.median_ret) / Number(p.ret_stddev), 0) : 0;
          const ici = computeIci({
            years_history: Number(p.years_history) || 0, total: p.total,
            hit_rate_pct: hitPct, median_return: Number(p.median_ret) || 0,
            risk_adjusted_return: riskAdj, deleted_count: 0,
          });
          const isConnected = connected[p.id] || p.connection_status === 'accepted';
          const isPending   = connected[p.id] || p.connection_status === 'pending';
          return (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
              background: 'rgba(255,255,255,.05)', borderRadius: 12,
            }}>
              <Avatar f={{ initials: initialsOf(p.full_name || p.username || '?'), avatarUrl: p.avatar_url, color: p.avatar_color }} size={36}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.full_name || p.username}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)' }}>
                  {p.username ? `@${p.username}` : ''}{p.total ? ` · ${p.total} recs` : ''}{p.total ? ` · ICI ${ici.score}` : ''}
                </div>
              </div>
              {isConnected || isPending ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#4ade80', fontWeight: 700, flexShrink: 0 }}>
                  <Check size={13}/> {isConnected ? 'Connected' : 'Pending'}
                </span>
              ) : (
                <button onClick={() => connect(p.id)} disabled={connecting[p.id]} style={connectBtnStyle}>
                  {connecting[p.id] ? <Loader size={12} className="spin"/> : <UserPlus size={12}/>} Connect
                </button>
              )}
            </div>
          );
        })}
      </div>

      <button onClick={onExplore} style={primaryBtnStyle}>
        Explore Network →
      </button>
      <button onClick={onSkip} style={laterBtnStyle}>I'll do this later</button>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', marginTop: 14 }}>
        You can always discover more people from Network.
      </div>
    </OverlayShell>
  );
}

const closeBtnStyle = {
  position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,.08)', border: 'none',
  color: 'rgba(255,255,255,.7)', cursor: 'pointer', width: 30, height: 30, borderRadius: 8,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const primaryBtnStyle = {
  width: '100%', padding: '13px', borderRadius: 11,
  background: 'linear-gradient(120deg,#6d5df5,#9a55ee 55%,#cf52d8)',
  border: 'none', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'inherit', letterSpacing: '-.1px',
};
const laterBtnStyle = {
  width: '100%', padding: '10px', marginTop: 10, background: 'none', border: 'none',
  color: 'rgba(255,255,255,.5)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
};
const connectBtnStyle = {
  display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 8,
  background: 'rgba(109,93,245,.18)', border: '1px solid rgba(109,93,245,.4)',
  color: '#c5bcff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
};
