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
  Image as ImageIcon
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
  getSectors as dbGetSectors
} from "../../services/api/lookupsApi";
import {
  getPublicProfile as dbGetPublicProfile,
  lookupUser as dbLookupUser
} from "../../services/api/profileApi";
import {
  cancelExitSignal as dbCancelExit,
  createRecommendation as dbCreateReco,
  deleteDelivery as dbDeleteDelivery,
  deleteRecommendation as dbDeleteReco,
  forwardRecommendation as dbForwardReco,
  getRecommenderUsername as dbGetRecommenderUsername,
  notifyPublicContacts as dbNotifyPublicContacts,
  setExitSignal as dbSetExit,
  updateDelivery
} from "../../services/api/recommendationsApi";
import { ClassTag, ConvBadge, HoldPreviewTable, InstrumentSearch, Money, SortTh, StatusBadge2, TypeBadge } from "../../components/common";
import { CONTACT_COLORS, FALLBACK_SECTORS, HORIZONS, SECTOR_EMOJI, THESIS_EMOJIS, THESIS_MAX_CHARS, THESIS_MAX_IMAGES, THESIS_MAX_MB, TODAY } from "../../constants/app";
import { useIsMobile } from "../../hooks/index";
import { _CAS_CONFIGURED, parseCasPdf } from "../../services/casUpload";
import { sendEmail, sendPush } from "../../services/notify";
import { calcTargetDate, classColor, compressImage, fmt, fmtDate, fmtPct, getTargetDate, initialsOf, isExpired, parseThesis, ret, serializeThesis } from "../../utils/format";
import { fetchPublicProfileInfo, gotoUserProfile, openProfile } from "../../utils/navigation";

export function Recommendations({ recsReceived, setRecsReceived, recsMade, setRecsMade,
    contacts, groups, assetClasses, setAssetClasses, initFilter, holdings, me, onReload, tracked, toggleTrack, globalSearch }) {
  const [tab, setTab] = useState(initFilter?.tab || "tracked");
  const [showNew, setShowNew] = useState(false);
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
  const forwardReco = async (r, targetIds, note) => {
    const recipients = targetIds.map(id=>({type:"user",id}));
    await dbForwardReco(r.id, myId, recipients);
    await onReload();
    setTab("made");
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
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        {/* Tabs — Tracked first */}
        <div style={{display:"flex",gap:6,background:"var(--surface-2)",borderRadius:14,padding:4,flexWrap:"wrap"}}>
          {[
            {id:"tracked",  label:"Tracked",  count:trackedCount,  icon:Bookmark},
            {id:"received", label:"Received", count:receivedCount, icon:Lightbulb},
            {id:"made",     label:"Created",  count:madeCount,     icon:Send},
          ].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              display:"flex",alignItems:"center",gap:8,padding:"10px 18px",borderRadius:11,border:"none",cursor:"pointer",fontFamily:"var(--font)",fontWeight:700,fontSize:14,transition:".15s",
              background: tab===t.id ? "var(--surface)" : "transparent",
              color:      tab===t.id ? "var(--accent-ink)" : "var(--ink)",
              boxShadow:  tab===t.id ? "0 1px 6px rgba(20,20,50,.1)" : "none",
            }}>
              <t.icon size={15}/>
              {t.label}
              <span style={{
                fontSize:12, fontWeight:800, padding:"2px 9px", borderRadius:999,
                background: tab===t.id ? "var(--grad)" : "var(--surface-2)",
                color:      tab===t.id ? "#fff" : "var(--ink-soft)",
              }}>{t.count}</span>
            </button>
          ))}
        </div>
        {/* New idea — elevated so it's reachable from every tab, not just Created */}
        <button className="btn btn-pri btn-sm" onClick={()=>setShowNew(true)}><Plus size={15}/> New idea</button>
      </div>
    </div>

    {tab==="tracked"  && <TrackedSection tracked={tracked} toggleTrack={toggleTrack} me={me} contacts={contacts} initMoneyFilter={initFilter?.moneyFilter} globalSearch={globalSearch}/>}
    {tab==="received" && <ReceivedSection recs={recsReceived} setRecs={setRecsReceived} myId={myId}
        contactName={contactName} groupName={groupName} assetClasses={assetClasses}
        contacts={contacts} groups={groups} initBy={initFilter?.by} initGroup={initFilter?.groupId}
        onForward={forwardReco} onReload={onReload} me={me} tracked={tracked} toggleTrack={toggleTrack} globalSearch={globalSearch}/>}
    {tab==="made"     && <MadeSection recs={recsMade} setRecs={setRecsMade} recipientName={recipientName}
        reach={reach} contacts={contacts} groups={groups} assetClasses={assetClasses}
        setAssetClasses={setAssetClasses} holdings={holdings} me={me} onReload={onReload} globalSearch={globalSearch}/>}

    {showNew && <MakeRecoModal assetClasses={assetClasses} setAssetClasses={setAssetClasses} contacts={contacts} groups={groups} holdings={holdings} me={me} onClose={()=>setShowNew(false)} onCreate={(rec)=>{ setRecsMade(rs=>[rec,...rs]); setShowNew(false); setTab("made"); }}/>}
  </>);
}


/* ─── TrackedSection — My Tracked / Saved list ─────────────────────────────── */

export function TrackedSection({ tracked, toggleTrack, me, contacts, initMoneyFilter, globalSearch }) {
  const isMobile = useIsMobile();
  const [recos,         setRecos]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [openRow,       setOpenRow]       = useState(null);
  const [sort,          setSort]          = useState({key:"tracked",dir:"desc"});
  const [sharePopId,    setSharePopId]    = useState(null);
  const [shareAnchor,   setShareAnchor]   = useState(null);
  const [shareUsername, setShareUsername] = useState(null);
  const [q,       setQ]       = useState(globalSearch||"");
  const [fBy,     setFBy]     = useState("all");
  const [fHorizon,setFHorizon]= useState("all");
  const [fMoney,  setFMoney]  = useState(initMoneyFilter||"all");
  const [fInv,    setFInv]    = useState("all");
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
  const dailyChangeFor = (r) => dailyPrices?.[priceKey(r.ticker, r.assetClass)]?.changePct ?? null;

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
      <div className="muted small">Click the bookmark icon on any recommendation to save it here for easy reference.</div>
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
      <select className="inline-select sm" value={fBy} onChange={e=>setFBy(e.target.value)} title="Filter by recommender">
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
      ? <div className="card"><div className="empty">No tracked recommendations match your filters.</div></div>
      : isMobile
      ? <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {sorted.map(r=>{
            const recoRet=r.reco_price?(r.current_price-r.reco_price)/r.reco_price:0;
            const myRet=r.is_invested&&r.invested_price?(r.current_price-r.invested_price)/r.invested_price:null;
            const isBuy=(r.recommendation_type||'Buy')==='Buy';
            const isInv=r.is_invested||false;
            const cur=r.currency||'INR';
            const fn=r.first_name||''; const ln=r.last_name||'';
            const rName=fn&&ln&&fn!==ln?`${fn} ${ln}`:(fn||r.recommender_name||'Unknown');
            return (
              <div key={r.id} className="card" style={{padding:'14px 16px',borderLeft:'3px solid '+(isBuy?'var(--gain)':'var(--loss)')}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:15,marginBottom:2}}>{r.asset_name}</div>
                    <div style={{fontSize:11,color:'var(--muted)'}}>{r.ticker} · By {rName}</div>
                  </div>
                  <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,flexShrink:0,background:isBuy?'var(--gain-soft)':'var(--loss-soft)',color:isBuy?'var(--gain)':'var(--loss)'}}>{isBuy?'Buy':'Sell'}</span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8,marginBottom:12}}>
                  {[['Reco Price',r.reco_price?fmt(r.reco_price,cur):'—',null],
                    ['Current',r.current_price?fmt(r.current_price,cur):'—',null],
                    ['Since Yday', dailyChangeFor(r)!=null?`${dailyChangeFor(r)>=0?'+':''}${dailyChangeFor(r).toFixed(1)}%`:'—', dailyChangeFor(r)!=null?(dailyChangeFor(r)>=0):null],
                    ['Return',r.reco_price?fmtPct(recoRet):'—', recoRet>=0]].map(([label,val,isGain],i)=>(
                    <div key={i} style={{background:'var(--surface-2)',borderRadius:8,padding:'8px 10px'}}>
                      <div style={{fontSize:10,color:'var(--muted)',marginBottom:2}}>{label}</div>
                      <div style={{fontWeight:700,fontSize:13,color:isGain==null?'var(--ink)':isGain?'var(--gain)':'var(--loss)'}}>{val}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                    {r.horizon&&<span className="pill accent" style={{fontSize:10}}>{r.horizon}</span>}
                    {isInv&&<span className="pill gain" style={{fontSize:10}}>Invested</span>}
                    <span style={{fontSize:10,color:'var(--muted)'}}>Tracked {new Date(r.tracked_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span>
                  </div>
                  <div style={{display:'flex',gap:4}}>
                    <InvestedToggle invested={isInv} investedPrice={r.invested_price}
                      reco={{id:r.id,price:r.current_price,ticker:r.ticker,assetName:r.asset_name,priceAt:r.reco_price}}
                      onMark={(price)=>{patchInvested(r,{is_invested:true,invested_price:price});if(!tracked?.has(r.id))toggleTrack?.(r.id);}}
                      onUnmark={()=>patchInvested(r,{is_invested:false,invested_price:null})}/>
                    <button className="iconbtn" title="Remove from tracked" onClick={()=>toggleTrack(r.id)} style={{background:'var(--accent-soft)',color:'var(--accent-ink)',borderColor:'var(--accent-line)'}}><Bookmark size={13}/></button>
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
                <th style={{whiteSpace:"normal",lineHeight:1.3,minWidth:60}}>Reco By</th>
                <th style={{textAlign:"left",whiteSpace:"normal",lineHeight:1.3,minWidth:60,cursor:"pointer"}} onClick={()=>setSort(s=>({key:"tracked",dir:s.key==="tracked"&&s.dir==="asc"?"desc":"asc"}))}>Tracked<br/>On<span className="si">{sort.key==="tracked"?sort.dir==="asc"?<ChevronDown size={13} style={{transform:"rotate(180deg)"}}/>:<ChevronDown size={13}/>:<ArrowUpDown size={12}/>}</span></th>
                <SortTh label="Reco Price"   k="reco"    sort={sort} setSort={setSort} align="right"/>
                <SortTh label="Entry Price"  k="entry"   sort={sort} setSort={setSort} align="right"/>
                <SortTh label="Current"      k="cur"     sort={sort} setSort={setSort} align="right"/>
                <th style={{textAlign:"right",whiteSpace:"normal",lineHeight:1.3,minWidth:64,cursor:"pointer"}} title="Change since the previous trading day's close" onClick={()=>setSort(s=>({key:"sinceyday",dir:s.key==="sinceyday"&&s.dir==="asc"?"desc":"asc"}))}>Since<br/>Yday<span className="si">{sort.key==="sinceyday"?sort.dir==="asc"?<ChevronDown size={13} style={{transform:"rotate(180deg)"}}/>:<ChevronDown size={13}/>:<ArrowUpDown size={12}/>}</span></th>
                <th style={{textAlign:"right",whiteSpace:"normal",lineHeight:1.3,minWidth:72,cursor:"pointer"}} onClick={()=>setSort(s=>({key:"recret",dir:s.key==="recret"&&s.dir==="asc"?"desc":"asc"}))}>Reco<br/>Return<span className="si">{sort.key==="recret"?sort.dir==="asc"?<ChevronDown size={13} style={{transform:"rotate(180deg)"}}/>:<ChevronDown size={13}/>:<ArrowUpDown size={12}/>}</span></th>
                <th style={{textAlign:"right",whiteSpace:"normal",lineHeight:1.3,minWidth:64,cursor:"pointer"}} onClick={()=>setSort(s=>({key:"myret",dir:s.key==="myret"&&s.dir==="asc"?"desc":"asc"}))}>My<br/>Return<span className="si">{sort.key==="myret"?sort.dir==="asc"?<ChevronDown size={13} style={{transform:"rotate(180deg)"}}/>:<ChevronDown size={13}/>:<ArrowUpDown size={12}/>}</span></th>
                <th>Status</th>
                <SortTh label="Horizon"      k="horizon" sort={sort} setSort={setSort}/>
                <th style={{textAlign:"right"}}>Actions</th>
              </tr></thead>
              <tbody>{sorted.map(r=>{
                const recoRet = r.reco_price ? (r.current_price-r.reco_price)/r.reco_price : 0;
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
                    {/* Asset — no ticker in collapsed */}
                    <td style={{cursor:'pointer',maxWidth:200}} onClick={()=>setOpenRow(open?null:r.id)}>
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <ChevronDown size={13} color="var(--muted)" style={{transform:open?'rotate(180deg)':'none',transition:'.15s',flexShrink:0}}/>
                        <div>
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
                            <ReceivedSharePopover
                              reco={{id:r.id,ticker:r.ticker,assetName:r.asset_name}}
                              fromUsername={shareUsername}
                              anchorEl={shareAnchor}
                              onForward={()=>setSharePopId(null)}
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
                        <div><div className="cap">Reco Return</div><b className={"tnum "+(itm?"pos":"neg")}>{itm?'+':''}{(recoRet*100).toFixed(1)}%</b></div>
                        {myRet!==null&&<div><div className="cap">My Return</div><b className={"tnum "+(myRet>=0?"pos":"neg")}>{myRet>=0?'+':''}{(myRet*100).toFixed(1)}%</b></div>}
                      </div>
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

export function ReceivedSection({ recs, setRecs, myId, contactName, groupName, assetClasses, contacts, groups, initBy, initGroup, onForward, onReload, me, tracked, toggleTrack, globalSearch }) {
  const isMobile = useIsMobile();
  const [q,setQ]=useState(globalSearch||""); const [sort,setSort]=useState({key:"date",dir:"desc"});
  const [fBy,setFBy]=useState(initBy||"all"),[fCls,setFCls]=useState("all"),[fMoney,setFMoney]=useState("all");
  const [fInv,setFInv]=useState("all"),[fGroup,setFGroup]=useState(initGroup||"all"),[fHorizon,setFHorizon]=useState("all");
  const [showHidden,setShowHidden]=useState(false); const [showExpired,setShowExpired]=useState(false);
  const [openRow,setOpenRow]=useState(null); const [fwd,setFwd]=useState(null);
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
  const onInvestClick=(r)=>{ if(r.invested) unInvest(r); else setInvesting(r); };
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
    if(!confirm("Remove this recommendation from your received list?")) return;
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
  const activeFilterNote = fBy!=="all"?`From ${fBy}`:fGroup!=="all"?`Via ${groupName(fGroup)}`:null;

  return (<>
    {/* ── Compact top bar: search + filters + expired toggle all in one row ── */}
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
      <div className="searchbox" style={{flex:"1 1 200px",minWidth:160}}>
        <Search size={15} color="var(--muted)"/>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search asset or contact…"/>
      </div>
      <select className="inline-select sm" value={fBy} onChange={e=>setFBy(e.target.value)} title="Filter by recommender">
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
      <div className="note warn" style={{marginBottom:10,padding:"8px 12px",fontSize:12}}><AlertTriangle size={14}/><div>A recommender has issued an <b>exit signal</b> on a recommendation below.</div></div>
    )}

    {rows.length===0
      ? <div className="card"><div className="empty">No recommendations match your filters.</div></div>
      : isMobile
      ? <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {rows.map(r=>{
            const isBuy=(r.recommendation_type||r.recType||'Buy')==='Buy';
            const recoRet=r.priceAt?(r.price-r.priceAt)/r.priceAt:0;
            const cur=r.currency||'INR';
            const fromName=r.byName||(typeof contactName==='function'?contactName(r.from):'Someone');
            return (
              <div key={r.id} className="card" style={{padding:'14px 16px',borderLeft:'3px solid '+(isBuy?'var(--gain)':'var(--loss)')}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:15,marginBottom:2}}>{r.assetName||r.asset_name}</div>
                    <div style={{fontSize:11,color:'var(--muted)'}}>{r.ticker} · From {fromName}</div>
                  </div>
                  <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,flexShrink:0,background:isBuy?'var(--gain-soft)':'var(--loss-soft)',color:isBuy?'var(--gain)':'var(--loss)'}}>{isBuy?'Buy':'Sell'}</span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12}}>
                  {[['Reco Price',r.priceAt?fmt(r.priceAt,cur):'—'],['Current',r.price?fmt(r.price,cur):'—'],['Return',r.priceAt?fmtPct(recoRet):'—']].map(([label,val],i)=>(
                    <div key={i} style={{background:'var(--surface-2)',borderRadius:8,padding:'8px 10px'}}>
                      <div style={{fontSize:10,color:'var(--muted)',marginBottom:2}}>{label}</div>
                      <div style={{fontWeight:700,fontSize:13,color:i===2?(recoRet>=0?'var(--gain)':'var(--loss)'):'var(--ink)'}}>{val}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                  <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                    {r.horizon&&<span className="pill accent" style={{fontSize:10}}>{r.horizon}</span>}
                    {r.conviction&&<ConvBadge level={r.conviction}/>}
                    <span style={{fontSize:10,color:'var(--muted)'}}>{fmtDate(r.date)}</span>
                  </div>
                  <div style={{display:'flex',gap:4}}>
                    <button className="iconbtn" title={tracked?.has(r.id)?'Tracked':'Track'} onClick={()=>toggleTrack?.(r.id)} style={tracked?.has(r.id)?{background:'var(--accent-soft)',color:'var(--accent-ink)'}:{}}><Bookmark size={13}/></button>
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
                <SortTh label="Reco ₹" k="reco" sort={sort} setSort={setSort} align="right"/>
                <SortTh label="Current ₹" k="cur" sort={sort} setSort={setSort} align="right"/>
                <SortTh label="Return" k="ret" sort={sort} setSort={setSort} align="right"/>
                <th>Status</th>
                <SortTh label="Horizon" k="horizon" sort={sort} setSort={setSort}/>
                <th title="Your reaction">React</th>
                <th style={{textAlign:"right"}}>Actions</th>
              </tr></thead>
              <tbody>{rows.map(r=>{
                const itm=ret(r)>=0; const open=openRow===r.id; const exp=isExpired(r); const td=getTargetDate(r);
                return (<React.Fragment key={r.id}>
                  <tr className={"hoverable"+(r.exitSignal?" exit":"")+(r.hidden?" hiddenrow":"")+(exp?" expired":"")}>
                    {/* Asset — expand on click */}
                    <td style={{cursor:"pointer",maxWidth:200}} onClick={()=>setOpenRow(open?null:r.id)}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <ChevronDown size={13} color="var(--muted)" style={{transform:open?"rotate(180deg)":"none",transition:".15s",flexShrink:0}}/>
                        <div>
                          <div className="sym" style={{fontSize:13}}>{r.assetName}</div>
                          <div style={{fontSize:11,color:"var(--muted)"}}>{r.assetClass&&<ClassTag c={r.assetClass}/>}</div>
                        </div>
                      </div>
                      {r.hidden && <span className="pill" style={{marginLeft:8,fontSize:10}}>Hidden</span>}
                      {exp && <span className="pill loss" style={{marginLeft:8,fontSize:10}}>Expired</span>}
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
                    <td className={"tnum nowrap "+(itm?"pos":"neg")} style={{fontWeight:700,textAlign:"right"}}>{fmtPct(ret(r))}</td>
                    <td>
                      <Money itm={itm}/>
                      {r.exitSignal && <div style={{marginTop:3}}><span className="pill loss" style={{fontSize:10}}><AlertTriangle size={10}/> EXIT</span></div>}
                    </td>
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
                        {/* Share — external public link + forward within platform */}
                        <div style={{position:"relative"}}>
                          <button className="iconbtn" title="Share / forward" onClick={(e)=>handleReceivedShare(e,r)}><Share2 size={13}/></button>
                          {sharePopId===r.id && (
                            <ReceivedSharePopover
                              reco={r}
                              fromUsername={shareUsername}
                              anchorEl={shareAnchor}
                              onForward={()=>{ setFwd(r); setSharePopId(null); }}
                              onClose={()=>{ setSharePopId(null); setShareAnchor(null); }}
                            />
                          )}
                        </div>
                        {/* Track / bookmark button */}
                        <button
                          className={"iconbtn"+(tracked?.has(r.id)?" on-like":"")}
                          title={tracked?.has(r.id)?"Remove from tracked":"Track this recommendation"}
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
                        {td&&<div><div className="cap">Target date</div><b className={exp?"neg":""}>{fmtDate(td)}{exp?" · Expired":""}</b></div>}
                        {r.conviction&&<div><div className="cap">Conviction</div><ConvBadge level={r.conviction}/></div>}
                        {r.invested&&<div><div className="cap">My entry</div><b className="tnum pos">{r.investedPrice?fmt(r.investedPrice):"—"}</b></div>}
                      </div>
                      <div className="cap">Thesis from {recName(r)}{isForwarded(r)?` · forwarded by ${sharedByName(r)}`:""}</div>
                      <div style={{fontSize:13,lineHeight:1.7,color:"var(--ink-soft)",marginTop:4,marginBottom:12,maxWidth:720}}>
                        {r.thesis ? <ThesisRenderer thesis={r.thesis}/> : <span className="muted">No thesis shared.</span>}
                      </div>
                      <button className="btn btn-soft btn-sm" onClick={()=>setFwd(r)}><Forward size={13}/> Forward this idea</button>
                      <div style={{marginTop:18,borderTop:'1px solid var(--line)',paddingTop:14}}>
                        <div className="cap" style={{marginBottom:10}}>Comments</div>
                        <RecoComments recoId={r.id} me={me}/>
                      </div>
                    </div></td></tr>
                  )}
                </React.Fragment>);
              })}</tbody>
            </table>
            </div>{/* /tscroll */}
          </div>
        </div>}

    {fwd && <ShareRecoModal reco={fwd} mode="forward" originName={recName(fwd)} contacts={contacts} groups={groups} onClose={()=>setFwd(null)}
        onShare={(targets,note)=>{ onForward(fwd,targets,note); setFwd(null); }}/>}
  </>);
}

export function InvestPriceModal({ reco, onClose, onConfirm }) {
  const [price,setPrice]=useState(String(reco.price));
  const valid = price!=="" && !isNaN(+price) && +price>0;
  return (<div className="overlay" onClick={onClose}><div className="modal" style={{width:420}} onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3>Mark as invested</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">
      <div className="muted small" style={{marginBottom:14}}>What price did you invest at for <b style={{color:"var(--ink)"}}>{reco.ticker}</b> — {reco.assetName}?</div>
      <div style={{display:"flex",gap:18,marginBottom:16}}>
        <div><div className="muted small">Reco price</div><div className="tnum" style={{fontWeight:700}}>{fmt(reco.priceAt)}</div></div>
        <div><div className="muted small">Current price</div><div className="tnum" style={{fontWeight:700}}>{fmt(reco.price)}</div></div></div>
      <div className="field"><label>Your entry price</label><input type="number" value={price} autoFocus onChange={e=>setPrice(e.target.value)} onKeyDown={e=>e.key==="Enter"&&valid&&onConfirm(+price)} placeholder="0"/></div>
    </div>
    <div className="modal-foot"><span/><div style={{display:"flex",gap:10}}><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-pri" disabled={!valid} onClick={()=>onConfirm(+price)}><Check size={15}/> Confirm invested</button></div></div>
  </div></div>);
}

export function ShareRecoModal({ reco, mode, originName, contacts, groups, onClose, onShare }) {
  const [targets,setTargets]=useState([]); const [note,setNote]=useState("");
  const toggle=(id)=>setTargets(t=>t.includes(id)?t.filter(x=>x!==id):[...t,id]);
  const fwd = mode==="forward";
  const valid = targets.length>0;
  return (<div className="overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3>{fwd?<><Forward size={18} style={{verticalAlign:-3,color:"var(--accent)"}}/> Forward recommendation</>:<><Share2 size={18} style={{verticalAlign:-3,color:"var(--accent)"}}/> Share recommendation</>}</h3>
      <button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">
      <div className="note info" style={{marginBottom:16}}><Lightbulb size={16}/><div>
        <b>{reco.ticker}</b> — {reco.assetName}{fwd && originName && <> · originally recommended by <b>{originName}</b></>}.
        {fwd && " Forwarding keeps the original recommender credited; you'll appear as the one who shared it."}</div></div>
      <div className="field"><label>Send to contacts</label><div style={{display:"flex",flexWrap:"wrap",gap:8}}>
        {contacts.map(c=><span key={c.id} className={"chip"+(targets.includes(c.id)?" sel":"")} onClick={()=>toggle(c.id)}>{targets.includes(c.id)&&<Check size={13}/>}{c.name}</span>)}</div></div>
      <div className="field"><label>Send to groups</label><div style={{display:"flex",flexWrap:"wrap",gap:8}}>
        {groups.filter(g=>g.members.includes("me")).map(g=><span key={g.id} className={"chip"+(targets.includes(g.id)?" sel":"")} onClick={()=>toggle(g.id)}>{targets.includes(g.id)&&<Check size={13}/>}<Layers size={13}/>{g.name}</span>)}</div></div>
      <div className="field"><label>Add a note {fwd && <span className="muted small">(optional — replaces the thesis you pass on)</span>}</label>
        <textarea rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder={fwd?"Your take when forwarding…":"Anything to add?"}/></div>
    </div>
    <div className="modal-foot"><span className="muted small">{targets.length} selected</span><div style={{display:"flex",gap:10}}>
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-pri" disabled={!valid} onClick={()=>onShare(targets,note)}><Send size={15}/> {fwd?"Forward":"Share"}</button></div></div>
  </div></div>);
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

export function MadeSection({ recs, setRecs, recipientName, reach, contacts, groups, assetClasses, setAssetClasses, holdings, me, onReload, globalSearch }) {
  const isMobile = useIsMobile();
  const [q,setQ]=useState(""); const [fCls,setFCls]=useState("all"),[fMoney,setFMoney]=useState("all"),[fHorizon,setFHorizon]=useState("all");
  useEffect(()=>{ setQ(globalSearch||""); },[globalSearch]);
  const [showExpired,setShowExpired]=useState(false);
  const [sort,setSort]=useState({key:"date",dir:"desc"});
  const [openRow,setOpenRow]=useState(null);
  const [share,setShare]=useState(null);
  const [sharePopId, setSharePopId] = useState(null);
  const [shareAnchor, setShareAnchor] = useState(null);
  const [exitingId,  setExitingId]  = useState(null);

  const del=async(r)=>{
    if(!confirm("Delete this recommendation? This will remove it from all recipients\' lists too.")) return;
    setRecs(rs=>rs.filter(x=>x.id!==r.id));
    await dbDeleteReco(r.id, me?.id);
  };

  const toggleExit=async(r)=>{
    if (r.exit) {
      if(!confirm("Cancel the exit signal for this recommendation?")) return;
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
      const confirmed = confirm(`Exit "${r.ticker}"?\n\nExit price: ${priceLabel}\n\nThis records your exit and closes the recommendation.`);
      setExitingId(null);
      if (!confirmed) return;
      setRecs(rs=>rs.map(x=>x.id===r.id?{...x,exit:true,exitDate:TODAY,exitPrice:exitPriceData?.price||null}:x));
      if(me?.id) {
        try { await dbSetExit(r.id, me.id, exitPriceData?.price||null, exitPriceData?.source||"unavailable"); await onReload(); } catch(_){}
      }
    }
  };
  const reShare=(r,targets)=>setRecs(rs=>rs.map(x=>x.id===r.id?{...x,recipients:[...new Set([...x.recipients,...targets])]}:x));

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
      ? <div className="card"><div className="empty">No recommendations match your filters.</div></div>
      : isMobile
      ? <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {rows.map(r=>{
            const isBuy=(r.recType||'Buy')==='Buy';
            const recoRet=r.priceAt?(r.price-r.priceAt)/r.priceAt:0;
            const cur=r.currency||'INR';
            return (
              <div key={r.id} className="card" style={{padding:'14px 16px',borderLeft:'3px solid '+(isBuy?'var(--gain)':'var(--loss)')}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:15,marginBottom:2}}>{r.assetName}</div>
                    <div style={{fontSize:11,color:'var(--muted)'}}>{r.ticker} · {fmtDate(r.date)}</div>
                  </div>
                  <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,flexShrink:0,background:isBuy?'var(--gain-soft)':'var(--loss-soft)',color:isBuy?'var(--gain)':'var(--loss)'}}>{isBuy?'Buy':'Sell'}</span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12}}>
                  {[['Reco Price',r.priceAt?fmt(r.priceAt,cur):'—'],['Current',r.price?fmt(r.price,cur):'—'],['Return',r.priceAt?fmtPct(recoRet):'—']].map(([label,val],i)=>(
                    <div key={i} style={{background:'var(--surface-2)',borderRadius:8,padding:'8px 10px'}}>
                      <div style={{fontSize:10,color:'var(--muted)',marginBottom:2}}>{label}</div>
                      <div style={{fontWeight:700,fontSize:13,color:i===2?(recoRet>=0?'var(--gain)':'var(--loss)'):'var(--ink)'}}>{val}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                  <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                    {r.horizon&&<span className="pill accent" style={{fontSize:10}}>{r.horizon}</span>}
                    {r.conviction&&<ConvBadge level={r.conviction}/>}
                    {(r.recipients?.length||0)>0&&<span style={{fontSize:10,color:'var(--muted)'}}>Sent to {reach(r.recipients)} people</span>}
                    {r.exit&&<span className="pill loss" style={{fontSize:10}}><LogOut size={10}/> Exited</span>}
                  </div>
                  <div style={{display:'flex',gap:4}}>
                    <button className="iconbtn" title="Share" onClick={()=>setShare(r)}><Share2 size={13}/></button>
                    {!r.exit&&<button className="iconbtn" title="Mark exit" onClick={()=>toggleExit(r)} style={{color:'var(--muted)'}}><LogOut size={13}/></button>}
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
                <SortTh label="Reco Price" k="reco" sort={sort} setSort={setSort} align="right"/>
                <SortTh label="Current" k="cur" sort={sort} setSort={setSort} align="right"/>
                <SortTh label="Return" k="ret" sort={sort} setSort={setSort} align="right"/>
                <th>Status</th>
                <SortTh label="Horizon" k="horizon" sort={sort} setSort={setSort}/>
                <th title="Likes from recipients">Likes</th>
                <th style={{textAlign:"right"}}>Actions</th>
              </tr></thead>
              <tbody>{rows.map(r=>{
                const itm=ret(r)>=0; const open=openRow===r.id; const expired=isExpired(r); const td=getTargetDate(r);
                return (<React.Fragment key={r.id}>
                  <tr className={"hoverable"+(r.exit?" exit":"")+(expired?" expired":"")}>
                    {/* Asset — click to expand */}
                    <td style={{cursor:"pointer",maxWidth:220}} onClick={()=>setOpenRow(open?null:r.id)}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <ChevronDown size={13} color="var(--muted)" style={{transform:open?"rotate(180deg)":"none",transition:".15s",flexShrink:0}}/>
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span className="sym" style={{fontSize:13}}>{r.assetName}</span>
                            <span className={r.isPublic?"pill gain":"pill"} style={{fontSize:10,padding:"1px 6px"}}>{r.isPublic?"Public":"Private"}</span>
                          </div>
                          <div style={{fontSize:11,color:"var(--muted)"}}><ClassTag c={r.assetClass}/></div>
                        </div>
                      </div>
                      {expired && <span className="pill loss" style={{fontSize:10,marginLeft:4}}>Expired</span>}
                      {r.exit && <div style={{marginTop:2}}><span className="pill loss" style={{fontSize:10}}><LogOut size={10}/> Exited {r.exitDate?fmtDate(r.exitDate):""}</span></div>}
                    </td>
                    <td className="muted small nowrap">{fmtDate(r.date)}</td>
                    <td style={{textAlign:"right"}} className="tnum">{r.priceAt?fmt(r.priceAt):<span className="muted">—</span>}</td>
                    <td style={{textAlign:"right"}} className="tnum">{fmt(r.price)}</td>
                    <td style={{textAlign:"right",fontWeight:700}} className={"tnum nowrap "+(itm?"pos":"neg")}>{fmtPct(ret(r))}</td>
                    <td><Money itm={itm}/></td>
                    <td>{r.horizon?<span className="pill accent" style={{fontSize:11}}>{r.horizon}</span>:<span className="muted">—</span>}</td>
                    {/* Likes from recipients */}
                    <td>
                      <div style={{display:"flex",alignItems:"center",gap:5}}>
                        <ThumbsUp size={13} color="var(--gain)"/>
                        <span style={{fontSize:12,fontWeight:700,color:"var(--gain)",minWidth:14}}>{r.likes?.length||0}</span>
                      </div>
                    </td>
                    <td>
                      <div className="actions" style={{gap:4}}>
                        {r.isPublic && (
                          <div style={{position:"relative"}}>
                            <button className="iconbtn" title="Copy public link" onClick={(e)=>setSharePopId(sharePopId===r.id?(setShareAnchor(null),null):(setShareAnchor(e.currentTarget),r.id))}><Link size={13}/></button>
                            {sharePopId===r.id && <SharePublicPopover reco={r} username={me.username} anchorEl={shareAnchor} onClose={()=>{ setSharePopId(null); setShareAnchor(null); }}/>}
                          </div>
                        )}
                        <button className="iconbtn" title="Share with contacts / groups" onClick={()=>setShare(r)}><Share2 size={13}/></button>
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
                        {td&&<div><div className="cap">Target date</div><b className={expired?"neg":""}>{fmtDate(td)}{expired?" · Expired":""}</b></div>}
                        {r.conviction&&<div><div className="cap">Conviction</div><ConvBadge level={r.conviction}/></div>}
                        {r.sector&&<div><div className="cap">Sector</div><b>{r.sector}</b></div>}
                        <div><div className="cap">Acted on it</div><b>{r.actedList.length} of {reach(r.recipients)}</b></div>
                        <div><div className="cap">Reactions</div>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <ThumbsUp size={13} color="var(--gain)"/><b>{r.likes.length}</b>
                          </div>
                        </div>
                      </div>
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
                    </div></td></tr>
                  )}
                </React.Fragment>);
              })}</tbody>
            </table>
            </div>{/* /tscroll */}
          </div>
        </div>}

    {share && <ShareRecoModal reco={share} mode="share" contacts={contacts} groups={groups} onClose={()=>setShare(null)}
        onShare={(targets)=>{ reShare(share,targets); setShare(null); }}/>}
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
    <div className="modal-head"><h3><Plus size={18} style={{verticalAlign:-3,color:"var(--accent)"}}/> Add a recommendation</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">
      <div className="muted small" style={{marginBottom:14}}>Log a tip someone shared with you offline — fill in the details yourself.</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0,columnGap:14}}>
        <div className="field"><label>Asset name</label><input value={f.assetName} onChange={e=>up("assetName",e.target.value)} placeholder="e.g. Apple Inc."/></div>
        <div className="field"><label>Ticker</label><input value={f.ticker} onChange={e=>up("ticker",e.target.value)} placeholder="AAPL"/></div>
        <div className="field"><label>Recommended by</label><input value={f.by} onChange={e=>up("by",e.target.value)} placeholder="Name" list="cnames"/>
          <datalist id="cnames">{contacts.map(c=><option key={c.id} value={c.name}/>)}</datalist></div>
        <div className="field"><label>Asset class</label><select value={f.assetClass} onChange={e=>up("assetClass",e.target.value)}>{assetClasses.map(c=><option key={c}>{c}</option>)}</select></div>
        <div className="field"><label>Date</label><input type="date" value={f.date} onChange={e=>up("date",e.target.value)}/></div>
        <div className="field"><label>Shared as</label><select value={f.shareType} onChange={e=>up("shareType",e.target.value)}><option value="one">One-to-one</option><option value="group">Group</option></select></div>
        <div className="field"><label>Reco price</label><input type="number" value={f.recoPrice} onChange={e=>up("recoPrice",e.target.value)} placeholder="0"/></div>
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
      <button className="btn btn-pri" disabled={!valid} onClick={save}>Add recommendation</button></div></div>
  </div></div>);
}

/* ═══════════════════════════════════════════════════════════════════════════
   THESIS: rich-text utilities, editor, and renderer
   ─ Storage: thesis column is either plain text (legacy) or a JSON string:
       {"__v":"1","text":"...","images":["data:image/jpeg;base64,..."]}
   ─ Limits: 500 chars · 2 images · 2 MB original → auto-compressed to ≤100 KB
   ══════════════════════════════════════════════════════════════════════════ */

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
    const label = sel || 'read more';
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
    } catch(e) { setImgErr(e.message || 'Image processing failed.'); }
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
        placeholder={`Share your investment thesis… Use **bold**, _italic_, [link text](https://url) · Max ${THESIS_MAX_CHARS} chars`}
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

export function ThesisRenderer({ thesis, previewLines=3 }) {
  const [expanded, setExpanded] = useState(false);
  const parsed = useMemo(() => parseThesis(thesis), [thesis]);
  if (!parsed) return null;
  const { text, images } = parsed;
  if (!text && !images?.length) return null;

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
        <img key={i} src={src} alt="" style={{maxWidth:'100%',borderRadius:8,
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
            <img key={i} src={src} alt="" style={{maxWidth:'100%',borderRadius:8,
              marginTop:8,display:'block',border:'1px solid var(--line)'}}/>
          ))}
          <button onClick={()=>setExpanded(false)} style={{background:'none',border:'none',
            cursor:'pointer',fontSize:12,color:'var(--accent-ink)',padding:'4px 0',fontWeight:600,marginTop:4}}>
            Show less ↑
          </button>
        </>
      ) : (
        <>
          {textNode(true)}
          <button onClick={()=>setExpanded(true)} style={{background:'none',border:'none',
            cursor:'pointer',fontSize:12,color:'var(--accent-ink)',padding:'4px 0',fontWeight:600}}>
            Read more{imgLabel} →
          </button>
        </>
      )}
    </div>
  );
}

export function MakeRecoModal({ assetClasses, setAssetClasses, contacts, groups, holdings, me, onClose, onCreate }) {
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
    if (me?.id) {
      try {
        const created = await dbCreateReco(recoData, me.id, recipients);
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
            ? `https://myinvestorcircle.com/#/investor/${me.username}/reco/${newRecoId}`
            : `https://myinvestorcircle.com/#/investor/${me.username || ''}`;

          const meta = {
            ticker:               recoData.ticker,
            assetName:            recoData.assetName,
            recommenderUsername:  me.username || '',
            recoId:               newRecoId,
          };
          await dbNotifyPublicContacts(newRecoId, contacts.map(c => c.id), meta);
          contacts.forEach(c => sendPush(c.id, {
            title: '💡 New recommendation in your circle',
            body:  `${me.name || 'Someone'} posted a new recommendation`,
            url:   recoUrl,
            tag:   'contact_recommendation',
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
  };

  const valid = (assetName.trim()||ticker.trim()) && (isPublic || targets.length>0) && (priceData?.price > 0 || !!priceError);

  return (<div className="overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3><Sparkles size={18} style={{verticalAlign:-3,color:"var(--accent)"}}/> New idea</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">

      {/* Recommendation type — Buy / Sell */}
      <div className="field"><label>Recommendation type</label>
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
              <div style={{marginTop:3,opacity:.8}}>Entry price is stamped using closing price of recommendation date — not manual entry.</div>
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
        <button className="btn btn-pri" disabled={!valid} onClick={create}><Send size={15}/> Send</button></div>
    </div>
  </div></div>);
}

/* =================================================================== SHARING */

export function ReceivedSharePopover({ reco, fromUsername, anchorEl, onForward, onClose }) {
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
  }, []);

  const url = fromUsername
    ? `${window.location.origin}${window.location.pathname}#/investor/${fromUsername}/reco/${reco.id}`
    : null;
  const waMsg = url ? encodeURIComponent(`Check out ${reco.ticker} (${reco.assetName}) on InvestorCircle:\n${url}`) : null;
  const copyLink = () => {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => { setCopied(false); onClose(); }, 1600); });
  };

  const content = (
    <>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Share2 size={15} color="var(--accent)" /> Share this idea
      </div>
      <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 8 }}
        onClick={() => { onForward(); onClose(); }}>
        <Forward size={14} /> Forward to your contacts
      </button>
      {url ? (<>
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 4, marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 8 }}>Share publicly</div>
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, padding: '7px 9px', fontSize: 11, color: 'var(--muted)', marginBottom: 8, wordBreak: 'break-all', lineHeight: 1.4 }}>{url}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button className="btn btn-pri btn-sm" style={{ justifyContent: 'center' }} onClick={copyLink}>{copied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy link</>}</button>
            <a href={`https://wa.me/?text=${waMsg}`} target="_blank" rel="noopener noreferrer" className="btn btn-soft btn-sm" style={{ justifyContent: 'center', textDecoration: 'none' }} onClick={onClose}><span style={{ fontSize: 14 }}>💬</span> Share on WhatsApp</a>
          </div>
        </div>
        <div className="muted small" style={{ fontSize: 11 }}>Links to the recommender's public profile.</div>
      </>) : (
        <div className="muted small" style={{ fontSize: 11, paddingTop: 4 }}>Public link unavailable — recommender hasn't set a username yet.</div>
      )}
      <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={onClose}>Cancel</button>
    </>
  );

  // ── Mobile: full-screen bottom sheet ──────────────────────────────────
  if (isMobile) return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)' }}/>
      <div ref={popRef} style={{ position: 'relative', background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '20px 20px 36px', boxShadow: '0 -8px 40px rgba(0,0,0,.28)', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: 'var(--line)', borderRadius: 2, margin: '0 auto 18px' }}/>
        {content}
      </div>
    </div>,
    document.body
  );

  // ── Desktop: floating popover ─────────────────────────────────────────
  if (!pos) return null;
  return createPortal(
    <div ref={popRef} style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,.18)', padding: '16px 18px', minWidth: 290, maxWidth: 340, fontFamily: 'var(--font)' }} onClick={e => e.stopPropagation()}>
      {content}
    </div>,
    document.body
  );
}

export function SharePublicPopover({ reco, username, onClose, anchorEl }) {
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
  }, []);

  const url = username
    ? `${window.location.origin}${window.location.pathname}#/investor/${username}/reco/${reco.id}`
    : null;
  const waMsg = url ? encodeURIComponent(`Check out ${reco.ticker} (${reco.assetName}) by @${username} on InvestorCircle:\n${url}`) : null;
  const copyLink = () => { if (!url) return; navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => { setCopied(false); onClose(); }, 1600); }); };

  const noUsername = (
    <div ref={popRef}>
      <div className="note warn" style={{ fontSize: 12 }}><AlertTriangle size={13} /><div>Set a username in your profile first.</div></div>
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 10, width: '100%' }} onClick={onClose}>Close</button>
    </div>
  );

  const content = username ? (
    <>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}><Globe size={15} color="var(--accent)" /> Share publicly</div>
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, padding: '8px 10px', fontSize: 11, color: 'var(--muted)', marginBottom: 12, wordBreak: 'break-all', lineHeight: 1.5 }}>{url}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="btn btn-pri btn-sm" style={{ justifyContent: 'center' }} onClick={copyLink}>{copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy link</>}</button>
        <a href={`https://wa.me/?text=${waMsg}`} target="_blank" rel="noopener noreferrer" className="btn btn-soft btn-sm" style={{ justifyContent: 'center', textDecoration: 'none' }} onClick={onClose}><span style={{ fontSize: 15, lineHeight: 1 }}>💬</span> Share on WhatsApp</a>
      </div>
      <div className="muted small" style={{ marginTop: 10, fontSize: 11 }}>Anyone with this link can view — no login needed.</div>
      <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={onClose}>Cancel</button>
    </>
  ) : noUsername;

  // ── Mobile: full-screen bottom sheet ──────────────────────────────────
  if (isMobile) return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)' }}/>
      <div ref={popRef} style={{ position: 'relative', background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '20px 20px 36px', boxShadow: '0 -8px 40px rgba(0,0,0,.28)', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: 'var(--line)', borderRadius: 2, margin: '0 auto 18px' }}/>
        {content}
      </div>
    </div>,
    document.body
  );

  // ── Desktop: floating popover ─────────────────────────────────────────
  if (!pos) return null;
  return createPortal(
    <div ref={popRef} style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,.18)', padding: '16px 18px', minWidth: 290, maxWidth: 340, fontFamily: 'var(--font)' }} onClick={e => e.stopPropagation()}>
      {content}
    </div>,
    document.body
  );
}

/* ─── RecoPostPage — dedicated shareable post view for a single recommendation ── */

export function RecoPostPage({ username, recoId, viewerUser, ME, onBack, onNavigateProfile }) {
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

  const recoUrl = `${window.location.origin}${window.location.pathname}#/investor/${username}/reco/${recoId}`;

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

  const requireLogin = () => { window.location.hash = ''; };

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
    navigator.clipboard.writeText(recoUrl)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2200); })
      .catch(() => {});
  };

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
  } : null;

  return (
    <div style={{minHeight:'100vh', background:'var(--bg)', paddingBottom:56}}>

      {/* ── Topbar ── */}
      <div style={{background:'var(--surface)', borderBottom:'1px solid var(--line)',
                   padding:'11px 20px', display:'flex', alignItems:'center', gap:12,
                   position:'sticky', top:0, zIndex:100}}>
        <img src="/mic-logo.png" alt="mic" style={{width:30, height:30, flexShrink:0}}/>
        <div style={{flex:1}}>
          <div style={{fontWeight:800, fontSize:13, lineHeight:1.1}}>myInvestorCircle</div>
          <div style={{fontSize:10, color:'var(--muted)'}}>Transparency Platform</div>
        </div>
        {viewerUser
          ? <button className="btn btn-ghost btn-sm" onClick={onBack}><ArrowLeft size={14}/> Back to app</button>
          : <a href={window.location.pathname}
               style={{fontSize:13, fontWeight:700, color:'var(--accent)', textDecoration:'none'}}>
              Sign in →
            </a>}
      </div>

      <div style={{maxWidth:640, margin:'0 auto', padding: isMobile ? '16px 12px' : '24px 16px'}}>

        {/* Loading */}
        {loading && (
          <div style={{textAlign:'center', padding:'72px 0', color:'var(--muted)'}}>
            <Loader size={28} className="spin" style={{marginBottom:14}}/>
            <div>Loading recommendation…</div>
          </div>
        )}

        {/* Not found */}
        {notFound && !loading && (
          <div style={{textAlign:'center', padding:'72px 0'}}>
            <div style={{fontSize:36, marginBottom:14}}>🔒</div>
            <div style={{fontWeight:700, fontSize:17, marginBottom:8}}>Recommendation not found</div>
            <div style={{fontSize:14, color:'var(--muted)', marginBottom:24}}>
              This recommendation may be private or no longer available.
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
            <div className="av" style={{width:50, height:50, fontSize:17, flexShrink:0,
                                        background:profile.avatar_color||'var(--grad)'}}>
              {initialsOf(fullName)}
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
                <div style={{fontSize:14, lineHeight:1.75, color:'var(--ink-soft)'}}>{reco.thesis}</div>
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
            <button onClick={copyLink} style={{display:'flex', alignItems:'center', gap:5,
              padding:'7px 12px', borderRadius:10, border:'1px solid var(--line)',
              background:'transparent', color:'var(--muted)',
              cursor:'pointer', fontFamily:'var(--font)', fontSize:13, fontWeight:600}}>
              {copied ? <><Check size={14}/></> : <><Share2 size={14}/></>}
            </button>
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
            <RecoComments recoId={recoId} me={commentMe}/>
            {!viewerUser && (
              <div style={{textAlign:'center', marginTop:12, fontSize:13, color:'var(--muted)'}}>
                <a href={window.location.pathname} style={{color:'var(--accent)', fontWeight:700}}>
                  Sign in
                </a>{' '}to leave a comment
              </div>
            )}
          </div>

          {/* ── Disclaimer ── */}
          <div style={{fontSize:11, color:'var(--muted)', lineHeight:1.7,
                       textAlign:'center', padding:'0 8px'}}>
            Publicly shared investment opinion. Not SEBI registered advice.
            Past performance does not indicate future results.
          </div>
        </>)}
      </div>
    </div>
  );
}

/* ─── Main PublicProfilePage ─────────────────────────────────────────────────── */
/* ── ProfileErrorBoundary — catches render errors so the page never goes blank ── */

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

/* ─── Shared comments component ─────────────────────────────────────────────────── */

export function RecoComments({ recoId, me }) {
  const [comments,  setComments]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [text,      setText]      = useState('');
  const [submitting,setSubmitting]= useState(false);

  useEffect(()=>{
    if(!recoId){ setLoading(false); return; }
    setLoading(true);
    dbGetEngagement(recoId)
      .then(e=>{ setComments(e.comments || []); setLoading(false); })
      .catch(()=>setLoading(false));
  },[recoId]);

  const submit=async()=>{
    if(!text.trim()||!me?.id) return;
    setSubmitting(true);
    const name=[me.firstName,me.lastName].filter(Boolean).join(' ')||me.name||'User';
    try{
      // Server derives the commenter's display name from their own profile and
      // performs the owner/network notification fan-out (see engagement.js).
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
          <div className="av" style={{width:30,height:30,background:'var(--grad)',fontSize:11,flexShrink:0}}>{initialsOf(me.name||'?')}</div>
          <div style={{flex:1,display:'flex',gap:8}}>
            <input value={text} onChange={e=>setText(e.target.value)} placeholder="Add a comment…"
              onKeyDown={e=>e.key==='Enter'&&!submitting&&text.trim()&&submit()}
              style={{flex:1,border:'1px solid var(--line-2)',borderRadius:10,padding:'8px 12px',fontSize:13,outline:'none',background:'var(--surface)',fontFamily:'var(--font)'}}/>
            <button className="btn btn-pri btn-sm" disabled={!text.trim()||submitting} onClick={submit} style={{flexShrink:0}}>
              {submitting?<Loader size={13} className="spin"/>:<Send size={13}/>}
            </button>
          </div>
        </div>
      )}
      {/* List */}
      {loading
        ? <div className="muted small" style={{paddingBottom:8}}><Loader size={13} className="spin" style={{marginRight:6}}/>Loading comments…</div>
        : comments.length===0
          ? <div className="muted small" style={{fontStyle:'italic'}}>No comments yet — be the first!</div>
          : comments.map(c=>(
              <div key={c.id} style={{display:'flex',gap:9,marginBottom:12}}>
                <div className="av" style={{width:28,height:28,background:'var(--accent)',fontSize:10,flexShrink:0}}>{initialsOf(c.user_name||'?')}</div>
                <div style={{flex:1}}>
                  <div style={{display:'flex',alignItems:'baseline',gap:7,marginBottom:2}}>
                    <span style={{fontSize:12,fontWeight:700}}>{c.userName||'User'}</span>
                    <span className="muted small" style={{fontSize:11}}>{new Date(c.createdAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
                  </div>
                  <div style={{fontSize:13,color:'var(--ink-soft)',lineHeight:1.6,background:'var(--surface-2)',borderRadius:10,padding:'7px 11px'}}>{c.comment}</div>
                </div>
              </div>
            ))
      }
    </div>
  );
}

/* ─── FeedCard — single recommendation card for the homepage ────────────────────── */

export function FeedCard({ r, me, contacts, groups, setRecsReceived, setPublicFeedRecos, setNetworkEngagementRecos, onReload, tracked, toggleTrack, onOpenSecurity, initExpanded=false }) {
  const [expanded,  setExpanded]  = useState(initExpanded);
  const [recommenderInfo, setRecommenderInfo] = useState(null); // { username, isSebiApproved }
  const [shareAnchor, setShareAnchor] = useState(null);
  const [shareUsername, setShareUsername] = useState(null);
  const [showShare, setShowShare] = useState(false);

  // Fetch recommender's username + SEBI status once (cached globally)
  useEffect(()=>{
    if(r.from) fetchPublicProfileInfo(r.from).then(setRecommenderInfo);
  },[r.from]);

  const cf = useMemo(()=>{
    const found = contacts.find(x=>x.id===r.from);
    if(found) return found;
    const name=r.byName||'Someone';
    return { name, initials:initialsOf(name), color:'#8d90ad' };
  },[r.from, contacts]);

  const retPct = (r.priceAt&&r.priceAt!==0) ? (r.price-r.priceAt)/r.priceAt : 0;
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
    <div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:18,boxShadow:'var(--shadow)',marginBottom:12,overflow:'visible',transition:'box-shadow .15s'}}
      onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 20px rgba(20,20,50,.1)'}
      onMouseLeave={e=>e.currentTarget.style.boxShadow='var(--shadow)'}>
      <div style={{padding:'16px 18px'}}>

        {/* ── Header row ── */}
        <div style={{display:'flex',alignItems:'flex-start',gap:12,marginBottom:11}}>

          {/* Avatar — click → profile */}
          <div className="av"
            style={{width:42,height:42,background:cf.color||'var(--grad)',fontSize:15,flexShrink:0,cursor:canOpenProfile?'pointer':'default'}}
            title={canOpenProfile?`View ${cf.name}'s profile`:''}
            onClick={()=>canOpenProfile&&openProfile(recommenderInfo.username)}>
            {cf.initials||initialsOf(cf.name)}
          </div>

          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,lineHeight:1.35,display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
              {/* Name — click → profile */}
              <b style={{color:canOpenProfile?'var(--accent-ink)':'var(--ink)',cursor:canOpenProfile?'pointer':'default',
                  textDecoration:canOpenProfile?'underline':'none',textDecorationStyle:'dotted',textUnderlineOffset:3}}
                title={canOpenProfile?`View ${cf.name}'s public profile`:''}
                onClick={()=>canOpenProfile&&openProfile(recommenderInfo.username)}>{cf.name}</b>
              <span style={{color:'var(--muted)',fontWeight:400}}>recommended</span>
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
              {r.priceAt>0&&<span>Reco ₹{Number(r.priceAt).toLocaleString('en-IN')}</span>}
              {r.feedSource==='public'
                ? <span title="This recommendation is publicly visible to all investors on myInvestorCircle"
                    style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:4,background:'rgba(99,102,241,.1)',color:'rgb(99,102,241)',border:'1px solid rgba(99,102,241,.25)',display:'flex',alignItems:'center',gap:3}}><Globe size={9}/> Public</span>
                : r.isPublic
                ? <span title="This recommendation is publicly visible to all investors"
                    style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:4,background:'rgba(99,102,241,.1)',color:'rgb(99,102,241)',border:'1px solid rgba(99,102,241,.25)',display:'flex',alignItems:'center',gap:3}}><Globe size={9}/> Public</span>
                : r.shareType==='group'
                  ? <span title={`Shared with the group: ${groups?.find?.(g=>g.id===r.groupId)?.name||'your group'}`}
                      style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:4,background:'var(--accent-soft)',color:'var(--accent-ink)',border:'1px solid var(--accent-line)',display:'flex',alignItems:'center',gap:3}}><Layers size={10}/>{r.groupId?(groups?.find?.(g=>g.id===r.groupId)?.name||'Group'):'Group'}</span>
                  : <span title="Sent directly to you by the investor — only you can see this"
                      style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:4,background:'var(--surface-2)',color:'var(--muted)',border:'1px solid var(--line)',display:'flex',alignItems:'center',gap:3}}><Send size={9}/> Sent to you</span>}
            </div>
          </div>

          {/* Return badge — click to expand */}
          <div style={{textAlign:'right',flexShrink:0,cursor:'pointer'}} onClick={()=>setExpanded(v=>!v)} title="Expand card">
            <div style={{fontSize:16,fontWeight:800,letterSpacing:'-.3px',color:itm?'var(--gain)':'var(--loss)'}}>
              {itm?'+':''}{(retPct*100).toFixed(1)}%
            </div>
            <div style={{fontSize:11,color:'var(--muted)',marginTop:1}}>₹{Number(r.price).toLocaleString('en-IN')} now</div>
            <div style={{fontSize:10,color:'var(--muted)',marginTop:2}}>{expanded?'▲':'▼'}</div>
          </div>
        </div>

        {/* ── Thesis — click to expand ── */}
        {r.thesis&&r.thesis!=='—'&&(
          <div style={{marginBottom:10,cursor:'pointer'}} onClick={()=>setExpanded(v=>!v)}>
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

        {/* ── Interaction bar — Like · Comment · Engagement · Share · Bookmark · Invested ── */}
        <div style={{display:'flex',alignItems:'center',gap:5,paddingTop:10,borderTop:'1px solid var(--line)'}}>
          {/* Like */}
          <button className={"iconbtn"+(r.reaction==='like'?' on-like':'')} title="Like" onClick={e=>{e.stopPropagation();react('like');}} style={{width:32,height:32}}><ThumbsUp size={14}/></button>
          <span style={{fontSize:12,fontWeight:700,color:'var(--muted)',minWidth:16}}>{r.likes||0}</span>
          {/* Comment */}
          <button className="iconbtn" title="Comment" onClick={()=>setExpanded(v=>!v)} style={{width:32,height:32}}><MessageSquare size={14}/></button>
          {(r.commentCount||0)>0 && <span style={{fontSize:12,fontWeight:700,color:'var(--muted)',minWidth:16}}>{r.commentCount}</span>}
          {/* Engagement */}
          {interactionCount>0&&<span style={{fontSize:11,color:'var(--muted)',display:'flex',alignItems:'center',gap:2}}>✦ {interactionCount}</span>}
          {/* Share */}
          <div style={{position:'relative'}}>
            <button className="iconbtn" title="Share" onClick={e=>{e.stopPropagation();handleShareClick(e);}} style={{width:32,height:32}}><Share2 size={14}/></button>
            {showShare&&<ReceivedSharePopover reco={r} fromUsername={shareUsername} anchorEl={shareAnchor}
              onForward={()=>setShowShare(false)}
              onClose={()=>{ setShowShare(false); setShareAnchor(null); }}/>}
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
            <button onClick={()=>setExpanded(v=>!v)} style={{background:'none',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:3,fontSize:12,color:'var(--accent-ink)',fontWeight:700,fontFamily:'var(--font)',padding:'4px 8px',borderRadius:8}}>
              {expanded?'Less':'More'}<ChevronDown size={14} style={{transform:expanded?'rotate(180deg)':'none',transition:'.15s'}}/>
            </button>
          </div>
        </div>
      </div>

      {/* ── Expanded detail + comments ── */}
      {expanded&&(
        <div style={{borderTop:'1px solid var(--line)',padding:'16px 18px',background:'var(--surface-2)',borderRadius:'0 0 18px 18px'}}>
          <div style={{display:'flex',gap:22,flexWrap:'wrap',marginBottom:14}}>
            <div><div className="cap">Ticker</div><b>{r.ticker}</b></div>
            {r.assetClass&&<div><div className="cap">Class</div><ClassTag c={r.assetClass}/></div>}
            {r.priceAt>0&&<div><div className="cap">Entry price</div><b className="tnum">₹{Number(r.priceAt).toLocaleString('en-IN')}</b></div>}
            {r.targetPrice&&<div><div className="cap">Target</div><b className="tnum pos">₹{Number(r.targetPrice).toLocaleString('en-IN')}</b></div>}
            {r.stopLoss&&<div><div className="cap">Stop loss</div><b className="tnum neg">₹{Number(r.stopLoss).toLocaleString('en-IN')}</b></div>}
            <div><div className="cap">Return</div><b className={"tnum "+(itm?"pos":"neg")}>{itm?'+':''}{(retPct*100).toFixed(1)}%</b></div>
            {r.conviction&&<div><div className="cap">Conviction</div><ConvBadge level={r.conviction}/></div>}
            {r.sector&&<div><div className="cap">Sector</div><b>{r.sector}</b></div>}
          </div>
          {r.thesis&&r.thesis!=='—'&&(
            <div style={{marginBottom:16}}>
              <div className="cap" style={{marginBottom:5}}>Thesis</div>
              <ThesisRenderer thesis={r.thesis} previewLines={8}/>
            </div>
          )}
          <div style={{borderTop:'1px solid var(--line)',paddingTop:14}}>
            <div className="cap" style={{marginBottom:10}}>Comments</div>
            <RecoComments recoId={r.id} me={me}/>
          </div>
        </div>
      )}
    </div>
  );
}

export function RecoCardModal({ r, me, contacts, groups, setRecsReceived, tracked, toggleTrack, onClose }) {
  return createPortal(
    <div className="modal-overlay" onClick={onClose} style={{zIndex:9999}}>
      <div style={{maxWidth:640,width:'92vw',margin:'60px auto',position:'relative'}} onClick={e=>e.stopPropagation()}>
        <button onClick={onClose} style={{position:'absolute',top:-36,right:0,background:'rgba(255,255,255,.15)',border:'none',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,padding:'4px 12px',borderRadius:8}}>✕ Close</button>
        <FeedCard r={r} me={me} contacts={contacts} groups={groups}
          setRecsReceived={setRecsReceived} tracked={tracked} toggleTrack={toggleTrack}
          initExpanded={true}/>
      </div>
    </div>,
    document.body
  );
}

/* ─── Shared widget header style ─── */
