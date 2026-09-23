// Recommendations.jsx / RecommendationsPages.jsx — split (Phase: bootstrap/
// perf architecture) so App.jsx's eager import of the Home Feed's card/modal
// components (FeedCard, MakeRecoModal, IdeaSharePopover, ThesisRenderer,
// InvestedToggle — all Discovery.jsx's HomeFeed genuinely needs) doesn't
// also drag in the full "Ideas" page (TrackedSection/ReceivedSection/
// MadeSection), RecoPostPage, and RecoComments (~1600 lines nav-only /
// permalink-only code) into the initial JS bundle. This file keeps only
// what Home Feed needs; RecommendationsPages.jsx holds the rest and is
// React.lazy-loaded from App.jsx. Keep this split — don't re-merge "for
// cleanliness".
import React, { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Lightbulb,
  Shield,
  Search,
  Lock,
  Eye,
  EyeOff,
  Plus,
  X,
  Check,
  Send,
  Layers,
  MessageSquare,
  Bookmark,
  ChevronRight,
  ChevronDown,
  Sparkles,
  ArrowUpDown,
  ThumbsUp,
  Trash2,
  LogOut,
  AlertTriangle,
  Upload,
  CreditCard,
  Share2,
  Forward,
  Loader,
  Globe,
  Copy,
  ArrowLeft,
  Link,
  Home,
  Image as ImageIcon,
  BarChart2
} from "lucide-react";
import { getPreviousClose, getTodayClose, sourceName } from "../../services/marketData";
import { getDailyPrices, byTicker, priceKey } from "../../services/api/pricingApi";
import { track } from "../../firebase";
import {
  commentOnReco as dbCommentOnReco,
  getEngagement as dbGetEngagement,
  getMyTrackedRecos as dbGetMyTrackedRecos,
  reactToReco as dbReactToReco,
  trackReco as dbTrackReco,
  untrackReco as dbUntrackReco
} from "../../services/api/engagementApi";
import {
  getSectors as dbGetSectors,
  searchPeople as dbSearchPeople
} from "../../services/api/lookupsApi";
import {
  getPublicProfile as dbGetPublicProfile,
  lookupUser as dbLookupUser
} from "../../services/api/profileApi";
import {
  cancelExitSignal as dbCancelExit,
  createRecommendation as dbCreateReco,
  deleteDelivery as dbDeleteDelivery,
  forwardRecommendation as dbForwardReco,
  getRecommenderUsername as dbGetRecommenderUsername,
  notifyPublicContacts as dbNotifyPublicContacts,
  setExitSignal as dbSetExit,
  updateDelivery
} from "../../services/api/recommendationsApi";
import { ClassTag, ClosedInfoLine, ConvBadge, HoldPreviewTable, IdeaDisclaimer, InstrumentSearch, LinkSharePopover, MemberBadgeOverlay, Money, OpenInAppBanner, SortTh, StatusBadge2, TypeBadge } from "../../components/common";
import { useMemberTagsFor } from "../../MemberTagsContext";
import { CONTACT_COLORS, FALLBACK_SECTORS, HORIZONS, SECTOR_EMOJI, THESIS_EMOJIS, THESIS_MAX_CHARS, THESIS_MAX_IMAGES, THESIS_MAX_MB, TODAY } from "../../constants/app";
import { useIsMobile } from "../../hooks/index";
import { _CAS_CONFIGURED, parseCasPdf } from "../../services/casUpload";
import { sendEmail, sendPush } from "../../services/notify";
import { calcTargetDate, classColor, compressImage, fmt, fmtDate, fmtPct, getClosedInfo, getTargetDate, initialsOf, isExpired, parseThesis, ret, serializeThesis } from "../../utils/format";
import { fetchPublicProfileInfo, goBackOrElse, goHome, gotoReco, gotoUserProfile, openProfile, openReco, openSecurity } from "../../utils/navigation";

export function ThesisRenderer({ thesis, previewLines=3, defaultExpanded=false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  // Both hooks below must run unconditionally, before either early return —
  // `parsed` can legitimately be null (an empty/placeholder thesis), so
  // `text`/`images` are read via optional chaining rather than destructured
  // off it, keeping this useMemo call from ever being skipped. Previously
  // the early `if (!parsed) return null` sat BETWEEN the two hook calls:
  // if `thesis` ever changed from populated to empty/placeholder while this
  // component instance stayed mounted (same position in the tree), the
  // second render would call fewer hooks than the first and React would
  // throw ("Rendered fewer hooks than during the previous render"),
  // crashing everything up to the nearest error boundary — this component
  // is used on nearly every reco card in the app.
  const parsed = useMemo(() => parseThesis(thesis), [thesis]);
  const text = parsed?.text;
  const images = parsed?.images;
  const html = useMemo(() => {
    if (!text) return '';
    return text
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--accent-ink);text-decoration:underline;word-break:break-all">$1</a>')
      .replace(/\n/g, '<br/>');
  }, [text]);

  if (!parsed) return null;
  if (!text && !images?.length) return null;

  const isLong = text.length > 200 || images?.length > 0;
  const imgLabel = images?.length ? ` + ${images.length} image${images.length>1?'s':''}` : '';

  const textNode = (clamp) => html ? (
    <div style={{fontSize:13,lineHeight:1.7,color:'var(--ink-soft)',wordBreak:'break-word',
      ...(clamp ? {overflow:'hidden',display:'-webkit-box',
        WebkitLineClamp:previewLines,WebkitBoxOrient:'vertical'} : {})}}
      dangerouslySetInnerHTML={{__html:html}}/>
  ) : null;

  if (!isLong) return (
    <div>
      {textNode(false)}
      {images?.map((src,i)=>(
        <img key={i} src={src} alt="" loading="lazy" style={{maxWidth:'100%',borderRadius:8,
          marginTop:8,display:'block',border:'1px solid var(--line)'}}/>
      ))}
    </div>
  );

  return (
    <div>
      {expanded ? (
        <>
          {textNode(false)}
          {images?.map((src,i)=>(
            <img key={i} src={src} alt="" loading="lazy" style={{maxWidth:'100%',borderRadius:8,
              marginTop:8,display:'block',border:'1px solid var(--line)'}}/>
          ))}
          <button onClick={e=>{e.stopPropagation();setExpanded(false);}} style={{background:'none',border:'none',
            cursor:'pointer',fontSize:12,color:'var(--accent-ink)',padding:'4px 0',fontWeight:600,marginTop:4}}>
            Show less ↑
          </button>
        </>
      ) : (
        <>
          {textNode(true)}
          <button onClick={e=>{e.stopPropagation();setExpanded(true);}} style={{background:'none',border:'none',
            cursor:'pointer',fontSize:12,color:'var(--accent-ink)',padding:'4px 0',fontWeight:600}}>
            Read more{imgLabel} →
          </button>
        </>
      )}
    </div>
  );
}

export function MakeRecoModal({ assetClasses, setAssetClasses, contacts, groups, holdings, me, onClose, onCreate, recsMade=[] }) {
  const myId = me?.id || "me";
  // Posting permission (product rule): a private Circle is shared between
  // friends, so any active member may post an idea to it. A public Circle
  // is the owner's broadcast channel, so only its owner/admin may post to
  // it — the server enforces this too (see authorizedCircleRecipientIds in
  // api/_lib/handlers/recommendations.js); this filter just keeps the
  // picker from offering a Circle the click would silently be rejected for.
  const myGroups = groups.filter(g=>{
    const isMember = g.my_role==="admin"||g.members?.some(m=>m.user_id===myId&&m.status==="active");
    if(!isMember) return false;
    if(g.circle_type==="public" && g.my_role!=="admin") return false;
    return true;
  });
  const [selectedInstr, setSelectedInstr] = useState(null);
  const [assetName,   setAssetName]   = useState("");
  const [ticker,      setTicker]      = useState("");
  const [cls,         setCls]         = useState(assetClasses[0]);
  const [currency,    setCurrency]    = useState("INR");
  const [recType,     setRecType]     = useState("Buy");
  const [conviction,  setConviction]  = useState("");
  const [sector,      setSector]      = useState("");
  // Auto-stamped entry price
  const [priceData,   setPriceData]   = useState(null);  // { price, source, date }
  const [priceLoading,setPriceLoading]= useState(false);
  const [priceError,  setPriceError]  = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [stopLoss,    setStopLoss]    = useState("");
  const [horizon,     setHorizon]     = useState("12m");
  const [thesis,      setThesis]      = useState("");
  const [targets,     setTargets]     = useState([]);
  const [isPublic,    setIsPublic]    = useState(true);
  const [sectorOpts,  setSectorOpts]  = useState(FALLBACK_SECTORS);
  const [submitting,  setSubmitting]  = useState(false);
  const [posted,      setPosted]      = useState(null); // { id, ticker, assetName } once the idea is live

  // Load sector options from sector_master — same pattern as all other DB calls in this app
  useEffect(() => {
    dbGetSectors()
      .then(sectors => { if (sectors?.length) setSectorOpts(sectors); })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!selectedInstr) return;
    setPriceData(null); setPriceError(""); setPriceLoading(true);
    getPreviousClose(selectedInstr.symbol, selectedInstr.exchange || "NSE")
      .then(d => { setPriceData(d); setPriceLoading(false); })
      .catch(e => {
        setPriceError(e.message || "Could not fetch price");
        setPriceLoading(false);
      });
  }, [selectedInstr?.symbol, selectedInstr?.exchange]);

  const CURRENCY_SYMBOL = { INR:"₹", USD:"$", GBP:"£", EUR:"€" };

  const onInstrSelect = (inst) => {
    if (!inst) {
      setSelectedInstr(null);
      setSector("");
      return;
    }
    setSelectedInstr(inst);
    setTicker(inst.symbol);
    setAssetName(inst.name);
    setCls(inst.assetClass || assetClasses[0]);
    setCurrency(inst.currency || "INR");
    setSector(inst.sector || "");   // auto-fill if available in master
  };

  // Surfaced right where the user just picked the ticker — not a blocker,
  // just context: do they already have a live (not exited, not expired)
  // idea out on this same instrument? "Live" mirrors the same exit/expiry
  // rules used everywhere else in the app (isExpired() + the exit flag).
  const activeRecoForTicker = useMemo(() => {
    const tickerUp = (selectedInstr?.symbol || "").toUpperCase();
    if (!tickerUp) return null;
    return (recsMade || []).find(r =>
      (r.ticker || "").toUpperCase() === tickerUp && !r.exit && !isExpired(r)
    ) || null;
  }, [selectedInstr?.symbol, recsMade]);

  const toggle  = (id) => setTargets(t=>t.includes(id)?t.filter(x=>x!==id):[...t,id]);
  const [peopleOpen,   setPeopleOpen]   = useState(false);
  const [peopleSearch, setPeopleSearch] = useState("");
  const selectedContactsCount = contacts.filter(c=>targets.includes(c.id)).length;
  const filteredContacts = peopleSearch.trim()
    ? contacts.filter(c=>c.name.toLowerCase().includes(peopleSearch.trim().toLowerCase()))
    : contacts;

  // A public Circle is, by definition, discoverable by anyone — so an idea
  // shared to one can never be marked non-public. Forcing (not just
  // defaulting) this keeps the Public checkbox truthful even if the user
  // had switched it off before picking a public Circle.
  const hasPublicCircleSelected = useMemo(
    () => targets.some(id => myGroups.find(g=>g.id===id)?.circle_type==="public"),
    [targets, myGroups]
  );
  useEffect(() => { if (hasPublicCircleSelected) setIsPublic(true); }, [hasPublicCircleSelected]);

  const create = async () => {
    if (submitting) return; // guard against a double-click firing two creates
    setSubmitting(true);
    const rp = priceData?.price || 0;
    const td = calcTargetDate(TODAY, horizon);
    const recoData = {
      assetName: assetName.trim() || ticker.toUpperCase(),
      ticker: (ticker||"—").toUpperCase(), assetClass:cls, currency,
      priceAt: rp, price: rp,
      targetPrice: targetPrice ? +targetPrice : null,
      stopLoss:    stopLoss    ? +stopLoss    : null,
      horizon, targetDate: td, thesis: thesis||"—",
      isPublic: isPublic || hasPublicCircleSelected, recType,
      conviction:  conviction  || null,
      sector:      sector      || null,
      exchange:    selectedInstr?.exchange || "NSE",
      priceSource: priceData?.source || null,
    };
    const recipients = targets.map(id=>({ type:groups.some(g=>g.id===id)?"group":"user", id }));
    let created = null;
    if (me?.id) {
      try {
        created = await dbCreateReco(recoData, me.id, recipients);
        track('reco_created', {
          rec_type:    recoData.recType  || 'Buy',
          asset_class: recoData.assetClass || '',
          is_public:   !!isPublic,
          has_ticker:  !!recoData.ticker,
          conviction:  recoData.conviction || '',
        });
        // Fan-out for public recos: in-app notifications + emails to all contacts
        if (isPublic && contacts?.length > 0) {
          const newRecoId = String(created?.id || '');
          const recoUrl   = newRecoId && me.username
            ? `https://myinvestorcircle.com/investor/${me.username}/idea/${newRecoId}`
            : `https://myinvestorcircle.com/investor/${me.username || ''}`;

          const meta = {
            ticker:               recoData.ticker,
            assetName:            recoData.assetName,
            recommenderUsername:  me.username || '',
            recoId:               newRecoId,
          };
          // Not awaited: in-app notification fan-out to every contact is
          // server-side work the user doesn't need to wait on to see their
          // own post confirmed — same treatment as the push/email loops
          // right below, which were already fire-and-forget.
          dbNotifyPublicContacts(newRecoId, contacts.map(c => c.id), meta)
            .catch(e => console.warn('notify-public-contacts:', e?.message || e));
          contacts.forEach(c => sendPush(c.id, {
            type: 'contact_recommendation',
            deepLink: newRecoId && me.username ? `/investor/${me.username}/idea/${newRecoId}` : undefined,
          }));
          // Emails
          contacts.forEach(c => {
            if (c.email) sendEmail('contact_recommendation', {
              to_email:      c.email,
              from_name:     me.name     || 'Someone in your circle',
              from_username: me.username || '',
              ticker:        recoData.ticker,
              asset_name:    recoData.assetName,
              reco_type:     recoData.recType || 'Buy',
              entry_price:   recoData.recoPrice
                ? `₹${Number(recoData.recoPrice).toLocaleString('en-IN')}`
                : '',
              conviction:    recoData.conviction || '',
              reco_url:      recoUrl,
            });
          });
        }
        await onCreate?.reload?.();
      }
      catch(e) { console.error("create reco:", e); }
    }
    onCreate({ id:"m"+Date.now(), ...recoData, date:TODAY, recipients:targets, actedList:[], likes:[], exit:false, exitDate:null });
    setSubmitting(false);
    // Only show the "posted" confirmation + link when the server actually
    // gave us back a real reco id — if the create call failed above, there's
    // no live page to link to, so just close like before instead of
    // confirming something that didn't happen.
    if (created?.id && me?.username) {
      setPosted({ id: String(created.id), ticker: recoData.ticker, assetName: recoData.assetName });
    } else {
      onClose();
    }
  };

  // "Post another idea" from the confirmation screen — same modal, blanked
  // back to a fresh form instead of closing, so a user posting several
  // ideas in one sitting doesn't have to reopen the modal each time.
  const resetForm = () => {
    setSelectedInstr(null);
    setAssetName("");
    setTicker("");
    setCls(assetClasses[0]);
    setCurrency("INR");
    setRecType("Buy");
    setConviction("");
    setSector("");
    setPriceData(null);
    setPriceLoading(false);
    setPriceError("");
    setTargetPrice("");
    setStopLoss("");
    setHorizon("12m");
    setThesis("");
    setTargets([]);
    setIsPublic(true);
    setPosted(null);
  };

  const valid = (assetName.trim()||ticker.trim()) && (isPublic || targets.length>0) && (priceData?.price > 0 || !!priceError);

  // Confirmation state: shown in place of the form once the idea is live,
  // so pressing Send always ends in visible feedback rather than the modal
  // just staying on the same screen with no sign the post went through.
  if (posted) {
    return (<div className="overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:420}}>
      <div className="modal-head"><h3>Idea posted</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
      <div className="modal-body" style={{textAlign:"center",padding:"32px 24px"}}>
        <div style={{width:52,height:52,borderRadius:"50%",background:"var(--gain-soft)",color:"var(--gain)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}>
          <Check size={26}/>
        </div>
        <div style={{fontWeight:700,fontSize:16,marginBottom:6}}>Your idea has been posted</div>
        <div className="muted small" style={{marginBottom:22}}>
          {posted.ticker && posted.ticker!=="—" ? posted.ticker : posted.assetName} is now live in your circle.
        </div>
        <div style={{display:"flex",gap:10}}>
          <button className="btn btn-ghost" style={{flex:1,justifyContent:"center"}} onClick={resetForm}>
            Post another idea
          </button>
          <button className="btn btn-pri" style={{flex:1,justifyContent:"center"}} onClick={()=>{ openReco(me.username, posted.id); onClose(); }}>
            Check it here
          </button>
        </div>
      </div>
    </div></div>);
  }

  return (<div className="overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3><Sparkles size={18} style={{verticalAlign:-3,color:"var(--accent)"}}/> New idea</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">

      {/* Recommendation type — Buy / Sell */}
      <div className="field"><label>Idea type</label>
        <div style={{display:"flex",gap:8}}>
          {["Buy","Sell"].map(t=>(
            <button key={t} onClick={()=>setRecType(t)}
              style={{flex:1,padding:"10px 0",borderRadius:10,fontWeight:700,fontSize:14,cursor:"pointer",border:"1.5px solid",
                background: recType===t ? (t==="Buy"?"var(--gain-soft)":"var(--loss-soft)") : "var(--surface)",
                color:      recType===t ? (t==="Buy"?"var(--gain)":"var(--loss)") : "var(--muted)",
                borderColor:recType===t ? (t==="Buy"?"var(--gain)":"var(--loss)") : "var(--line)",
              }}>{t}</button>
          ))}
        </div>
      </div>

      {/* Instrument search */}
      <div className="field"><label>Search instrument <span className="muted small">(type symbol or company name)</span></label>
        <InstrumentSearch onSelect={onInstrSelect} placeholder="e.g. RELIANCE or Reliance Industries…"/>
      </div>

      {/* Manual override if instrument not in list */}
      <details style={{marginBottom:14}}>
        <summary style={{fontSize:12,fontWeight:600,color:"var(--muted)",cursor:"pointer",userSelect:"none",marginBottom:8}}>Not in the list? Enter manually</summary>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",columnGap:14,paddingTop:8}}>
          <div className="field"><label>Ticker / Symbol</label>
            <input value={ticker} onChange={e=>setTicker(e.target.value)} placeholder="e.g. AAPL" list="myh"/>
            <datalist id="myh">{holdings.map(h=><option key={h.id} value={h.sym}>{h.name}</option>)}</datalist></div>
          <div className="field"><label>Asset name</label>
            <input value={assetName} onChange={e=>setAssetName(e.target.value)} placeholder="e.g. Apple Inc."/></div>
        </div>
      </details>

      {/* Show selected instrument summary */}
      {selectedInstr && (
        <div style={{display:"flex",gap:8,marginBottom:14,padding:"10px 12px",background:"var(--accent-soft)",borderRadius:10,alignItems:"center"}}>
          <Check size={15} color="var(--accent-ink)"/>
          <span style={{fontSize:13,fontWeight:600,color:"var(--accent-ink)"}}>{selectedInstr.symbol} — {selectedInstr.name}</span>
          <span className="chip mini" style={{marginLeft:"auto"}}>{selectedInstr.exchange}</span>
          <span className="chip mini">{selectedInstr.assetClass}</span>
          <span className="chip mini">{CURRENCY_SYMBOL[selectedInstr.currency]||selectedInstr.currency} {selectedInstr.currency}</span>
        </div>
      )}

      {/* Not a blocker — just a heads-up, right where they can't miss it
          (immediately under the instrument they just picked) but before
          anything that would stop them from continuing to post. */}
      {activeRecoForTicker && (
        <div className="note warn" style={{marginBottom:14}}>
          <AlertTriangle size={14}/>
          <div>
            You already have a live idea on <b>{activeRecoForTicker.ticker}</b> posted on{" "}
            {fmtDate(activeRecoForTicker.date)}. You can go ahead and post this one too, or{" "}
            <a href="#" style={{color:"inherit",fontWeight:800,textDecoration:"underline"}}
              onClick={e=>{ e.preventDefault(); openReco(me.username, activeRecoForTicker.id); }}>
              share a follow-up on the original idea
            </a> instead.
          </div>
        </div>
      )}

      <div className="field"><label><span>Asset class</span></label>
        <select value={cls} onChange={e=>setCls(e.target.value)}>{assetClasses.map(c=><option key={c}>{c}</option>)}</select></div>

      {/* Sector — locked from master, editable only when manual */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",columnGap:14}}>
        <div className="field">
          <label style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>Sector</span>
            {selectedInstr?.sector
              ? <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:4,background:"var(--gain-soft)",color:"var(--gain)"}}>From security master</span>
              : <span className="muted small">{selectedInstr ? "Not in master — select below" : "Optional"}</span>}
          </label>
          {selectedInstr?.sector
            ? <div style={{padding:"11px 13px",border:"1px solid var(--line)",borderRadius:11,background:"var(--surface-2)",fontSize:14,color:"var(--ink-soft)",display:"flex",alignItems:"center",gap:8}}>
                <Lock size={13} color="var(--muted)"/>
                {selectedInstr.sector}
              </div>
            : <select value={sector} onChange={e=>setSector(e.target.value)}>
                <option value="">— Select sector —</option>
                {sectorOpts.map(s=><option key={s}>{s}</option>)}
              </select>}
        </div>
        <div className="field"><label>Conviction <span className="muted small">(optional)</span></label>
          <select value={conviction} onChange={e=>setConviction(e.target.value)}>
            <option value="">— Not specified —</option>
            <option>Low</option><option>Medium</option><option>High</option>
          </select></div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",columnGap:14,rowGap:0}}>
        {/* Currency — locked from master, editable only when manual */}
        <div className="field">
          <label style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>Currency</span>
            {selectedInstr && <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:4,background:"var(--gain-soft)",color:"var(--gain)"}}>Master</span>}
          </label>
          {selectedInstr
            ? <div style={{padding:"11px 13px",border:"1px solid var(--line)",borderRadius:11,background:"var(--surface-2)",fontSize:14,color:"var(--ink-soft)",display:"flex",alignItems:"center",gap:8}}>
                <Lock size={13} color="var(--muted)"/>
                {CURRENCY_SYMBOL[currency]||currency} {currency}
              </div>
            : <select value={currency} onChange={e=>setCurrency(e.target.value)}>
                {["INR","USD","GBP","EUR"].map(c=><option key={c}>{c}</option>)}
              </select>}
        </div>
        {/* Auto-stamped entry price — non-editable for platform integrity */}
        <div className="field" style={{gridColumn:"span 2"}}>
          <label style={{display:"flex",justifyContent:"space-between"}}>
            <span>Entry price ({CURRENCY_SYMBOL[currency]||currency})</span>
            <span style={{fontSize:10,fontWeight:600,padding:"2px 6px",borderRadius:4,background:priceData?"var(--gain-soft)":"var(--surface-2)",color:priceData?"var(--gain)":"var(--muted)"}}>
              {priceData?"Auto-stamped":"Awaiting instrument"}
            </span>
          </label>
          {priceLoading && (
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"11px 13px",border:"1px solid var(--line)",borderRadius:11,background:"var(--surface-2)",fontSize:13,color:"var(--muted)"}}>
              <Loader size={14} className="spin"/> Fetching previous close…
            </div>
          )}
          {!priceLoading && priceData && (
            <div style={{padding:"11px 13px",border:"1px solid var(--gain)",borderRadius:11,background:"var(--gain-soft)",fontSize:14,fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>
              {CURRENCY_SYMBOL[currency]||currency}{Number(priceData.price).toLocaleString("en-IN")}
              <div style={{fontSize:10,fontWeight:400,color:"var(--gain)",marginTop:3}}>{sourceName(priceData.source)} · {priceData.date}</div>
            </div>
          )}
          {!priceLoading && !priceData && !priceError && (
            <div style={{padding:"11px 13px",border:"1px dashed var(--line-2)",borderRadius:11,background:"var(--surface-2)",fontSize:13,color:"var(--muted)"}}>
              — Select an instrument above
            </div>
          )}
          {priceError && (
            <div style={{padding:"11px 13px",border:"1px solid var(--amber)",borderRadius:11,background:"var(--amber-soft)",fontSize:12,color:"var(--amber)"}}>
              <AlertTriangle size={13}/> Price will be auto-stamped tonight by the nightly batch using closing price.
              <div style={{marginTop:3,opacity:.8}}>Entry price is stamped using closing price of idea date — not manual entry.</div>
            </div>
          )}
        </div>
        <div className="field"><label>Target price <span className="muted small">(opt.)</span></label>
          <input type="number" value={targetPrice} onChange={e=>setTargetPrice(e.target.value)} placeholder="0"/></div>
        <div className="field"><label>Stop loss <span className="muted small">(opt.)</span></label>
          <input type="number" value={stopLoss} onChange={e=>setStopLoss(e.target.value)} placeholder="0"/></div>
        <div className="field"><label>Horizon</label>
          <select value={horizon} onChange={e=>setHorizon(e.target.value)}>{HORIZONS.map(h=><option key={h} value={h}>{h}</option>)}</select></div>
      </div>

      <div className="field"><label>Thesis <span className="muted small">(optional — formatting, emojis &amp; images supported)</span></label><ThesisEditor value={thesis} onChange={setThesis}/></div>
      {/* ── Who should see this? ─────────────────────────────────────── */}
      <div className="field" style={{borderTop:"1px solid var(--line)",paddingTop:14,marginTop:8}}>
        <label style={{display:"block",marginBottom:10}}>Who should see this?</label>

        <label
          title={hasPublicCircleSelected ? "A public Circle is selected below — ideas shared to a public Circle are always public." : undefined}
          style={{display:"flex",gap:10,alignItems:"flex-start",padding:"11px 13px",border:"1px solid var(--line)",borderRadius:11,marginBottom:8,cursor:hasPublicCircleSelected?"not-allowed":"pointer"}}>
          <input type="checkbox" checked={isPublic} disabled={hasPublicCircleSelected}
            onChange={e=>setIsPublic(e.target.checked)}
            style={{width:16,height:16,accentColor:"var(--accent)",marginTop:2,flexShrink:0}}/>
          <div>
            <div style={{fontWeight:700,fontSize:13.5}}>🌐 Public</div>
            <div className="muted small" style={{marginTop:2}}>Anyone on My Investor Circle can discover this.</div>
            {hasPublicCircleSelected && (
              <div className="muted small" style={{marginTop:4,color:"var(--accent-ink)"}}>
                Can&apos;t be turned off — a public Circle is selected below.
              </div>
            )}
          </div>
        </label>

        <div style={{padding:"11px 13px",border:"1px solid var(--line)",borderRadius:11,marginBottom:8}}>
          <div style={{fontWeight:700,fontSize:13.5}}>⭕ Circles</div>
          <div className="muted small" style={{marginTop:2,marginBottom:8}}>Select one or more Circles.</div>
          {myGroups.length===0 ? <div className="muted small">No Circles yet — Circles you belong to (or own) will appear here.</div> :
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>{myGroups.map(g=>
            <span key={g.id} className={"chip"+(targets.includes(g.id)?" sel":"")} onClick={()=>toggle(g.id)} title={g.circle_type==="public"?"Public Circle":"Private Circle"}>
              {targets.includes(g.id)&&<Check size={13}/>}
              {g.circle_type==="public" ? <Globe size={13}/> : <Lock size={13}/>}
              {g.name}
            </span>)}</div>}
          <div className="muted small" style={{marginTop:8,display:"flex",gap:5,alignItems:"flex-start"}}>
            <span style={{flexShrink:0}}>ℹ️</span>
            <span>You can share to any Private Circle you belong to, or a Public Circle you own (only its admin can post there).</span>
          </div>
        </div>

        <div style={{border:"1px solid var(--line)",borderRadius:11}}>
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 13px",cursor:"pointer"}} onClick={()=>setPeopleOpen(o=>!o)}>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:13.5}}>👥 People</div>
              <div className="muted small" style={{marginTop:2}}>
                {selectedContactsCount>0 ? `${selectedContactsCount} selected` : "Select specific people."}
              </div>
            </div>
            <ChevronDown size={16} className="muted" style={{transform:peopleOpen?"rotate(180deg)":"none",transition:".15s",flexShrink:0}}/>
          </div>
          {peopleOpen && (
            <div style={{padding:"0 13px 13px"}}>
              {contacts.length===0 ? <div className="muted small">No contacts yet.</div> : (<>
                <div className="searchbox" style={{marginBottom:8}}>
                  <Search size={14} color="var(--muted)"/>
                  <input value={peopleSearch} onChange={e=>setPeopleSearch(e.target.value)} placeholder="Search people…" onClick={e=>e.stopPropagation()}/>
                </div>
                <div style={{maxHeight:220,overflowY:"auto",display:"flex",flexDirection:"column",gap:2}}>
                  {filteredContacts.length===0
                    ? <div className="muted small" style={{padding:"6px 2px"}}>No people match &ldquo;{peopleSearch}&rdquo;.</div>
                    : filteredContacts.map(c=>(
                      <label key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 6px",borderRadius:8,cursor:"pointer"}}>
                        <input type="checkbox" checked={targets.includes(c.id)} onChange={()=>toggle(c.id)}
                          style={{width:15,height:15,accentColor:"var(--accent)",flexShrink:0}}/>
                        <span style={{fontSize:13}}>{c.name}</span>
                      </label>
                    ))}
                </div>
              </>)}
            </div>
          )}
        </div>
      </div>
    </div>
    <div className="modal-foot">
      <span className="muted small">Target date: {calcTargetDate(TODAY,horizon)?fmtDate(calcTargetDate(TODAY,horizon)):"—"}</span>
      <div style={{display:"flex",gap:10}}><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-pri" disabled={!valid || submitting} onClick={create}>
          {submitting ? <><Loader size={15} className="spin"/> Posting…</> : <><Send size={15}/> Send</>}
        </button></div>
    </div>
  </div></div>);
}

/* =================================================================== SHARING */

/* ─── IdeaSharePopover — unified share UI for My Ideas cards (Tracked / Received /
     Created). Order: public link (copy/WhatsApp) → Circles → Contacts (expandable,
     searchable, multi-select). "Send" delivers to the selected Circles/contacts via
     the same forward pipeline used elsewhere, so it actually persists server-side
     (unlike the old Made-tab "Share" which only touched local state). ───────────── */
export function IdeaSharePopover({ reco, username, contacts=[], groups=[], anchorEl, onClose, onSend }) {
  const isMobile = useIsMobile();
  const [copied,   setCopied]   = useState(false);
  const [pos,      setPos]      = useState(null);
  const popRef = useRef(null);

  const [selCircles,  setSelCircles]  = useState(new Set());
  const [selContacts, setSelContacts] = useState(new Set());
  const [contactsOpen, setContactsOpen] = useState(false);
  const [contactQ,     setContactQ]     = useState('');
  const [sending,      setSending]      = useState(false);

  useEffect(() => {
    if (!isMobile && anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    const h = (e) => { if (popRef.current && !popRef.current.contains(e.target) && e.target !== anchorEl) onClose(); };
    setTimeout(() => document.addEventListener('mousedown', h), 0);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Real, indexable /idea/:id (web-public/), not this page's own in-app
  // /investor/.../idea/:id route — same reasoning as Stock Insights' Share
  // button. Safe unconditionally
  // here because `username` (below) is only ever passed for a PUBLIC idea —
  // callers pass null for a private one, which already skips this link
  // entirely (see the "Public link unavailable" case further down).
  const url = username
    ? `https://myinvestorcircle.com/idea/${encodeURIComponent(reco.id)}`
    : null;
  const waMsg = url ? encodeURIComponent(`Check out ${reco.ticker} (${reco.assetName}) on My Investor Circle:\n${url}`) : null;
  const copyLink = () => {
    if (!url) return;
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1600); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopyLink(url, done));
    else fallbackCopyLink(url, done);
  };

  const toggleCircle  = (id) => setSelCircles(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleContact = (id) => setSelContacts(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const filteredContacts = useMemo(() => {
    const q = contactQ.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(c => (c.name||'').toLowerCase().includes(q));
  }, [contacts, contactQ]);

  const totalSelected = selCircles.size + selContacts.size;
  const send = async () => {
    if (!totalSelected || sending) return;
    setSending(true);
    const targets = [
      ...[...selCircles].map(id => ({ type: 'group', id })),
      ...[...selContacts].map(id => ({ type: 'user', id })),
    ];
    try { await onSend(targets); onClose(); }
    finally { setSending(false); }
  };

  const content = (
    <>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Share2 size={15} color="var(--accent)" /> Share this idea
      </div>

      {/* ── Public link: copy + WhatsApp ── */}
      {url ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button className="btn btn-pri btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={copyLink}>{copied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy link</>}</button>
          <a href={`https://wa.me/?text=${waMsg}`} target="_blank" rel="noopener noreferrer" className="btn btn-soft btn-sm" style={{ flex: 1, justifyContent: 'center', textDecoration: 'none' }}><span style={{ fontSize: 14 }}>💬</span> WhatsApp</a>
        </div>
      ) : (
        <div className="muted small" style={{ marginBottom: 14 }}>Public link unavailable — ideator hasn't set a username yet.</div>
      )}

      {/* ── Circles ── */}
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginBottom: 12 }}>
        <div className="cap" style={{ marginBottom: 8 }}>Circles</div>
        {groups.length === 0
          ? <div className="muted small">You're not in any Circles yet.</div>
          : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 120, overflowY: 'auto' }}>
              {groups.map(g => (
                <span key={g.id} className={"chip"+(selCircles.has(g.id)?" sel":"")} onClick={()=>toggleCircle(g.id)}>
                  {selCircles.has(g.id) && <Check size={12}/>}<Layers size={12}/>{g.name}
                </span>
              ))}
            </div>}
      </div>

      {/* ── Contacts — expandable, searchable, multi-select ── */}
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginBottom: 14 }}>
        <button
          onClick={()=>setContactsOpen(v=>!v)}
          style={{ display:'flex', alignItems:'center', gap:6, width:'100%', background:'none', border:'none', cursor:'pointer', padding:0, fontFamily:'var(--font)' }}
        >
          <span className="cap" style={{ marginBottom:0 }}>Contacts {selContacts.size>0 && `(${selContacts.size} selected)`}</span>
          <ChevronDown size={13} color="var(--muted)" style={{ marginLeft:'auto', transform: contactsOpen?'rotate(180deg)':'none', transition:'.15s' }}/>
        </button>
        {contactsOpen && (
          <div style={{ marginTop: 10 }}>
            <div className="searchbox" style={{ padding: '6px 10px', marginBottom: 8 }}>
              <Search size={13} color="var(--muted)"/>
              <input value={contactQ} onChange={e=>setContactQ(e.target.value)} placeholder="Search contacts…" style={{ fontSize: 12.5 }}/>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:2, maxHeight:160, overflowY:'auto' }}>
              {filteredContacts.length===0
                ? <div className="muted small" style={{ padding: '4px 2px' }}>No contacts match.</div>
                : filteredContacts.map(c => (
                    <label key={c.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 4px', borderRadius:8, cursor:'pointer', fontSize:13 }}>
                      <input type="checkbox" checked={selContacts.has(c.id)} onChange={()=>toggleContact(c.id)} style={{ accentColor:'var(--accent)' }}/>
                      {c.name}
                    </label>
                  ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <span className="muted small" style={{ flex:1 }}>{totalSelected>0 ? `${totalSelected} selected` : 'Select Circles or contacts'}</span>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-pri btn-sm" disabled={!totalSelected||sending} onClick={send}>
          {sending ? <><Loader size={13} className="spin"/> Sending…</> : <><Send size={13}/> Send</>}
        </button>
      </div>
    </>
  );

  // ── Mobile: full-screen bottom sheet ──────────────────────────────────
  if (isMobile) return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)' }}/>
      <div ref={popRef} style={{ position: 'relative', background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '20px 20px 28px', boxShadow: '0 -8px 40px rgba(0,0,0,.28)', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: 'var(--line)', borderRadius: 2, margin: '0 auto 18px' }}/>
        {content}
      </div>
    </div>,
    document.body
  );

  // ── Desktop: floating popover ─────────────────────────────────────────
  if (!pos) return null;
  return createPortal(
    <div ref={popRef} style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,.18)', padding: '16px 18px', minWidth: 300, maxWidth: 360, maxHeight: '80vh', overflowY: 'auto', fontFamily: 'var(--font)' }} onClick={e => e.stopPropagation()}>
      {content}
    </div>,
    document.body
  );
}

/* Clipboard fallback for contexts where the async Clipboard API is unavailable
   or silently fails (older browsers, some in-app/WebView browsers) — copies
   via a temporary offscreen textarea + execCommand instead. */
export function fallbackCopyLink(text, onDone) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    onDone();
  } catch (_) { /* give up silently — the URL is still visible on-screen to copy by hand */ }
}


/* ─── RecoPostPage — dedicated shareable post view for a single recommendation ── */

export function InvestedToggle({ invested, investedPrice, reco, onMark, onUnmark, stopProp=false }) {
  const [showModal, setShowModal] = useState(false);

  const handleClick = (e) => {
    if (stopProp) e.stopPropagation();
    if (invested) onUnmark();
    else setShowModal(true);
  };

  const tooltip = invested
    ? (investedPrice ? `Entry: ₹${Number(investedPrice).toLocaleString('en-IN')} · Click to unmark` : 'Invested · Click to unmark')
    : 'Click to mark as invested';

  return (
    <>
      <div
        style={{display:'flex',alignItems:'center',gap:7,cursor:'pointer',userSelect:'none'}}
        onClick={handleClick}
        title={tooltip}
      >
        <div className={"sw"+(invested?" on":"")}
          style={{width:34,height:19,background:invested?'var(--gain)':undefined}}>
          <div className="knob" style={{width:13,height:13,top:3,left:invested?18:3}}/>
        </div>
        <span style={{fontSize:12,fontWeight:700,color:invested?'var(--gain)':'var(--muted)',transition:'color .15s'}}>
          {invested?'Invested':'Mark Invested'}
        </span>
      </div>
      {showModal && (
        <InvestPriceModal
          reco={{...reco, price: reco.current_price||reco.price}}
          onClose={()=>setShowModal(false)}
          onConfirm={(price)=>{ onMark(price); setShowModal(false); }}
        />
      )}
    </>
  );
}

/* ─── @mention helpers — shared by the comment composer and renderer ───────────── */

// The @token, if any, ending exactly at the caret — e.g. typing "hi @ro"
// with the caret at the end returns "ro". Used to decide whether to open
// the suggestion dropdown and what to search for.
export function FeedCard({ r, me, contacts, groups, setRecsReceived, setPublicFeedRecos, setNetworkEngagementRecos, onReload, tracked, toggleTrack, onOpenSecurity }) {
  const [recommenderInfo, setRecommenderInfo] = useState(null); // { username, isSebiApproved }
  const [shareAnchor, setShareAnchor] = useState(null);
  const [shareUsername, setShareUsername] = useState(null);
  const [showShare, setShowShare] = useState(false);

  // Fetch recommender's username + SEBI status once (cached globally)
  useEffect(()=>{
    if(r.from) fetchPublicProfileInfo(r.from).then(setRecommenderInfo);
  },[r.from]);

  // Click-through to the dedicated reco page — same destination every other
  // idea card in the app navigates to.
  const goToDetail = () => {
    if (recommenderInfo?.username) openReco(recommenderInfo.username, r.id);
    else if (r.from) gotoReco(r.from, r.id);
  };

  const cf = useMemo(()=>{
    const found = contacts.find(x=>x.id===r.from);
    if(found) return found;
    const name=r.byName||'Someone';
    return { name, initials:initialsOf(name), color:'#8d90ad' };
  },[r.from, contacts]);
  const authorTags = useMemberTagsFor(r.from);

  const closed = getClosedInfo(r);
  const retPct = closed && closed.retPct!=null ? closed.retPct : ((r.priceAt&&r.priceAt!==0) ? (r.price-r.priceAt)/r.priceAt : 0);
  const itm = retPct >= 0;
  const isTracked = tracked?.has(r.id);
  const interactionCount = (r.likes||0)+(r.invested?1:0)+(isTracked?1:0);
  const canOpenProfile = !!recommenderInfo?.username;

  const patch=(updates)=>{
    if(r.feedSource==="public"&&setPublicFeedRecos){
      setPublicFeedRecos(rs=>rs.map(x=>x.id===r.id?{...x,...updates}:x));
    } else if(r.feedSource==="network_engagement"&&setNetworkEngagementRecos){
      setNetworkEngagementRecos(rs=>rs.map(x=>x.id===r.id?{...x,...updates}:x));
    } else {
      setRecsReceived(rs=>rs.map(x=>x.deliveryId===r.deliveryId?{...x,...updates}:x));
      if(r.deliveryId){ try{ updateDelivery(r.deliveryId,updates,me?.id); }catch(_){} }
    }
  };

  const react=(val)=>{
    if(!me?.id) return;
    const next=r.reaction===val?'none':val;
    let likes=(r.likes||0);
    if(r.reaction==='like') likes = Math.max(0,likes-1);
    if(next==='like')       likes++;

    // ── Update local state ────────────────────────────────────────────────────
    if(r.feedSource==='public'&&setPublicFeedRecos){
      setPublicFeedRecos(rs=>rs.map(x=>x.id===r.id?{...x,reaction:next,likes}:x));
    } else if(r.feedSource==='network_engagement'&&setNetworkEngagementRecos){
      setNetworkEngagementRecos(rs=>rs.map(x=>x.id===r.id?{...x,reaction:next,likes}:x));
    } else {
      setRecsReceived(rs=>rs.map(x=>x.deliveryId===r.deliveryId?{...x,reaction:next,likes}:x));
      // Also persist delivery reaction for compatibility
      if(r.deliveryId) updateDelivery(r.deliveryId,{reaction:next==='none'?null:next},me.id).catch(console.warn);
    }

    // Persist reaction to recommendation_reactions for ALL feed types, and (on
    // a fresh like) trigger the owner/network notification fan-out server-side.
    if(me?.id && r.id){
      dbReactToReco(r.id, next==='like' ? 'like' : null, next==='like' ? { likerName: me.name||'Someone' } : null)
        .catch(e=>console.error('[like] ✗ failed:', e?.message));
    }
  };

  const handleShareClick=async(e)=>{
    if(showShare){ setShowShare(false); setShareAnchor(null); return; }
    setShareAnchor(e.currentTarget); setShowShare(true);
    const cached=recommenderInfo?.username||null;
    if(cached){ setShareUsername(cached); return; }
    if(r.from){
      try{
        const row=await dbLookupUser('id', r.from);
        if(row?.username) setShareUsername(row.username);
      }catch(_){}
    }
  };

  const isBuy=(r.recommendation_type||r.recType||'Buy')==='Buy';

  // SEBI regulatory badge — shown after recommender info loads
  const SebiBadge=()=>{
    if(!recommenderInfo) return null;
    return recommenderInfo.isSebiApproved
      ? <span title="SEBI Registered Research Analyst or Investment Adviser — platform-verified"
          style={{fontSize:9,fontWeight:800,padding:'2px 8px',borderRadius:4,background:'rgba(21,146,78,.12)',color:'var(--gain)',border:'1px solid rgba(21,146,78,.3)',textTransform:'uppercase',letterSpacing:'.05em',whiteSpace:'nowrap',flexShrink:0}}>
          ✓ SEBI Reg.
        </span>
      : <span title="Not SEBI Registered — investing on own account"
          style={{fontSize:9,fontWeight:700,padding:'2px 8px',borderRadius:4,background:'rgba(141,144,173,.08)',color:'var(--muted)',border:'1px solid rgba(141,144,173,.2)',textTransform:'uppercase',letterSpacing:'.05em',whiteSpace:'nowrap',flexShrink:0}}>
          Non-SEBI
        </span>;
  };

  return (
    <div onClick={goToDetail}
      style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:18,boxShadow:'var(--shadow)',marginBottom:12,overflow:'visible',transition:'box-shadow .15s',cursor:'pointer'}}
      onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 20px rgba(20,20,50,.1)'}
      onMouseLeave={e=>e.currentTarget.style.boxShadow='var(--shadow)'}>
      <div style={{padding:'16px 18px'}}>

        {/* ── Header row ── */}
        <div style={{display:'flex',alignItems:'flex-start',gap:12,marginBottom:11}}>

          {/* Avatar — click → profile */}
          <div style={{position:'relative',width:42,height:42,flexShrink:0}}>
            {cf.avatarUrl
              ? <img src={cf.avatarUrl} alt="" className="av"
                  style={{width:42,height:42,objectFit:'cover',cursor:canOpenProfile?'pointer':'default'}}
                  title={canOpenProfile?`View ${cf.name}'s profile`:''}
                  onClick={e=>{ if(canOpenProfile){ e.stopPropagation(); openProfile(recommenderInfo.username); } }}/>
              : <div className="av"
                  style={{width:42,height:42,background:cf.color||'var(--grad)',fontSize:15,cursor:canOpenProfile?'pointer':'default'}}
                  title={canOpenProfile?`View ${cf.name}'s profile`:''}
                  onClick={e=>{ if(canOpenProfile){ e.stopPropagation(); openProfile(recommenderInfo.username); } }}>
                  {cf.initials||initialsOf(cf.name)}
                </div>}
            <MemberBadgeOverlay tags={authorTags} size={42}/>
          </div>

          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,lineHeight:1.35,display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
              {/* Name — click → profile */}
              <b style={{color:canOpenProfile?'var(--accent-ink)':'var(--ink)',cursor:canOpenProfile?'pointer':'default',
                  textDecoration:canOpenProfile?'underline':'none',textDecorationStyle:'dotted',textUnderlineOffset:3}}
                title={canOpenProfile?`View ${cf.name}'s public profile`:''}
                onClick={e=>{ if(canOpenProfile){ e.stopPropagation(); openProfile(recommenderInfo.username); } }}>{cf.name}</b>
              <span style={{color:'var(--muted)',fontWeight:400}}>shared</span>
              <b
                style={{
                  color: r.ticker&&onOpenSecurity ? 'var(--accent-ink)' : 'var(--ink)',
                  cursor: r.ticker&&onOpenSecurity ? 'pointer' : 'default',
                  textDecoration: r.ticker&&onOpenSecurity ? 'underline' : 'none',
                  textDecorationStyle: 'dotted',
                  textUnderlineOffset: 3,
                }}
                title={r.ticker&&onOpenSecurity ? `View ${r.assetName} on Stock Insights` : undefined}
                onClick={e=>{ if(r.ticker&&onOpenSecurity){ e.stopPropagation(); onOpenSecurity(r.ticker, r.assetName); } }}
              >{r.assetName}</b>
              <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:5,
                background:isBuy?'var(--gain-soft)':'var(--loss-soft)',color:isBuy?'var(--gain)':'var(--loss)'}}>
                {isBuy?'Buy':'Sell'}
              </span>
              {/* Regulatory badge */}
              <SebiBadge/>
            </div>
            <div style={{fontSize:12,color:'var(--muted)',marginTop:3,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              <span>{fmtDate(r.date)}</span>
              {r.assetClass&&<span style={{display:'flex',alignItems:'center',gap:4}}><span className="dot" style={{background:classColor(r.assetClass),width:7,height:7}}/>{r.assetClass}</span>}
              {r.priceAt>0&&<span>Entry ₹{Number(r.priceAt).toLocaleString('en-IN')}</span>}
              {r.feedSource==='public'
                ? <span title="This idea is publicly visible to all investors on myInvestorCircle"
                    style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:4,background:'rgba(99,102,241,.1)',color:'rgb(99,102,241)',border:'1px solid rgba(99,102,241,.25)',display:'flex',alignItems:'center',gap:3}}><Globe size={9}/> Public</span>
                : r.isPublic
                ? <span title="This idea is publicly visible to all investors"
                    style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:4,background:'rgba(99,102,241,.1)',color:'rgb(99,102,241)',border:'1px solid rgba(99,102,241,.25)',display:'flex',alignItems:'center',gap:3}}><Globe size={9}/> Public</span>
                : r.shareType==='group'
                  ? <span title={`Shared with the group: ${groups?.find?.(g=>g.id===r.groupId)?.name||'your group'}`}
                      style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:4,background:'var(--accent-soft)',color:'var(--accent-ink)',border:'1px solid var(--accent-line)',display:'flex',alignItems:'center',gap:3}}><Layers size={10}/>{r.groupId?(groups?.find?.(g=>g.id===r.groupId)?.name||'Group'):'Group'}</span>
                  : <span title="Sent directly to you by the investor — only you can see this"
                      style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:4,background:'var(--surface-2)',color:'var(--muted)',border:'1px solid var(--line)',display:'flex',alignItems:'center',gap:3}}><Send size={9}/> Sent to you</span>}
            </div>
          </div>

          {/* Return badge — display only; clicking bubbles to the card's click-through */}
          <div style={{textAlign:'right',flexShrink:0}}>
            <div style={{fontSize:16,fontWeight:800,letterSpacing:'-.3px',color:itm?'var(--gain)':'var(--loss)'}}>
              {itm?'+':''}{(retPct*100).toFixed(1)}%
            </div>
            <div style={{fontSize:11,color:'var(--muted)',marginTop:1}}>₹{Number(r.price).toLocaleString('en-IN')} now</div>
          </div>
        </div>

        {/* ── Thesis — plain text/links bubble up to the card's click-through like
             the rest of the card; "Read more"/"Show less" stop their own
             propagation (see ThesisRenderer) so expanding never navigates away ── */}
        {r.thesis&&r.thesis!=='—'&&(
          <div style={{marginBottom:10}}>
            <ThesisRenderer thesis={r.thesis} previewLines={2}/>
          </div>
        )}

        {/* ── Pills ── */}
        {(r.horizon||r.targetPrice||r.sector||r.conviction||r.stopLoss)&&(
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:11}}>
            {r.horizon&&<span className="pill accent" style={{fontSize:11}}>Horizon: {r.horizon}</span>}
            {r.targetPrice&&<span className="pill" style={{fontSize:11}}>Target ₹{Number(r.targetPrice).toLocaleString('en-IN')}</span>}
            {r.sector&&<span className="pill" style={{fontSize:11}}>{r.sector}</span>}
            {r.conviction&&<ConvBadge level={r.conviction}/>}
          </div>
        )}

        {closed && <div style={{marginBottom:11}}><ClosedInfoLine info={closed}/></div>}

        {/* ── Interaction bar — Like · Comment · Engagement · Share · Bookmark · Invested ── */}
        <div style={{display:'flex',alignItems:'center',gap:5,paddingTop:10,borderTop:'1px solid var(--line)'}} onClick={e=>e.stopPropagation()}>
          {/* Like */}
          <button className={"iconbtn"+(r.reaction==='like'?' on-like':'')} title="Like" onClick={()=>react('like')} style={{width:32,height:32}}><ThumbsUp size={14}/></button>
          <span style={{fontSize:12,fontWeight:700,color:'var(--muted)',minWidth:16}}>{r.likes||0}</span>
          {/* Comment — comments live on the reco page now */}
          <button className="iconbtn" title="Comment" onClick={goToDetail} style={{width:32,height:32}}><MessageSquare size={14}/></button>
          {(r.commentCount||0)>0 && <span style={{fontSize:12,fontWeight:700,color:'var(--muted)',minWidth:16}}>{r.commentCount}</span>}
          {/* Engagement */}
          {interactionCount>0&&<span style={{fontSize:11,color:'var(--muted)',display:'flex',alignItems:'center',gap:2}}>✦ {interactionCount}</span>}
          {/* Share */}
          <div style={{position:'relative'}}>
            <button className="iconbtn" title="Share" onClick={handleShareClick} style={{width:32,height:32}}><Share2 size={14}/></button>
            {showShare && (
              <IdeaSharePopover
                reco={r} username={shareUsername} contacts={contacts} groups={groups}
                anchorEl={shareAnchor}
                onSend={(targets)=>dbForwardReco(r.id, me?.id, targets)}
                onClose={()=>{ setShowShare(false); setShareAnchor(null); }}
              />
            )}
          </div>
          {/* Bookmark */}
          <button className={"iconbtn"+(isTracked?' on-like':'')} title={isTracked?'Remove from tracked':'Track'}
            onClick={()=>toggleTrack?.(r.id)}
            style={isTracked?{width:32,height:32,background:'var(--accent-soft)',color:'var(--accent-ink)',borderColor:'var(--accent-line)'}:{width:32,height:32}}>
            <Bookmark size={14}/>
          </button>
          {/* Mark Invested */}
          <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:8}}>
            <InvestedToggle
              invested={r.invested} investedPrice={r.investedPrice||r.invested_price}
              reco={{...r,price:r.price,ticker:r.ticker,assetName:r.assetName,priceAt:r.priceAt}}
              onMark={(price)=>{
                patch({isInvested:true,investedPrice:price,invested:true});
                if(me?.id){
                  dbTrackReco(r.id, true, price)
                    .then(()=>{ if(toggleTrack&&tracked&&!tracked.has(r.id)) toggleTrack(r.id); })
                    .catch(()=>{ if(toggleTrack&&tracked&&!tracked.has(r.id)) toggleTrack(r.id); });
                } else if(toggleTrack&&tracked&&!tracked.has(r.id)) toggleTrack(r.id);
              }}
              onUnmark={()=>{
                patch({isInvested:false,investedPrice:null,invested:false});
                if(me?.id) dbTrackReco(r.id, false).catch(console.warn);
              }}
              stopProp={true}
            />
          </div>
        </div>
        <IdeaDisclaimer style={{marginTop:10}}/>
      </div>
    </div>
  );
}

/* ─── Shared widget header style ─── */

export function InvestPriceModal({ reco, onClose, onConfirm }) {
  const [price,setPrice]=useState(String(reco.price));
  const valid = price!=="" && !isNaN(+price) && +price>0;
  return (<div className="overlay" onClick={onClose}><div className="modal" style={{width:420}} onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3>Mark as invested</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">
      <div className="muted small" style={{marginBottom:14}}>What price did you invest at for <b style={{color:"var(--ink)"}}>{reco.ticker}</b> — {reco.assetName}?</div>
      <div style={{display:"flex",gap:18,marginBottom:16}}>
        <div><div className="muted small">Entry price</div><div className="tnum" style={{fontWeight:700}}>{fmt(reco.priceAt)}</div></div>
        <div><div className="muted small">Current price</div><div className="tnum" style={{fontWeight:700}}>{fmt(reco.price)}</div></div></div>
      <div className="field"><label>Your entry price</label><input type="number" value={price} autoFocus onChange={e=>setPrice(e.target.value)} onKeyDown={e=>e.key==="Enter"&&valid&&onConfirm(+price)} placeholder="0"/></div>
    </div>
    <div className="modal-foot"><span/><div style={{display:"flex",gap:10}}><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-pri" disabled={!valid} onClick={()=>onConfirm(+price)}><Check size={15}/> Confirm invested</button></div></div>
  </div></div>);
}


export function ThesisEditor({ value, onChange }) {
  const init = useMemo(() => parseThesis(value), []);  // eslint-disable-line
  const [text,      setText]      = useState(init?.text   || '');
  const [images,    setImages]    = useState(init?.images || []);
  const [showEmoji, setShowEmoji] = useState(false);
  const [imgErr,    setImgErr]    = useState('');
  const taRef  = useRef(null);
  const emoRef = useRef(null);
  const isMobile = useIsMobile();

  const emit = (t, im) => onChange(serializeThesis({ text: t ?? text, images: im ?? images }));

  // Close emoji picker on outside click
  useEffect(() => {
    if (!showEmoji) return;
    const h = e => { if (emoRef.current && !emoRef.current.contains(e.target)) setShowEmoji(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showEmoji]);

  const wrapSel = (open, close) => {
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = text.slice(s, e) || 'text';
    const next = (text.slice(0, s) + open + sel + close + text.slice(e)).slice(0, THESIS_MAX_CHARS);
    setText(next); emit(next, undefined);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + open.length, s + open.length + sel.length); }, 0);
  };

  const insertLink = () => {
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = text.slice(s, e);
    const url = window.prompt('Enter URL (must start with https://):');
    if (!url || !url.startsWith('http')) return;
    const labelInput = window.prompt('Enter link text:', sel || 'Click for more details');
    if (labelInput === null) return; // cancelled
    const label = labelInput.trim() || 'Click for more details';
    const str   = `[${label}](${url})`;
    const next  = (text.slice(0, s) + str + text.slice(e)).slice(0, THESIS_MAX_CHARS);
    setText(next); emit(next, undefined);
  };

  const addEmoji = em => {
    const ta = taRef.current;
    const s  = ta?.selectionStart ?? text.length;
    const next = (text.slice(0, s) + em + text.slice(s)).slice(0, THESIS_MAX_CHARS);
    setText(next); emit(next, undefined);
    setShowEmoji(false);
    setTimeout(() => { ta?.focus(); ta?.setSelectionRange(s + em.length, s + em.length); }, 0);
  };

  const handleFiles = async files => {
    setImgErr('');
    const arr = Array.from(files);
    if (images.length + arr.length > THESIS_MAX_IMAGES) {
      setImgErr(`Maximum ${THESIS_MAX_IMAGES} images allowed.`); return;
    }
    try {
      const compressed = await Promise.all(arr.slice(0, THESIS_MAX_IMAGES - images.length).map(compressImage));
      const ni = [...images, ...compressed];
      setImages(ni); emit(undefined, ni);
    } catch(e) { setImgErr(e.message || 'Something went wrong processing that image. Please try uploading it again.'); }
  };

  const removeImage = i => {
    const ni = images.filter((_, j) => j !== i);
    setImages(ni); emit(undefined, ni); setImgErr('');
  };

  const pct = text.length / THESIS_MAX_CHARS;
  const cCol = pct > 0.9 ? 'var(--loss)' : pct > 0.75 ? 'var(--amber)' : 'var(--muted)';

  const btnBase = { minWidth:28, height:28, border:'1px solid var(--line)', borderRadius:6,
    background:'var(--surface)', cursor:'pointer', color:'var(--ink)', display:'flex',
    alignItems:'center', justifyContent:'center', lineHeight:1, flexShrink:0 };

  return (
    <div>
      {/* ── Toolbar ── */}
      <div style={{display:'flex',alignItems:'center',gap:4,padding:'6px 10px',
        background:'var(--surface-2)',borderRadius:'9px 9px 0 0',
        borderBottom:'1px solid var(--line)',flexWrap:'wrap',rowGap:4}}>

        <button onMouseDown={e=>e.preventDefault()} onClick={()=>wrapSel('**','**')}
          title="Bold (Ctrl+B)" style={{...btnBase,fontWeight:800,fontSize:13,padding:'0 6px',minWidth:28}}>B</button>
        <button onMouseDown={e=>e.preventDefault()} onClick={()=>wrapSel('_','_')}
          title="Italic" style={{...btnBase,fontStyle:'italic',fontSize:13,padding:'0 6px',minWidth:28}}>I</button>
        <button onMouseDown={e=>e.preventDefault()} onClick={insertLink}
          title="Insert link" style={btnBase}><Link size={13}/></button>

        {/* Emoji picker */}
        <div style={{position:'relative'}} ref={emoRef}>
          <button onMouseDown={e=>e.preventDefault()} onClick={()=>setShowEmoji(v=>!v)}
            title="Insert emoji" style={{...btnBase,background:showEmoji?'var(--accent-soft)':'var(--surface)',fontSize:15}}>😊</button>
          {showEmoji&&(
            <div style={{position:'absolute',top:32,left:0,zIndex:500,background:'var(--surface)',
              border:'1px solid var(--line)',borderRadius:10,padding:8,
              boxShadow:'0 8px 24px rgba(0,0,0,.18)',
              display:'grid',gridTemplateColumns:'repeat(10,1fr)',gap:1,
              width: isMobile ? 260 : 280}}>
              {THESIS_EMOJIS.map(em=>(
                <button key={em} onMouseDown={e=>e.preventDefault()} onClick={()=>addEmoji(em)}
                  style={{background:'none',border:'none',cursor:'pointer',fontSize:18,
                    padding:3,borderRadius:4,lineHeight:1}}>{em}</button>
              ))}
            </div>
          )}
        </div>

        {/* Image upload */}
        <label title={images.length>=THESIS_MAX_IMAGES?`Max ${THESIS_MAX_IMAGES} images`:'Add image'}
          style={{...btnBase,cursor:images.length>=THESIS_MAX_IMAGES?'not-allowed':'pointer',
            opacity:images.length>=THESIS_MAX_IMAGES?.45:1}}>
          <input type="file" accept="image/*" multiple style={{display:'none'}}
            disabled={images.length>=THESIS_MAX_IMAGES}
            onChange={e=>{handleFiles(e.target.files);e.target.value='';}}/>
          <ImageIcon size={13}/>
        </label>

        <div style={{marginLeft:'auto',fontSize:10,color:'var(--muted)',whiteSpace:'nowrap',lineHeight:1.3}}>
          📷 Max {THESIS_MAX_IMAGES} images<br/>· {THESIS_MAX_MB}MB each
        </div>
      </div>

      {/* ── Textarea ── */}
      <textarea ref={taRef} value={text} onChange={e=>{ const v=e.target.value.slice(0,THESIS_MAX_CHARS); setText(v); emit(v,undefined); }}
        placeholder={`Share your investment thesis… Max ${THESIS_MAX_CHARS} chars`}
        rows={3}
        style={{borderRadius:'0 0 9px 9px',resize:'vertical',fontFamily:'var(--font)',fontSize:13,
          lineHeight:1.65,padding:'10px 12px',border:'1px solid var(--line)',borderTop:'none',
          background:'var(--surface)',color:'var(--ink)',outline:'none',width:'100%',boxSizing:'border-box'}}/>

      {/* ── Footer row ── */}
      <div style={{display:'flex',justifyContent:'flex-end',marginTop:3}}>
        <span style={{fontSize:11,color:cCol,fontVariantNumeric:'tabular-nums'}}>{text.length}/{THESIS_MAX_CHARS}</span>
      </div>

      {/* ── Error ── */}
      {imgErr&&<div className="note warn" style={{fontSize:12,marginTop:4}}>{imgErr}</div>}

      {/* ── Image previews ── */}
      {images.length>0&&(
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}>
          {images.map((src,i)=>(
            <div key={i} style={{position:'relative',flexShrink:0}}>
              <img src={src} alt="" style={{width:isMobile?'calc((100vw - 96px) / 2)':110,
                height:isMobile?'calc((100vw - 96px) / 2)':110,objectFit:'cover',
                borderRadius:8,border:'1px solid var(--line)',display:'block'}}/>
              <button onClick={()=>removeImage(i)}
                style={{position:'absolute',top:4,right:4,width:22,height:22,borderRadius:'50%',
                  background:'rgba(0,0,0,.65)',border:'none',color:'#fff',cursor:'pointer',
                  display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,lineHeight:1,padding:0}}>×</button>
              <div style={{position:'absolute',bottom:4,left:4,fontSize:9,background:'rgba(0,0,0,.5)',
                color:'#fff',borderRadius:3,padding:'1px 4px'}}>#{i+1}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── ThesisRenderer ─────────────────────────────────────────────────────── */

