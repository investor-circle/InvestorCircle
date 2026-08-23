import React, { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Lock,
  Eye,
  EyeOff,
  X,
  Check,
  UserPlus,
  AlertTriangle,
  Loader,
  Pencil,
  Database,
  Globe,
  Copy,
  ExternalLink,
  ArrowLeft,
  Radar,
  Users,
  Layers,
  Share2,
  Home
} from "lucide-react";
import { createUserWithEmailAndPassword, updateProfile as fbUpdateProfile } from "firebase/auth";
import { auth as primaryAuth } from "../../firebase";
import {
  getClaimAdminLink as dbGetClaimAdminLink,
  getClaimStatus as dbGetClaimStatus,
  submitClaim as dbSubmitClaim
} from "../../services/api/claimApi";
import {
  checkUsername as dbCheckUsername,
  getPublicProfile as dbGetPublicProfile,
  getRegOptions as dbGetRegOptions,
  saveProfileEdit as dbSaveProfileEdit,
  saveUsername as dbSaveUsername,
  uploadAvatar as dbUploadAvatar
} from "../../services/api/profileApi";
import {
  getOwnerCircles as dbGetOwnerCircles,
  requestJoinCircle as dbRequestJoinCircle
} from "../../services/api/groupsApi";
import {
  trackInvestor as dbTrackInvestor,
  untrackInvestor as dbUntrackInvestor,
  getTrackingStatus as dbGetTrackingStatus
} from "../../services/api/trackingApi";
import { goBackOrElse, gotoCircle } from "../../utils/navigation";
import { compressAvatarFile } from "../../utils/image";
import {
  computeIci
} from "../../services/api/recommendationsApi";
import { ConvBadge, IciDonut, RetBadge, ScoreBox, SocialIconBtn, StatusBadge2, TypeBadge } from "../../components/common";
import { SECTOR_EMOJI } from "../../constants/app";
import { useIsMobile } from "../../hooks/index";
import { sendEmail } from "../../services/notify";
import { initialsOf } from "../../utils/format";

/* ── ProfileSharePopover — Copy link / Share on WhatsApp for a profile,
   same anchored-popover-on-desktop / bottom-sheet-on-mobile pattern as the
   reco card's share button (SharePublicPopover in Recommendations.jsx) and
   the Circle page's share button (CircleSharePopover in Groups.jsx). ── */
function ProfileSharePopover({ profileUrl, displayName, anchorEl, onClose }) {
  const isMobile = useIsMobile();
  const [copied, setCopied] = useState(false);
  const [pos, setPos] = useState(null);
  const popRef = useRef(null);

  useEffect(() => {
    if (!isMobile && anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    const h = (e) => { if (popRef.current && !popRef.current.contains(e.target) && e.target !== anchorEl) onClose(); };
    setTimeout(() => document.addEventListener('mousedown', h), 0);
    return () => document.removeEventListener('mousedown', h);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const waText = encodeURIComponent(`Check out ${displayName}'s investment track record on myInvestorCircle:\n${profileUrl}`);
  const copyLink = () => navigator.clipboard.writeText(profileUrl).then(() => { setCopied(true); setTimeout(() => { setCopied(false); onClose(); }, 1600); });

  const content = (
    <>
      <div style={{fontWeight:700,fontSize:14,marginBottom:12,display:'flex',alignItems:'center',gap:6}}><Share2 size={15} color="var(--accent)"/> Share this profile</div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        <button className="btn btn-pri btn-sm" style={{justifyContent:'center'}} onClick={copyLink}>{copied ? <><Check size={14}/> Copied!</> : <><Copy size={14}/> Copy link</>}</button>
        <a href={`https://wa.me/?text=${waText}`} target="_blank" rel="noopener noreferrer" className="btn btn-soft btn-sm" style={{justifyContent:'center',textDecoration:'none'}} onClick={onClose}><span style={{fontSize:15,lineHeight:1}}>💬</span> Share on WhatsApp</a>
      </div>
      <button className="btn btn-ghost btn-sm" style={{width:'100%',justifyContent:'center',marginTop:10}} onClick={onClose}>Cancel</button>
    </>
  );

  if (isMobile) return createPortal(
    <div style={{position:'fixed',inset:0,zIndex:9999,display:'flex',flexDirection:'column',justifyContent:'flex-end'}} onClick={onClose}>
      <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,.45)'}}/>
      <div ref={popRef} style={{position:'relative',background:'var(--surface)',borderRadius:'20px 20px 0 0',padding:'20px 20px 36px',boxShadow:'0 -8px 40px rgba(0,0,0,.28)'}} onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,background:'var(--line)',borderRadius:2,margin:'0 auto 18px'}}/>
        {content}
      </div>
    </div>,
    document.body
  );

  if (!pos) return null;
  return createPortal(
    <div ref={popRef} style={{position:'fixed',top:pos.top,right:pos.right,zIndex:9999,background:'var(--surface)',border:'1px solid var(--line)',borderRadius:14,boxShadow:'0 8px 32px rgba(0,0,0,.18)',padding:'16px 18px',minWidth:270,maxWidth:320,fontFamily:'var(--font)'}} onClick={e=>e.stopPropagation()}>
      {content}
    </div>,
    document.body
  );
}

export function PublicProfilePage({ username, recoId, viewerUser, viewerConnections, viewerIsAdmin=false, viewerForClaim=false, onClaimClick=null, mode, isOwnProfile, patchProfile, onBack, onRequestConnect }) {
  const isMobile = useIsMobile();
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [notFound,    setNotFound]    = useState(false);
  const [recTab,      setRecTab]      = useState('All');
  const [connecting,  setConnecting]  = useState(false);
  const [connected,   setConnected]   = useState(false);
  const [copied,      setCopied]      = useState(false);
  const [shareOpen,   setShareOpen]   = useState(false);
  const shareBtnRef = useRef(null);
  const [expandedId,  setExpandedId]  = useState(recoId||null);
  const expandedRef = useRef(null);
  const [tracking,    setTracking]    = useState(false);
  const [trackBusy,   setTrackBusy]   = useState(false);
  const [circles,     setCircles]     = useState({ public: [], private: [] });
  const [joiningCircle, setJoiningCircle] = useState(null);

  // Public URL — defined early so it's always in scope for both shells
  const profileUrl = `${window.location.origin}${window.location.pathname}#/investor/${username}`;
  const copyLink   = () => navigator.clipboard.writeText(profileUrl)
    .then(()=>{ setCopied(true); setTimeout(()=>setCopied(false), 2000); });

  // Profile editing state — covers all editable fields
  const [editing,          setEditing]          = useState(false);
  const [editFirstName,    setEditFirstName]    = useState('');
  const [editLastName,     setEditLastName]     = useState('');
  const [editAvatarColor,  setEditAvatarColor]  = useState('');
  const [editBio,          setEditBio]          = useState('');
  const [editSocials,      setEditSocials]      = useState({ twitter:'', linkedin:'', telegram:'', instagram:'' });
  const [editRegStatus,    setEditRegStatus]    = useState('self_directed');
  const [editSebiNum,      setEditSebiNum]      = useState('');
  const [editSebiTill,     setEditSebiTill]     = useState('');
  const [editSebiFirm,     setEditSebiFirm]     = useState('');
  const [savingEdit,       setSavingEdit]       = useState(false);
  const [editErr,          setEditErr]          = useState('');
  const [regOptions,       setRegOptions]       = useState([]);
  const [sebiVerifyMsg,    setSebiVerifyMsg]    = useState('');

  const [claimInfo,       setClaimInfo]       = useState(null); // { is_unclaimed, claim_status, claim_token }
  const [adminLinkCopied, setAdminLinkCopied] = useState(false);
  // Fetch viewer's admin status independently — avoids race condition where ME
  // (loaded from Neon after Firebase auth) isn't available yet when this page renders.
  const [isViewerAdmin,   setIsViewerAdmin]   = useState(false);

  useEffect(()=>{
    setLoading(true); setNotFound(false); setData(null); setClaimInfo(null);
    dbGetPublicProfile(username).then(d=>{
      if(!d) setNotFound(true); else setData(d);
      setLoading(false);
    }).catch(()=>{ setNotFound(true); setLoading(false); });
    // Public claim status (no token — see api/_lib/handlers/claim-profile.js).
    dbGetClaimStatus(username).then(info=>{ if(info) setClaimInfo(info); }).catch(()=>{});

    // Admin-only: gated on the viewerIsAdmin prop so non-admins (the common
    // case) never make a call that's guaranteed to 403. A successful response
    // hands back the claim token in the same round trip.
    if (viewerUser?.uid && viewerIsAdmin) {
      dbGetClaimAdminLink(username).then(res=>{
        if (res) {
          setIsViewerAdmin(true);
          setClaimInfo(ci => ({ ...(ci||{}), claim_token: res.claim_token }));
        }
      }).catch(()=>{});
    }
  },[username, viewerUser?.uid, viewerIsAdmin]);

  useEffect(()=>{
    if(recoId&&data&&expandedRef.current)
      setTimeout(()=>expandedRef.current?.scrollIntoView({behavior:'smooth',block:'center'}),200);
  },[recoId,data]);

  // Load registration options + verification message when edit opens
  const startEdit=async()=>{
    const p=data?.profile||{};
    setEditFirstName(p.first_name||'');
    setEditLastName(p.last_name||'');
    setEditAvatarColor(p.avatar_color||'');
    setEditBio(p.bio||'');
    setEditSocials({ twitter:p.twitter_url||'', linkedin:p.linkedin_url||'', telegram:p.telegram_url||'', instagram:p.instagram_url||'' });
    setEditRegStatus(p.registration_status||'self_directed');
    setEditSebiNum(p.sebi_reg_number||'');
    setEditSebiTill(p.sebi_reg_valid_till||'');
    setEditSebiFirm(p.sebi_firm_name||'');
    setEditErr('');
    if(!regOptions.length) {
      try {
        const { options: opts, verifyMessage } = await dbGetRegOptions();
        setRegOptions(opts);
        if(verifyMessage) setSebiVerifyMsg(verifyMessage);
      } catch(_) {}
    }
    setEditing(true);
  };

  // Save all profile fields
  const saveEdit=async()=>{
    if(!data?.profile?.id) return;
    setSavingEdit(true);
    setEditErr('');
    const isSebi = ['sebi_ra','sebi_ria'].includes(editRegStatus);
    try {
      const fn = editFirstName.trim(); const ln = editLastName.trim();
      await dbSaveProfileEdit({
        firstName: fn, lastName: ln,
        avatarColor: editAvatarColor, bio: editBio,
        twitter: editSocials.twitter, linkedin: editSocials.linkedin,
        telegram: editSocials.telegram, instagram: editSocials.instagram,
        registrationStatus: editRegStatus,
        sebiNum: editSebiNum, sebiTill: editSebiTill, sebiFirm: editSebiFirm,
      });
      const newApprovalStatus = isSebi
        ? (editRegStatus !== (data.profile.registration_status||'self_directed') ? 'pending' : (data.profile.sebi_approval_status||'not_applied'))
        : 'not_applied';
      const updates = {
        first_name:fn, last_name:ln, full_name:[fn,ln].filter(Boolean).join(' '),
        avatar_color:editAvatarColor, bio:editBio,
        twitter_url:editSocials.twitter, linkedin_url:editSocials.linkedin,
        telegram_url:editSocials.telegram, instagram_url:editSocials.instagram,
        registration_status:editRegStatus,
        sebi_reg_number:isSebi?editSebiNum:null,
        sebi_reg_valid_till:isSebi?editSebiTill:null,
        sebi_firm_name:isSebi?editSebiFirm:null,
        sebi_approval_status:newApprovalStatus,
      };
      setData(d=>({...d,profile:{...d.profile,...updates}}));
      if(patchProfile) patchProfile(updates);
      setSavingEdit(false);
      setEditing(false);
    } catch(e){
      console.warn('Save failed:',e);
      setEditErr(e.message || 'Could not save your changes — please try again.');
      setSavingEdit(false);
      // Keep the modal open on failure — silently closing it here was the bug:
      // the form looked like it saved, but the write never reached the server.
    }
  };

  // Connection status relative to the viewer
  const profileUserId = data?.profile?.id;
  const connStatus = useMemo(()=>{
    if(!profileUserId||!viewerConnections?.length) return 'none';
    const c = viewerConnections.find(c=>c.user_id===profileUserId);
    return c?.status||'none';
  },[profileUserId, viewerConnections]);
  useEffect(()=>{ if(connStatus==='accepted') setConnected(true); },[connStatus]);

  const handleConnect = async()=>{
    setConnecting(true);
    await onRequestConnect(data.profile.id);
    setConnected(true);
    setConnecting(false);
  };

  // Tracking status + Circles (public always; private only those the viewer
  // is already a member of — server enforces this, see api/_lib/handlers/groups.js).
  useEffect(()=>{
    if(!profileUserId) return;
    dbGetOwnerCircles(profileUserId).then(setCircles).catch(()=>{});
    if (viewerUser && !isOwnProfile) {
      dbGetTrackingStatus(profileUserId).then(setTracking).catch(()=>{});
    }
  },[profileUserId, viewerUser?.uid, isOwnProfile]);

  const handleToggleTrack = async()=>{
    if(!profileUserId || trackBusy) return;
    setTrackBusy(true);
    if(tracking){ await dbUntrackInvestor(profileUserId); setTracking(false); }
    else { await dbTrackInvestor(profileUserId); setTracking(true); }
    setTrackBusy(false);
  };

  const handleJoinCircle = async(circle)=>{
    if(!viewerUser){ onRequestConnect && sessionStorage.setItem("pending_connect_username", username); return; }
    setJoiningCircle(circle.id);
    const res = await dbRequestJoinCircle(circle.id);
    if(res && !res.error){
      setTracking(true); // Subscribing always tracks the circle owner too.
      setCircles(c=>({...c, public: c.public.map(pc=>pc.id===circle.id?{...pc, _requested:true}:pc)}));
    } else {
      // Surface a failure instead of silently doing nothing (e.g. a
      // dropped connection). Public Circle Subscribe itself has no
      // eligibility gate — a 403 here would mean something else broke.
      alert("Couldn't send your request to join. Please try again.");
    }
    setJoiningCircle(null);
  };

  // ── Content renderer ──────────────────────────────────────────────────────
  const renderContent=()=>{
    if(loading) return <div style={{textAlign:'center',padding:'60px 0',color:'var(--muted)'}}><Loader size={28} className="spin" style={{marginBottom:14}}/><div>Loading public investment record…</div></div>;
    if(notFound) return <div style={{textAlign:'center',padding:'60px 0'}}><Globe size={36} color="var(--muted)" style={{marginBottom:14}}/><div style={{fontWeight:700,fontSize:16,marginBottom:8}}>Record not found</div><div className="muted small">@{username} hasn't set up a public profile yet.</div></div>;
    if(!data) return null;
    try {

    // ── ClaimBanner — shown for unclaimed profiles ──────────────────────────
    const isUnclaimed  = claimInfo?.is_unclaimed === true;
    const claimStatus  = claimInfo?.claim_status;

    if (isUnclaimed) {
      const isClaimer = claimStatus === 'pending_approval';
      const hasToken  = !!localStorage.getItem('mic_claim_token');

      // ── ADMIN: bypass restricted view — show full profile with preview banner ──
      // Admin needs to see all seeded recommendations before sharing the claim link.
      // A sticky banner at the top makes the admin context explicit.
      if (isViewerAdmin || viewerForClaim) {
        // fall through to full profile render below — respective banner injected there
      } else {
        // ── Non-admin: restricted "unclaimed" page ────────────────────────────
        return (
          <div>
            <div style={{background: isClaimer ? 'rgba(109,93,245,.08)' : 'rgba(251,191,36,.08)', border:`1px solid ${isClaimer?'rgba(109,93,245,.35)':'rgba(251,191,36,.5)'}`, borderRadius:14, padding:'14px 18px', marginBottom:20, display:'flex', alignItems:'flex-start', gap:12}}>
              <div style={{fontSize:20, flexShrink:0}}>{isClaimer ? '⏳' : '👤'}</div>
              <div style={{flex:1}}>
                {isClaimer
                  ? <><div style={{fontWeight:700,fontSize:14,marginBottom:3}}>Claim pending admin approval</div><div style={{fontSize:13,color:'var(--muted)',lineHeight:1.5}}>Your claim for @{username} is under review. You'll receive an email once approved.</div></>
                  : hasToken
                    ? <><div style={{fontWeight:700,fontSize:14,marginBottom:3}}>This is your unclaimed profile</div><div style={{fontSize:13,color:'var(--muted)',lineHeight:1.5}}>You have a claim link for this profile. To claim it, <strong>sign out first</strong> then open your claim link again.</div></>
                    : <><div style={{fontWeight:700,fontSize:14,marginBottom:3}}>This profile is unclaimed</div><div style={{fontSize:13,color:'var(--muted)',lineHeight:1.5}}>This profile was created by the myInvestorCircle team. If you're {data?.profile?.full_name||username}, claim it using your personal invite link.</div></>
                }
              </div>
            </div>
            <div className="card" style={{padding:'20px 24px',marginBottom:20}}>
              <div style={{display:'flex',alignItems:'center',gap:14}}>
                <div className="av" style={{width:56,height:56,fontSize:20,flexShrink:0,background:'var(--grad)'}}>{initialsOf(data?.profile?.full_name||username)}</div>
                <div>
                  <div style={{fontWeight:800,fontSize:20}}>{data?.profile?.full_name}</div>
                  <div style={{fontSize:13,color:'var(--muted)'}}>@{username}</div>
                </div>
              </div>
              {data?.profile?.bio && <div style={{fontSize:13,marginTop:14,color:'var(--ink)',lineHeight:1.6,paddingTop:14,borderTop:'1px solid var(--line)'}}>{data.profile.bio}</div>}
            </div>
            <div style={{fontSize:12,color:'var(--muted)',textAlign:'center'}}>The full track record and recommendations will be visible once the profile is claimed and approved.</div>
          </div>
        );
      }
    }
    // Spread-merge ({ ...defaults, ...(data.x||{}) }) fails because DB null values
    // overwrite the defaults; ?? correctly treats null/undefined as "use default".
    const d_p = data.profile  || {};
    const d_s = data.summary  || {};
    const d_l = data.live     || {};
    const d_r = data.realized || {};

    const profile = {
      id: d_p.id ?? '', first_name: d_p.first_name ?? '', last_name: d_p.last_name ?? '',
      full_name: d_p.full_name ?? '', email: d_p.email ?? '', bio: d_p.bio ?? '',
      avatar_color: d_p.avatar_color ?? '', avatar_url: d_p.avatar_url ?? '', username: d_p.username ?? '',
      connection_count: d_p.connection_count ?? 0, group_count: d_p.group_count ?? 0,
      tracking_count: d_p.tracking_count ?? 0,
      created_at: d_p.created_at ?? null,
      registration_status: d_p.registration_status ?? 'self_directed',
      sebi_approval_status: d_p.sebi_approval_status ?? 'not_applied',
      sebi_reg_number: d_p.sebi_reg_number ?? null,
      twitter_url: d_p.twitter_url ?? '', linkedin_url: d_p.linkedin_url ?? '',
      telegram_url: d_p.telegram_url ?? '', instagram_url: d_p.instagram_url ?? '',
    };
    const summary = {
      total:         d_s.total         ?? 0,
      closed:        d_s.closed        ?? 0,
      active:        d_s.active        ?? 0,
      years_history: d_s.years_history ?? 0,
    };
    const live = {
      count:            d_l.count            ?? 0,
      in_profit:        d_l.in_profit        ?? 0,
      in_loss:          d_l.in_loss          ?? 0,
      avg_return:       d_l.avg_return       ?? 0,
      avg_holding_days: d_l.avg_holding_days ?? 0,
      best:             d_l.best             ?? null,
      worst:            d_l.worst            ?? null,
    };
    const realized = {
      count:            d_r.count            ?? 0,
      hit_rate_pct:     d_r.hit_rate_pct     ?? 0,
      median_return:    d_r.median_return     ?? 0,
      avg_return:       d_r.avg_return        ?? 0,
      avg_holding_days: d_r.avg_holding_days  ?? 0,
      win_count:        d_r.win_count         ?? 0,
      loss_count:       d_r.loss_count        ?? 0,
      risk_adjusted:    d_r.risk_adjusted      ?? 0,
      best:             d_r.best               ?? null,
    };
    const sectors = Array.isArray(data.sectors) ? data.sectors : [];
    const recos   = Array.isArray(data.recos)   ? data.recos   : [];
    const displayName=[profile.first_name,profile.last_name].filter(Boolean).join(' ')||profile.full_name||username;
    const memberSince=profile.created_at?new Date(profile.created_at).toLocaleDateString('en-IN',{month:'short',year:'numeric'}):null;

    // Guard computeIci — it may throw or return without components on edge cases
    let ici = { score:0, band:'New', components:[] };
    try {
      const result = computeIci({
        years_history:       Number(summary.years_history)  || 0,
        total:               Number(summary.total)          || 0,
        hit_rate_pct:        Number(realized.hit_rate_pct)  || 0,
        median_return:       Number(realized.median_return)  || 0,
        risk_adjusted_return:Number(realized.risk_adjusted) || 0,
      });
      if (result) ici = { ...ici, ...result, components: Array.isArray(result.components) ? result.components : [] };
    } catch(_) {}

    const filteredRecos=recTab==='All'?recos:recos.filter(r=>r.status===recTab);
    const recoIdNotPublic=recoId&&data&&!recos.find(r=>r.id===recoId);

    const showAddBtn=!isOwnProfile&&viewerUser&&!connected&&connStatus!=='pending';
    const showPending=!isOwnProfile&&viewerUser&&connStatus==='pending';
    const showConnected=!isOwnProfile&&viewerUser&&connected;
    const showJoinBtn=!isOwnProfile&&!viewerUser;

    // Admin preview helpers — computed inside renderContent from component-level claimInfo state.
    // adminLinkCopied state lives at component level (above) to comply with React rules of hooks.
    const adminClaimLink = claimInfo?.claim_token
      ? `${window.location.origin}${window.location.pathname}?claim_token=${claimInfo.claim_token}`
      : null;
    const copyAdminLink = () => {
      if (!adminClaimLink) return;
      navigator.clipboard.writeText(adminClaimLink)
        .then(()=>{ setAdminLinkCopied(true); setTimeout(()=>setAdminLinkCopied(false),2000); })
        .catch(()=>{});
    };

    return (
      <>
        {/* ── Claim invitation banner — for creator visiting via claim link ── */}
        {isUnclaimed && viewerForClaim && (
          <div style={{
            background:'linear-gradient(135deg,#6d5df5 0%,#a855f7 100%)',
            borderRadius:14, padding:'18px 20px', marginBottom:20,
          }}>
            <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
              <div style={{flex:1,minWidth:180}}>
                <div style={{fontWeight:800,fontSize:16,color:'#fff',marginBottom:4}}>
                  🎉 Your investor profile is ready to claim
                </div>
                <div style={{fontSize:13,color:'rgba(255,255,255,.8)',lineHeight:1.5}}>
                  This is exactly how your profile will look once live.
                  All seeded recommendations are linked — claim it to go live.
                </div>
              </div>
              <button
                onClick={onClaimClick}
                style={{
                  background:'#fff', color:'#6d5df5', fontWeight:800,
                  fontSize:13, padding:'10px 22px', borderRadius:10,
                  border:'none', cursor:'pointer',
                  boxShadow:'0 4px 12px rgba(0,0,0,.2)', whiteSpace:'nowrap',
                  width: '100%', maxWidth: 280,  // full-width on mobile, capped on desktop
                }}
              >
                <UserPlus size={14} style={{verticalAlign:-2,marginRight:7}}/>Claim this profile
              </button>
            </div>
          </div>
        )}

        {/* ── Admin-only preview banner for unclaimed profiles ── */}
        {isUnclaimed && isViewerAdmin && (
          <div style={{
            background:'rgba(251,146,60,.08)',
            border:'1.5px solid rgba(251,146,60,.45)',
            borderRadius:14, padding:'14px 18px', marginBottom:20,
          }}>
            <div style={{display:'flex',alignItems:'flex-start',gap:12,flexWrap:'wrap'}}>
              <div style={{flex:1,minWidth:200}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                  <span style={{fontSize:13,fontWeight:800,color:'#ea580c'}}>
                    🔧 Admin preview
                  </span>
                  <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:20,
                    background: claimStatus==='pending_approval'?'rgba(109,93,245,.15)':'rgba(251,191,36,.15)',
                    color:      claimStatus==='pending_approval'?'var(--accent)':'#92400e',
                  }}>
                    {claimStatus==='pending_approval' ? '⏳ Claim pending approval' : '👤 Unclaimed'}
                  </span>
                </div>
                <div style={{fontSize:12,color:'#92400e',lineHeight:1.55}}>
                  This view is <strong>only visible to admins</strong>. The public sees a restricted version without recommendations. Review all seeded content below before sharing the claim link.
                </div>
              </div>
              <div style={{display:'flex',gap:8,flexShrink:0,flexWrap:'wrap',alignItems:'center'}}>
                {adminClaimLink ? (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={copyAdminLink}
                    style={{fontSize:11,borderColor:'rgba(251,146,60,.4)',color:'#ea580c'}}
                  >
                    {adminLinkCopied ? <><Check size={12}/> Copied!</> : <><Copy size={12}/> Copy claim link</>}
                  </button>
                ) : (
                  <span style={{fontSize:11,color:'var(--muted)',fontStyle:'italic'}}>
                    Claim link used / pending
                  </span>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={onBack}
                  style={{fontSize:11,borderColor:'rgba(251,146,60,.4)',color:'#ea580c'}}
                  title="Go back to Admin panel"
                >
                  <Database size={12}/> Admin panel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── IDENTITY CARD ── */}
        <div style={{background:'#0f1117',borderRadius:18,overflow:'hidden',marginBottom:16,border:'1px solid rgba(255,255,255,.07)',boxShadow:'0 8px 32px rgba(0,0,0,.4)'}}>

          {/* ── Hero: strict 50-50 layout — left = avatar+bio, right = ICI ── */}
          <div style={{display:'flex', flexWrap:'wrap', padding:'18px 28px 0', gap:24, alignItems:'stretch'}}>

            {/* ── LEFT 50%: avatar + bio ── */}
            <div style={{
              ...(isMobile ? {flex:'0 0 100%'} : {flex:'1 1 0', maxWidth:'calc(50% - 12px)'}),
              minWidth:0, display:'flex', gap:18, alignItems:'flex-start',
            }}>
              {/* Avatar */}
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" style={{width:76,height:76,borderRadius:20,objectFit:'cover',flexShrink:0,boxShadow:'0 4px 20px rgba(109,93,245,.4)'}}/>
              ) : (
                <div style={{width:76,height:76,borderRadius:20,background:profile.avatar_color||'linear-gradient(135deg,#6d5df5,#cf52d8)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,fontWeight:900,color:'#fff',flexShrink:0,boxShadow:'0 4px 20px rgba(109,93,245,.4)',letterSpacing:'-.5px'}}>
                  {initialsOf(displayName)}
                </div>
              )}

              {/* Bio content */}
              <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:10}}>
                {/* Name + badges */}
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                  <span style={{fontSize:22,fontWeight:900,color:'#fff',letterSpacing:'-.6px',lineHeight:1.1}}>{displayName}</span>
                  {(()=>{
                    const status=profile.registration_status||'self_directed';
                    const approved=profile.sebi_approval_status==='approved';
                    const isSebi=['sebi_ra','sebi_ria'].includes(status);
                    const label=isSebi&&approved?(status==='sebi_ra'?'SEBI RA':'SEBI RIA'):(status==='enthusiast'?'Enthusiast':'Self-directed');
                    return <span style={{fontSize:10,fontWeight:800,padding:'3px 8px',borderRadius:5,background:'rgba(255,255,255,.1)',color:'rgba(255,255,255,.75)',border:'1px solid rgba(255,255,255,.14)',textTransform:'uppercase',letterSpacing:'.06em',flexShrink:0}}>{label}</span>;
                  })()}
                  {(()=>{
                    const status=profile.registration_status||'self_directed';
                    const approved=profile.sebi_approval_status==='approved';
                    const isSebi=['sebi_ra','sebi_ria'].includes(status);
                    if(isSebi&&approved) return <span style={{fontSize:10,fontWeight:800,padding:'3px 8px',borderRadius:5,background:'rgba(21,146,78,.2)',color:'#4ade80',border:'1px solid rgba(21,146,78,.35)',textTransform:'uppercase',letterSpacing:'.06em',flexShrink:0}}>✓ SEBI{profile.sebi_reg_number?` · ${profile.sebi_reg_number}`:''}</span>;
                    return <span style={{fontSize:10,fontWeight:800,padding:'3px 8px',borderRadius:5,background:'rgba(244,63,94,.15)',color:'#fb7185',border:'1px solid rgba(244,63,94,.3)',textTransform:'uppercase',letterSpacing:'.06em',flexShrink:0}}>Non-SEBI</span>;
                  })()}
                </div>

                {/* Username + since */}
                <div style={{fontSize:13,color:'rgba(255,255,255,.45)',display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontWeight:600}}>@{username}</span>
                  {memberSince&&<><span style={{opacity:.4}}>·</span><span>Member since {memberSince}</span></>}
                </div>

                {/* Bio */}
                {profile.bio
                  ? <p style={{fontSize:14,color:'rgba(255,255,255,.75)',lineHeight:1.7,margin:0}}>{profile.bio}</p>
                  : isOwnProfile&&<p style={{fontSize:13,color:'rgba(255,255,255,.25)',fontStyle:'italic',margin:0}}>No bio yet — click Edit profile to add one.</p>}

                {/* Social icons + action buttons */}
                <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                  {['twitter','linkedin','telegram','instagram'].map(p=>(
                    <SocialIconBtn key={p} platform={p} url={profile[`${p}_url`]}/>
                  ))}
                  {!isOwnProfile && viewerUser && (
                    <button className="btn btn-sm" disabled={trackBusy} onClick={handleToggleTrack}
                      style={tracking
                        ? {background:'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.22)',color:'rgba(255,255,255,.85)',marginLeft:4}
                        : {background:'rgba(109,93,245,.85)',border:'none',color:'#fff',marginLeft:4}}>
                      {trackBusy?<Loader size={13} className="spin"/>:tracking?<><Check size={13}/>Tracking</>:<><Radar size={13}/>Track</>}
                    </button>
                  )}
                  {showAddBtn&&<button className="btn btn-pri btn-sm" disabled={connecting} onClick={handleConnect} style={{background:'rgba(109,93,245,.85)',border:'none',marginLeft:4}}>{connecting?<><Loader size={13} className="spin"/>Sending…</>:<><UserPlus size={13}/>Connect</>}</button>}
                  {showPending&&<span style={{fontSize:12,color:'rgba(255,255,255,.5)',display:'flex',alignItems:'center',gap:5,marginLeft:4}}><Check size={12}/>Request Pending</span>}
                  {showConnected&&<span style={{fontSize:12,color:'rgba(255,255,255,.5)',display:'flex',alignItems:'center',gap:5,marginLeft:4}}><Check size={12}/>Connected</span>}
                  {showJoinBtn&&<button className="btn btn-pri btn-sm" onClick={()=>onRequestConnect(data.profile.id)} style={{background:'rgba(109,93,245,.85)',border:'none',marginLeft:4}}><UserPlus size={13}/>Track / Connect</button>}
                </div>

                {/* Edit button */}
                {isOwnProfile&&(
                  <div>
                    <button onClick={startEdit} style={{fontSize:12,fontWeight:700,background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.15)',color:'rgba(255,255,255,.7)',cursor:'pointer',padding:'6px 14px',borderRadius:8,display:'inline-flex',alignItems:'center',gap:6,fontFamily:'var(--font)'}}>
                      <Pencil size={12}/>Edit profile
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── RIGHT 50%: ICI widget ── */}
            <div className="ici-panel" style={{
              ...(isMobile ? {flex:'0 0 100%',minWidth:0} : {flex:'1 1 0',maxWidth:'calc(50% - 12px)',minWidth:0}),
              background:'linear-gradient(145deg,#1c0d4a 0%,#160b3d 50%,#0f1130 100%)',
              border:'1px solid rgba(139,92,246,.6)',
              borderRadius:20,
              padding:'20px 24px 16px',
              boxShadow:'0 0 0 1px rgba(139,92,246,.15),0 4px 24px rgba(109,93,245,.5),0 16px 48px rgba(109,93,245,.3),inset 0 1px 0 rgba(255,255,255,.08)',
            }}>
              <div style={{fontSize:14,fontWeight:800,color:'#fff',letterSpacing:'-.2px',marginBottom:16,display:'flex',alignItems:'center',gap:8}}>
                <span style={{display:'inline-flex',width:6,height:6,borderRadius:'50%',background:'#a78bfa',boxShadow:'0 0 8px #a78bfa'}}/>
                Investor Circle Credibility Index
              </div>
              <div className="ici-body" style={{display:'flex',gap:24,alignItems:'center'}}>
                <IciDonut score={ici.score} band={ici.band}/>
                <div style={{flex:1,minWidth:0}}>
                  {ici.components.map(c=>{
                    const pct=c.max>0?(c.score/c.max)*100:0;
                    const barCol=pct>=80?'#4ade80':pct>=50?'#a78bfa':pct>0?'#fbbf24':'rgba(255,255,255,.06)';
                    return (
                      <div key={c.label} style={{marginBottom:12}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:8,marginBottom:4}}>
                          <span style={{fontSize:11.5,color:'rgba(255,255,255,.85)',fontWeight:600,flex:1,minWidth:0}}>{c.label}</span>
                          <span style={{fontSize:11.5,color:'rgba(255,255,255,.65)',fontWeight:700,flexShrink:0}}>{c.score}/{c.max}</span>
                        </div>
                        <div style={{height:4,background:'rgba(255,255,255,.08)',borderRadius:3,overflow:'hidden'}}>
                          <div style={{height:'100%',width:`${pct}%`,background:`linear-gradient(90deg,${barCol},${barCol}bb)`,borderRadius:3,transition:'width .5s ease',boxShadow:pct>0?`0 0 6px ${barCol}88`:'none'}}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ── Footer strip: left 50% = stats (under bio), right 50% = learn more (under ICI) ── */}
          <div style={{display:'flex',flexWrap:'wrap',borderTop:'1px solid rgba(255,255,255,.07)',marginTop:16,background:'rgba(0,0,0,.25)'}}>

            {/* Left 50%: compact stats — visual extension of bio column */}
            <div style={{
              ...(isMobile?{flex:'0 0 100%',borderBottom:'1px solid rgba(255,255,255,.07)'}:{flex:'1 1 0',borderRight:'1px solid rgba(255,255,255,.07)'}),
              display:'flex',gap:16,flexWrap:'wrap',alignItems:'center',padding:'9px 28px',
            }}>
              {[
                {val:summary.total,                label:'Ideas'},
                {val:profile.tracking_count||0,    label:'Tracking'},
                {val:profile.connection_count||0,  label:'Connections'},
                {val:profile.group_count||0,       label:'Circles'},
                {val:summary.active,               label:'Active'},
                {val:summary.closed,               label:'Closed'},
                {val:`${summary.years_history.toFixed(1)}y`, label:'History'},
              ].map((s,i)=>(
                <React.Fragment key={s.label}>
                  {i>0&&<span style={{color:'rgba(255,255,255,.1)',fontSize:12}}>·</span>}
                  <div style={{display:'flex',alignItems:'baseline',gap:4}}>
                    <span style={{fontSize:14,fontWeight:800,color:'#fff',letterSpacing:'-.4px',fontFamily:'var(--font)'}}>{s.val}</span>
                    <span style={{fontSize:10,fontWeight:600,color:'rgba(255,255,255,.35)',textTransform:'uppercase',letterSpacing:'.06em'}}>{s.label}</span>
                  </div>
                </React.Fragment>
              ))}
            </div>

            {/* Right 50%: learn more — visual extension of ICI column */}
            <div style={{
              ...(isMobile?{flex:'0 0 100%'}:{flex:'1 1 0'}),
              display:'flex',alignItems:'center',justifyContent:'flex-end',padding:'9px 28px',
            }}>
              <a href="#methodology" style={{fontSize:11.5,color:'#c4b5fd',textDecoration:'none',fontWeight:600,letterSpacing:'.01em'}}>How is the ICI Score calculated? Learn More →</a>
            </div>
          </div>
        </div>

        {/* ── EDIT PROFILE MODAL ── */}
        {editing && createPortal(
          <div className="modal-overlay" style={{position:'fixed',inset:0,background:'rgba(13,14,30,.65)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:'20px'}} onClick={()=>setEditing(false)}>
            <div style={{width:'100%',maxWidth:560,maxHeight:'90vh',overflowY:'auto',background:'#16182a',borderRadius:20,border:'1px solid rgba(255,255,255,.1)',boxShadow:'0 24px 80px rgba(0,0,0,.6)'}} onClick={e=>e.stopPropagation()}>
              {/* Modal header */}
              <div style={{padding:'20px 24px 16px',borderBottom:'1px solid rgba(255,255,255,.08)',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,background:'#16182a',zIndex:1,borderRadius:'20px 20px 0 0'}}>
                <div style={{fontSize:17,fontWeight:800,color:'#fff'}}>Edit Profile</div>
                <button onClick={()=>setEditing(false)} style={{background:'rgba(255,255,255,.08)',border:'none',color:'rgba(255,255,255,.7)',cursor:'pointer',width:32,height:32,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontFamily:'inherit'}}>×</button>
              </div>

              <div style={{padding:'24px'}}>
                {/* Avatar color */}
                <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Avatar colour</div>
                <div style={{display:'flex',gap:8,marginBottom:22}}>
                  {['#6d5df5','#cf52d8','#15924e','#0ea5b7','#d97706','#e11d48','#2563eb','#64748b'].map(c=>(
                    <div key={c} onClick={()=>setEditAvatarColor(c)} style={{width:32,height:32,borderRadius:9,background:c,cursor:'pointer',border:editAvatarColor===c?'2px solid #fff':'2px solid transparent',boxSizing:'border-box',transition:'.1s',boxShadow:editAvatarColor===c?`0 0 12px ${c}88`:''}}/>
                  ))}
                  <div onClick={()=>setEditAvatarColor('')} style={{width:32,height:32,borderRadius:9,background:'linear-gradient(135deg,#6d5df5,#cf52d8)',cursor:'pointer',border:!editAvatarColor?'2px solid #fff':'2px solid transparent',boxSizing:'border-box',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,color:'#fff',fontWeight:800}}>AUTO</div>
                </div>

                {/* Name */}
                <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Name</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:20}}>
                  {[{val:editFirstName,set:setEditFirstName,ph:'First name'},{val:editLastName,set:setEditLastName,ph:'Last name'}].map((f,i)=>(
                    <input key={i} value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph}
                      style={{background:'rgba(255,255,255,.07)',border:'1px solid rgba(255,255,255,.12)',borderRadius:9,padding:'10px 13px',fontSize:14,color:'#fff',fontFamily:'var(--font)',outline:'none',boxSizing:'border-box',width:'100%'}}/>
                  ))}
                </div>

                {/* Read-only username + email — email auto-populated from auth */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:20}}>
                  {[{label:'Username',val:`@${username}`},{label:'Email',val:profile.email||viewerUser?.email||''}].map((f,i)=>(
                    <div key={i}>
                      <div style={{fontSize:11,color:'rgba(255,255,255,.35)',marginBottom:6,display:'flex',alignItems:'center',gap:4,fontWeight:600}}><Lock size={10}/>{f.label} <span style={{fontWeight:400,fontSize:10}}>(cannot be changed)</span></div>
                      <div style={{background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.07)',borderRadius:9,padding:'10px 13px',fontSize:13,color:'rgba(255,255,255,.4)',fontFamily:'inherit'}}>{f.val||<span style={{opacity:.4,fontStyle:'italic'}}>not set</span>}</div>
                    </div>
                  ))}
                </div>

                {/* Bio */}
                <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Bio</div>
                <textarea value={editBio} onChange={e=>setEditBio(e.target.value)} rows={3} maxLength={300} placeholder="Describe your investment approach…"
                  style={{width:'100%',background:'rgba(255,255,255,.07)',border:'1px solid rgba(255,255,255,.12)',borderRadius:9,padding:'10px 13px',fontSize:14,color:'#fff',fontFamily:'var(--font)',resize:'vertical',outline:'none',boxSizing:'border-box'}}/>
                <div style={{fontSize:11,color:'rgba(255,255,255,.3)',textAlign:'right',marginTop:4,marginBottom:20}}>{editBio.length}/300</div>

                {/* Social links */}
                <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Social profile links</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:20}}>
                  {[
                    {key:'twitter',label:'Twitter / X',ph:'https://twitter.com/username'},
                    {key:'linkedin',label:'LinkedIn',ph:'https://linkedin.com/in/username'},
                    {key:'telegram',label:'Telegram',ph:'https://t.me/username'},
                    {key:'instagram',label:'Instagram',ph:'https://instagram.com/username'},
                  ].map(s=>(
                    <div key={s.key}>
                      <div style={{fontSize:11,color:'rgba(255,255,255,.4)',marginBottom:6,fontWeight:600}}>{s.label}</div>
                      <input value={editSocials[s.key]} onChange={e=>setEditSocials(p=>({...p,[s.key]:e.target.value}))} placeholder={s.ph}
                        style={{width:'100%',background:'rgba(255,255,255,.07)',border:'1px solid rgba(255,255,255,.12)',borderRadius:9,padding:'9px 12px',fontSize:13,color:'#fff',fontFamily:'var(--font)',outline:'none',boxSizing:'border-box'}}/>
                    </div>
                  ))}
                </div>

                {/* Registration status */}
                <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Investor type</div>
                <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:20}}>
                  {(regOptions.length ? regOptions : [
                    {code:'self_directed',label:'Self-directed Investor',description:'Invests own money independently.',requires_sebi_fields:false},
                    {code:'enthusiast',label:'Market Enthusiast',description:'Passionate about markets, shares ideas informally.',requires_sebi_fields:false},
                    {code:'sebi_ra',label:'SEBI Registered Research Analyst',description:'INH000XXXXXX format.',requires_sebi_fields:true},
                    {code:'sebi_ria',label:'SEBI Registered Investment Adviser',description:'INA000XXXXXX format.',requires_sebi_fields:true},
                  ]).map(opt=>(
                    <label key={opt.code} style={{display:'flex',alignItems:'flex-start',gap:10,cursor:'pointer',padding:'11px 14px',borderRadius:10,background:editRegStatus===opt.code?'rgba(109,93,245,.2)':'rgba(255,255,255,.04)',border:`1px solid ${editRegStatus===opt.code?'rgba(109,93,245,.55)':'rgba(255,255,255,.08)'}`,transition:'.15s'}}>
                      <input type="radio" name="regStatus" value={opt.code} checked={editRegStatus===opt.code} onChange={()=>setEditRegStatus(opt.code)} style={{accentColor:'#6d5df5',marginTop:3,flexShrink:0}}/>
                      <div><div style={{fontSize:14,fontWeight:700,color:'#fff'}}>{opt.label}</div><div style={{fontSize:12,color:'rgba(255,255,255,.4)',marginTop:2,lineHeight:1.4}}>{opt.description}</div></div>
                    </label>
                  ))}
                </div>

                {/* SEBI fields */}
                {['sebi_ra','sebi_ria'].includes(editRegStatus) && (<>
                  <div style={{background:'rgba(251,191,36,.08)',border:'1px solid rgba(251,191,36,.2)',borderRadius:10,padding:'12px 14px',marginBottom:16,fontSize:13,color:'#fbbf24',lineHeight:1.6}}>
                    {sebiVerifyMsg || 'Your SEBI registration details will be reviewed by our team within 2–3 business days.'}
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:20}}>
                    {[
                      {label:'SEBI Registration Number',ph:editRegStatus==='sebi_ra'?'INH000XXXXXX':'INA000XXXXXX',val:editSebiNum,set:setEditSebiNum},
                      {label:'Registration Valid Till',ph:'',val:editSebiTill,set:setEditSebiTill,type:'date'},
                      {label:'Firm / Employer Name (optional)',ph:'e.g. XYZ Securities',val:editSebiFirm,set:setEditSebiFirm},
                    ].map((f,i)=>(
                      <div key={i} style={i===2?{gridColumn:'1/span 2'}:{}}>
                        <div style={{fontSize:11,color:'rgba(255,255,255,.4)',marginBottom:6,fontWeight:600}}>{f.label}</div>
                        <input type={f.type||'text'} value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph}
                          style={{width:'100%',background:'rgba(255,255,255,.07)',border:'1px solid rgba(255,255,255,.12)',borderRadius:9,padding:'10px 13px',fontSize:13,color:'#fff',fontFamily:'var(--font)',outline:'none',boxSizing:'border-box',colorScheme:'dark'}}/>
                      </div>
                    ))}
                  </div>
                </>)}

                {/* Footer buttons */}
                {editErr && (
                  <div style={{background:'rgba(225,29,72,.12)',border:'1px solid rgba(225,29,72,.35)',borderRadius:10,padding:'10px 14px',marginBottom:14,fontSize:13,color:'#fca5b5'}}>
                    {editErr}
                  </div>
                )}
                <div style={{display:'flex',gap:10,justifyContent:'flex-end',borderTop:'1px solid rgba(255,255,255,.07)',paddingTop:16}}>
                  <button onClick={()=>{setEditing(false);setEditErr('');}} style={{padding:'10px 20px',borderRadius:10,fontWeight:700,fontSize:14,cursor:'pointer',background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.15)',color:'#fff',fontFamily:'var(--font)'}}>
                    Cancel
                  </button>
                  <button className="btn btn-pri" disabled={savingEdit} onClick={saveEdit} style={{padding:'10px 24px',fontSize:14}}>
                    {savingEdit?<><Loader size={14} className="spin"/> Saving…</>:<><Check size={14}/> Save changes</>}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
        <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:14,marginBottom:14}}>

          <div className="card">
            <div className="card-head">
              <span style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                <span style={{width:8,height:8,borderRadius:'50%',background:'var(--gain)',display:'inline-block',flexShrink:0}}/>
                <span style={{fontSize:13,fontWeight:700}}>Live Scorecard</span>
                <span className="muted small">Active positions</span>
              </span>
            </div>
            <div className="card-body">
              {live.count===0?<div className="empty" style={{padding:'20px 0'}}>No active recommendations.</div>:(<>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:9,marginBottom:10}}>
                  <ScoreBox val={live.count} label="Active" big mobile={isMobile}/>
                  <ScoreBox val={`${live.in_profit} (${live.count?Math.round(live.in_profit/live.count*100):0}%)`} label="In Profit" col="var(--gain)" big mobile={isMobile}/>
                  <ScoreBox val={`${live.in_loss} (${live.count?Math.round(live.in_loss/live.count*100):0}%)`} label="In Loss" col="var(--loss)" big mobile={isMobile}/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:9,marginBottom:10}}>
                  <ScoreBox val={<RetBadge pct={live.avg_return}/>} label="Avg Return" mobile={isMobile}/>
                  <ScoreBox val={`${live.avg_holding_days||0}d`} label="Avg Holding" mobile={isMobile}/>
                  <ScoreBox val="—" label="vs NIFTY" mobile={isMobile}/>
                </div>
                {(live.best||live.worst)&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}>
                  {live.best&&<ScoreBox val={<><b>{live.best.ticker}</b> <RetBadge pct={live.best.ret_pct}/></>} label="Best" mobile={isMobile}/>}
                  {live.worst&&<ScoreBox val={<><b>{live.worst.ticker}</b> <RetBadge pct={live.worst.ret_pct}/></>} label="Worst" mobile={isMobile}/>}
                </div>}
              </>)}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <span style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                <span style={{width:8,height:8,borderRadius:'50%',background:'var(--accent)',display:'inline-block',flexShrink:0}}/>
                <span style={{fontSize:13,fontWeight:700}}>Realized Scorecard</span>
                <span className="muted small">Closed only</span>
              </span>
            </div>
            <div className="card-body">
              {realized.count===0?<div className="empty" style={{padding:'20px 0'}}>No closed recommendations yet.</div>:(<>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:9,marginBottom:10}}>
                  <ScoreBox val={realized.count} label="Closed" big mobile={isMobile}/>
                  <ScoreBox val={`${realized.hit_rate_pct.toFixed(1)}%`} label="Hit Rate" col={realized.hit_rate_pct>=50?'var(--gain)':'var(--loss)'} big mobile={isMobile}/>
                  <ScoreBox val={<RetBadge pct={realized.median_return}/>} label="Median Ret." big mobile={isMobile}/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:isMobile?'repeat(2,1fr)':'repeat(4,1fr)',gap:9,marginBottom:10}}>
                  <ScoreBox val={<RetBadge pct={realized.avg_return}/>} label="Avg Return" mobile={isMobile}/>
                  <ScoreBox val={`${realized.avg_holding_days||0}d`} label="Avg Holding" mobile={isMobile}/>
                  <ScoreBox val={`${realized.win_count}/${realized.loss_count}`} label="Win/Loss" mobile={isMobile}/>
                  <ScoreBox val={(isNaN(realized.risk_adjusted)||!isFinite(realized.risk_adjusted))?'—':Number(realized.risk_adjusted).toFixed(2)} label="Risk-Adj." mobile={isMobile}/>
                </div>
                {realized.best&&<div style={{padding:'9px 12px',background:'var(--gain-soft)',borderRadius:9,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:6}}>
                  <span style={{fontSize:12,fontWeight:600,color:'var(--gain)'}}>Best Closed Trade</span>
                  <span><b>{realized.best.ticker}</b> <RetBadge pct={realized.best.ret_pct}/></span>
                </div>}
              </>)}
            </div>
          </div>
        </div>

        <div style={{display:'flex',gap:8,alignItems:'center',padding:'9px 14px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:10,marginBottom:14,fontSize:12,color:'var(--muted)'}}>
          <AlertTriangle size={13} style={{flexShrink:0}}/><span>Returns on active positions use current price and may change daily. Only closed recommendations feed the realized scorecard.</span>
        </div>

        {/* ── CIRCLES ── */}
        {(circles.public.length>0 || circles.private.length>0) && (
          <div className="card" style={{marginBottom:14}}>
            <div className="card-head"><Layers size={14} style={{verticalAlign:-2,marginRight:4}}/> Circles</div>
            <div className="card-body" style={{display:'flex',flexDirection:'column',gap:14}}>
              {circles.public.length>0 && (
                <div>
                  <div className="muted small" style={{fontWeight:700,marginBottom:8,textTransform:'uppercase',letterSpacing:'.04em',fontSize:11}}>Public Circles</div>
                  <div style={{display:'flex',flexDirection:'column',gap:8}}>
                    {circles.public.map(c=>(
                      <div key={c.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,padding:'10px 12px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:10}}>
                        <div style={{cursor:'pointer',minWidth:0}} onClick={()=>gotoCircle(c.slug)}>
                          <div style={{fontWeight:700,fontSize:13.5}}>{c.name}</div>
                          <div className="muted small">{c.member_count} member{c.member_count!==1?'s':''}{c.description?` · ${c.description}`:''}</div>
                        </div>
                        {isOwnProfile
                          ? <button className="btn btn-ghost btn-sm" onClick={()=>gotoCircle(c.slug)}>View</button>
                          : c._requested
                            ? <span className="pill" style={{fontSize:11,flexShrink:0}}>Requested</span>
                            : <button className="btn btn-pri btn-sm" disabled={joiningCircle===c.id} onClick={()=>handleJoinCircle(c)} style={{flexShrink:0}}>
                                {joiningCircle===c.id?<Loader size={13} className="spin"/>:'Subscribe'}
                              </button>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {circles.private.length>0 && (
                <div>
                  <div className="muted small" style={{fontWeight:700,marginBottom:8,textTransform:'uppercase',letterSpacing:'.04em',fontSize:11}}><Lock size={10} style={{verticalAlign:-1,marginRight:3}}/>Private Circles</div>
                  <div style={{display:'flex',flexDirection:'column',gap:8}}>
                    {circles.private.map(c=>(
                      <div key={c.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,padding:'10px 12px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:10,cursor:'pointer'}} onClick={()=>gotoCircle(c.slug)}>
                        <div style={{minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:13.5}}>{c.name}</div>
                          <div className="muted small">{c.member_count} member{c.member_count!==1?'s':''}</div>
                        </div>
                        <button className="btn btn-ghost btn-sm" style={{flexShrink:0}}>View</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SECTOR PERFORMANCE ── */}
        {sectors.length>0&&(
          <div className="card" style={{marginBottom:14}}>
            <div className="card-head">
              <span style={{fontSize:13,fontWeight:700}}>Sector Performance</span>
              <div style={{display:'flex',gap:12,fontSize:11,color:'var(--muted)'}}>
                <span><span style={{display:'inline-block',width:10,height:10,borderRadius:3,background:'var(--gain)',marginRight:4}}/> Active Success %</span>
                <span><span style={{display:'inline-block',width:10,height:10,borderRadius:3,background:'var(--accent)',marginRight:4}}/> Closed Hit Rate %</span>
              </div>
            </div>
            <div style={{padding:'16px 20px 12px',overflowX:'auto'}}>
              <div style={{display:'flex',gap:20,minWidth:'max-content'}}>
                {sectors.map(s=>{
                  const ap=s.active_count?Math.round(s.active_in_profit/s.active_count*100):null;
                  const cp=s.closed_count?Math.round(s.closed_wins/s.closed_count*100):null;
                  return(
                    <div key={s.sector} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,minWidth:90}}>
                      <div style={{display:'flex',gap:4,alignItems:'flex-end',height:52}}>
                        {ap!=null&&<div style={{width:20,height:`${Math.max(ap,4)}%`,background:'var(--gain)',borderRadius:'4px 4px 0 0'}} title={`Active: ${ap}%`}/>}
                        {cp!=null&&<div style={{width:20,height:`${Math.max(cp,4)}%`,background:'var(--accent)',borderRadius:'4px 4px 0 0'}} title={`Closed: ${cp}%`}/>}
                      </div>
                      <div style={{fontSize:10.5,fontWeight:700,display:'flex',gap:5}}>
                        {ap!=null&&<span style={{color:'var(--gain)'}}>{ap}%</span>}
                        {cp!=null&&<span style={{color:'var(--accent)'}}>{cp}%</span>}
                      </div>
                      <div style={{fontSize:11,fontWeight:700,textAlign:'center',lineHeight:1.3}}>{SECTOR_EMOJI[s.sector]||'•'} {s.sector}</div>
                      <div style={{fontSize:10,color:'var(--muted)'}}>{s.total_recs} rec{s.total_recs!==1?'s':''}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── RECOMMENDATION TIMELINE ── */}
        <div className="card" style={{marginBottom:14}}>
          <div className="card-head">
            <span style={{fontSize:13,fontWeight:700}}>Recommendation History</span>
            <span className="muted small">Public record · Permanent &amp; immutable</span>
          </div>
          <div style={{display:'flex',gap:0,borderBottom:'1px solid var(--line)',padding:'0 16px'}}>
            {[
              {key:'All',count:recos.length},
              {key:'Active',count:recos.filter(r=>r.status==='Active').length},
              {key:'Closed',count:recos.filter(r=>r.status==='Closed').length},
              {key:'Expired',count:recos.filter(r=>r.status==='Expired').length},
            ].map(t=>(
              <button key={t.key} onClick={()=>setRecTab(t.key)} style={{background:'none',border:'none',cursor:'pointer',padding:'11px 14px',fontWeight:700,fontSize:13,color:recTab===t.key?'var(--accent)':'var(--muted)',borderBottom:recTab===t.key?'2px solid var(--accent)':'2px solid transparent',marginBottom:-1,fontFamily:'inherit'}}>
                {t.key}{t.count>0&&<span style={{fontSize:11,marginLeft:4,opacity:.7}}>({t.count})</span>}
              </button>
            ))}
          </div>
          {recoIdNotPublic&&(
            <div style={{display:'flex',gap:10,alignItems:'flex-start',margin:'12px 16px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:12,padding:'12px 16px'}}>
              <Lock size={15} color="var(--muted)"/><div><div style={{fontWeight:700,fontSize:13,marginBottom:3}}>Recommendation not publicly visible</div><div className="muted small">This recommendation is only visible to the investor's network.</div></div>
            </div>
          )}
          <div style={{overflowX:'auto'}}>
            {filteredRecos.length===0
              ?<div className="empty" style={{padding:'32px 0'}}>No {recTab.toLowerCase()} recommendations.</div>
              :<table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead><tr style={{background:'#f9fafb',borderBottom:'2px solid var(--line)'}}>
                  {['Date','Instrument','Type','Entry ₹','Current ₹','Target','Stop Loss','Return','Status','Conviction','Holding'].map(h=>(
                    <th key={h} style={{padding:'9px 11px',textAlign:['Return','Entry ₹','Current ₹','Target','Stop Loss'].includes(h)?'right':'left',fontSize:10.5,fontWeight:700,letterSpacing:.06,textTransform:'uppercase',color:'var(--muted)',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>{filteredRecos.map(r=>{
                  const isLinked=r.id===recoId, isExpanded=r.id===expandedId;
                  const retPct=Number(r.return_pct||0);
                  return(<React.Fragment key={r.id}>
                    <tr ref={isLinked?expandedRef:null} className="hoverable"
                        style={{cursor:'pointer',background:isLinked?'var(--accent-soft)':undefined,outline:isLinked?'2px solid var(--accent)':undefined,outlineOffset:-2}}
                        onClick={()=>setExpandedId(isExpanded?null:r.id)}>
                      <td style={{padding:'10px 11px',color:'var(--muted)',fontSize:12,whiteSpace:'nowrap'}}>{r.created_at?new Date(r.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'2-digit'}):'-'}</td>
                      <td style={{padding:'10px 11px'}}><div style={{fontWeight:700}}>{r.ticker}</div><div style={{fontSize:11,color:'var(--muted)',maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.asset_name}</div></td>
                      <td style={{padding:'10px 11px'}}><TypeBadge t={r.recommendation_type}/></td>
                      <td style={{padding:'10px 11px',textAlign:'right',fontFamily:"'JetBrains Mono',monospace",fontSize:12}}>{r.reco_price?`₹${Number(r.reco_price).toLocaleString('en-IN')}`:'—'}</td>
                      <td style={{padding:'10px 11px',textAlign:'right',fontFamily:"'JetBrains Mono',monospace",fontSize:12}}>{r.current_price?`₹${Number(r.current_price).toLocaleString('en-IN')}`:'—'}</td>
                      <td style={{padding:'10px 11px',textAlign:'right',fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:'var(--muted)'}}>{r.target_price?`₹${Number(r.target_price).toLocaleString('en-IN')}`:'—'}</td>
                      <td style={{padding:'10px 11px',textAlign:'right',fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:'var(--loss)'}}>{r.stop_loss?`₹${Number(r.stop_loss).toLocaleString('en-IN')}`:'—'}</td>
                      <td style={{padding:'10px 11px',textAlign:'right'}}><RetBadge pct={retPct}/></td>
                      <td style={{padding:'10px 11px'}}><StatusBadge2 status={r.status}/></td>
                      <td style={{padding:'10px 11px'}}><ConvBadge level={r.conviction}/></td>
                      <td style={{padding:'10px 11px',color:'var(--muted)',fontSize:12,whiteSpace:'nowrap'}}>{r.holding_days?`${r.holding_days}d`:'—'} {isExpanded?'▲':'▼'}</td>
                    </tr>
                    {isExpanded&&r.thesis&&r.thesis!=='—'&&(
                      <tr><td colSpan={11} style={{padding:0}}>
                        <div style={{background:isLinked?'var(--accent-soft)':'var(--surface-2)',padding:'11px 16px',display:'flex',gap:16,flexWrap:'wrap'}}>
                          <div style={{flex:1}}><div style={{fontSize:10.5,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:.5,marginBottom:4}}>Thesis</div><div style={{fontSize:13,lineHeight:1.6,color:'var(--ink-soft)'}}>{r.thesis}</div></div>
                          {r.sector&&<div><div style={{fontSize:10.5,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:.5,marginBottom:4}}>Sector</div><div style={{fontSize:13}}>{SECTOR_EMOJI[r.sector]} {r.sector}</div></div>}
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>);
                })}</tbody>
              </table>}
          </div>
          <div style={{padding:'9px 16px',borderTop:'1px solid var(--line)',fontSize:11,color:'var(--muted)'}}>Returns calculated from entry price and current/exit price. Not investment advice.</div>
        </div>
        {/* ── Methodology ── */}
        <div id="methodology" className="card" style={{marginBottom:14}}>
          <div className="card-head"><span style={{fontSize:13,fontWeight:700}}>How is the ICI Score calculated?</span><a href="#methodology" style={{fontSize:12,fontWeight:700,color:'var(--accent-ink)',textDecoration:'none'}}>Learn More →</a></div>
          <div style={{padding:'14px 20px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            {[
              ['Hit Rate','Percentage of closed recommendations with a positive realized return.'],
              ['Median Return','Median realized return across closed positions. More robust than average.'],
              ['Risk-Adjusted Return','Average return ÷ standard deviation of returns (Sharpe-like, no risk-free rate).'],
              ['ICI Score','Track length (15%), volume (15%), hit rate (20%), median (15%), risk-adj (15%), transparency (10%), profile (10%).'],
              ['Active Positions','Use last known price. Indicative only — excluded from realized scorecard.'],
              ['Sector Attribution','Based on sector set at publication time.'],
            ].map(([h,p])=>(<div key={h}><div style={{fontSize:12,fontWeight:700,color:'var(--ink-soft)',marginBottom:3}}>{h}</div><div style={{fontSize:12,color:'var(--muted)',lineHeight:1.6}}>{p}</div></div>))}
          </div>
        </div>

        {/* ── Disclaimer ── */}
        <div style={{background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:14,padding:'14px 18px',fontSize:12,color:'var(--muted)',lineHeight:1.7}}>
          <strong style={{color:'var(--ink-soft)'}}>Regulatory Disclaimer:</strong> Investor Circle records publicly shared investment opinions and computes historical statistics using a transparent methodology. <strong>Investor Circle does not endorse or recommend any individual or investment.</strong> The individual shown is a self-directed investor and is <strong>not SEBI registered.</strong> Nothing here constitutes investment advice. Past performance does not indicate future results.
        </div>
      </>
    );
    } catch(renderErr) {
      console.error('PublicProfile renderContent error:', renderErr);
      return (
        <div style={{padding:'40px 24px',textAlign:'center'}}>
          <AlertTriangle size={32} color="var(--loss)" style={{marginBottom:14}}/>
          <div style={{fontWeight:700,fontSize:16,marginBottom:8}}>Profile failed to render</div>
          <div style={{fontSize:13,color:'var(--muted)',marginBottom:16}}>
            An error occurred while building your profile view.
          </div>
          <div style={{background:'var(--surface-2)',border:'1px solid var(--loss)',borderRadius:10,
              padding:'12px 16px',fontSize:12,fontFamily:'monospace',color:'var(--loss)',
              textAlign:'left',maxWidth:560,margin:'0 auto',wordBreak:'break-all'}}>
            {renderErr.message}
          </div>
        </div>
      );
    }
  };

  // ── Shell wrappers ──────────────────────────────────────────────────────────
  if(mode==='standalone') {
    return(
      <div style={{minHeight:'100vh',background:'var(--bg)',paddingBottom:48}}>
        <div style={{background:'var(--surface)',borderBottom:'1px solid var(--line)',padding:'8px 14px',display:'flex',alignItems:'center',gap:8,position:'sticky',top:0,zIndex:100}}>
          <img src="/mic-logo.png" alt="mic" style={{width:22,height:22,flexShrink:0}}/>
          <div style={{flex:1,minWidth:0,fontWeight:800,fontSize:13,lineHeight:1.1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>myInvestorCircle</div>
          {data && (
            <button ref={shareBtnRef} className="icon-btn" title="Share this profile" aria-label="Share this profile" onClick={()=>setShareOpen(true)} style={{flexShrink:0}}>
              <Share2 size={16}/>
            </button>
          )}
          {viewerUser
            ?<div style={{display:'flex',gap:6,flexShrink:0}}>
                <button className="btn btn-ghost btn-sm" style={{padding:'6px 10px'}} onClick={()=>goBackOrElse(onBack)} title="Go back"><ArrowLeft size={14}/> Back</button>
                <button className="btn btn-ghost btn-sm" style={{padding:'6px 10px'}} onClick={onBack} title="Home"><Home size={14}/> Home</button>
              </div>
            :<a href={window.location.pathname} style={{fontSize:13,fontWeight:600,color:'var(--accent)',textDecoration:'none',flexShrink:0}}>Sign in →</a>}
        </div>
        {shareOpen && (
          <ProfileSharePopover
            profileUrl={profileUrl}
            displayName={data?.profile?.full_name || username}
            anchorEl={shareBtnRef.current}
            onClose={()=>setShareOpen(false)}
          />
        )}
        <div style={{padding:'20px 20px 0'}}>{renderContent()}</div>
      </div>
    );
  }

  // Embedded (Track Record nav)
  return(<>
    <div className="page-head">
      <div><div className="eyebrow">Track Record</div><div className="page-title">Public Investment Record</div></div>
      <div style={{display:'flex',gap:8}}>
        {data&&<>
          <button className="btn btn-soft btn-sm" onClick={copyLink}>{copied?<><Check size={14}/> Copied!</>:<><Copy size={14}/> Copy link</>}</button>
          <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm"><ExternalLink size={14}/> Open public URL</a>
        </>}
      </div>
    </div>
    {renderContent()}
  </>);
}

/* ── ProfileEditModal — standalone overlay triggered from the top-nav dropdown ── */

export function ProfileEditModal({ profile, userId, username, patchProfile, onClose,
                           updateProfile=null,
                           claimMode=false, claimToken=null, unclaimedProfile=null, onClaimSuccess=null }) {
  const USERNAME_RE = /^[a-z0-9_]{5,20}$/;
  const [firstName,    setFirstName]    = useState(profile?.first_name || '');
  const [lastName,     setLastName]     = useState(profile?.last_name  || '');
  const [avatarColor,  setAvatarColor]  = useState(profile?.avatar_color || '');
  const [avatarUrl,    setAvatarUrl]    = useState(profile?.avatar_url || '');
  const [avatarBusy,   setAvatarBusy]   = useState(false);
  const [avatarErr,    setAvatarErr]    = useState('');
  const avatarInputRef = useRef(null);
  const [bio,          setBio]          = useState(profile?.bio || '');
  const [socials,      setSocials]      = useState({
    twitter:   profile?.twitter_url   || '',
    linkedin:  profile?.linkedin_url  || '',
    telegram:  profile?.telegram_url  || '',
    instagram: profile?.instagram_url || '',
  });
  const [regStatus,    setRegStatus]    = useState(profile?.registration_status || 'self_directed');
  const [sebiNum,      setSebiNum]      = useState(profile?.sebi_reg_number      || '');
  const [sebiTill,     setSebiTill]     = useState(profile?.sebi_reg_valid_till  || '');
  const [sebiFirm,     setSebiFirm]     = useState(profile?.sebi_firm_name       || '');
  const [regOptions,   setRegOptions]   = useState([]);
  const [sebiMsg,      setSebiMsg]      = useState('');
  const [saving,       setSaving]       = useState(false);
  const [err,          setErr]          = useState('');
  // Username setting — only relevant when username not yet set
  const [unInput,  setUnInput]  = useState(claimMode ? (unclaimedProfile?.username || '') : '');
  const [unStatus, setUnStatus] = useState('idle'); // idle|checking|available|taken|invalid
  const [unSaved,  setUnSaved]  = useState(!!username && !claimMode);

  // ── Claim-mode only state ─────────────────────────────────────────────────
  const [claimEmail,    setClaimEmail]    = useState('');
  const [claimPass,     setClaimPass]     = useState('');
  const [claimPass2,    setClaimPass2]    = useState('');
  const [showClaimPass, setShowClaimPass] = useState(false);
  const [consentTerms,  setConsentTerms]  = useState(false);
  const [consentData,   setConsentData]   = useState(false);
  const [consentSebi,   setConsentSebi]   = useState(false);
  const [claimBusy,     setClaimBusy]     = useState(false);

  useEffect(() => {
    dbGetRegOptions().then(({ options, verifyMessage }) => {
      setRegOptions(options);
      if (verifyMessage) setSebiMsg(verifyMessage);
    }).catch(() => {});
  }, []);

  // Debounced username availability check.
  // In claim mode, the unclaimed profile's username is already reserved for this creator —
  // skip the DB round-trip and mark it available instantly.
  useEffect(() => {
    if (!unInput) { setUnStatus('idle'); return; }
    if (!USERNAME_RE.test(unInput)) { setUnStatus('invalid'); return; }
    if (claimMode && unInput === unclaimedProfile?.username) {
      setUnStatus('available'); return; // reserved for this creator via token
    }
    setUnStatus('checking');
    const t = setTimeout(async () => {
      // In claim mode use the unclaimed profile's own id as the exclusion id.
      // This correctly excludes only the reserved unclaimed row so the pre-filled
      // username shows "available" but all real active usernames still show "taken".
      // Passing null (previous behaviour) caused `id != NULL` → NULL in SQL →
      // 0 rows returned → every username appeared "available" — the core bug.
      const excludeId = claimMode ? (unclaimedProfile?.id || '__claim_check__') : userId;
      const ok = await dbCheckUsername(unInput, excludeId);
      setUnStatus(ok ? 'available' : 'taken');
    }, 500);
    return () => clearTimeout(t);
  }, [unInput]);

  const handleAvatarFile = async (file) => {
    if (!file) return;
    setAvatarErr(''); setAvatarBusy(true);
    try {
      const compressed = await compressAvatarFile(file);
      const saved = await dbUploadAvatar(compressed);
      setAvatarUrl(saved || compressed);
      patchProfile?.({ avatar_url: saved || compressed });
    } catch (e) {
      setAvatarErr(e.message || 'Could not upload image');
    }
    setAvatarBusy(false);
  };

  const isSebi = ['sebi_ra', 'sebi_ria'].includes(regStatus);

  // ── Claim submission (claimMode only) ────────────────────────────────────
  const handleClaim = async () => {
    setErr('');
    const fn = firstName.trim(), ln = lastName.trim();
    if (!fn)                                   { setErr('First name is required.'); return; }
    if (unStatus !== 'available')              { setErr('Please set a valid, available username.'); return; }
    if (!claimEmail.trim()||!claimEmail.includes('@')) { setErr('Enter a valid email address.'); return; }
    if (!claimPass||claimPass.length<8)        { setErr('Password must be at least 8 characters.'); return; }
    if (claimPass!==claimPass2)                { setErr('Passwords do not match.'); return; }
    if (!consentTerms||!consentData)           { setErr('Please accept all required terms.'); return; }
    setClaimBusy(true);
    try {
      const fullName = [fn,ln].filter(Boolean).join(' ');
      const cred = await createUserWithEmailAndPassword(primaryAuth, claimEmail.trim(), claimPass);
      const uid  = cred.user.uid;

      // Write creator's real profile (unconditional first_name to beat AuthContext race).
      // Username strategy:
      //   - Same as admin-assigned → write NULL (unclaimed profile still holds it;
      //     approval COALESCE transfers it from the unclaimed row).
      //   - Different from admin-assigned → write it now (no UNIQUE conflict since the
      //     unclaimed row holds a different value). Approval COALESCE keeps it, and
      //     Step A nulls the unclaimed row which frees the original admin username.
      await dbSubmitClaim({
        token: claimToken,
        firstName: fn, lastName: ln, bio: bio.trim(),
        registrationStatus: regStatus,
        username: unInput,
        email: claimEmail.trim(),
      });

      await fbUpdateProfile(cred.user,{displayName:fullName}).catch(()=>{});

      sendEmail('claim_submitted',   { to_email:claimEmail.trim(), creator_name:fullName, profile_name:unclaimedProfile?.full_name, username:unInput });
      sendEmail('claim_admin_notify', { to_email:'hello@myinvestorcircle.com', creator_name:fullName, claimer_email:claimEmail.trim(), profile_name:unclaimedProfile?.full_name, username:unInput });

      localStorage.removeItem('mic_claim_token');
      onClaimSuccess?.();
    } catch(e) {
      const c=e.code||'';
      if(c==='auth/email-already-in-use') setErr('This email is already registered. Contact hello@myinvestorcircle.com.');
      else if(c==='auth/invalid-email')   setErr('Enter a valid email address.');
      else if(c==='auth/weak-password')   setErr('Password must be at least 8 characters.');
      else setErr(e.message||'Something went wrong. Please try again.');
    }
    setClaimBusy(false);
  };

  // Whether there's a pending username in the input that Save still needs to
  // persist (i.e. the user typed one but it was never saved).
  const hasPendingUsername = !claimMode && !!unInput && !username && !unSaved;

  const save = async () => {
    if (!userId) return;
    setErr('');

    // Fold the username into the same Save action — no separate "Set" click
    // required. If they typed one, it must be valid+available before Save
    // can proceed at all (silently dropping it would be worse than blocking).
    if (hasPendingUsername && unStatus !== 'available') {
      setErr(unStatus === 'taken' ? 'That username is already taken — try another.' : 'Please enter a valid username before saving.');
      return;
    }

    setSaving(true);
    const fn = firstName.trim(), ln = lastName.trim();
    const fullName = [fn,ln].filter(Boolean).join(' ')||null;

    // Phase 2d: route the name update through the same authenticated
    // api/profile/update.js endpoint AuthContext.updateProfile() already uses,
    // so both edit screens stay consistent. Only when a first name is
    // actually entered — updateProfile() requires one, whereas this form has
    // always allowed clearing it to blank via dbSaveProfileEdit below.
    if (fn && updateProfile) {
      const result = await updateProfile(fn, ln);
      if (result?.error) { setErr(result.error); setSaving(false); return; }
    }

    try {
      if (hasPendingUsername) {
        await dbSaveUsername(userId, unInput);
        patchProfile?.({ username: unInput });
        setUnSaved(true);
      }
      await dbSaveProfileEdit({
        firstName: fn, lastName: ln,
        avatarColor, bio,
        twitter: socials.twitter, linkedin: socials.linkedin,
        telegram: socials.telegram, instagram: socials.instagram,
        registrationStatus: regStatus,
        sebiNum: isSebi?sebiNum:null, sebiTill: isSebi?sebiTill:null, sebiFirm: isSebi?sebiFirm:null,
      });
      patchProfile?.({
        first_name: fn, last_name: ln, full_name: fullName,
        avatar_color: avatarColor, bio,
        twitter_url: socials.twitter, linkedin_url: socials.linkedin,
        telegram_url: socials.telegram, instagram_url: socials.instagram,
        registration_status: regStatus,
        sebi_reg_number:     isSebi ? sebiNum  : null,
        sebi_reg_valid_till: isSebi ? sebiTill : null,
        sebi_firm_name:      isSebi ? sebiFirm : null,
      });
      onClose();
    } catch(e) { setErr('Could not save: ' + e.message); }
    setSaving(false);
  };

  const darkInput = {
    width:'100%', background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.12)',
    borderRadius:9, padding:'10px 13px', fontSize:13, color:'#fff',
    fontFamily:'var(--font)', outline:'none', boxSizing:'border-box',
  };

  return createPortal(
    <div style={{position:'fixed',inset:0,background:'rgba(13,14,30,.65)',backdropFilter:'blur(4px)',
        display:'flex',alignItems:'center',justifyContent:'center',zIndex:9000,padding:'20px'}}
      onClick={onClose}>
      <div style={{width:'100%',maxWidth:560,maxHeight:'90vh',overflowY:'auto',background:'#16182a',
          borderRadius:20,border:'1px solid rgba(255,255,255,.1)',boxShadow:'0 24px 80px rgba(0,0,0,.6)'}}
        onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{padding:'20px 24px 16px',borderBottom:'1px solid rgba(255,255,255,.08)',
            display:'flex',alignItems:'center',justifyContent:'space-between',
            position:'sticky',top:0,background:'#16182a',zIndex:1,borderRadius:'20px 20px 0 0'}}>
          <div style={{fontSize:17,fontWeight:800,color:'#fff'}}>{claimMode?'Claim your profile':'Edit Profile'}</div>
          <button onClick={onClose} style={{background:'rgba(255,255,255,.08)',border:'none',
              color:'rgba(255,255,255,.7)',cursor:'pointer',width:32,height:32,borderRadius:8,
              display:'flex',alignItems:'center',justifyContent:'center'}}>
            <X size={16}/>
          </button>
        </div>

        <div style={{padding:'24px'}}>

          {/* ── Claim-mode only: account credentials ─────────────────── */}
          {claimMode && (<>
            <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>
              Username
            </div>
            <div style={{marginBottom:20}}>
              <input value={unInput} onChange={e=>setUnInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''))}
                placeholder="Choose a username" style={{...darkInput,borderColor:
                  unStatus==='available'?'#4ade80':unStatus==='taken'||unStatus==='invalid'?'#f87171':'rgba(255,255,255,.12)'}}/>
              <div style={{marginTop:6,fontSize:11,color:
                unStatus==='available'?'#4ade80':unStatus==='taken'||unStatus==='invalid'?'#f87171':'rgba(255,255,255,.4)'}}>
                {unStatus==='checking'?'Checking…':unStatus==='available'?`✓ @${unInput} is available`
                 :unStatus==='taken'?'Username already taken — try another'
                 :unStatus==='invalid'?'5–20 lowercase letters, numbers or _'
                 :`Your profile will be at /#/investor/${unInput||'username'}`}
              </div>
            </div>

            <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>
              Account credentials
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:20}}>
              <input type="email" value={claimEmail} onChange={e=>setClaimEmail(e.target.value)}
                placeholder="Your real email address" style={darkInput}/>
              <div style={{position:'relative'}}>
                <input type={showClaimPass?'text':'password'} value={claimPass} onChange={e=>setClaimPass(e.target.value)}
                  placeholder="Create a password (min. 8 characters)"
                  style={{...darkInput,paddingRight:38}}/>
                <button onClick={()=>setShowClaimPass(v=>!v)}
                  style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,.5)',padding:0}}>
                  {showClaimPass?<EyeOff size={14}/>:<Eye size={14}/>}
                </button>
              </div>
              <input type={showClaimPass?'text':'password'} value={claimPass2} onChange={e=>setClaimPass2(e.target.value)}
                placeholder="Confirm password" style={darkInput}/>
            </div>

            <div style={{height:1,background:'rgba(255,255,255,.08)',marginBottom:20}}/>
            <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:12}}>
              Profile details
            </div>
          </>)}

          {/* Profile picture */}
          {!claimMode && (
            <div style={{marginBottom:22}}>
              <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',
                  textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Profile picture</div>
              <div style={{display:'flex',alignItems:'center',gap:14}}>
                {avatarUrl
                  ? <img src={avatarUrl} alt="" style={{width:56,height:56,borderRadius:16,objectFit:'cover',flexShrink:0}}/>
                  : <div style={{width:56,height:56,borderRadius:16,flexShrink:0,background:avatarColor||'linear-gradient(135deg,#6d5df5,#cf52d8)',
                      display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,fontWeight:900,color:'#fff'}}>
                      {initialsOf(`${firstName} ${lastName}`.trim()||'?')}
                    </div>}
                <div>
                  <input ref={avatarInputRef} type="file" accept="image/*" style={{display:'none'}}
                    onChange={e=>handleAvatarFile(e.target.files?.[0])}/>
                  <button onClick={()=>avatarInputRef.current?.click()} disabled={avatarBusy}
                    style={{padding:'8px 14px',borderRadius:9,background:'rgba(255,255,255,.08)',
                      border:'1px solid rgba(255,255,255,.15)',color:'#fff',fontSize:12,fontWeight:700,
                      cursor:avatarBusy?'wait':'pointer',fontFamily:'var(--font)'}}>
                    {avatarBusy ? 'Uploading…' : avatarUrl ? 'Change photo' : 'Upload photo'}
                  </button>
                  <div style={{fontSize:11,color:'rgba(255,255,255,.4)',marginTop:6}}>JPG or PNG, under 8MB</div>
                  {avatarErr && <div style={{fontSize:11,color:'#f87171',marginTop:4}}>{avatarErr}</div>}
                </div>
              </div>
            </div>
          )}

          {/* Avatar colour */}
          {!claimMode && <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',
              textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Avatar colour</div>}
          {!claimMode && <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:22}}>
            {['#6d5df5','#cf52d8','#15924e','#0ea5b7','#d97706','#e11d48','#2563eb','#64748b'].map(c=>(
              <div key={c} onClick={()=>setAvatarColor(c)} style={{width:32,height:32,borderRadius:9,
                  background:c,cursor:'pointer',boxSizing:'border-box',transition:'.1s',
                  border:avatarColor===c?'2px solid #fff':'2px solid transparent',
                  boxShadow:avatarColor===c?`0 0 12px ${c}88`:''}}/>
            ))}
            <div onClick={()=>setAvatarColor('')} style={{width:32,height:32,borderRadius:9,cursor:'pointer',
                background:'linear-gradient(135deg,#6d5df5,#cf52d8)',boxSizing:'border-box',
                display:'flex',alignItems:'center',justifyContent:'center',
                border:!avatarColor?'2px solid #fff':'2px solid transparent',
                fontSize:9,color:'#fff',fontWeight:800}}>AUTO</div>
          </div>}

          {/* Name */}
          <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',
              textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Name</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:20}}>
            <input value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="First name" style={darkInput}/>
            <input value={lastName}  onChange={e=>setLastName(e.target.value)}  placeholder="Last name"  style={darkInput}/>
          </div>

          {/* Username — shown in non-claim mode only; claim mode has its own above */}
          {!claimMode && <div style={{marginBottom:20}}>
            <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',
                textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Username</div>
            {(username || unSaved) ? (
              <div style={{display:'flex',alignItems:'center',gap:8,background:'rgba(255,255,255,.04)',
                  border:'1px solid rgba(255,255,255,.07)',borderRadius:9,padding:'10px 13px'}}>
                <Lock size={13} color="rgba(255,255,255,.35)"/>
                <span style={{fontSize:13,fontWeight:700,color:'rgba(255,255,255,.7)'}}>@{unSaved&&!username?unInput:username}</span>
                <span style={{fontSize:11,color:'rgba(255,255,255,.3)',marginLeft:4}}>(cannot be changed)</span>
              </div>
            ) : (
              <>
                <div style={{background:'rgba(251,191,36,.08)',border:'1px solid rgba(251,191,36,.2)',
                    borderRadius:9,padding:'10px 13px',fontSize:12,color:'#fbbf24',marginBottom:10,lineHeight:1.5}}>
                  ⚠ Choose carefully — username cannot be changed once set.
                  It becomes part of your permanent public profile URL, and you'll
                  need one to post recommendations or have a public profile page.
                </div>
                <div style={{position:'relative'}}>
                  <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',
                      color:'rgba(255,255,255,.4)',pointerEvents:'none',fontSize:14}}>@</span>
                  <input value={unInput}
                    onChange={e=>setUnInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''))}
                    maxLength={20} placeholder="your_username"
                    style={{...darkInput,paddingLeft:28}}/>
                </div>
                <div style={{marginTop:6,fontSize:12,minHeight:16}}>
                  {unStatus==='checking'  && <span style={{color:'rgba(255,255,255,.4)',display:'flex',alignItems:'center',gap:5}}><Loader size={11} className="spin"/> Checking…</span>}
                  {unStatus==='available' && <span style={{color:'#4ade80',display:'flex',alignItems:'center',gap:5}}><Check size={11}/> Available — will be saved with the rest of this form</span>}
                  {unStatus==='taken'     && <span style={{color:'#f87171',display:'flex',alignItems:'center',gap:5}}><X size={11}/> Already taken — try another</span>}
                  {unStatus==='invalid'   && unInput && <span style={{color:'#f87171',fontSize:11}}>5–20 chars, lowercase letters, numbers and underscores only</span>}
                </div>
              </>
            )}
          </div>}  {/* end !claimMode username block */}

          {/* Read-only email — hidden in claim mode (creator enters their own email above) */}
          {!claimMode && <div style={{marginBottom:20}}>
            <div style={{fontSize:11,color:'rgba(255,255,255,.35)',marginBottom:6,
                display:'flex',alignItems:'center',gap:4,fontWeight:600}}>
              <Lock size={10}/> Email <span style={{fontWeight:400,fontSize:10}}>(cannot be changed)</span>
            </div>
            <div style={{background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.07)',
                borderRadius:9,padding:'10px 13px',fontSize:13,color:'rgba(255,255,255,.4)',fontFamily:'inherit'}}>
              {profile?.email || <span style={{opacity:.4,fontStyle:'italic'}}>not set</span>}
            </div>
          </div>}  {/* end !claimMode email block */}

          {/* Bio */}
          <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',
              textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Bio</div>
          <textarea value={bio} onChange={e=>setBio(e.target.value)} rows={3} maxLength={300}
            placeholder="Describe your investment approach…"
            style={{...darkInput,resize:'vertical'}}/>
          <div style={{fontSize:11,color:'rgba(255,255,255,.3)',textAlign:'right',
              marginTop:4,marginBottom:20}}>{bio.length}/300</div>

          {/* Social links */}
          <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',
              textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Social links</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:20}}>
            {[
              {key:'twitter',  label:'Twitter / X', ph:'https://twitter.com/username'},
              {key:'linkedin', label:'LinkedIn',     ph:'https://linkedin.com/in/username'},
              {key:'telegram', label:'Telegram',     ph:'https://t.me/username'},
              {key:'instagram',label:'Instagram',    ph:'https://instagram.com/username'},
            ].map(s=>(
              <div key={s.key}>
                <div style={{fontSize:11,color:'rgba(255,255,255,.4)',marginBottom:6,fontWeight:600}}>{s.label}</div>
                <input value={socials[s.key]} onChange={e=>setSocials(p=>({...p,[s.key]:e.target.value}))}
                  placeholder={s.ph} style={darkInput}/>
              </div>
            ))}
          </div>

          {/* Investor type */}
          <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',
              textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Investor type</div>
          <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:20}}>
            {(regOptions.length ? regOptions : [
              {code:'self_directed',label:'Self-directed Investor',           description:'Invests own money independently.'},
              {code:'enthusiast',  label:'Market Enthusiast',                 description:'Passionate about markets, shares ideas informally.'},
              {code:'sebi_ra',     label:'SEBI Registered Research Analyst',  description:'INH000XXXXXX format.'},
              {code:'sebi_ria',    label:'SEBI Registered Investment Adviser',description:'INA000XXXXXX format.'},
            ]).map(opt=>(
              <label key={opt.code} style={{display:'flex',alignItems:'flex-start',gap:10,cursor:'pointer',
                  padding:'11px 14px',borderRadius:10,transition:'.15s',
                  background:regStatus===opt.code?'rgba(109,93,245,.2)':'rgba(255,255,255,.04)',
                  border:`1px solid ${regStatus===opt.code?'rgba(109,93,245,.55)':'rgba(255,255,255,.08)'}`}}>
                <input type="radio" name="pemRegStatus" value={opt.code}
                  checked={regStatus===opt.code} onChange={()=>setRegStatus(opt.code)}
                  style={{accentColor:'#6d5df5',marginTop:3,flexShrink:0}}/>
                <div>
                  <div style={{fontSize:14,fontWeight:700,color:'#fff'}}>{opt.label}</div>
                  <div style={{fontSize:12,color:'rgba(255,255,255,.4)',marginTop:2,lineHeight:1.4}}>{opt.description}</div>
                </div>
              </label>
            ))}
          </div>

          {/* SEBI fields */}
          {isSebi && (<>
            <div style={{background:'rgba(251,191,36,.08)',border:'1px solid rgba(251,191,36,.2)',
                borderRadius:10,padding:'12px 14px',marginBottom:16,fontSize:13,color:'#fbbf24',lineHeight:1.6}}>
              {sebiMsg || 'Your SEBI registration details will be reviewed by our team within 2–3 business days.'}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:20}}>
              {[
                {label:'SEBI Reg. Number',       ph:regStatus==='sebi_ra'?'INH000XXXXXX':'INA000XXXXXX',val:sebiNum, set:setSebiNum},
                {label:'Valid Till',              ph:'',val:sebiTill,set:setSebiTill,type:'date'},
                {label:'Firm / Employer (opt.)', ph:'e.g. XYZ Securities',val:sebiFirm,set:setSebiFirm,span:true},
              ].map((f,i)=>(
                <div key={i} style={f.span?{gridColumn:'1/span 2'}:{}}>
                  <div style={{fontSize:11,color:'rgba(255,255,255,.4)',marginBottom:6,fontWeight:600}}>{f.label}</div>
                  <input type={f.type||'text'} value={f.val} onChange={e=>f.set(e.target.value)}
                    placeholder={f.ph} style={{...darkInput,colorScheme:'dark'}}/>
                </div>
              ))}
            </div>
          </>)}

          {err && <div style={{color:'#f87171',fontSize:12,marginBottom:14,padding:'8px 12px',
              background:'rgba(248,113,113,.1)',borderRadius:8,border:'1px solid rgba(248,113,113,.2)'}}>{err}</div>}

          {/* Footer */}
          <div style={{borderTop:'1px solid rgba(255,255,255,.07)',paddingTop:16,
            display:'flex',flexDirection:'column',gap:14}}>

            {/* Claim-mode: consent checkboxes — full width above the buttons */}
            {claimMode && (
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.4)',
                  letterSpacing:'.05em',marginBottom:2}}>
                  CONSENT &amp; AGREEMENTS
                </div>
                {[
                  [consentTerms,setConsentTerms,'I agree to the Terms of Service and Privacy Policy *'],
                  [consentData, setConsentData, 'I consent to myInvestorCircle storing and publicly displaying my investment recommendations *'],
                  [consentSebi, setConsentSebi, 'My recommendations comply with SEBI regulations (if registered) or are for educational purposes only'],
                ].map(([val,set,label],i)=>(
                  <label key={i} style={{display:'flex',gap:12,alignItems:'flex-start',cursor:'pointer',
                    fontSize:12,color:'rgba(255,255,255,.75)',lineHeight:1.6,userSelect:'none'}}>
                    <input type="checkbox" checked={val} onChange={e=>set(e.target.checked)}
                      style={{marginTop:2,flexShrink:0,width:16,height:16,accentColor:'#a78bfa',cursor:'pointer'}}/>
                    <span style={{flex:1}}>{label}</span>
                  </label>
                ))}
              </div>
            )}

            {/* Action buttons — full-width row, Claim button grows to fill */}
            <div style={{display:'flex',gap:10,width:'100%'}}>
              <button onClick={onClose}
                style={{padding:'11px 20px',borderRadius:10,fontWeight:700,fontSize:14,
                  cursor:'pointer',background:'rgba(255,255,255,.08)',
                  border:'1px solid rgba(255,255,255,.15)',color:'#fff',
                  fontFamily:'var(--font)',whiteSpace:'nowrap',flexShrink:0}}>
                Cancel
              </button>
              <button className="btn btn-pri"
                disabled={claimMode ? claimBusy : (saving || (hasPendingUsername && unStatus === 'checking'))}
                onClick={claimMode ? handleClaim : save}
                style={{flex:1,justifyContent:'center',padding:'11px 16px',
                  fontSize:14,minHeight:0,lineHeight:1.3}}>
                {claimMode
                  ? (claimBusy ? <><Loader size={14} className="spin"/> Claiming…</> : <><UserPlus size={14}/> Claim @{unInput||'profile'}</>)
                  : (saving    ? <><Loader size={14} className="spin"/> Saving…</>   : <><Check size={14}/> Save changes</>)
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* =================================================================== HOME */
/* ─── InvestedToggle — shared across FeedCard, ReceivedSection, TrackedSection ──── */

export function ClaimProfilePage({ profile, token, onBack }) {
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [claimDone,      setClaimDone]      = useState(false);

  // ── Success state (shown until Firebase auth re-render takes over) ────────
  if (claimDone) return (
    <div style={{minHeight:'100vh',background:'var(--bg)',display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <div className="card" style={{maxWidth:480,width:'100%',padding:'36px 28px',textAlign:'center'}}>
        <div style={{fontSize:44,marginBottom:12}}>⏳</div>
        <div style={{fontWeight:800,fontSize:21,marginBottom:8}}>Your request is sent for approval</div>
        <div style={{fontSize:14,color:'var(--muted)',lineHeight:1.7,marginBottom:16}}>
          Your claim for <strong>@{profile.username}</strong> has been submitted to the myInvestorCircle admin for review.
        </div>
        <div className="note" style={{fontSize:13,textAlign:'left',marginBottom:14,lineHeight:1.65}}>
          <strong>What happens next:</strong><br/>
          Once the admin approves your profile, you will see your historical recommendations and full ICI score on your Track Record page. You'll receive a confirmation email as soon as it's approved — usually within 24 hours.
        </div>
        <div style={{fontSize:12,color:'var(--muted)'}}>
          You're now logged in. Visit the <strong>Track Record</strong> tab to check your approval status.
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Escape hatch — admins/existing users who land here via stale claim token */}
      <div style={{background:'rgba(0,0,0,.55)',padding:'8px 16px',textAlign:'center',fontSize:12,color:'rgba(255,255,255,.55)'}}>
        Already have an account?{' '}
        <button onClick={onBack} style={{background:'none',border:'none',cursor:'pointer',
          color:'#c4b5fd',textDecoration:'underline',fontSize:12,padding:0,fontFamily:'inherit'}}>
          Sign in instead →
        </button>
      </div>

      {/* Full public profile page — same UI the creator will see once live */}
      <PublicProfilePage
        username={profile.username}
        viewerUser={null}
        viewerConnections={[]}
        viewerIsAdmin={false}
        viewerForClaim={true}
        onClaimClick={()=>setShowClaimModal(true)}
        mode="standalone"
        onBack={onBack}
        onRequestConnect={()=>{}}
      />

      {/* Claim modal — same EditProfile modal extended with credentials + consent */}
      {showClaimModal && (
        <ProfileEditModal
          profile={{
            first_name:           profile.first_name,
            last_name:            profile.last_name,
            bio:                  profile.bio,
            registration_status:  profile.registration_status,
            avatar_color:         '',
            email:                '',
          }}
          userId={null}
          username={null}
          patchProfile={null}
          claimMode={true}
          claimToken={token}
          unclaimedProfile={profile}
          onClaimSuccess={()=>{ setShowClaimModal(false); setClaimDone(true); }}
          onClose={()=>setShowClaimModal(false)}
        />
      )}
    </>
  );
}
