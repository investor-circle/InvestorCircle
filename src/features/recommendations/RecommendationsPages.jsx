// Split out of Recommendations.jsx (see that file's header comment). Holds
// the full "Ideas" page (Recommendations/TrackedSection/ReceivedSection/
// MadeSection), RecoPostPage (the idea permalink page), RecoComments, and
// the modals only those use. App.jsx lazy-loads everything here — none of
// it is needed for the Home Feed's initial render.
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
import { Avatar, ClassTag, ClosedInfoLine, ConvBadge, HoldPreviewTable, IdeaDisclaimer, InstrumentSearch, LinkSharePopover, MemberBadgeOverlay, Money, OpenInAppBanner, SortTh, StatusBadge2, TypeBadge } from "../../components/common";
import { useMemberTagsMap } from "../../MemberTagsContext";
import { CONTACT_COLORS, FALLBACK_SECTORS, HORIZONS, SECTOR_EMOJI, THESIS_EMOJIS, THESIS_MAX_CHARS, THESIS_MAX_IMAGES, THESIS_MAX_MB, TODAY } from "../../constants/app";
import { useIsMobile } from "../../hooks/index";
import { _CAS_CONFIGURED, parseCasPdf } from "../../services/casUpload";
import { sendEmail, sendPush } from "../../services/notify";
import { calcTargetDate, classColor, compressImage, fmt, fmtDate, fmtPct, getClosedInfo, getTargetDate, initialsOf, isExpired, parseThesis, ret, serializeThesis } from "../../utils/format";
import { fetchPublicProfileInfo, goBackOrElse, goHome, gotoReco, gotoUserProfile, openProfile, openReco, openSecurity } from "../../utils/navigation";

import { ThesisRenderer, MakeRecoModal, IdeaSharePopover, InvestedToggle, fallbackCopyLink, InvestPriceModal, ThesisEditor } from "./Recommendations";
export function Recommendations({ recsReceived, setRecsReceived, recsMade, setRecsMade,
    contacts, groups, assetClasses, setAssetClasses, initFilter, holdings, me, onReload, tracked, toggleTrack, globalSearch }) {
  const [tab, setTab] = useState(initFilter?.tab || "tracked");
  const [showNew, setShowNew] = useState(false);
  const isMobile = useIsMobile();
  const myId = me?.id || "me";
  const contactName = (id) => contacts.find(c=>c.id===id)?.name || (id===myId?"You":id);
  const groupName   = (id) => groups.find(g=>g.id===id)?.name || id;
  const recipientName = (id) => groups.find(g=>g.id===id)?.name || contactName(id);
  const reach = (ids) => {
    const s=new Set();
    ids.forEach(id=>{ const g=groups.find(x=>x.id===id);
      if(g) (g.members||[]).filter(m=>m.status==="active"&&m.user_id!==myId).forEach(m=>s.add(m.user_id));
      else if(id!==myId&&id!=="me") s.add(id);
    });
    return s.size;
  };
  // Share button on an idea card (Tracked/Received/Created) — targets are
  // already typed {type:'user'|'group', id} by IdeaSharePopover. This doesn't
  // jump the user to the Made tab — sharing from Tracked/Received shouldn't
  // relocate them away from the tab they were on.
  const sendIdeaToTargets = async (recoId, targets) => {
    await dbForwardReco(recoId, myId, targets);
    await onReload();
  };
  const receivedCount = recsReceived.filter(r=>!r.hidden).length;
  const madeCount = recsMade.length;
  const trackedCount = tracked.size;

  return (<>
    {/* ── Header + tabs ── */}
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:12}}>
      <div>
        <div className="eyebrow" style={{marginBottom:0}}>My Ideas</div>
        <div style={{fontSize:22,fontWeight:800,letterSpacing:'-.4px',marginTop:2}}>Ideas worth tracking</div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",width:isMobile?"100%":undefined}}>
        {/* Tabs — Tracked first. Fixed to a single row (flex:1 per tab, no wrap) so
            3 tabs never spill onto a second row on narrow screens. */}
        <div style={{display:"flex",gap:isMobile?4:6,background:"var(--surface-2)",borderRadius:14,padding:4,flexWrap:"nowrap",width:isMobile?"100%":undefined}}>
          {[
            {id:"tracked",  label:"Tracked",  count:trackedCount,  icon:Bookmark},
            {id:"received", label:"Received", count:receivedCount, icon:Lightbulb},
            {id:"made",     label:"Created",  count:madeCount,     icon:Send},
          ].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              display:"flex",alignItems:"center",justifyContent:isMobile?"center":undefined,gap:isMobile?4:8,
              padding:isMobile?"9px 6px":"10px 18px",borderRadius:11,border:"none",cursor:"pointer",
              fontFamily:"var(--font)",fontWeight:700,fontSize:isMobile?12.5:14,transition:".15s",
              flex:isMobile?"1 1 0":undefined,minWidth:0,
              background: tab===t.id ? "var(--surface)" : "transparent",
              color:      tab===t.id ? "var(--accent-ink)" : "var(--ink)",
              boxShadow:  tab===t.id ? "0 1px 6px rgba(20,20,50,.1)" : "none",
            }}>
              <t.icon size={isMobile?13:15}/>
              {t.label}
              <span style={{
                fontSize:isMobile?10.5:12, fontWeight:800, padding:isMobile?"1px 6px":"2px 9px", borderRadius:999,
                background: tab===t.id ? "var(--grad)" : "var(--surface-2)",
                color:      tab===t.id ? "#fff" : "var(--ink-soft)",
              }}>{t.count}</span>
            </button>
          ))}
        </div>
        {/* New idea — elevated so it's reachable from every tab, not just Created */}
        <button className="btn btn-pri btn-sm" onClick={()=>setShowNew(true)} style={isMobile?{width:"100%",justifyContent:"center"}:undefined}><Plus size={15}/> New idea</button>
      </div>
    </div>

    {tab==="tracked"  && <TrackedSection tracked={tracked} toggleTrack={toggleTrack} me={me} contacts={contacts} groups={groups} onSendShare={sendIdeaToTargets} initMoneyFilter={initFilter?.moneyFilter} initBy={initFilter?.by} initInv={initFilter?.invested} globalSearch={globalSearch}/>}
    {tab==="received" && <ReceivedSection recs={recsReceived} setRecs={setRecsReceived} myId={myId}
        contactName={contactName} groupName={groupName} assetClasses={assetClasses}
        contacts={contacts} groups={groups} initBy={initFilter?.by} initGroup={initFilter?.groupId} initInv={initFilter?.invested}
        onSendShare={sendIdeaToTargets} onReload={onReload} me={me} tracked={tracked} toggleTrack={toggleTrack} globalSearch={globalSearch}/>}
    {tab==="made"     && <MadeSection recs={recsMade} setRecs={setRecsMade} recipientName={recipientName}
        reach={reach} contacts={contacts} groups={groups} onSendShare={sendIdeaToTargets} assetClasses={assetClasses}
        setAssetClasses={setAssetClasses} holdings={holdings} me={me} onReload={onReload} globalSearch={globalSearch}/>}

    {showNew && <MakeRecoModal assetClasses={assetClasses} setAssetClasses={setAssetClasses} contacts={contacts} groups={groups} holdings={holdings} me={me} recsMade={recsMade} onClose={()=>setShowNew(false)} onCreate={(rec)=>{ setRecsMade(rs=>[rec,...rs]); setTab("made"); }}/>}
  </>);
}


/* ─── TrackedSection — My Tracked / Saved list ─────────────────────────────── */

export function TrackedSection({ tracked, toggleTrack, me, contacts, groups=[], onSendShare, initMoneyFilter, initBy, initInv, globalSearch }) {
  const isMobile = useIsMobile();
  const [recos,         setRecos]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [openRow,       setOpenRow]       = useState(null);
  const [sort,          setSort]          = useState({key:"tracked",dir:"desc"});
  const [sharePopId,    setSharePopId]    = useState(null);
  const [shareAnchor,   setShareAnchor]   = useState(null);
  const [shareUsername, setShareUsername] = useState(null);
  const [q,       setQ]       = useState(globalSearch||"");
  const [fBy,     setFBy]     = useState(initBy||"all");
  const [fHorizon,setFHorizon]= useState("all");
  const [fMoney,  setFMoney]  = useState(initMoneyFilter||"all");
  const [fInv,    setFInv]    = useState(initInv||"all");
  const [dailyPrices, setDailyPrices] = useState(null);

  // Sync global search into local filter
  useEffect(()=>{ setQ(globalSearch||""); },[globalSearch]);

  useEffect(()=>{
    if(!me?.id){ setLoading(false); return; }
    setLoading(true);
    dbGetMyTrackedRecos()
      .then(rows=>{ setRecos(rows); setLoading(false); })
      .catch(e=>{ console.error('TrackedSection load failed:', e); setLoading(false); });
  },[me?.id, tracked.size]);

  // "Since yesterday" daily change, shown alongside the existing cumulative
  // returns rather than behind a toggle — this is the full list page, not
  // the compact Pulse widget, so there's room to show both at once instead
  // of making the user pick a lens. One batched request for the DISTINCT
  // tickers in the whole tracked list (not per-row), same pattern as the
  // Pulse "My Tracked" widget.
  const trackedTickerKey = useMemo(
    () => [...new Set(recos.map(r=>(r.ticker||'').trim().toUpperCase()).filter(Boolean))].sort().join(','),
    [recos]
  );
  useEffect(() => {
    if (!trackedTickerKey) { setDailyPrices(null); return; }
    let cancelled = false;
    getDailyPrices(trackedTickerKey.split(','))
      .then(rows => { if (!cancelled) setDailyPrices(byTicker(rows)); })
      .catch(() => {}); // pricing unavailable degrades to '—' cells, not an error
    return () => { cancelled = true; };
  }, [trackedTickerKey]);
  const dailyChangeFor = (r) => dailyPrices?.[priceKey(r.ticker, r.asset_class)]?.changePct ?? null;

  // Patch invested status locally + persist to recommendation_tracking
  const patchInvested=(r, updates)=>{
    setRecos(rs=>rs.map(x=>x.id===r.id?{...x,...updates}:x));
    if(me?.id) {
      dbTrackReco(r.id, !!updates.is_invested, updates.is_invested ? (updates.invested_price||null) : null).catch(console.warn);
    }
  };

  const handleShare = async (e, r) => {
    if(sharePopId===r.id){ setSharePopId(null); setShareAnchor(null); return; }
    setShareAnchor(e.currentTarget); setSharePopId(r.id); setShareUsername(null);
    if(r.recommender_username){ setShareUsername(r.recommender_username); return; }
    try {
      const username = await dbGetRecommenderUsername(r.id);
      if(username) setShareUsername(username);
    }catch(_){}
  };

  if(loading) return <div className="muted small" style={{padding:32,textAlign:'center'}}><Loader size={20} className="spin"/></div>;

  if(recos.length===0) return (
    <div className="card"><div className="card-body" style={{textAlign:'center',padding:'48px 32px'}}>
      <Bookmark size={36} color="var(--muted)" style={{marginBottom:14}}/>
      <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>Nothing tracked yet</div>
      <div className="muted small">Click the bookmark icon on any idea to save it here for easy reference.</div>
    </div></div>
  );

  // Helper — same name logic as the row display
  const recName = r => {
    const fn = r.first_name || '';
    const ln = r.last_name  || '';
    return fn && ln && fn !== ln ? `${fn} ${ln}` : (fn || r.recommender_name || 'Unknown');
  };

  // Derive unique recommender names for the person filter
  const byOptions = [...new Set(recos.map(recName))].sort();

  // Filter + sort
  const filtered = recos.filter(r=>{
    if(fBy!=="all" && recName(r)!==fBy) return false;
    if(q.trim()){ const s=q.toLowerCase(); if(!(r.asset_name+r.ticker).toLowerCase().includes(s)) return false; }
    if(fHorizon!=="all" && r.horizon!==fHorizon) return false;
    const recoRet=r.reco_price?(r.current_price-r.reco_price)/r.reco_price:0;
    if(fMoney==="in"  && recoRet<0)  return false;
    if(fMoney==="out" && recoRet>=0) return false;
    if(fInv==="yes" && !r.is_invested) return false;
    if(fInv==="no"  &&  r.is_invested) return false;
    return true;
  });

  const sorted = [...filtered].sort((a,b)=>{
    const dir=sort.dir==="asc"?1:-1;
    if(sort.key==="asset")   return a.asset_name.localeCompare(b.asset_name)*dir;
    if(sort.key==="tracked") return (a.tracked_at>b.tracked_at?1:-1)*dir;
    if(sort.key==="reco")    return ((a.reco_price||0)-(b.reco_price||0))*dir;
    if(sort.key==="cur")     return ((a.current_price||0)-(b.current_price||0))*dir;
    if(sort.key==="entry")   return ((a.invested_price||0)-(b.invested_price||0))*dir;
    if(sort.key==="sinceyday") return ((dailyChangeFor(a)??0)-(dailyChangeFor(b)??0))*dir;
    if(sort.key==="recret"){
      const ra=a.reco_price?(a.current_price-a.reco_price)/a.reco_price:0;
      const rb=b.reco_price?(b.current_price-b.reco_price)/b.reco_price:0;
      return (ra-rb)*dir;
    }
    if(sort.key==="myret"){
      const ra=a.invested_price?(a.current_price-a.invested_price)/a.invested_price:0;
      const rb=b.invested_price?(b.current_price-b.invested_price)/b.invested_price:0;
      return (ra-rb)*dir;
    }
    if(sort.key==="horizon") return (HORIZONS.indexOf(a.horizon)-HORIZONS.indexOf(b.horizon))*dir;
    return 0;
  });

  return (<>
    {/* ── Filters ── */}
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
      <div className="searchbox" style={{flex:"1 1 200px",minWidth:160}}>
        <Search size={15} color="var(--muted)"/>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search asset or ticker…"/>
      </div>
      <select className="inline-select sm" value={fBy} onChange={e=>setFBy(e.target.value)} title="Filter by ideator">
        <option value="all">All people</option>{byOptions.map(b=><option key={b}>{b}</option>)}
      </select>
      <select className="inline-select sm" value={fHorizon} onChange={e=>setFHorizon(e.target.value)} title="Filter by horizon">
        <option value="all">All horizons</option>{HORIZONS.map(h=><option key={h}>{h}</option>)}
      </select>
      <select className="inline-select sm" value={fMoney} onChange={e=>setFMoney(e.target.value)}>
        <option value="all">All returns</option><option value="in">In the money</option><option value="out">Out of money</option>
      </select>
      <select className="inline-select sm" value={fInv} onChange={e=>setFInv(e.target.value)}>
        <option value="all">All</option><option value="yes">Invested</option><option value="no">Not invested</option>
      </select>
    </div>

    {sorted.length===0
      ? <div className="card"><div className="empty">No tracked ideas match your filters.</div></div>
      : isMobile
      ? <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {sorted.map(r=>{
            const closedM=getClosedInfo(r);
            const recoRet=closedM && closedM.retPct!=null ? closedM.retPct : (r.reco_price?(r.current_price-r.reco_price)/r.reco_price:0);
            const myRet=r.is_invested&&r.invested_price?(r.current_price-r.invested_price)/r.invested_price:null;
            const isBuy=(r.recommendation_type||'Buy')==='Buy';
            const isInv=r.is_invested||false;
            const cur=r.currency||'INR';
            const fn=r.first_name||''; const ln=r.last_name||'';
            const rName=fn&&ln&&fn!==ln?`${fn} ${ln}`:(fn||r.recommender_name||'Unknown');
            return (
              <div key={r.id} className="card"
                style={{padding:'14px 16px',borderLeft:'3px solid '+(isBuy?'var(--gain)':'var(--loss)'),cursor:r.recommender_username?'pointer':'default'}}
                onClick={()=>r.recommender_username&&openReco(r.recommender_username,r.id)}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:15,marginBottom:2}}>{r.asset_name}</div>
                    <div style={{fontSize:11,color:'var(--muted)'}}>{r.ticker} · By {rName}</div>
                  </div>
                  <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,flexShrink:0,background:isBuy?'var(--gain-soft)':'var(--loss-soft)',color:isBuy?'var(--gain)':'var(--loss)'}}>{isBuy?'Buy':'Sell'}</span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8,marginBottom:12}}>
                  {[['Entry Price',r.reco_price?fmt(r.reco_price,cur):'—',null],
                    ['Current',r.current_price?fmt(r.current_price,cur):'—',null],
                    ['Since Yday', dailyChangeFor(r)!=null?`${dailyChangeFor(r)>=0?'+':''}${dailyChangeFor(r).toFixed(1)}%`:'—', dailyChangeFor(r)!=null?(dailyChangeFor(r)>=0):null],
                    ['Return',r.reco_price?fmtPct(recoRet):'—', recoRet>=0]].map(([label,val,isGain],i)=>(
                    <div key={i} style={{background:'var(--surface-2)',borderRadius:8,padding:'8px 10px'}}>
                      <div style={{fontSize:10,color:'var(--muted)',marginBottom:2}}>{label}</div>
                      <div style={{fontWeight:700,fontSize:13,color:isGain==null?'var(--ink)':isGain?'var(--gain)':'var(--loss)'}}>{val}</div>
                    </div>
                  ))}
                </div>
                {closedM && <div style={{marginBottom:12}}><ClosedInfoLine info={closedM} cur={cur}/></div>}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                    {r.horizon&&<span className="pill accent" style={{fontSize:10}}>{r.horizon}</span>}
                    {isInv&&<span className="pill gain" style={{fontSize:10}}>Invested</span>}
                    <span style={{fontSize:10,color:'var(--muted)'}}>Tracked {new Date(r.tracked_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span>
                  </div>
                  <div style={{display:'flex',gap:4,position:'relative'}} onClick={e=>e.stopPropagation()}>
                    <InvestedToggle invested={isInv} investedPrice={r.invested_price}
                      reco={{id:r.id,price:r.current_price,ticker:r.ticker,assetName:r.asset_name,priceAt:r.reco_price}}
                      onMark={(price)=>{patchInvested(r,{is_invested:true,invested_price:price});if(!tracked?.has(r.id))toggleTrack?.(r.id);}}
                      onUnmark={()=>patchInvested(r,{is_invested:false,invested_price:null})}/>
                    <button className="iconbtn" title="Share" onClick={(e)=>handleShare(e,r)}><Share2 size={13}/></button>
                    <button className="iconbtn" title="Remove from tracked" onClick={()=>toggleTrack(r.id)} style={{background:'var(--accent-soft)',color:'var(--accent-ink)',borderColor:'var(--accent-line)'}}><Bookmark size={13}/></button>
                    {sharePopId===r.id && (
                      <IdeaSharePopover
                        reco={{id:r.id,ticker:r.ticker,assetName:r.asset_name}}
                        username={shareUsername} contacts={contacts} groups={groups}
                        anchorEl={shareAnchor}
                        onSend={(targets)=>onSendShare(r.id,targets)}
                        onClose={()=>{ setSharePopId(null); setShareAnchor(null); }}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      : <div className="card">
          <div className="card-body" style={{padding:"6px 0"}}>
            <div className="tscroll">
            <table className="grid" style={{width:"100%"}}>
              <thead><tr>
                <SortTh label="Asset"        k="asset"   sort={sort} setSort={setSort}/>
                <th style={{whiteSpace:"normal",lineHeight:1.3,minWidth:60}}>Idea By</th>
                <th style={{textAlign:"left",whiteSpace:"normal",lineHeight:1.3,minWidth:60,cursor:"pointer"}} onClick={()=>setSort(s=>({key:"tracked",dir:s.key==="tracked"&&s.dir==="asc"?"desc":"asc"}))}>Tracked<br/>On<span className="si">{sort.key==="tracked"?sort.dir==="asc"?<ChevronDown size={13} style={{transform:"rotate(180deg)"}}/>:<ChevronDown size={13}/>:<ArrowUpDown size={12}/>}</span></th>
                <SortTh label="Entry Price"   k="reco"    sort={sort} setSort={setSort} align="right"/>
                <SortTh label="My Entry"      k="entry"   sort={sort} setSort={setSort} align="right"/>
                <SortTh label="Current"      k="cur"     sort={sort} setSort={setSort} align="right"/>
                <th style={{textAlign:"right",whiteSpace:"normal",lineHeight:1.3,minWidth:64,cursor:"pointer"}} title="Change since the previous trading day's close" onClick={()=>setSort(s=>({key:"sinceyday",dir:s.key==="sinceyday"&&s.dir==="asc"?"desc":"asc"}))}>Since<br/>Yday<span className="si">{sort.key==="sinceyday"?sort.dir==="asc"?<ChevronDown size={13} style={{transform:"rotate(180deg)"}}/>:<ChevronDown size={13}/>:<ArrowUpDown size={12}/>}</span></th>
                <th style={{textAlign:"right",whiteSpace:"normal",lineHeight:1.3,minWidth:72,cursor:"pointer"}} onClick={()=>setSort(s=>({key:"recret",dir:s.key==="recret"&&s.dir==="asc"?"desc":"asc"}))}>Idea<br/>Return<span className="si">{sort.key==="recret"?sort.dir==="asc"?<ChevronDown size={13} style={{transform:"rotate(180deg)"}}/>:<ChevronDown size={13}/>:<ArrowUpDown size={12}/>}</span></th>
                <th style={{textAlign:"right",whiteSpace:"normal",lineHeight:1.3,minWidth:64,cursor:"pointer"}} onClick={()=>setSort(s=>({key:"myret",dir:s.key==="myret"&&s.dir==="asc"?"desc":"asc"}))}>My<br/>Return<span className="si">{sort.key==="myret"?sort.dir==="asc"?<ChevronDown size={13} style={{transform:"rotate(180deg)"}}/>:<ChevronDown size={13}/>:<ArrowUpDown size={12}/>}</span></th>
                <th>Status</th>
                <SortTh label="Horizon"      k="horizon" sort={sort} setSort={setSort}/>
                <th style={{textAlign:"right"}}>Actions</th>
              </tr></thead>
              <tbody>{sorted.map(r=>{
                const closed  = getClosedInfo(r);
                const recoRet = closed && closed.retPct!=null ? closed.retPct : (r.reco_price ? (r.current_price-r.reco_price)/r.reco_price : 0);
                const myRet   = r.is_invested && r.invested_price ? (r.current_price-r.invested_price)/r.invested_price : null;
                const itm = recoRet >= 0;
                const open = openRow===r.id;
                // Fix duplicate name: if first_name and last_name are identical, show only one
                const fn = r.first_name||''; const ln = r.last_name||'';
                const rName = fn && ln && fn!==ln ? `${fn} ${ln}` : (fn || r.recommender_name || 'Unknown');
                const isBuy = (r.recommendation_type||'Buy')==='Buy';
                const isInv = r.is_invested || false;

                return (<React.Fragment key={r.id}>
                  <tr className="hoverable">
                    {/* Asset — chevron expands inline detail; asset name click-through to the dedicated reco page */}
                    <td style={{maxWidth:200}}>
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <ChevronDown size={13} color="var(--muted)" style={{cursor:'pointer',transform:open?'rotate(180deg)':'none',transition:'.15s',flexShrink:0}} onClick={()=>setOpenRow(open?null:r.id)}/>
                        <div style={r.recommender_username?{cursor:'pointer'}:{}} onClick={()=>r.recommender_username?openReco(r.recommender_username,r.id):setOpenRow(open?null:r.id)} title={r.recommender_username?'View this idea':undefined}>
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            <span className="sym" style={{fontSize:13}}>{r.asset_name}</span>
                            <span style={{fontSize:10,fontWeight:700,padding:'2px 6px',borderRadius:4,background:isBuy?'var(--gain-soft)':'var(--loss-soft)',color:isBuy?'var(--gain)':'var(--loss)'}}>{isBuy?'Buy':'Sell'}</span>
                          </div>
                          <div style={{fontSize:11,color:'var(--muted)'}}><ClassTag c={r.asset_class}/></div>
                        </div>
                      </div>
                    </td>
                    <td style={{fontSize:13}}>
                      {r.recommender_username
                        ? <span style={{cursor:'pointer',color:'var(--accent-ink)',fontWeight:600,textDecoration:'underline',textDecorationStyle:'dotted',textUnderlineOffset:3}}
                            title={`View ${rName}'s public profile`}
                            onClick={()=>openProfile(r.recommender_username)}>{rName}</span>
                        : <span style={{fontWeight:600}}>{rName}</span>}
                    </td>
                    <td className="muted small nowrap">{new Date(r.tracked_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'2-digit'})}</td>
                    <td style={{textAlign:'right'}} className="tnum">{r.reco_price?fmt(r.reco_price,r.currency||'INR'):' —'}</td>
                    <td style={{textAlign:'right'}} className="tnum">
                      {isInv && r.invested_price
                        ? <span style={{fontWeight:600,color:'var(--accent-ink)'}}>{fmt(r.invested_price,r.currency||'INR')}</span>
                        : <span className="muted">—</span>}
                    </td>
                    <td style={{textAlign:'right'}} className="tnum">{r.current_price?fmt(r.current_price,r.currency||'INR'):' —'}</td>
                    <td style={{textAlign:'right',fontWeight:700}} className={"tnum "+(dailyChangeFor(r)==null?"":dailyChangeFor(r)>=0?"pos":"neg")}>
                      {dailyChangeFor(r)!=null ? `${dailyChangeFor(r)>=0?'+':''}${dailyChangeFor(r).toFixed(1)}%` : <span className="muted">—</span>}
                    </td>
                    <td style={{textAlign:'right',fontWeight:700}} className={"tnum "+(itm?"pos":"neg")}>{r.reco_price?`${itm?'+':''}${(recoRet*100).toFixed(1)}%`:'—'}</td>
                    <td style={{textAlign:'right',fontWeight:700}}>
                      {myRet!==null
                        ? <span className={myRet>=0?"pos":"neg"}>{myRet>=0?'+':''}{(myRet*100).toFixed(1)}%</span>
                        : <span className="muted" style={{fontSize:11}}>—</span>}
                    </td>
                    <td><Money itm={itm}/></td>
                    <td>{r.horizon?<span className="pill accent" style={{fontSize:11}}>{r.horizon}</span>:<span className="muted">—</span>}</td>
                    <td>
                      <div className="actions" style={{gap:6,justifyContent:'flex-end',flexWrap:'nowrap'}}>
                        {/* Share */}
                        <div style={{position:"relative"}}>
                          <button className="iconbtn" title="Share" onClick={e=>handleShare(e,r)}><Share2 size={13}/></button>
                          {sharePopId===r.id && (
                            <IdeaSharePopover
                              reco={{id:r.id,ticker:r.ticker,assetName:r.asset_name}}
                              username={shareUsername} contacts={contacts} groups={groups}
                              anchorEl={shareAnchor}
                              onSend={(targets)=>onSendShare(r.id,targets)}
                              onClose={()=>{ setSharePopId(null); setShareAnchor(null); }}
                            />
                          )}
                        </div>
                        {/* Mark Invested toggle */}
                        <InvestedToggle
                          invested={isInv}
                          investedPrice={r.invested_price}
                          reco={{id:r.id, price:r.current_price, ticker:r.ticker, assetName:r.asset_name, priceAt:r.reco_price}}
                          onMark={(price)=>{
                            patchInvested(r,{is_invested:true,invested_price:price});
                            if(!tracked?.has(r.id)) toggleTrack?.(r.id);
                          }}
                          onUnmark={()=>patchInvested(r,{is_invested:false,invested_price:null})}
                        />
                        {/* Untrack */}
                        <button className="iconbtn" title="Remove from tracked"
                          onClick={()=>toggleTrack(r.id)}
                          style={{background:'var(--accent-soft)',color:'var(--accent-ink)',borderColor:'var(--accent-line)'}}>
                          <Bookmark size={13}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                  {open && (
                    <tr className="expand-row"><td colSpan={11}><div className="expand-inner">
                      <div style={{display:'flex',gap:24,flexWrap:'wrap',marginBottom:12}}>
                        <div><div className="cap">Ticker</div><b>{r.ticker}</b></div>
                        {isInv && r.invested_price&&<div><div className="cap">My entry price</div><b className="tnum" style={{color:'var(--accent-ink)'}}>{fmt(r.invested_price,r.currency||'INR')}</b></div>}
                        {r.target_price&&<div><div className="cap">Target</div><b className="tnum">{fmt(r.target_price,r.currency||'INR')}</b></div>}
                        {r.stop_loss&&<div><div className="cap">Stop loss</div><b className="tnum neg">{fmt(r.stop_loss,r.currency||'INR')}</b></div>}
                        {r.conviction&&<div><div className="cap">Conviction</div><ConvBadge level={r.conviction}/></div>}
                        {r.sector&&<div><div className="cap">Sector</div><b>{r.sector}</b></div>}
                        <div><div className="cap">Idea Return</div><b className={"tnum "+(itm?"pos":"neg")}>{itm?'+':''}{(recoRet*100).toFixed(1)}%</b></div>
                        {myRet!==null&&<div><div className="cap">My Return</div><b className={"tnum "+(myRet>=0?"pos":"neg")}>{myRet>=0?'+':''}{(myRet*100).toFixed(1)}%</b></div>}
                      </div>
                      {closed && <div style={{marginBottom:12}}><ClosedInfoLine info={closed} cur={r.currency||'INR'}/></div>}
                      {r.thesis&&r.thesis!=='—'&&(
                        <><div className="cap" style={{marginBottom:4}}>Thesis</div>
                        <div style={{fontSize:13,lineHeight:1.7,color:'var(--ink-soft)',marginBottom:14}}>{r.thesis}</div></>
                      )}
                      <div style={{borderTop:'1px solid var(--line)',paddingTop:12}}>
                        <div className="cap" style={{marginBottom:10}}>Comments</div>
                        <RecoComments recoId={r.id} me={me}/>
                      </div>
                    </div></td></tr>
                  )}
                </React.Fragment>);
              })}</tbody>
            </table>
            </div>
          </div>
        </div>}
  </>);
}

export function ReceivedSection({ recs, setRecs, myId, contactName, groupName, assetClasses, contacts, groups, initBy, initGroup, initInv, onSendShare, onReload, me, tracked, toggleTrack, globalSearch }) {
  const isMobile = useIsMobile();
  const [q,setQ]=useState(globalSearch||""); const [sort,setSort]=useState({key:"date",dir:"desc"});
  const [fBy,setFBy]=useState(initBy||"all"),[fCls,setFCls]=useState("all"),[fMoney,setFMoney]=useState("all");
  const [fInv,setFInv]=useState(initInv||"all"),[fGroup,setFGroup]=useState(initGroup||"all"),[fHorizon,setFHorizon]=useState("all");
  const [showHidden,setShowHidden]=useState(false); const [showExpired,setShowExpired]=useState(false);
  const [openRow,setOpenRow]=useState(null);
  const [sharePopId,setSharePopId]=useState(null);
  const [shareAnchor,setShareAnchor]=useState(null);
  // Sync global search into local filter
  useEffect(()=>{ setQ(globalSearch||""); },[globalSearch]);
  const [shareUsername,setShareUsername]=useState(null);

  const handleReceivedShare = async (e, r) => {
    if (sharePopId===r.id) { setSharePopId(null); setShareAnchor(null); return; }
    setShareAnchor(e.currentTarget);
    setSharePopId(r.id);
    setShareUsername(null);
    // Async fetch recommender username for public link
    if (r.from) {
      try {
        const row = await dbLookupUser('id', r.from);
        if (row?.username) setShareUsername(row.username);
      } catch(_) {}
    }
  };

  const recName = (r) => r.byName || contactName(r.from);
  const isForwarded = (r) => r.sharedBy && r.sharedBy!==r.from;
  const sharedByName = (r) => isForwarded(r) ? (r.sharedByName||contactName(r.sharedBy)) : null;
  const byOptions = [...new Set(recs.map(recName))];
  const groupOptions = [...new Set(recs.filter(r=>r.shareType==="group").map(r=>r.groupId).filter(Boolean))];

  const patch = async (r, updates) => {
    setRecs(rs=>rs.map(x=>x.deliveryId===r.deliveryId?{...x,...updates}:x));
    if (r.deliveryId) {
      try { await updateDelivery(r.deliveryId, updates, myId); } catch(e) { await onReload(); }
    }
  };
  const doInvest=(r,price)=>patch(r,{isInvested:true,investedPrice:price,invested:true});
  const unInvest=(r)=>{
    patch(r,{isInvested:false,investedPrice:null,invested:false});
    if(myId) dbTrackReco(r.id, false).catch(console.warn);
  };
  const react=(r,val)=>{
    const next=r.reaction===val?'none':val;
    let likes=(r.likes||0);
    if(r.reaction==='like') likes = Math.max(0, likes-1);
    if(next==='like')       likes++;
    setRecs(rs=>rs.map(x=>x.deliveryId===r.deliveryId?{...x,reaction:next,likes}:x));
    if(r.deliveryId) updateDelivery(r.deliveryId,{reaction:next==='none'?null:next},myId).catch(console.warn);
  };
  const toggleHide=(r)=>patch(r,{isHidden:!r.hidden,hidden:!r.hidden});
  const del=async(r)=>{
    if(!confirm("Remove this idea from your received list?")) return;
    setRecs(rs=>rs.filter(x=>x.deliveryId!==r.deliveryId));
    await dbDeleteDelivery(r.deliveryId, myId);
  };

  const rows = useMemo(()=>{
    let r=recs.filter(x=>showHidden||!x.hidden);
    if(!showExpired) r=r.filter(x=>!isExpired(x));
    if(q.trim()){ const s=q.toLowerCase(); r=r.filter(x=>(x.assetName+" "+x.ticker+" "+recName(x)).toLowerCase().includes(s)); }
    if(fBy!=="all") r=r.filter(x=>recName(x)===fBy);
    if(fGroup!=="all") r=r.filter(x=>x.shareType==="group"&&x.groupId===fGroup);
    if(fCls!=="all") r=r.filter(x=>x.assetClass===fCls);
    if(fHorizon!=="all") r=r.filter(x=>x.horizon===fHorizon);
    if(fMoney!=="all") r=r.filter(x=>fMoney==="in"?ret(x)>=0:ret(x)<0);
    if(fInv!=="all") r=r.filter(x=>fInv==="yes"?x.invested:!x.invested);
    const dir=sort.dir==="asc"?1:-1; const k=sort.key;
    r=[...r].sort((a,b)=>{let av,bv;
      if(k==="assetName"){av=a.assetName.toLowerCase();bv=b.assetName.toLowerCase();}
      else if(k==="by"){av=recName(a).toLowerCase();bv=recName(b).toLowerCase();}
      else if(k==="date"){av=a.date||"";bv=b.date||"";}
      else if(k==="reco"){av=a.priceAt;bv=b.priceAt;}
      else if(k==="cur"){av=a.price;bv=b.price;}
      else if(k==="ret"){av=ret(a);bv=ret(b);}
      else if(k==="horizon"){av=HORIZONS.indexOf(a.horizon);bv=HORIZONS.indexOf(b.horizon);}
      return av<bv?-dir:av>bv?dir:0;});
    return r;
  },[recs,q,fBy,fGroup,fCls,fHorizon,fMoney,fInv,showHidden,showExpired,sort]);

  const expiredCount = recs.filter(x=>!x.hidden&&isExpired(x)).length;
  const activeFilterNote = fBy!=="all"?`From ${fBy}`+(fInv==="yes"?" · Acted on":""):fGroup!=="all"?`Via ${groupName(fGroup)}`:null;

  return (<>
    {/* ── Compact top bar: search + filters + expired toggle all in one row ── */}
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
      <div className="searchbox" style={{flex:"1 1 200px",minWidth:160}}>
        <Search size={15} color="var(--muted)"/>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search asset or contact…"/>
      </div>
      <select className="inline-select sm" value={fBy} onChange={e=>setFBy(e.target.value)} title="Filter by ideator">
        <option value="all">All people</option>{byOptions.map(b=><option key={b}>{b}</option>)}
      </select>
      <select className="inline-select sm" value={fCls} onChange={e=>setFCls(e.target.value)} title="Filter by class">
        <option value="all">All classes</option>{assetClasses.map(c=><option key={c}>{c}</option>)}
      </select>
      <select className="inline-select sm" value={fHorizon} onChange={e=>setFHorizon(e.target.value)} title="Filter by horizon">
        <option value="all">All horizons</option>{HORIZONS.map(h=><option key={h}>{h}</option>)}
      </select>
      <select className="inline-select sm" value={fMoney} onChange={e=>setFMoney(e.target.value)}>
        <option value="all">All returns</option><option value="in">In the money</option><option value="out">Out of money</option>
      </select>
      <select className="inline-select sm" value={fInv} onChange={e=>setFInv(e.target.value)}>
        <option value="all">All</option><option value="yes">Invested</option><option value="no">Not invested</option>
      </select>
      {/* Expired toggle — inline, compact */}
      <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",background:"var(--surface-2)",border:"1px solid var(--line)",borderRadius:9,cursor:"pointer",flexShrink:0,userSelect:"none"}} onClick={()=>setShowExpired(v=>!v)}>
        <div className={"sw"+(showExpired?" on":"")} style={{width:32,height:18}} onClick={e=>{e.stopPropagation();setShowExpired(v=>!v)}}><div className="knob" style={{width:14,height:14,top:2}}/></div>
        <span style={{fontSize:12,fontWeight:600,color:"var(--ink-soft)",whiteSpace:"nowrap"}}>Expired</span>
        {expiredCount>0 && <span className="pill loss" style={{fontSize:11,padding:"1px 6px"}}>{expiredCount}</span>}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",background:"var(--surface-2)",border:"1px solid var(--line)",borderRadius:9,cursor:"pointer",flexShrink:0}} onClick={()=>setShowHidden(v=>!v)}>
        <div className={"sw"+(showHidden?" on":"")} style={{width:32,height:18}}><div className="knob" style={{width:14,height:14,top:2}}/></div>
        <span style={{fontSize:12,fontWeight:600,color:"var(--ink-soft)",whiteSpace:"nowrap"}}>Hidden</span>
      </div>
    </div>

    {/* Active filter badge */}
    {activeFilterNote && (
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,fontSize:12}}>
        <span className="pill accent">{activeFilterNote}</span>
        <button onClick={()=>{setFBy("all");setFGroup("all");}} style={{fontSize:11,color:"var(--muted)",background:"none",border:"none",cursor:"pointer",padding:0}}>✕ Clear</button>
      </div>
    )}
    {recs.some(r=>r.exitSignal&&(showHidden||!r.hidden)) && (
      <div className="note warn" style={{marginBottom:10,padding:"8px 12px",fontSize:12}}><AlertTriangle size={14}/><div>An ideator has issued an <b>exit signal</b> on an idea below.</div></div>
    )}

    {rows.length===0
      ? <div className="card"><div className="empty">No ideas match your filters.</div></div>
      : isMobile
      ? <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {rows.map(r=>{
            const isBuy=(r.recommendation_type||r.recType||'Buy')==='Buy';
            const closed=getClosedInfo(r);
            const recoRet=closed && closed.retPct!=null ? closed.retPct : (r.priceAt?(r.price-r.priceAt)/r.priceAt:0);
            const cur=r.currency||'INR';
            const fromName=r.byName||(typeof contactName==='function'?contactName(r.from):'Someone');
            return (
              <div key={r.id} className="card" style={{padding:'14px 16px',borderLeft:'3px solid '+(isBuy?'var(--gain)':'var(--loss)'),cursor:r.from?'pointer':'default'}}
                onClick={()=>r.from&&gotoReco(r.from,r.id)}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:15,marginBottom:2}}>{r.assetName||r.asset_name}</div>
                    <div style={{fontSize:11,color:'var(--muted)'}}>{r.ticker} · From {fromName}</div>
                  </div>
                  <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,flexShrink:0,background:isBuy?'var(--gain-soft)':'var(--loss-soft)',color:isBuy?'var(--gain)':'var(--loss)'}}>{isBuy?'Buy':'Sell'}</span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12}}>
                  {[['Entry Price',r.priceAt?fmt(r.priceAt,cur):'—'],['Current',r.price?fmt(r.price,cur):'—'],['Return',r.priceAt?fmtPct(recoRet):'—']].map(([label,val],i)=>(
                    <div key={i} style={{background:'var(--surface-2)',borderRadius:8,padding:'8px 10px'}}>
                      <div style={{fontSize:10,color:'var(--muted)',marginBottom:2}}>{label}</div>
                      <div style={{fontWeight:700,fontSize:13,color:i===2?(recoRet>=0?'var(--gain)':'var(--loss)'):'var(--ink)'}}>{val}</div>
                    </div>
                  ))}
                </div>
                {closed && <div style={{marginBottom:12}}><ClosedInfoLine info={closed} cur={cur}/></div>}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                  <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                    {r.horizon&&<span className="pill accent" style={{fontSize:10}}>{r.horizon}</span>}
                    {r.conviction&&<ConvBadge level={r.conviction}/>}
                    <span style={{fontSize:10,color:'var(--muted)'}}>{fmtDate(r.date)}</span>
                  </div>
                  <div style={{display:'flex',gap:4,position:'relative'}} onClick={e=>e.stopPropagation()}>
                    <button className="iconbtn" title="Share" onClick={(e)=>handleReceivedShare(e,r)}><Share2 size={13}/></button>
                    <button className="iconbtn" title={tracked?.has(r.id)?'Tracked':'Track'} onClick={()=>toggleTrack?.(r.id)} style={tracked?.has(r.id)?{background:'var(--accent-soft)',color:'var(--accent-ink)'}:{}}><Bookmark size={13}/></button>
                    {sharePopId===r.id && (
                      <IdeaSharePopover
                        reco={r} username={shareUsername} contacts={contacts} groups={groups}
                        anchorEl={shareAnchor}
                        onSend={(targets)=>onSendShare(r.id,targets)}
                        onClose={()=>{ setSharePopId(null); setShareAnchor(null); }}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      : <div className="card">
          <div className="card-body" style={{padding:"6px 0"}}>
            <div className="tscroll">
            <table className="grid" style={{width:"100%"}}>
              <thead><tr>
                <SortTh label="Asset" k="assetName" sort={sort} setSort={setSort}/>
                <SortTh label="By" k="by" sort={sort} setSort={setSort}/>
                <SortTh label="Date" k="date" sort={sort} setSort={setSort}/>
                <SortTh label="Entry ₹" k="reco" sort={sort} setSort={setSort} align="right"/>
                <SortTh label="Current ₹" k="cur" sort={sort} setSort={setSort} align="right"/>
                <SortTh label="Return" k="ret" sort={sort} setSort={setSort} align="right"/>
                <th>Status</th>
                <SortTh label="Horizon" k="horizon" sort={sort} setSort={setSort}/>
                <th title="Your reaction">React</th>
                <th style={{textAlign:"right"}}>Actions</th>
              </tr></thead>
              <tbody>{rows.map(r=>{
                const closed=getClosedInfo(r);
                const retVal=closed && closed.retPct!=null ? closed.retPct : ret(r);
                const itm=retVal>=0; const open=openRow===r.id; const td=getTargetDate(r);
                return (<React.Fragment key={r.id}>
                  <tr className={"hoverable"+(closed?.kind==='exited'?" exit":"")+(r.hidden?" hiddenrow":"")+(closed?.kind==='expired'?" expired":"")}>
                    {/* Asset — chevron expands inline detail; name click-through to the dedicated reco page */}
                    <td style={{maxWidth:200}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <ChevronDown size={13} color="var(--muted)" style={{cursor:"pointer",transform:open?"rotate(180deg)":"none",transition:".15s",flexShrink:0}} onClick={()=>setOpenRow(open?null:r.id)}/>
                        <div style={r.from?{cursor:'pointer'}:{}} onClick={()=>r.from?gotoReco(r.from,r.id):setOpenRow(open?null:r.id)} title={r.from?'View this idea':undefined}>
                          <div className="sym" style={{fontSize:13}}>{r.assetName}</div>
                          <div style={{fontSize:11,color:"var(--muted)"}}>{r.assetClass&&<ClassTag c={r.assetClass}/>}</div>
                        </div>
                      </div>
                      {r.hidden && <span className="pill" style={{marginLeft:8,fontSize:10}}>Hidden</span>}
                      {closed && <span className={"pill "+(closed.kind==='exited'?'loss':'')} style={{marginLeft:8,fontSize:10}}>{closed.kind==='exited'?'Exited':'Expired'}</span>}
                    </td>
                    {/* Recommended by */}
                    <td style={{maxWidth:130}}>
                      <div
                        style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                          cursor:r.from?'pointer':'default',
                          color:r.from?'var(--accent-ink)':'var(--ink)',
                          textDecoration:r.from?'underline':'none',
                          textDecorationStyle:'dotted',textUnderlineOffset:3}}
                        title={r.from?`View ${recName(r)}'s public profile`:''}
                        onClick={()=>r.from&&gotoUserProfile(r.from)}
                      >{recName(r)}</div>
                      {isForwarded(r) && <div style={{fontSize:11,color:"var(--muted)",display:"flex",alignItems:"center",gap:3}}><Forward size={10}/> via {sharedByName(r)}</div>}
                    </td>
                    <td className="muted small nowrap">{fmtDate(r.date)}</td>
                    <td style={{textAlign:"right"}} className="tnum">{r.priceAt?fmt(r.priceAt):<span className="muted">—</span>}</td>
                    <td style={{textAlign:"right"}} className="tnum">{fmt(r.price)}</td>
                    <td className={"tnum nowrap "+(itm?"pos":"neg")} style={{fontWeight:700,textAlign:"right"}}>{fmtPct(retVal)}</td>
                    <td>{closed ? <StatusBadge2 status={closed.kind==='exited'?'Closed':'Expired'}/> : <Money itm={itm}/>}</td>
                    <td>{r.horizon?<span className="pill accent" style={{fontSize:11}}>{r.horizon}</span>:<span className="muted">—</span>}</td>
                    {/* Reactions */}
                    <td>
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <button className={"iconbtn"+(r.reaction==="like"?" on-like":"")} title="Like" onClick={()=>react(r,"like")}><ThumbsUp size={13}/></button>
                        <span className="muted small tnum" style={{fontSize:11}}>{r.likes}</span>
                      </div>
                    </td>
                    {/* Actions */}
                    <td>
                      <div className="actions" style={{gap:4}}>
                        {/* Mark Invested toggle */}
                        <InvestedToggle
                          invested={r.invested}
                          investedPrice={r.investedPrice||r.invested_price}
                          reco={r}
                          onMark={(price)=>{
                            doInvest(r, price);
                            // Upsert into tracking with invested data (auto-tracks + marks invested)
                            if(myId) {
                              dbTrackReco(r.id, true, price)
                                .then(()=>{ if(toggleTrack && tracked && !tracked.has(r.id)) toggleTrack(r.id); })
                                .catch(()=>{ if(toggleTrack && tracked && !tracked.has(r.id)) toggleTrack(r.id); });
                            } else if(toggleTrack && tracked && !tracked.has(r.id)) toggleTrack(r.id);
                          }}
                          onUnmark={()=>unInvest(r)}
                          stopProp={false}
                        />
                        {/* Share — public link + Circles + contacts */}
                        <div style={{position:"relative"}}>
                          <button className="iconbtn" title="Share" onClick={(e)=>handleReceivedShare(e,r)}><Share2 size={13}/></button>
                          {sharePopId===r.id && (
                            <IdeaSharePopover
                              reco={r}
                              username={shareUsername} contacts={contacts} groups={groups}
                              anchorEl={shareAnchor}
                              onSend={(targets)=>onSendShare(r.id,targets)}
                              onClose={()=>{ setSharePopId(null); setShareAnchor(null); }}
                            />
                          )}
                        </div>
                        {/* Track / bookmark button */}
                        <button
                          className={"iconbtn"+(tracked?.has(r.id)?" on-like":"")}
                          title={tracked?.has(r.id)?"Remove from tracked":"Track this idea"}
                          onClick={()=>toggleTrack?.(r.id)}
                          style={tracked?.has(r.id)?{background:'var(--accent-soft)',color:'var(--accent-ink)',borderColor:'var(--accent-line)'}:{}}>
                          <Bookmark size={13}/>
                        </button>
                        <button className="iconbtn" title={r.hidden?"Unhide":"Hide"} onClick={()=>toggleHide(r)}>{r.hidden?<Eye size={13}/>:<EyeOff size={13}/>}</button>
                        <button className="iconbtn danger" title="Remove" onClick={()=>del(r)}><Trash2 size={13}/></button>
                      </div>
                    </td>
                  </tr>
                  {/* ── Expanded detail row ── */}
                  {open && (
                    <tr className="expand-row"><td colSpan={10}><div className="expand-inner">
                      <div style={{display:"flex",gap:32,flexWrap:"wrap",marginBottom:12}}>
                        <div><div className="cap">Ticker</div><b>{r.ticker}</b></div>
                        <div><div className="cap">Asset class</div><ClassTag c={r.assetClass}/></div>
                        <div><div className="cap">Shared as</div><b>{r.shareType==="group"?`Group · ${groupName(r.groupId)}`:"Direct"}</b></div>
                        {isForwarded(r)&&<div><div className="cap">Forwarded by</div><b>{sharedByName(r)}</b></div>}
                        {r.targetPrice&&<div><div className="cap">Target price</div><b className="tnum">{fmt(r.targetPrice)}</b></div>}
                        {r.stopLoss&&<div><div className="cap">Stop loss</div><b className="tnum neg">{fmt(r.stopLoss)}</b></div>}
                        {td&&<div><div className="cap">Target date</div><b className={closed?.kind==='expired'?"neg":""}>{fmtDate(td)}{closed?.kind==='expired'?" · Expired":""}</b></div>}
                        {r.conviction&&<div><div className="cap">Conviction</div><ConvBadge level={r.conviction}/></div>}
                        {r.invested&&<div><div className="cap">My entry</div><b className="tnum pos">{r.investedPrice?fmt(r.investedPrice):"—"}</b></div>}
                      </div>
                      {closed && <div style={{marginBottom:12}}><ClosedInfoLine info={closed}/></div>}
                      <div className="cap">Thesis from {recName(r)}{isForwarded(r)?` · forwarded by ${sharedByName(r)}`:""}</div>
                      <div style={{fontSize:13,lineHeight:1.7,color:"var(--ink-soft)",marginTop:4,marginBottom:12,maxWidth:720}}>
                        {r.thesis ? <ThesisRenderer thesis={r.thesis}/> : <span className="muted">No thesis shared.</span>}
                      </div>
                      <div style={{position:'relative',display:'inline-block'}}>
                        <button className="btn btn-soft btn-sm" onClick={(e)=>{ setSharePopId(r.id); setShareAnchor(e.currentTarget); }}><Forward size={13}/> Forward this idea</button>
                        {sharePopId===r.id && (
                          <IdeaSharePopover
                            reco={r} username={shareUsername} contacts={contacts} groups={groups}
                            anchorEl={shareAnchor}
                            onSend={(targets)=>onSendShare(r.id,targets)}
                            onClose={()=>{ setSharePopId(null); setShareAnchor(null); }}
                          />
                        )}
                      </div>
                      <div style={{marginTop:18,borderTop:'1px solid var(--line)',paddingTop:14}}>
                        <div className="cap" style={{marginBottom:10}}>Comments</div>
                        <RecoComments recoId={r.id} me={me}/>
                      </div>
                      <IdeaDisclaimer defaultExpanded style={{marginTop:14}}/>
                    </div></td></tr>
                  )}
                </React.Fragment>);
              })}</tbody>
            </table>
            </div>{/* /tscroll */}
          </div>
        </div>}
  </>);
}

export function ImportPreviewModal({ result, onClose, onApply }) {
  const [mode,setMode]=useState("append"); const h=result.holdings||[];
  return (<div className="overlay" onClick={onClose}><div className="modal" style={{width:720}} onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3><Upload size={18} style={{verticalAlign:-3,color:"var(--accent)"}}/> Import portfolio</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">
      <div className="muted small" style={{marginBottom:12}}>From <b style={{color:"var(--ink)"}}>{result.fileName}</b> — found <b style={{color:"var(--ink)"}}>{h.length}</b> holding{h.length===1?"":"s"}.</div>
      {(result.warnings||[]).map((w,i)=><div key={i} className="note warn" style={{marginBottom:12}}><AlertTriangle size={16}/><div>{w}</div></div>)}
      {h.length>0 && <>
        <div style={{maxHeight:300,overflow:"auto",border:"1px solid var(--line)",borderRadius:12}}><HoldPreviewTable holdings={h}/></div>
        <div style={{display:"flex",gap:18,marginTop:16}}>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontWeight:600}}><input type="radio" checked={mode==="append"} onChange={()=>setMode("append")} style={{accentColor:"var(--accent)"}}/> Add to my portfolio</label>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontWeight:600}}><input type="radio" checked={mode==="replace"} onChange={()=>setMode("replace")} style={{accentColor:"var(--accent)"}}/> Replace everything</label></div>
      </>}
    </div>
    <div className="modal-foot"><span/><div style={{display:"flex",gap:10}}><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-pri" disabled={h.length===0} onClick={()=>onApply(h,mode)}><Check size={15}/> Import {h.length||""}</button></div></div>
  </div></div>);
}

/* ── CAS PDF Upload Modal ────────────────────────────────────────────────────
   Replaces the old mock "Link via PAN" modal.
   Step 1: drop / browse PDF + enter password → Parse
   Step 2: preview MF & equity holdings + choose append/replace → Import
   ─────────────────────────────────────────────────────────────────────────── */

export function PanPullModal({ onClose, onApply }) {
  const [file,     setFile]     = useState(null);
  const [password, setPassword] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [drag,     setDrag]     = useState(false);
  const [parsing,  setParsing]  = useState(false);
  const [parsed,   setParsed]   = useState(null);   // { mf, equity, investor, warnings }
  const [mode,     setMode]     = useState('append');
  const [err,      setErr]      = useState('');
  const dropRef = useRef(null);

  const allHoldings = parsed ? [...(parsed.mf||[]), ...(parsed.equity||[])] : [];

  const pickFile = f => {
    if (!f || f.type !== 'application/pdf') { setErr('Please select a PDF file.'); return; }
    setFile(f); setErr(''); setParsed(null);
  };

  const onDrop = e => {
    e.preventDefault(); setDrag(false);
    pickFile(e.dataTransfer.files[0]);
  };

  const parse = async () => {
    if (!file) return;
    setParsing(true); setErr('');
    try {
      const result = await parseCasPdf(file, password);
      setParsed(result);
      if (!result.mf.length && !result.equity.length) {
        setErr('No holdings found. Check your password and try again.');
        setParsed(null);
      }
    } catch(e) { setErr(e.message); }
    setParsing(false);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{width: parsed ? 760 : 500, maxWidth:'95vw'}}
           onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div className="modal-head">
          <h3><CreditCard size={18} style={{verticalAlign:-3,color:'var(--accent)'}}/>
            {' '}Import portfolio via CAS
          </h3>
          <button className="icon-btn" onClick={onClose}><X size={20}/></button>
        </div>

        <div className="modal-body">
          {!parsed ? (
            <>
              {/* API not configured warning */}
              {!_CAS_CONFIGURED&&(
                <div className="note" style={{marginBottom:12,background:'#fef3c7',border:'1px solid #fbbf24',borderRadius:10,padding:'10px 14px',display:'flex',gap:8,alignItems:'flex-start'}}>
                  <AlertTriangle size={15} style={{color:'#92400e',flexShrink:0,marginTop:1}}/>
                  <div style={{fontSize:12,color:'#78350f'}}>
                    <strong>CAS API not configured.</strong> Add{' '}
                    <code style={{background:'rgba(0,0,0,.08)',padding:'1px 5px',borderRadius:3}}>VITE_CAS_API_URL=https://your-project.vercel.app</code>{' '}
                    to GitHub → Settings → Secrets → Actions, then redeploy. Until then, CAS import will fail with a 405 error.
                  </div>
                </div>
              )}

              {/* What is CAS */}
              <div className="note info" style={{marginBottom:16}}>
                <Shield size={15}/>
                <div>
                  A <strong>Consolidated Account Statement (CAS)</strong> contains
                  all your mutual fund and demat (equity) holdings in one PDF.
                  {' '}<a href="https://www.camsonline.com/Investors/Statements/ConsolidatedAccountStatement"
                     target="_blank" rel="noopener noreferrer"
                     style={{color:'var(--accent-ink)',fontWeight:600}}>Get your CAS from CAMS →</a>
                </div>
              </div>

              {/* Drop zone */}
              <div ref={dropRef}
                   onDragOver={e=>{e.preventDefault();setDrag(true);}}
                   onDragLeave={()=>setDrag(false)}
                   onDrop={onDrop}
                   onClick={()=>dropRef.current.querySelector('input').click()}
                   style={{
                     border:`2px dashed ${drag?'var(--accent)':'var(--line-2)'}`,
                     borderRadius:14, padding:'28px 20px', textAlign:'center',
                     cursor:'pointer', transition:'.15s',
                     background:drag?'var(--accent-soft)':'var(--surface-2)',
                   }}>
                <input type="file" accept=".pdf" style={{display:'none'}}
                  onChange={e=>pickFile(e.target.files[0])}/>
                {file
                  ? <div>
                      <div style={{fontSize:15,fontWeight:700,color:'var(--ink)',marginBottom:4}}>
                        📄 {file.name}
                      </div>
                      <div style={{fontSize:12,color:'var(--muted)'}}>
                        {(file.size/1024/1024).toFixed(2)} MB · Click to change
                      </div>
                    </div>
                  : <>
                      <Upload size={28} color="var(--muted)" style={{marginBottom:10}}/>
                      <div style={{fontSize:14,fontWeight:600,color:'var(--ink)',marginBottom:4}}>
                        Drop your CAS PDF here
                      </div>
                      <div style={{fontSize:12,color:'var(--muted)'}}>or click to browse</div>
                    </>}
              </div>

              {/* Password */}
              <div className="field" style={{marginTop:14}}>
                <label style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span>PDF Password</span>
                  <button onClick={()=>setShowPwd(v=>!v)}
                    style={{background:'none',border:'none',cursor:'pointer',fontSize:12,
                      color:'var(--accent-ink)',fontWeight:600,fontFamily:'var(--font)',padding:0}}>
                    {showPwd?'Hide':'Show hint'}
                  </button>
                </label>
                <div style={{position:'relative'}}>
                  <input type="text" value={password} placeholder="Leave blank if no password"
                    onChange={e=>{setPassword(e.target.value);setErr('');}}
                    onKeyDown={e=>e.key==='Enter'&&file&&parse()}
                    style={{width:'100%',paddingRight:36}}/>
                </div>
                {showPwd && (
                  <div style={{marginTop:8,padding:'10px 14px',background:'var(--surface-2)',
                    border:'1px solid var(--line)',borderRadius:10,fontSize:12,lineHeight:1.8,color:'var(--muted)'}}>
                    <strong style={{color:'var(--ink)'}}>Typical passwords:</strong><br/>
                    <span style={{display:'block',marginTop:4}}>
                      CDSL / NSDL CAS:&nbsp;
                      <code style={{color:'var(--accent-ink)'}}>your PAN in lowercase</code>
                      &nbsp;(e.g. <code>abcde1234f</code>)
                    </span>
                    <span style={{display:'block'}}>
                      CAMS CAS:&nbsp;
                      <code style={{color:'var(--accent-ink)'}}>first 4 chars of email + date of birth</code>
                      &nbsp;(e.g. <code>ankuDDMMYYYY</code>)
                    </span>
                    <span style={{display:'block'}}>
                      No password?&nbsp; Leave the field blank.
                    </span>
                  </div>
                )}
              </div>

              {err && (
                <div style={{display:'flex',gap:7,alignItems:'flex-start',color:'var(--loss)',fontSize:13,marginTop:6}}>
                  <AlertTriangle size={14} style={{flexShrink:0,marginTop:2}}/>{err}
                </div>
              )}
            </>
          ) : (
            /* ── Preview ── */
            <>
              {/* Investor info */}
              {parsed.investor?.name && (
                <div style={{display:'flex',gap:16,alignItems:'center',padding:'10px 14px',
                  background:'var(--surface-2)',border:'1px solid var(--line)',
                  borderRadius:12,marginBottom:14,fontSize:13}}>
                  <div style={{fontWeight:700,color:'var(--ink)'}}>{parsed.investor.name}</div>
                  {parsed.investor.pan && <div style={{color:'var(--muted)',fontFamily:'monospace'}}>{parsed.investor.pan}</div>}
                  {parsed.investor.email && <div style={{color:'var(--muted)'}}>{parsed.investor.email}</div>}
                </div>
              )}

              {/* Holdings split */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                {[
                  {label:'Mutual Funds', count:parsed.mf.length,    icon:'📈', col:'var(--accent-ink)'},
                  {label:'Equity / ETF', count:parsed.equity.length, icon:'🏦', col:'var(--gain)'},
                ].map(s=>(
                  <div key={s.label} style={{padding:'12px 16px',background:'var(--surface-2)',
                    border:'1px solid var(--line)',borderRadius:12,textAlign:'center'}}>
                    <div style={{fontSize:24,marginBottom:4}}>{s.icon}</div>
                    <div style={{fontSize:22,fontWeight:900,color:s.col}}>{s.count}</div>
                    <div style={{fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.06em'}}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Warnings */}
              {parsed.warnings?.filter(w=>w).map((w,i)=>(
                <div key={i} className="note" style={{marginBottom:8,fontSize:12,padding:'8px 12px'}}>
                  <AlertTriangle size={13}/><div>{w}</div>
                </div>
              ))}

              {/* Holdings table */}
              <div style={{maxHeight:260,overflow:'auto',border:'1px solid var(--line)',borderRadius:12,marginBottom:14}}>
                <HoldPreviewTable holdings={allHoldings}/>
              </div>

              {/* Mode selector */}
              <div style={{display:'flex',gap:20}}>
                {[['append','Add to my portfolio'],['replace','Replace everything']].map(([v,label])=>(
                  <label key={v} style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontWeight:600,fontSize:14}}>
                    <input type="radio" checked={mode===v} onChange={()=>setMode(v)} style={{accentColor:'var(--accent)'}}/>
                    {label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={parsed ? ()=>setParsed(null) : onClose}>
            {parsed ? '← Back' : 'Cancel'}
          </button>
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            {parsing && <span style={{fontSize:12,color:'var(--muted)',display:'flex',alignItems:'center',gap:6}}><Loader size={14} className="spin"/>Parsing…</span>}
            {!parsed
              ? <button className="btn btn-pri" disabled={!file||parsing} onClick={parse}>
                  <Upload size={14}/> Parse CAS
                </button>
              : <button className="btn btn-pri" disabled={allHoldings.length===0}
                  onClick={()=>onApply(allHoldings, mode)}>
                  <Check size={14}/> Import {allHoldings.length} holding{allHoldings.length!==1?'s':''}
                </button>}
          </div>
        </div>

      </div>
    </div>
  );
}

export function MadeSection({ recs, setRecs, recipientName, reach, contacts, groups, onSendShare, assetClasses, setAssetClasses, holdings, me, onReload, globalSearch }) {
  const isMobile = useIsMobile();
  const [q,setQ]=useState(""); const [fCls,setFCls]=useState("all"),[fMoney,setFMoney]=useState("all"),[fHorizon,setFHorizon]=useState("all");
  useEffect(()=>{ setQ(globalSearch||""); },[globalSearch]);
  const [showExpired,setShowExpired]=useState(false);
  const [sort,setSort]=useState({key:"date",dir:"desc"});
  const [openRow,setOpenRow]=useState(null);
  const [sharePopId, setSharePopId] = useState(null);
  const [shareAnchor, setShareAnchor] = useState(null);
  const [exitingId,  setExitingId]  = useState(null);

  // No delete handler here, deliberately. An idea is permanent once posted:
  // the track record only means something if nobody can erase the calls that
  // went wrong, so an author closes a position with toggleExit() below, which
  // records the outcome rather than hiding it. (The Trash button in
  // ReceivedSection is a different action — it removes the RECIPIENT's own
  // copy via deleteDelivery and leaves the idea itself alone.)
  //
  // A `del` handler calling deleteRecommendation() used to sit here, unwired
  // to any button; it has been removed so it cannot be hooked up by mistake.
  // If a short post-publish correction window is introduced later, it will be
  // a deliberate feature with its own time limit and rules.

  const toggleExit=async(r)=>{
    if (r.exit) {
      if(!confirm("Cancel the exit signal for this idea?")) return;
      setRecs(rs=>rs.map(x=>x.id===r.id?{...x,exit:false,exitDate:null,exitPrice:null}:x));
      if(me?.id) { try { await dbCancelExit(r.id,me.id); await onReload(); } catch(_){} }
    } else {
      setExitingId(r.id);
      let exitPriceData = null;
      try { exitPriceData = await getTodayClose(r.ticker, r.exchange || "NSE"); }
      catch(e) { console.warn("Exit price fetch failed:", e.message); }
      const priceLabel = exitPriceData
        ? `₹${Number(exitPriceData.price).toLocaleString("en-IN")} (${sourceName(exitPriceData.source)} · ${exitPriceData.date})`
        : "Price unavailable — will not be stamped (flagged on profile)";
      const confirmed = confirm(`Exit "${r.ticker}"?\n\nExit price: ${priceLabel}\n\nThis records your exit and closes the idea.`);
      setExitingId(null);
      if (!confirmed) return;
      setRecs(rs=>rs.map(x=>x.id===r.id?{...x,exit:true,exitDate:TODAY,exitPrice:exitPriceData?.price||null}:x));
      if(me?.id) {
        try { await dbSetExit(r.id, me.id, exitPriceData?.price||null, exitPriceData?.source||"unavailable"); await onReload(); } catch(_){}
      }
    }
  };
  const rows = useMemo(()=>{
    let r=[...recs];
    if(!showExpired) r=r.filter(x=>!isExpired(x));
    if(q.trim()){ const s=q.toLowerCase(); r=r.filter(x=>(x.assetName+" "+x.ticker).toLowerCase().includes(s)); }
    if(fCls!=="all") r=r.filter(x=>x.assetClass===fCls);
    if(fHorizon!=="all") r=r.filter(x=>x.horizon===fHorizon);
    if(fMoney!=="all") r=r.filter(x=> fMoney==="in"?ret(x)>=0:ret(x)<0);
    const dir=sort.dir==="asc"?1:-1; const k=sort.key;
    r.sort((a,b)=>{ let av,bv;
      if(k==="assetName"){av=a.assetName.toLowerCase();bv=b.assetName.toLowerCase();}
      else if(k==="date"){av=a.date;bv=b.date;}
      else if(k==="reco"){av=a.priceAt;bv=b.priceAt;}
      else if(k==="cur"){av=a.price;bv=b.price;}
      else if(k==="ret"){av=ret(a);bv=ret(b);}
      else if(k==="target"){av=a.targetPrice||0;bv=b.targetPrice||0;}
      else if(k==="horizon"){av=HORIZONS.indexOf(a.horizon);bv=HORIZONS.indexOf(b.horizon);}
      return av<bv?-dir:av>bv?dir:0; });
    return r;
  },[recs,q,fCls,fHorizon,fMoney,showExpired,sort]);

  const expiredCount = recs.filter(x=>isExpired(x)).length;

  return (<>
    {/* ── Compact toolbar ── */}
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
      <div className="searchbox" style={{flex:"1 1 200px",minWidth:160}}>
        <Search size={15} color="var(--muted)"/>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search by asset or ticker…"/>
      </div>
      <select className="inline-select sm" value={fCls} onChange={e=>setFCls(e.target.value)}>
        <option value="all">All classes</option>{assetClasses.map(c=><option key={c}>{c}</option>)}
      </select>
      <select className="inline-select sm" value={fHorizon} onChange={e=>setFHorizon(e.target.value)}>
        <option value="all">All horizons</option>{HORIZONS.map(h=><option key={h}>{h}</option>)}
      </select>
      <select className="inline-select sm" value={fMoney} onChange={e=>setFMoney(e.target.value)}>
        <option value="all">All returns</option><option value="in">In the money</option><option value="out">Out of money</option>
      </select>
      <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",background:"var(--surface-2)",border:"1px solid var(--line)",borderRadius:9,cursor:"pointer",flexShrink:0}} onClick={()=>setShowExpired(v=>!v)}>
        <div className={"sw"+(showExpired?" on":"")} style={{width:32,height:18}}><div className="knob" style={{width:14,height:14,top:2}}/></div>
        <span style={{fontSize:12,fontWeight:600,color:"var(--ink-soft)",whiteSpace:"nowrap"}}>Expired</span>
        {expiredCount>0 && <span className="pill loss" style={{fontSize:11,padding:"1px 6px"}}>{expiredCount}</span>}
      </div>
    </div>

    {rows.length===0
      ? <div className="card"><div className="empty">No ideas match your filters.</div></div>
      : isMobile
      ? <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {rows.map(r=>{
            const isBuy=(r.recType||'Buy')==='Buy';
            const closedM=getClosedInfo(r);
            const recoRet=closedM && closedM.retPct!=null ? closedM.retPct : (r.priceAt?(r.price-r.priceAt)/r.priceAt:0);
            const cur=r.currency||'INR';
            return (
              <div key={r.id} className="card"
                style={{padding:'14px 16px',borderLeft:'3px solid '+(isBuy?'var(--gain)':'var(--loss)'),cursor:me?.username?'pointer':'default'}}
                onClick={()=>me?.username&&openReco(me.username,r.id)}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:15,marginBottom:2}}>{r.assetName}</div>
                    <div style={{fontSize:11,color:'var(--muted)'}}>{r.ticker} · {fmtDate(r.date)}</div>
                  </div>
                  <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,flexShrink:0,background:isBuy?'var(--gain-soft)':'var(--loss-soft)',color:isBuy?'var(--gain)':'var(--loss)'}}>{isBuy?'Buy':'Sell'}</span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12}}>
                  {[['Entry Price',r.priceAt?fmt(r.priceAt,cur):'—'],['Current',r.price?fmt(r.price,cur):'—'],['Return',r.priceAt?fmtPct(recoRet):'—']].map(([label,val],i)=>(
                    <div key={i} style={{background:'var(--surface-2)',borderRadius:8,padding:'8px 10px'}}>
                      <div style={{fontSize:10,color:'var(--muted)',marginBottom:2}}>{label}</div>
                      <div style={{fontWeight:700,fontSize:13,color:i===2?(recoRet>=0?'var(--gain)':'var(--loss)'):'var(--ink)'}}>{val}</div>
                    </div>
                  ))}
                </div>
                {closedM && <div style={{marginBottom:12}}><ClosedInfoLine info={closedM} cur={cur}/></div>}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                  <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                    {r.horizon&&<span className="pill accent" style={{fontSize:10}}>{r.horizon}</span>}
                    {r.conviction&&<ConvBadge level={r.conviction}/>}
                    {(r.recipients?.length||0)>0&&<span style={{fontSize:10,color:'var(--muted)'}}>Sent to {reach(r.recipients)} people</span>}
                  </div>
                  <div style={{display:'flex',gap:4,position:'relative'}} onClick={e=>e.stopPropagation()}>
                    <button className="iconbtn" title="Share" onClick={(e)=>{ setSharePopId(sharePopId===r.id?null:r.id); setShareAnchor(e.currentTarget); }}><Share2 size={13}/></button>
                    {!r.exit&&<button className="iconbtn" title="Mark exit" onClick={()=>toggleExit(r)} style={{color:'var(--muted)'}}><LogOut size={13}/></button>}
                    {sharePopId===r.id && (
                      <IdeaSharePopover
                        reco={r} username={r.isPublic?me.username:null} contacts={contacts} groups={groups}
                        anchorEl={shareAnchor}
                        onSend={(targets)=>onSendShare(r.id,targets)}
                        onClose={()=>{ setSharePopId(null); setShareAnchor(null); }}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      : <div className="card">
          <div className="card-body" style={{padding:"6px 0"}}>
            <div className="tscroll">
            <table className="grid" style={{width:"100%"}}>
              <thead><tr>
                <SortTh label="Asset" k="assetName" sort={sort} setSort={setSort}/>
                <SortTh label="Date" k="date" sort={sort} setSort={setSort}/>
                <SortTh label="Entry Price" k="reco" sort={sort} setSort={setSort} align="right"/>
                <SortTh label="Current" k="cur" sort={sort} setSort={setSort} align="right"/>
                <SortTh label="Return" k="ret" sort={sort} setSort={setSort} align="right"/>
                <th>Status</th>
                <SortTh label="Horizon" k="horizon" sort={sort} setSort={setSort}/>
                <th title="Likes from recipients">Likes</th>
                <th style={{textAlign:"right"}}>Actions</th>
              </tr></thead>
              <tbody>{rows.map(r=>{
                const closed=getClosedInfo(r);
                const retVal=closed && closed.retPct!=null ? closed.retPct : ret(r);
                const itm=retVal>=0; const open=openRow===r.id; const td=getTargetDate(r);
                return (<React.Fragment key={r.id}>
                  <tr className={"hoverable"+(closed?.kind==='exited'?" exit":"")+(closed?.kind==='expired'?" expired":"")}>
                    {/* Asset — chevron expands inline detail; name click-through to the dedicated reco page */}
                    <td style={{maxWidth:220}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <ChevronDown size={13} color="var(--muted)" style={{cursor:"pointer",transform:open?"rotate(180deg)":"none",transition:".15s",flexShrink:0}} onClick={()=>setOpenRow(open?null:r.id)}/>
                        <div style={me?.username?{cursor:'pointer'}:{}} onClick={()=>me?.username?openReco(me.username,r.id):setOpenRow(open?null:r.id)} title={me?.username?'View this idea':undefined}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span className="sym" style={{fontSize:13}}>{r.assetName}</span>
                            <span className={r.isPublic?"pill gain":"pill"} style={{fontSize:10,padding:"1px 6px"}}>{r.isPublic?"Public":"Private"}</span>
                          </div>
                          <div style={{fontSize:11,color:"var(--muted)"}}><ClassTag c={r.assetClass}/></div>
                        </div>
                      </div>
                      {closed?.kind==='expired' && <span className="pill loss" style={{fontSize:10,marginLeft:4}}>Expired</span>}
                      {closed?.kind==='exited' && <div style={{marginTop:2}}><span className="pill loss" style={{fontSize:10}}><LogOut size={10}/> Exited {r.exitDate?fmtDate(r.exitDate):""}</span></div>}
                    </td>
                    <td className="muted small nowrap">{fmtDate(r.date)}</td>
                    <td style={{textAlign:"right"}} className="tnum">{r.priceAt?fmt(r.priceAt):<span className="muted">—</span>}</td>
                    <td style={{textAlign:"right"}} className="tnum">{fmt(r.price)}</td>
                    <td style={{textAlign:"right",fontWeight:700}} className={"tnum nowrap "+(itm?"pos":"neg")}>{fmtPct(retVal)}</td>
                    <td>{closed ? <StatusBadge2 status={closed.kind==='exited'?'Closed':'Expired'}/> : <Money itm={itm}/>}</td>
                    <td>{r.horizon?<span className="pill accent" style={{fontSize:11}}>{r.horizon}</span>:<span className="muted">—</span>}</td>
                    {/* Likes from recipients */}
                    <td>
                      <div style={{display:"flex",alignItems:"center",gap:5}}>
                        <ThumbsUp size={13} color="var(--gain)"/>
                        <span style={{fontSize:12,fontWeight:700,color:"var(--gain)",minWidth:14}}>{r.likes||0}</span>
                      </div>
                    </td>
                    <td>
                      <div className="actions" style={{gap:4}}>
                        <div style={{position:"relative"}}>
                          <button className="iconbtn" title="Share" onClick={(e)=>setSharePopId(sharePopId===r.id?(setShareAnchor(null),null):(setShareAnchor(e.currentTarget),r.id))}><Share2 size={13}/></button>
                          {sharePopId===r.id && (
                            <IdeaSharePopover
                              reco={r} username={r.isPublic?me.username:null} contacts={contacts} groups={groups}
                              anchorEl={shareAnchor}
                              onSend={(targets)=>onSendShare(r.id,targets)}
                              onClose={()=>{ setSharePopId(null); setShareAnchor(null); }}
                            />
                          )}
                        </div>
                        <button className={"btn btn-sm "+(r.exit?"btn-ghost":"btn-soft")} style={{fontSize:11,padding:"4px 8px"}} disabled={exitingId===r.id} onClick={()=>toggleExit(r)}>
                          {exitingId===r.id?<><Loader size={12} className="spin"/> …</>:<><LogOut size={12}/> {r.exit?"Cancel exit":"Send exit"}</>}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {/* ── Expanded detail row ── */}
                  {open && (
                    <tr className="expand-row"><td colSpan={9}><div className="expand-inner">
                      {/* Meta info strip */}
                      <div style={{display:"flex",gap:28,flexWrap:"wrap",marginBottom:12}}>
                        <div><div className="cap">Ticker</div><b>{r.ticker}</b></div>
                        <div><div className="cap">Class</div><ClassTag c={r.assetClass}/></div>
                        <div><div className="cap">Shared with</div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:2}}>{r.recipients.map(id=><span key={id} className="chip mini">{recipientName(id)}</span>)}</div>
                        </div>
                        {r.stopLoss&&<div><div className="cap">Stop loss</div><b className="tnum neg">{fmt(r.stopLoss)}</b></div>}
                        {td&&<div><div className="cap">Target date</div><b className={closed?.kind==='expired'?"neg":""}>{fmtDate(td)}{closed?.kind==='expired'?" · Expired":""}</b></div>}
                        {r.conviction&&<div><div className="cap">Conviction</div><ConvBadge level={r.conviction}/></div>}
                        {r.sector&&<div><div className="cap">Sector</div><b>{r.sector}</b></div>}
                        <div><div className="cap">Acted on it</div><b>{r.actedList.length} of {reach(r.recipients)}</b></div>
                        <div><div className="cap">Reactions</div>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <ThumbsUp size={13} color="var(--gain)"/><b>{r.likes||0}</b>
                          </div>
                        </div>
                      </div>
                      {closed && <div style={{marginBottom:12}}><ClosedInfoLine info={closed}/></div>}
                      {/* Thesis */}
                      <div className="cap">Your thesis</div>
                      <div style={{fontSize:13,lineHeight:1.7,color:"var(--ink-soft)",marginTop:4,marginBottom:12,maxWidth:720}}>
                        {r.thesis && r.thesis!=="—"?<ThesisRenderer thesis={r.thesis}/>:<span className="muted">No thesis recorded.</span>}
                      </div>
                      {/* Acted on list */}
                      {r.actedList.length>0&&(
                        <><div className="cap" style={{marginBottom:6}}>Who acted on it</div>
                        <div className="namelist" style={{marginBottom:12}}>{r.actedList.map((a,i)=>(
                          <span key={i} className="nl-item"><span className="av" style={{width:24,height:24,background:CONTACT_COLORS[i%CONTACT_COLORS.length],fontSize:9}}>{initialsOf(a.name)}</span>{a.name}<span className="muted small"> · {fmtDate(a.date)}</span></span>
                        ))}</div></>
                      )}
                      <IdeaDisclaimer defaultExpanded divider/>
                    </div></td></tr>
                  )}
                </React.Fragment>);
              })}</tbody>
            </table>
            </div>{/* /tscroll */}
          </div>
        </div>}
  </>);
}

export function AddReceivedModal({ assetClasses, contacts, groups, onClose, onAdd }) {
  const [f,setF]=useState({ assetName:"", ticker:"", by:"", assetClass:assetClasses[0], date:TODAY, recoPrice:"", curPrice:"", targetPrice:"", horizon:"12m", shareType:"one", groupId:groups[0]?.id||"", invested:false, investedPrice:"", thesis:"" });
  const up=(k,v)=>setF(s=>({...s,[k]:v}));
  const valid = f.assetName.trim() && f.by.trim() && f.recoPrice && f.curPrice && (!f.invested || f.investedPrice);
  const save=()=>onAdd({ id:"r"+Date.now(), from:null, byName:f.by.trim(), assetName:f.assetName.trim(), ticker:(f.ticker||"—").toUpperCase(), assetClass:f.assetClass, date:f.date||TODAY,
    priceAt:+f.recoPrice, price:+f.curPrice, targetPrice:f.targetPrice?+f.targetPrice:null, horizon:f.horizon||null, targetDate:calcTargetDate(f.date||TODAY,f.horizon),
    invested:f.invested, investedPrice:f.invested?(+f.investedPrice):null, recoActed:f.invested?1:0, shareType:f.shareType, groupId:f.shareType==="group"?f.groupId:null,
    reaction:"none", likes:0, exitSignal:false, exitDate:null, hidden:false, thesis:f.thesis.trim()||null });
  return (<div className="overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3><Plus size={18} style={{verticalAlign:-3,color:"var(--accent)"}}/> Add an idea</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">
      <div className="muted small" style={{marginBottom:14}}>Log a tip someone shared with you offline — fill in the details yourself.</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0,columnGap:14}}>
        <div className="field"><label>Asset name</label><input value={f.assetName} onChange={e=>up("assetName",e.target.value)} placeholder="e.g. Apple Inc."/></div>
        <div className="field"><label>Ticker</label><input value={f.ticker} onChange={e=>up("ticker",e.target.value)} placeholder="AAPL"/></div>
        <div className="field"><label>Posted by</label><input value={f.by} onChange={e=>up("by",e.target.value)} placeholder="Name" list="cnames"/>
          <datalist id="cnames">{contacts.map(c=><option key={c.id} value={c.name}/>)}</datalist></div>
        <div className="field"><label>Asset class</label><select value={f.assetClass} onChange={e=>up("assetClass",e.target.value)}>{assetClasses.map(c=><option key={c}>{c}</option>)}</select></div>
        <div className="field"><label>Date</label><input type="date" value={f.date} onChange={e=>up("date",e.target.value)}/></div>
        <div className="field"><label>Shared as</label><select value={f.shareType} onChange={e=>up("shareType",e.target.value)}><option value="one">One-to-one</option><option value="group">Group</option></select></div>
        <div className="field"><label>Entry price</label><input type="number" value={f.recoPrice} onChange={e=>up("recoPrice",e.target.value)} placeholder="0"/></div>
        <div className="field"><label>Current price</label><input type="number" value={f.curPrice} onChange={e=>up("curPrice",e.target.value)} placeholder="0"/></div>
        <div className="field"><label>Target price <span className="muted small">(optional)</span></label><input type="number" value={f.targetPrice} onChange={e=>up("targetPrice",e.target.value)} placeholder="0"/></div>
        <div className="field"><label>Target horizon</label><select value={f.horizon} onChange={e=>up("horizon",e.target.value)}>{HORIZONS.map(h=><option key={h} value={h}>{h}</option>)}</select></div>
        {f.shareType==="group" && <div className="field" style={{gridColumn:"1 / span 2"}}><label>Group</label><select value={f.groupId} onChange={e=>up("groupId",e.target.value)}>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></div>}
      </div>
      <div className="field"><label>Thesis <span className="muted small">(optional — shown when the row is expanded)</span></label>
        <textarea rows={2} value={f.thesis} onChange={e=>up("thesis",e.target.value)} placeholder="What was their reasoning?"/></div>
      <label style={{display:"flex",alignItems:"center",gap:9,fontSize:14,fontWeight:600,cursor:"pointer"}}><input type="checkbox" checked={f.invested} onChange={e=>up("invested",e.target.checked)} style={{width:17,height:17,accentColor:"var(--accent)"}}/> I've already invested on this</label>
      {f.invested && <div className="field" style={{marginTop:12,maxWidth:220}}><label>My entry price</label><input type="number" value={f.investedPrice} onChange={e=>up("investedPrice",e.target.value)} placeholder="0"/></div>}
    </div>
    <div className="modal-foot"><span/><div style={{display:"flex",gap:10}}><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-pri" disabled={!valid} onClick={save}>Add idea</button></div></div>
  </div></div>);
}

/* ═══════════════════════════════════════════════════════════════════════════
   THESIS: rich-text utilities, editor, and renderer
   ─ Storage: thesis column is either plain text (legacy) or a JSON string:
       {"__v":"1","text":"...","images":["data:image/jpeg;base64,..."]}
   ─ Limits: 500 chars · 2 images · 2 MB original → auto-compressed to ≤100 KB
   ══════════════════════════════════════════════════════════════════════════ */

export function RecoPostPage({ username, recoId, highlightCommentId, viewerUser, ME, contacts=[], groups=[], onBack, onNavigateProfile }) {
  const isMobile = useIsMobile();
  const [data,         setData]         = useState(null);
  const [reco,         setReco]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [notFound,     setNotFound]     = useState(false);
  const [liked,        setLiked]        = useState(false);
  const [likeCount,    setLikeCount]    = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [isTracked,    setIsTracked]    = useState(false);
  const [invested,     setInvested]     = useState(false);
  const [investedPrice,setInvestedPrice]= useState(null);
  const [copied,       setCopied]       = useState(false);
  const [shareOpen,    setShareOpen]    = useState(false);
  const shareBtnRef = useRef(null);

  // Real, indexable /idea/:id (web-public/), not this page's own
  // /investor/.../idea/:id in-app URL — safe unconditionally because this
  // page only ever loads public-profile data (see the useEffect below), so
  // it can never be showing a private idea in the first place.
  const recoUrl = `https://myinvestorcircle.com/idea/${encodeURIComponent(recoId)}`;

  // Load profile + reco
  useEffect(() => {
    setLoading(true); setNotFound(false); setData(null); setReco(null);
    dbGetPublicProfile(username).then(d => {
      if (!d) { setNotFound(true); setLoading(false); return; }
      setData(d);
      const found = (d.recos || []).find(r => r.id === recoId);
      if (found) { setReco(found); }
      else setNotFound(true);
      setLoading(false);
    }).catch(() => { setNotFound(true); setLoading(false); });
  }, [username, recoId]);

  // Load like count, comment count, and viewer's state when recoId is known
  useEffect(() => {
    if (!recoId || !viewerUser?.uid) return;
    dbGetEngagement(recoId).then(e => {
      setLikeCount(e.likes || 0);
      setCommentCount(e.commentsCount || 0);
      if (e.myReaction === 'like') setLiked(true);
      if (e.tracking) {
        setIsTracked(true);
        if (e.tracking.isInvested) { setInvested(true); setInvestedPrice(e.tracking.investedPrice); }
      }
    }).catch(() => {});
  }, [recoId, viewerUser?.uid]);

  const requireLogin = () => { goHome(); };

  const handleLike = () => {
    if (!viewerUser) { requireLogin(); return; }
    const next = !liked;
    setLiked(next);
    setLikeCount(c => next ? c + 1 : Math.max(0, c - 1));
    if (viewerUser.uid) {
      if (next) track('reco_liked');
      dbReactToReco(recoId, next ? 'like' : null)
        .catch(e=>console.error('[like] ✗ RecoPost failed:', e?.message));
    }
  };

  const handleTrack = () => {
    if (!viewerUser) { requireLogin(); return; }
    const next = !isTracked;
    setIsTracked(next);
    if (viewerUser.uid) {
      if (next) dbTrackReco(recoId).catch(() => {});
      else dbUntrackReco(recoId).catch(() => {});
    }
  };

  const handleInvest = (price) => {
    if (!viewerUser) return;
    setInvested(true); setInvestedPrice(price); setIsTracked(true);
    dbTrackReco(recoId, true, price).catch(() => {});
  };

  const handleUnInvest = () => {
    if (!viewerUser) return;
    setInvested(false); setInvestedPrice(null);
    dbTrackReco(recoId, false).catch(() => {});
  };

  const copyLink = () => {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2200); };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(recoUrl).then(done).catch(() => fallbackCopyLink(recoUrl, done));
    } else {
      fallbackCopyLink(recoUrl, done);
    }
  };

  // Share to Circles/contacts from this page — same forward pipeline the
  // My Ideas cards use (IdeaSharePopover), just wired to ME.id directly
  // since this standalone page doesn't carry the myId helper from Recommendations().
  const sendShareTargets = async (targets) => { await dbForwardReco(recoId, ME.id, targets); };

  const profile  = data?.profile;
  const ici      = data?.ici;
  const retPct   = Number(reco?.return_pct || 0);
  const retPos   = retPct >= 0;
  const fullName = profile ? (profile.first_name ? `${profile.first_name} ${profile.last_name||''}`.trim() : profile.full_name) : username;

  // me object for RecoComments — needs id + name
  const commentMe = viewerUser ? {
    id:        viewerUser.uid,
    name:      ME?.name || viewerUser.displayName || 'Anonymous',
    firstName: ME?.firstName || '',
    lastName:  ME?.lastName  || '',
    avatarUrl: ME?.avatarUrl || '',
  } : null;

  return (
    <div style={{minHeight:'100vh', background:'var(--bg)', paddingBottom:56}}>

      {/* ── Topbar — compact: logo + brand name, then Back / Home ── */}
      <div style={{background:'var(--surface)', borderBottom:'1px solid var(--line)',
                   padding:'8px 14px', display:'flex', alignItems:'center', gap:8,
                   position:'sticky', top:0, zIndex:100}}>
        <img src="/mic-logo.png" alt="mic" style={{width:22, height:22, flexShrink:0}}/>
        <div style={{flex:1, minWidth:0, fontWeight:800, fontSize:13, lineHeight:1.1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>myInvestorCircle</div>
        {viewerUser
          ? <div style={{display:'flex', gap:6, flexShrink:0}}>
              <button className="btn btn-ghost btn-sm" style={{padding:'6px 10px'}} onClick={()=>goBackOrElse(onBack)} title="Go back"><ArrowLeft size={14}/> Back</button>
              <button className="btn btn-ghost btn-sm" style={{padding:'6px 10px'}} onClick={onBack} title="Home"><Home size={14}/> Home</button>
            </div>
          : <a href={window.location.pathname}
               style={{fontSize:13, fontWeight:700, color:'var(--accent)', textDecoration:'none', flexShrink:0}}>
              Sign in →
            </a>}
      </div>

      <div style={{maxWidth:640, margin:'0 auto', padding: isMobile ? '16px 12px' : '24px 16px'}}>

        {/* This page is where a link shared from the app lands when the OS
            didn't hand it to the app — most often because it was opened
            inside another app's built-in browser. */}
        <OpenInAppBanner/>

        {/* Loading */}
        {loading && (
          <div style={{textAlign:'center', padding:'72px 0', color:'var(--muted)'}}>
            <Loader size={28} className="spin" style={{marginBottom:14}}/>
            <div>Loading idea…</div>
          </div>
        )}

        {/* Not found */}
        {notFound && !loading && (
          <div style={{textAlign:'center', padding:'72px 0'}}>
            <div style={{fontSize:36, marginBottom:14}}>🔒</div>
            <div style={{fontWeight:700, fontSize:17, marginBottom:8}}>Idea not found</div>
            <div style={{fontSize:14, color:'var(--muted)', marginBottom:24}}>
              This idea may be private or no longer available.
            </div>
            <button className="btn btn-pri" onClick={onNavigateProfile}>
              View @{username}'s profile
            </button>
          </div>
        )}

        {reco && profile && !loading && (<>

          {/* ── Creator panel ── */}
          <div style={{background:'var(--surface)', border:'1px solid var(--line)', borderRadius:16,
                       padding:'16px 18px', marginBottom:14,
                       display:'flex', alignItems:'center', gap:14}}>
            <div style={{position:'relative', width:50, height:50, flexShrink:0}}>
              <div className="av" style={{width:50, height:50, fontSize:17,
                                          background:profile.avatar_color||'var(--grad)'}}>
                {initialsOf(fullName)}
              </div>
              <MemberBadgeOverlay tags={profile.tags} size={50}/>
            </div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontWeight:800, fontSize:16, lineHeight:1.2,
                           overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                {fullName}
              </div>
              {profile.username &&
                <div style={{fontSize:12, color:'var(--muted)'}}>@{profile.username}</div>}
              {ici && (
                <div style={{marginTop:5}}>
                  <span style={{fontSize:11, fontWeight:700, padding:'2px 9px', borderRadius:999,
                    background: ici.score>=70 ? 'rgba(74,222,128,.15)'
                              : ici.score>=50 ? 'rgba(124,92,252,.15)'
                              : 'rgba(251,191,36,.15)',
                    color:      ici.score>=70 ? '#22863a'
                              : ici.score>=50 ? '#6d4fc7'
                              : '#b07a00'}}>
                    ICI {Math.round(ici.score)} · {ici.band}
                  </span>
                </div>
              )}
            </div>
            <button className="btn btn-soft btn-sm" onClick={onNavigateProfile}
                    style={{flexShrink:0, display:'flex', alignItems:'center', gap:4}}>
              {isMobile ? 'Profile' : 'Track Record'} <ChevronRight size={13}/>
            </button>
          </div>

          {/* ── Reco card ── */}
          <div style={{background:'var(--surface)', border:'1px solid var(--line)', borderRadius:16,
                       padding:'20px', marginBottom:14}}>
            {/* Header row */}
            <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between',
                         marginBottom:16, gap:12, flexWrap:'wrap'}}>
              <div>
                <div style={{display:'flex', alignItems:'center', gap:7, marginBottom:6, flexWrap:'wrap'}}>
                  <TypeBadge t={reco.recommendation_type}/>
                  <StatusBadge2 status={reco.status}/>
                  {reco.conviction && <ConvBadge level={reco.conviction}/>}
                </div>
                <div style={{fontWeight:900, fontSize:24, lineHeight:1.1, letterSpacing:'-.5px'}}>
                  {reco.ticker}
                </div>
                <div style={{fontSize:14, color:'var(--muted)', marginTop:3}}>{reco.asset_name}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:26, fontWeight:900, color:retPos?'var(--gain)':'var(--loss)',
                             letterSpacing:'-.5px'}}>
                  {retPos?'+':''}{retPct.toFixed(1)}%
                </div>
                <div style={{fontSize:11, color:'var(--muted)', marginTop:1}}>Total return</div>
              </div>
            </div>

            {/* Price grid */}
            <div style={{display:'grid',
                         gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)',
                         gap:10, marginBottom:14}}>
              {[
                ['Entry price',   reco.reco_price    ? `₹${Number(reco.reco_price).toLocaleString('en-IN')}`    : '—'],
                ['Current price', reco.current_price ? `₹${Number(reco.current_price).toLocaleString('en-IN')}` : '—'],
                ['Target',        reco.target_price  ? `₹${Number(reco.target_price).toLocaleString('en-IN')}`  : '—'],
                ['Stop loss',     reco.stop_loss     ? `₹${Number(reco.stop_loss).toLocaleString('en-IN')}`     : '—'],
                ['Horizon',       reco.horizon || '—'],
                ['Duration',      reco.holding_days  ? `${reco.holding_days}d` : '—'],
              ].map(([label, val]) => (
                <div key={label} style={{background:'var(--surface-2)', borderRadius:10, padding:'10px 12px'}}>
                  <div style={{fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase',
                               letterSpacing:.5, marginBottom:3}}>{label}</div>
                  <div style={{fontWeight:700, fontSize:14, fontFamily:"'JetBrains Mono',monospace"}}>{val}</div>
                </div>
              ))}
            </div>

            {/* Tags row */}
            <div style={{display:'flex', gap:8, flexWrap:'wrap', marginBottom: reco.thesis ? 14 : 0}}>
              {reco.sector && (
                <span style={{fontSize:12, background:'var(--surface-2)', padding:'4px 10px',
                              borderRadius:20, color:'var(--muted)'}}>
                  {SECTOR_EMOJI[reco.sector]} {reco.sector}
                </span>
              )}
              {reco.created_at && (
                <span style={{fontSize:12, color:'var(--muted)', display:'flex', alignItems:'center', gap:4}}>
                  Posted {new Date(reco.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}
                </span>
              )}
            </div>

            {/* Thesis */}
            {reco.thesis && reco.thesis !== '—' && (
              <div style={{background:'var(--surface-2)', borderRadius:12, padding:'14px 16px'}}>
                <div style={{fontSize:10.5, fontWeight:700, color:'var(--muted)', textTransform:'uppercase',
                             letterSpacing:.5, marginBottom:6}}>Investment Thesis</div>
                <ThesisRenderer thesis={reco.thesis} previewLines={8} defaultExpanded/>
              </div>
            )}
          </div>

          {/* ── Interaction bar: Like · Comment · Engagement · Share · Bookmark · Invested ── */}
          <div style={{background:'var(--surface)', border:'1px solid var(--line)', borderRadius:16,
                       padding:'12px 16px', marginBottom:14,
                       display:'flex', alignItems:'center', gap:6, flexWrap:'wrap'}}>
            {/* Like */}
            <button onClick={handleLike} style={{display:'flex', alignItems:'center', gap:5,
              padding:'7px 12px', borderRadius:10, border:'1px solid var(--line)',
              background: liked ? 'var(--accent-soft)' : 'transparent',
              color: liked ? 'var(--accent-ink)' : 'var(--muted)',
              cursor:'pointer', fontFamily:'var(--font)', fontSize:13, fontWeight:600, transition:'.15s'}}>
              <ThumbsUp size={14}/>{likeCount > 0 ? ` ${likeCount}` : ''}
            </button>
            {/* Comment */}
            <button onClick={()=>document.getElementById('rpp-comments')?.scrollIntoView({behavior:'smooth'})}
              style={{display:'flex', alignItems:'center', gap:5,
              padding:'7px 12px', borderRadius:10, border:'1px solid var(--line)',
              background:'transparent', color:'var(--muted)',
              cursor:'pointer', fontFamily:'var(--font)', fontSize:13, fontWeight:600}}>
              <MessageSquare size={14}/>{commentCount > 0 ? ` ${commentCount}` : ''}
            </button>
            {/* Engagement */}
            {(likeCount + commentCount) > 0 && (
              <span style={{fontSize:12, color:'var(--muted)', display:'flex', alignItems:'center', gap:3,
                            padding:'7px 10px', borderRadius:10, border:'1px solid var(--line)'}}>
                ✦ {likeCount + commentCount}
              </span>
            )}
            <div style={{flex:1}}/>
            {/* Share */}
            <div style={{position:'relative'}}>
              <button ref={shareBtnRef} onClick={()=>setShareOpen(v=>!v)} title="Share this idea" style={{display:'flex', alignItems:'center', gap:5,
                padding:'7px 12px', borderRadius:10, border:'1px solid var(--line)',
                background: shareOpen ? 'var(--accent-soft)' : 'transparent', color: shareOpen ? 'var(--accent-ink)' : 'var(--muted)',
                cursor:'pointer', fontFamily:'var(--font)', fontSize:13, fontWeight:600}}>
                <Share2 size={14}/> Share
              </button>
              {shareOpen && (viewerUser ? (
                <IdeaSharePopover
                  reco={{id:recoId, ticker:reco?.ticker, assetName:reco?.assetName}}
                  username={username} contacts={contacts} groups={groups}
                  anchorEl={shareBtnRef.current}
                  onSend={sendShareTargets}
                  onClose={()=>setShareOpen(false)}
                />
              ) : (
                <LinkSharePopover url={recoUrl} title="Share this idea" message={`Check out this idea on My Investor Circle:\n${recoUrl}`} anchorEl={shareBtnRef.current} copied={copied} onCopy={copyLink} onClose={()=>setShareOpen(false)}/>
              ))}
            </div>
            {/* Bookmark */}
            <button onClick={viewerUser ? handleTrack : requireLogin}
              style={{display:'flex', alignItems:'center', gap:5,
              padding:'7px 12px', borderRadius:10, border:'1px solid var(--line)',
              background: isTracked ? 'var(--accent-soft)' : 'transparent',
              color: isTracked ? 'var(--accent-ink)' : 'var(--muted)',
              cursor:'pointer', fontFamily:'var(--font)', fontSize:13, fontWeight:600, transition:'.15s'}}>
              <Bookmark size={14}/>
            </button>
            {/* Mark Invested */}
            {viewerUser && reco && (
              <InvestedToggle
                invested={invested}
                investedPrice={investedPrice}
                reco={{id:recoId, price:reco.current_price, ticker:reco.ticker, assetName:reco.asset_name, priceAt:reco.reco_price}}
                onMark={handleInvest}
                onUnmark={handleUnInvest}
              />
            )}
          </div>

          {/* ── Stock Insights CTA — same "what does everyone else think about
              this security" jump-off the mobile app already offers from its
              own idea detail screen (see mobile/app/reco/[id].js's
              consensusBtn); web had no equivalent way to reach the ticker's
              own page from here. Offered for any idea with a ticker and
              regardless of sign-in — SecurityIntelligencePage already
              degrades correctly for a signed-out viewer, same as this page
              does. openSecurity() is the plain navigation.js bridge (like
              openReco/openProfile above), not App.jsx's own onOpenSecurity
              prop — this standalone page isn't rendered from a branch that
              threads that prop down, so it goes through the same
              component-free goToPath() mechanism the rest of this page's
              navigation already uses. */}
          {reco?.ticker && (
            <button onClick={()=>openSecurity(reco.ticker)}
              style={{display:'flex', alignItems:'center', gap:9, width:'100%',
                background:'var(--accent-soft)', border:'1px solid var(--accent-line)', borderRadius:16,
                padding:'14px 18px', marginBottom:14, cursor:'pointer', fontFamily:'var(--font)',
                textAlign:'left'}}>
              <BarChart2 size={17} color="var(--accent-ink)"/>
              <span style={{flex:1, fontSize:13.5, fontWeight:700, color:'var(--accent-ink)'}}>
                What others think about {reco.ticker}
              </span>
              <ChevronRight size={16} color="var(--accent-ink)"/>
            </button>
          )}

          {/* ── Sign-in nudge (non-members) ── */}
          {!viewerUser && (
            <div style={{background:'rgba(109,93,245,.07)', border:'1px solid rgba(109,93,245,.25)',
                         borderRadius:16, padding:'16px 20px', marginBottom:14,
                         display:'flex', alignItems:'center', gap:14, flexWrap:'wrap'}}>
              <div style={{flex:1, minWidth:200}}>
                <div style={{fontWeight:700, fontSize:14, marginBottom:3}}>
                  Join to like, comment and save
                </div>
                <div style={{fontSize:13, color:'var(--muted)'}}>
                  myInvestorCircle is where investors share and track high-conviction ideas.
                </div>
              </div>
              <a href={window.location.pathname}
                 style={{flexShrink:0, padding:'10px 20px', borderRadius:10,
                         background:'var(--accent)', color:'#fff',
                         fontWeight:700, fontSize:13, textDecoration:'none'}}>
                Sign in →
              </a>
            </div>
          )}

          {/* ── Comments ── */}
          <div id="rpp-comments" style={{background:'var(--surface)', border:'1px solid var(--line)', borderRadius:16,
                       padding:'20px', marginBottom:14}}>
            <div style={{fontWeight:700, fontSize:15, marginBottom:16}}>Comments</div>
            <RecoComments recoId={recoId} me={commentMe} highlightCommentId={highlightCommentId}/>
            {!viewerUser && (
              <div style={{textAlign:'center', marginTop:12, fontSize:13, color:'var(--muted)'}}>
                <a href={window.location.pathname} style={{color:'var(--accent)', fontWeight:700}}>
                  Sign in
                </a>{' '}to leave a comment
              </div>
            )}
          </div>

          {/* ── Disclaimer ── */}
          <IdeaDisclaimer align="center" defaultExpanded style={{padding:'0 8px'}}/>
        </>)}
      </div>
    </div>
  );
}

/* ─── Main PublicProfilePage ─────────────────────────────────────────────────── */
/* ── ProfileErrorBoundary — catches render errors so the page never goes blank ── */

function activeMentionQuery(text, caret) {
  const upto = text.slice(0, caret);
  const m = upto.match(/(?:^|\s)@([a-zA-Z0-9_]{0,20})$/);
  return m ? { query: m[1], start: caret - m[1].length - 1 } : null;
}

// Bare http(s):// and www. links inside a comment become real anchors.
// Trailing punctuation (a sentence-ending period, a comma, a closing paren
// that isn't part of the URL) is peeled off and rendered as plain text
// after the link, rather than becoming part of the href. Split on this
// FIRST (before @mention splitting below) so a URL is always treated as one
// atomic token — a profile link like https://x.com/@someone must never get
// fragmented into a plain link plus a separately-clickable @mention span.
const URL_RE = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;
const URL_TEST_RE = /^(?:https?:\/\/|www\.)/i;
const URL_TRAILING_PUNCT_RE = /[.,!?;:'")\]}]+$/;

function renderUrlPart(url, key) {
  const trailingMatch = url.match(URL_TRAILING_PUNCT_RE);
  const trailing = trailingMatch ? trailingMatch[0] : '';
  const cleanUrl = trailing ? url.slice(0, -trailing.length) : url;
  if (!cleanUrl) return [url];
  const href = cleanUrl.toLowerCase().startsWith('http') ? cleanUrl : `https://${cleanUrl}`;
  return [
    <a key={`${key}-url`} href={href} target="_blank" rel="noopener noreferrer"
      style={{color:'var(--accent-ink)',textDecoration:'underline',wordBreak:'break-all'}}
      onClick={e=>e.stopPropagation()}>
      {cleanUrl}
    </a>,
    trailing,
  ].filter(Boolean);
}

// Splits plain (non-URL) text into confirmed @mentions — confirmed meaning
// present in that comment's own `mentions` list (server-resolved), not just
// anything shaped like "@word" — and clickable spans for each.
function renderMentions(text, usernames, keyPrefix) {
  if (!usernames.size) return text ? [text] : [];
  return text.split(/(@[a-zA-Z0-9_]{5,20})/g).flatMap((part, i) => {
    const m = part.match(/^@([a-zA-Z0-9_]{5,20})$/);
    if (m && usernames.has(m[1].toLowerCase())) {
      return [
        <span key={`${keyPrefix}-m${i}`} style={{color:'var(--accent-ink)',fontWeight:700,cursor:'pointer'}}
          onClick={e=>{ e.stopPropagation(); openProfile(m[1]); }}>
          {part}
        </span>,
      ];
    }
    return part ? [part] : [];
  });
}

// Renders comment text as plain strings, clickable links for any URL, and
// clickable spans for confirmed @mentions. Building an array of nodes
// (rather than dangerouslySetInnerHTML, as ThesisRenderer does for the
// richer thesis field) keeps this free of any HTML-injection surface, which
// a plain-text field like a comment has no reason to need.
export function renderCommentBody(text, mentions) {
  if (!text) return text;
  const usernames = new Set((mentions || []).map(m => (m.username || '').toLowerCase()));
  return text.split(URL_RE).flatMap((part, i) =>
    URL_TEST_RE.test(part) ? renderUrlPart(part, `p${i}`) : renderMentions(part, usernames, `p${i}`)
  );
}

/* ─── Shared comments component ─────────────────────────────────────────────────── */

export function RecoComments({ recoId, me, highlightCommentId }) {
  const memberTagsByUser = useMemberTagsMap();
  const [comments,  setComments]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [text,      setText]      = useState('');
  const [submitting,setSubmitting]= useState(false);
  const inputRef = useRef(null);
  const wrapRef  = useRef(null);

  // @mention suggestion dropdown state. `anchor` is the index of the "@" the
  // current query started at, so a selection knows exactly what to replace.
  const [mentionOpen,    setMentionOpen]    = useState(false);
  const [mentionResults, setMentionResults] = useState([]);
  const [mentionAnchor,  setMentionAnchor]  = useState(null);
  const mentionSeq = useRef(0);

  useEffect(()=>{
    if(!recoId){ setLoading(false); return; }
    setLoading(true);
    dbGetEngagement(recoId)
      .then(e=>{ setComments(e.comments || []); setLoading(false); })
      .catch(()=>setLoading(false));
  },[recoId]);

  // Deep-linked from a "mentioned you in a comment" notification — scroll the
  // specific comment into view once it's loaded. Same pattern as CirclePage's
  // highlightIdeaId.
  useEffect(()=>{
    if(!highlightCommentId || !comments.length) return;
    const el = document.getElementById(`comment-${highlightCommentId}`);
    if (el) setTimeout(()=>el.scrollIntoView({behavior:'smooth', block:'center'}), 150);
  },[comments, highlightCommentId]);

  // Close the suggestion dropdown on an outside click.
  useEffect(()=>{
    if (!mentionOpen) return;
    const h = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setMentionOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  },[mentionOpen]);

  const onTextChange = (e) => {
    const value = e.target.value;
    const caret = e.target.selectionStart ?? value.length;
    setText(value);

    const active = activeMentionQuery(value, caret);
    if (!active) { setMentionOpen(false); return; }
    setMentionAnchor(active.start);
    const seq = ++mentionSeq.current;
    if (active.query.length < 2) { setMentionResults([]); setMentionOpen(true); return; }
    dbSearchPeople(active.query, 6).then(people => {
      if (seq !== mentionSeq.current) return; // a newer keystroke has since fired
      setMentionResults(people);
      setMentionOpen(true);
    }).catch(()=>{});
  };

  const selectMention = (person) => {
    if (mentionAnchor == null) return;
    const caret = inputRef.current?.selectionStart ?? text.length;
    const next = `${text.slice(0, mentionAnchor)}@${person.username} ${text.slice(caret)}`;
    setText(next);
    setMentionOpen(false);
    const pos = mentionAnchor + person.username.length + 2;
    setTimeout(()=>{ inputRef.current?.focus(); inputRef.current?.setSelectionRange(pos, pos); }, 0);
  };

  const submit=async()=>{
    if(!text.trim()||!me?.id) return;
    setSubmitting(true);
    const name=[me.firstName,me.lastName].filter(Boolean).join(' ')||me.name||'User';
    try{
      // Server derives the commenter's display name from their own profile,
      // resolves any @username tokens against real accounts, and performs
      // the owner/network/mention notification fan-out (see engagement.js).
      const comment = await dbCommentOnReco(recoId, text.trim());
      setComments(prev=>[...prev, comment]);
      setText('');
    }catch(e){ console.warn('Comment failed:',e); }
    setSubmitting(false);
  };

  return (
    <div>
      {/* Input */}
      {me?.id && (
        <div style={{display:'flex',gap:9,marginBottom:14,alignItems:'flex-start'}}>
          <Avatar f={{ id: me.id, avatarUrl: me.avatarUrl, name: me.name }} size={30}/>
          <div ref={wrapRef} style={{flex:1,display:'flex',gap:8,position:'relative'}}>
            <input ref={inputRef} value={text} onChange={onTextChange} placeholder="Add a comment… (@ to mention someone)"
              onKeyDown={e=>{
                if(e.key==='Enter' && mentionOpen && mentionResults.length){ e.preventDefault(); selectMention(mentionResults[0]); return; }
                if(e.key==='Escape' && mentionOpen){ setMentionOpen(false); return; }
                if(e.key==='Enter' && !submitting && text.trim()) submit();
              }}
              style={{flex:1,border:'1px solid var(--line-2)',borderRadius:10,padding:'8px 12px',fontSize:13,outline:'none',background:'var(--surface)',fontFamily:'var(--font)'}}/>
            <button className="btn btn-pri btn-sm" disabled={!text.trim()||submitting} onClick={submit} style={{flexShrink:0}}>
              {submitting?<Loader size={13} className="spin"/>:<Send size={13}/>}
            </button>
            {mentionOpen && (
              <div style={{position:'absolute',top:'calc(100% + 4px)',left:0,width:260,background:'var(--surface)',border:'1px solid var(--line)',borderRadius:12,boxShadow:'0 8px 28px rgba(0,0,0,.13)',zIndex:200,maxHeight:220,overflowY:'auto'}}>
                {mentionResults.length===0
                  ? <div className="muted small" style={{padding:'10px 14px'}}>No matching investors</div>
                  : mentionResults.map(p=>(
                      <div key={p.id} onMouseDown={()=>selectMention(p)}
                        style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',cursor:'pointer'}}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--surface-2)'}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <div style={{position:'relative',width:24,height:24,flexShrink:0}}>
                          <div className="av" style={{width:24,height:24,fontSize:10,background:'var(--grad)'}}>{initialsOf(p.full_name||p.username)}</div>
                          <MemberBadgeOverlay tags={memberTagsByUser[p.id]} size={24}/>
                        </div>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.full_name||p.username}</div>
                          <div className="muted" style={{fontSize:11}}>@{p.username}</div>
                        </div>
                      </div>
                    ))
                }
              </div>
            )}
          </div>
        </div>
      )}
      {/* List */}
      {loading
        ? <div className="muted small" style={{paddingBottom:8}}><Loader size={13} className="spin" style={{marginRight:6}}/>Loading comments…</div>
        : comments.length===0
          ? <div className="muted small" style={{fontStyle:'italic'}}>No comments yet — be the first!</div>
          : comments.map(c=>{
              const isHighlighted = String(c.id)===String(highlightCommentId);
              return (
              <div key={c.id} id={`comment-${c.id}`} style={{display:'flex',gap:9,marginBottom:12}}>
                <Avatar f={{ id: c.userId, avatarUrl: c.avatarUrl, name: c.userName, color: 'var(--accent)' }} size={28}/>
                <div style={{flex:1}}>
                  <div style={{display:'flex',alignItems:'baseline',gap:7,marginBottom:2}}>
                    <span style={{fontSize:12,fontWeight:700}}>{c.userName||'User'}</span>
                    <span className="muted small" style={{fontSize:11}}>{new Date(c.createdAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
                  </div>
                  <div style={{fontSize:13,color:'var(--ink-soft)',lineHeight:1.6,background: isHighlighted ? 'var(--accent-soft, rgba(109,93,245,.1))' : 'var(--surface-2)',
                    border: isHighlighted ? '1.5px solid var(--accent)' : '1px solid transparent',
                    borderRadius:10,padding:'7px 11px'}}>{renderCommentBody(c.comment, c.mentions)}</div>
                </div>
              </div>
              );
            })
      }
    </div>
  );
}

/* ─── FeedCard — single recommendation card for the homepage ────────────────────── */

