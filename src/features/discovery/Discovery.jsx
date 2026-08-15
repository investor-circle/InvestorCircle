import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Users,
  Lightbulb,
  Search,
  Bell,
  TrendingUp,
  TrendingDown,
  X,
  MessageSquare,
  Bookmark,
  ChevronRight,
  ChevronDown,
  Sparkles,
  UserPlus,
  ThumbsUp,
  Loader,
  RefreshCw,
  Globe,
  Link,
  Flame,
  BarChart2,
  Activity,
  Zap,
  Target,
  Clock
} from "lucide-react";
import {
  getInvestorIciBatch as dbGetInvestorIciBatch
} from "../../services/api/profileApi";
import {
  computeIci,
  getConsensusRecosPublic as dbGetConsensusRecosPublic,
  getTickerRecos as dbGetTickerRecos
} from "../../services/api/recommendationsApi";
import { ConsensusBar, ConvBadge, InstrumentSearch, SparkLine, WidgetHeader } from "../../components/common";
import { FeedCard, MakeRecoModal, RecoCardModal } from "../recommendations/Recommendations";
import { useDerivedHoldings, useIsMobile } from "../../hooks/index";
import { computeConsensus, computeTrend, fmtDate, getThesisText, initialsOf, scoreFeedRec } from "../../utils/format";

export function FreshWidget({ recsReceived, contacts, setPage }) {
  const fresh = [...recsReceived].filter(r=>!r.hidden)
    .sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,4);
  const [modal, setModal] = useState(null);
  const cf = (r) => { const f=contacts.find(x=>x.id===r.from); return f||(r.byName?{name:r.byName,color:'#8d90ad'}:{name:'?',color:'#8d90ad'}); };
  return (
    <div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:16,boxShadow:'var(--shadow)',overflow:'hidden',marginBottom:12}}>
      <WidgetHeader icon={Bell} label="Fresh Ideas" action="View all" onAction={()=>setPage('recs')}/>
      {fresh.length===0
        ? <div className="muted small" style={{padding:'10px 14px 12px',fontStyle:'italic'}}>No new recommendations yet.</div>
        : fresh.map(r=>{
          const perf=r.priceAt?(r.price-r.priceAt)/r.priceAt:0;
          const c=cf(r);
          return (
            <div key={r.id} onClick={()=>setModal(r)} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 14px',borderTop:'1px solid var(--line)',cursor:'pointer',transition:'.12s'}}
              onMouseEnter={e=>e.currentTarget.style.background='var(--surface-2)'}
              onMouseLeave={e=>e.currentTarget.style.background=''}>
              <div className="av" style={{width:30,height:30,background:c.color||'var(--grad)',fontSize:10,flexShrink:0}}>{initialsOf(c.name)}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,fontSize:12,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.assetName}</div>
                <div style={{fontSize:10,color:'var(--muted)'}}>{c.name.split(' ')[0]} · {fmtDate(r.date)}</div>
              </div>
              <div style={{textAlign:'right',flexShrink:0}}>
                <div style={{fontSize:12,fontWeight:700,color:perf>=0?'var(--gain)':'var(--loss)'}}>{perf>=0?'+':''}{(perf*100).toFixed(1)}%</div>
                <div style={{fontSize:10,color:'var(--muted)'}}>{r.horizon||''}</div>
              </div>
            </div>
          );
        })}
      {modal && <RecoCardModal r={modal} me={null} contacts={contacts} groups={[]} setRecsReceived={()=>{}} tracked={new Set()} toggleTrack={()=>{}} onClose={()=>setModal(null)}/>}
    </div>
  );
}

/* ─── Sidebar Widget: Tracked Summary Donut (#6) ─── */

export function TrackedSummaryWidget({ recsReceived, tracked, setPage, setRecoInit }) {
  const trackedList = recsReceived.filter(r=>tracked.has(r.id));
  const total = trackedList.length;
  const inM = trackedList.filter(r=>r.priceAt&&r.price>r.priceAt).length;
  const outM = total - inM;
  if(total===0) return null;

  // SVG donut
  const R=32, cx=40, cy=40, stroke=9, circum=2*Math.PI*R;
  const inDash=circum*(inM/total), outDash=circum*(outM/total);
  const navTo=(filter)=>{ setRecoInit({tab:'tracked',moneyFilter:filter}); setPage('recs'); };

  return (
    <div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:16,boxShadow:'var(--shadow)',overflow:'hidden',marginBottom:12}}>
      <WidgetHeader icon={TrendingUp} label="My Tracked"/>
      <div style={{padding:'12px 14px'}}>
      <div style={{display:'flex',alignItems:'center',gap:14}}>
        <svg width={80} height={80} style={{flexShrink:0}}>
          {/* background */}
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--line-2)" strokeWidth={stroke}/>
          {/* out of money — red */}
          {outM>0&&<circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--loss)" strokeWidth={stroke}
            strokeDasharray={`${outDash} ${circum-outDash}`}
            strokeDashoffset={-(circum*(inM/total))}
            strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}/>}
          {/* in the money — green */}
          {inM>0&&<circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--gain)" strokeWidth={stroke}
            strokeDasharray={`${inDash} ${circum-inDash}`}
            strokeDashoffset={0}
            strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}/>}
          <text x={cx} y={cy+1} textAnchor="middle" dominantBaseline="middle" style={{fontSize:16,fontWeight:800,fill:'var(--ink)'}}>{total}</text>
          <text x={cx} y={cy+14} textAnchor="middle" dominantBaseline="middle" style={{fontSize:8,fill:'var(--muted)'}}>tracked</text>
        </svg>
        <div style={{flex:1}}>
          <div onClick={()=>navTo('in')} style={{cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 10px',borderRadius:8,marginBottom:5,background:'var(--gain-soft)',transition:'.12s'}}
            onMouseEnter={e=>e.currentTarget.style.opacity='.8'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
            <span style={{fontSize:12,fontWeight:600,color:'var(--gain)'}}>In the money</span>
            <span style={{fontSize:15,fontWeight:800,color:'var(--gain)'}}>{inM}</span>
          </div>
          <div onClick={()=>navTo('out')} style={{cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 10px',borderRadius:8,background:'var(--loss-soft)',transition:'.12s'}}
            onMouseEnter={e=>e.currentTarget.style.opacity='.8'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
            <span style={{fontSize:12,fontWeight:600,color:'var(--loss)'}}>Out of money</span>
            <span style={{fontSize:15,fontWeight:800,color:'var(--loss)'}}>{outM}</span>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

/* ─── Sidebar Widget: Missed Opportunities (#5) ─── */

export function MissedOppsWidget({ recsReceived, tracked, contacts }) {
  const [modal, setModal] = useState(null);
  const missed = recsReceived
    .filter(r=>!tracked.has(r.id)&&!r.hidden&&r.priceAt>0)
    .map(r=>({...r, ret:(r.price-r.priceAt)/r.priceAt}))
    .filter(r=>r.ret>0.03)
    .sort((a,b)=>b.ret-a.ret)
    .slice(0,3);
  if(!missed.length) return null;
  const cf=(r)=>{ const f=contacts.find(x=>x.id===r.from); return f||(r.byName?{name:r.byName}:{name:'?'}); };
  return (
    <div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:16,boxShadow:'var(--shadow)',overflow:'hidden',marginBottom:12}}>
      <WidgetHeader emoji="💸" label="Missed Opportunities"/>
      {missed.map(r=>(
        <div key={r.id} onClick={()=>setModal(r)} style={{padding:'9px 14px',borderTop:'1px solid var(--line)',cursor:'pointer',transition:'.12s'}}
          onMouseEnter={e=>e.currentTarget.style.background='var(--surface-2)'}
          onMouseLeave={e=>e.currentTarget.style.background=''}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
            <div>
              <div style={{fontWeight:700,fontSize:12}}>{r.assetName}</div>
              <div style={{fontSize:10,color:'var(--muted)',marginTop:1}}>from {cf(r).name.split(' ')[0]} · Reco ₹{Number(r.priceAt).toLocaleString('en-IN')}</div>
            </div>
            <div style={{textAlign:'right',flexShrink:0}}>
              <div style={{fontSize:13,fontWeight:800,color:'var(--gain)'}}>+{(r.ret*100).toFixed(1)}%</div>
              <div style={{fontSize:10,color:'var(--muted)'}}>₹{Number(r.price).toLocaleString('en-IN')} now</div>
            </div>
          </div>
        </div>
      ))}
      {modal && <RecoCardModal r={modal} me={null} contacts={contacts} groups={[]} setRecsReceived={()=>{}} tracked={new Set()} toggleTrack={()=>{}} onClose={()=>setModal(null)}/>}
    </div>
  );
}

/* ─── Sidebar Widget: Trending in Network (#4) ─── */

export function TrendingWidget({ recsReceived, tracked, contacts }) {
  const [modal, setModal] = useState(null);
  const trending = [...recsReceived].filter(r=>!r.hidden)
    .map(r=>({...r, score:(r.likes||0)+(tracked.has(r.id)?2:0)}))
    .filter(r=>r.score>0)
    .sort((a,b)=>b.score-a.score)
    .slice(0,3);
  if(!trending.length) return null;
  const cf=(r)=>{ const f=contacts.find(x=>x.id===r.from); return f||(r.byName?{name:r.byName,color:'#8d90ad'}:{name:'?',color:'#8d90ad'}); };
  return (
    <div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:16,boxShadow:'var(--shadow)',overflow:'hidden',marginBottom:12}}>
      <WidgetHeader icon={Flame} label="Trending on Platform"/>
      {trending.map((r,i)=>{
        const perf=r.priceAt?(r.price-r.priceAt)/r.priceAt:0;
        const c=cf(r);
        return (
          <div key={r.id} onClick={()=>setModal(r)} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 14px',borderTop:'1px solid var(--line)',cursor:'pointer',transition:'.12s'}}
            onMouseEnter={e=>e.currentTarget.style.background='var(--surface-2)'}
            onMouseLeave={e=>e.currentTarget.style.background=''}>
            <div style={{width:22,height:22,borderRadius:'50%',background:i===0?'var(--grad)':i===1?'var(--accent-soft)':'var(--surface-2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:i===0?'#fff':'var(--accent-ink)',flexShrink:0}}>{i+1}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,fontSize:12,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.assetName}</div>
              <div style={{fontSize:10,color:'var(--muted)',display:'flex',gap:8}}>
                <span><ThumbsUp size={10}/> {r.likes||0}</span>
                <span><Bookmark size={10}/> {tracked.has(r.id)?'tracked':''}</span>
              </div>
            </div>
            <div style={{fontSize:12,fontWeight:700,color:perf>=0?'var(--gain)':'var(--loss)',flexShrink:0}}>{perf>=0?'+':''}{(perf*100).toFixed(1)}%</div>
          </div>
        );
      })}
      {modal && <RecoCardModal r={modal} me={null} contacts={contacts} groups={[]} setRecsReceived={()=>{}} tracked={new Set()} toggleTrack={()=>{}} onClose={()=>setModal(null)}/>}
    </div>
  );
}

/* ─── HomeFeed — redesigned hero page ──────────────────────────────────────────── */

export function HomeFeed({ isMobile, setPage, setRecoInit, recsReceived, setRecsReceived, configs, holdings, contacts, me, assetClasses, setAssetClasses, groups, setRecsMade, tracked, toggleTrack, effectiveFeedConfig, networkEngagementRecos, setNetworkEngagementRecos, publicFeedRecos=[], setPublicFeedRecos, feedConfigOptions, userFeedPrefs, setUserFeedPrefs, globalSearch, connections=[], onPeopleConnect, onShowInvite, onOpenSecurity }) {
  const { total, pnl, pnlPct } = useDerivedHoldings(holdings, configs.allowCryptoAccounts);
  const firstName = me?.firstName || me?.name?.split(' ')[0] || 'there';
  const [showNewReco,    setShowNewReco]    = useState(false);
  const [mobileFeedTab,  setMobileFeedTab]  = useState('feed'); // 'feed' | 'pulse'
  // Merged pool for Pulse widgets: direct deliveries + public platform recommendations
  // Deduped so items already in recsReceived don't appear twice.
  const allFeedRecos = useMemo(() => {
    const seenIds = new Set(recsReceived.map(r => r.id));
    return [
      ...recsReceived,
      ...publicFeedRecos.filter(r => !seenIds.has(r.id)),
    ];
  }, [recsReceived, publicFeedRecos]);

  // Pulse badge count: missed opportunities (untracked, risen >3%) + tracked movers (±7%)
  // Capped at 5; badge disappears when user is already on Pulse tab.
  const pulseCountRaw = allFeedRecos.filter(r =>
    !r.hidden && r.priceAt > 0 && (
      (!tracked.has(r.id) && (r.price - r.priceAt) / r.priceAt > 0.03) ||
      (tracked.has(r.id) && Math.abs((r.price - r.priceAt) / r.priceAt) > 0.07)
    )
  ).length;
  const pulseCount    = Math.min(pulseCountRaw, 5);
  const pulseBadgeText = pulseCount >= 5 ? '5+' : pulseCount > 0 ? String(pulseCount) : null;
  const showPulseBadge = !!pulseBadgeText && mobileFeedTab !== 'pulse';
  const [loadedCount,  setLoadedCount]  = useState(20);
  const sentinelRef = useRef(null);

  const feedRecs = useMemo(() => {
    const cfg = effectiveFeedConfig;
    const directIds = new Set(recsReceived.map(r=>r.id));
    let items = recsReceived.filter(r=>!r.hidden).map(r=>({...r, feedSource: r.feedSource||'direct'}));

    // Source 2: recommendations liked/commented on by connections
    if (cfg.src_network_engagement) {
      const extra = networkEngagementRecos.filter(r=>!directIds.has(r.id));
      items = [...items, ...extra];
    }

    // Source 3: public recommendations from all users across the platform
    // cfg.src_public defaults to true (undefined = enabled)
    if (cfg.src_public !== false) {
      const seenIds = new Set(items.map(r=>r.id));
      const pubExtra = publicFeedRecos.filter(r => !seenIds.has(r.id));
      items = [...items, ...pubExtra];
    }

    if (cfg.filter_hide_invested) items = items.filter(r=>!r.invested);
    const contactIds = new Set((contacts||[]).map(c=>c.id));
    return items
      .map(r=>({...r, _score: scoreFeedRec(r, tracked, cfg, contactIds)}))
      .sort((a,b)=>b._score-a._score);
  }, [recsReceived, networkEngagementRecos, publicFeedRecos, tracked, effectiveFeedConfig, contacts]);

  // Search filter applied to all currently loaded items
  const visibleFeed = useMemo(() => {
    const q = (globalSearch||'').trim().toLowerCase();
    const base = feedRecs.slice(0, loadedCount);
    if (!q) return base;
    return base.filter(r =>
      r.assetName?.toLowerCase().includes(q) ||
      r.ticker?.toLowerCase().includes(q) ||
      r.byName?.toLowerCase().includes(q) ||
      contacts.find(c=>c.id===r.from)?.name?.toLowerCase().includes(q) ||
      contacts.find(c=>c.id===r.from)?.username?.toLowerCase().includes(q)
    );
  }, [feedRecs, loadedCount, globalSearch, contacts]);

  // Infinite scroll — Intersection Observer on sentinel div
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !globalSearch) setLoadedCount(n => n + 20); },
      { rootMargin: '300px' }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [globalSearch]);

  // Reset page when search changes
  useEffect(() => { setLoadedCount(20); }, [globalSearch]);

  return (
    <>
    {/* ── Mobile: header + tabs merged into one fixed block ──────────────
         Keeps Welcome, Recommend an idea, and Feed/Pulse tabs pinned
         below the topbar at ALL scroll depths. Nothing overlaps content
         because the 104px spacer below reserves the exact same height
         in the flow.                                                 ── */}
    {isMobile && !showNewReco && (
      <div style={{
        position:'fixed', top:64, left:0, right:0, zIndex:185,
        background:'var(--surface)',
        borderBottom:'2px solid var(--line)',
        boxShadow:'0 2px 8px rgba(0,0,0,.07)',
      }}>
        {/* Row 1 — Welcome greeting + Recommend button */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'10px 16px 0', gap:10,
        }}>
          <span style={{fontSize:17,fontWeight:800,letterSpacing:'-.3px',lineHeight:1.2}}>
            Welcome back, {firstName}! 👋
          </span>
          <button
            className="btn btn-pri btn-sm"
            onClick={()=>setShowNewReco(true)}
            style={{flexShrink:0}}
          >
            <Lightbulb size={14}/> Recommend
          </button>
        </div>
        {/* Row 2 — Feed / Pulse tab switcher */}
        <div role="tablist" style={{display:'flex', gap:8, padding:'8px 16px 8px'}}>
          {[
            { id:'feed',  label:'Feed',  sub:'Ideas from your network' },
            { id:'pulse', label:'Pulse', sub:'Your tracking & activity' },
          ].map(({id, label, sub})=>{
            const isActive = mobileFeedTab === id;
            return (
              <button key={id} role="tab" aria-selected={isActive}
                onClick={()=>setMobileFeedTab(id)}
                style={{
                  flex:1, height:48, border:'none', borderRadius:10,
                  fontFamily:'var(--font)', cursor:'pointer', transition:'.15s',
                  display:'flex', flexDirection:'column',
                  alignItems:'center', justifyContent:'center', gap:2,
                  background: isActive ? 'var(--accent)' : 'transparent',
                  color:      isActive ? '#fff' : 'var(--muted)',
                  padding:0,
                }}
              >
                <div style={{display:'flex', alignItems:'center', gap:5}}>
                  <span style={{fontSize:13, fontWeight:800, lineHeight:1}}>{label}</span>
                  {id==='pulse' && showPulseBadge && (
                    <span style={{
                      background: isActive ? 'rgba(255,255,255,.28)' : 'var(--grad)',
                      color:'#fff', fontSize:10, fontWeight:800,
                      borderRadius:999, padding:'1px 5px', lineHeight:1.4,
                      flexShrink:0,
                    }}>{pulseBadgeText}</span>
                  )}
                </div>
                <span style={{
                  fontSize:9, fontWeight:400, lineHeight:1,
                  color: isActive ? 'rgba(255,255,255,.72)' : 'var(--muted)',
                  letterSpacing:'.01em',
                }}>{sub}</span>
              </button>
            );
          })}
        </div>
      </div>
    )}
    {/* Spacer = fixed header height (10+32+8+48+8+2 = 108px, +4 buffer = 112px).
        Prevents the first feed card from hiding underneath the fixed header. */}
    {isMobile && !showNewReco && <div aria-hidden="true" style={{height:112,flexShrink:0}}/>}

    {/* ── Desktop: normal in-flow header ── */}
    {!isMobile && (
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:10}}>
        <span style={{fontSize:22,fontWeight:800,letterSpacing:'-.4px'}}>Welcome back, {firstName}! 👋</span>
        <button className="btn btn-pri btn-sm" onClick={()=>setShowNewReco(true)} style={{marginLeft:'auto'}}>
          <Lightbulb size={14}/> Recommend an idea
        </button>
      </div>
    )}
    <div style={{display:'flex',gap:22,alignItems:'flex-start'}}>

      {/* ── Feed column: JS-controlled visibility on mobile ── */}
      <div style={{
        flex:1, minWidth:0,
        display: isMobile && mobileFeedTab==='pulse' ? 'none' : undefined,
      }}>

        {/* Feed cards */}

        {/* Feed cards — searched via top nav bar */}
        {visibleFeed.length===0
          ? <div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:18,padding:'48px 32px',textAlign:'center',boxShadow:'var(--shadow)'}}>
              <div style={{fontSize:40,marginBottom:14}}>{globalSearch?'🔍':'🌱'}</div>
              <div style={{fontWeight:700,fontSize:17,marginBottom:8}}>
                {globalSearch?`No results for "${globalSearch}"`:'Your feed is empty'}
              </div>
              <div className="muted small" style={{marginBottom:22,maxWidth:340,margin:'0 auto 22px',lineHeight:1.6}}>
                {globalSearch?'Try a different search term.':'Add people to your network — their recommendations will appear here.'}
              </div>
              {!globalSearch&&<div style={{display:'flex',gap:10,justifyContent:'center'}}>
                <button className="btn btn-pri btn-sm" onClick={()=>setPage('network')}><Users size={14}/> Add connections</button>
                <button className="btn btn-ghost btn-sm" onClick={()=>setShowNewReco(true)}><Lightbulb size={14}/> Recommend an idea</button>
              </div>}
            </div>
          : (<>
              {visibleFeed.map(r=>(
                <FeedCard key={r.id} r={r} me={me} contacts={contacts} groups={groups}
                  setRecsReceived={setRecsReceived} setPublicFeedRecos={setPublicFeedRecos} setNetworkEngagementRecos={setNetworkEngagementRecos} tracked={tracked} toggleTrack={toggleTrack} onOpenSecurity={onOpenSecurity}/>
              ))}
              {!globalSearch && loadedCount < feedRecs.length && (
                <div ref={sentinelRef} style={{height:8,textAlign:'center',padding:'12px 0',color:'var(--muted)',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                  <Loader size={13} className="spin"/> Loading more…
                </div>
              )}
              {(globalSearch || loadedCount >= feedRecs.length) && feedRecs.length > 0 && (
                <div style={{textAlign:'center',padding:'14px 0',color:'var(--muted)',fontSize:12}}>
                  {globalSearch
                    ? `${visibleFeed.length} result${visibleFeed.length!==1?'s':''} in feed`
                    : `✓ All ${feedRecs.length} idea${feedRecs.length!==1?'s':''} loaded`}
                </div>
              )}
            </>)}
      </div>

      {/* ── Pulse column: desktop = fixed 252px aside; mobile = full-width, shown only on Pulse tab ── */}
      <div style={{
        width: isMobile ? '100%' : 252,
        flexShrink: isMobile ? 1 : 0,
        display: isMobile && mobileFeedTab==='feed' ? 'none' : undefined,
      }}>
        {/* Widget #7 — Fresh Ideas (network + public platform) */}
        <FreshWidget recsReceived={allFeedRecos} contacts={contacts} setPage={setPage}/>

        {/* Widget #6 — Tracked Summary Donut */}
        <TrackedSummaryWidget recsReceived={allFeedRecos} tracked={tracked} setPage={setPage} setRecoInit={setRecoInit}/>

        {/* Widget #5 — Missed Opportunities */}
        <MissedOppsWidget recsReceived={allFeedRecos} tracked={tracked} contacts={contacts}/>

        {/* Widget #4 — Trending on Platform */}
        <TrendingWidget recsReceived={allFeedRecos} tracked={tracked} contacts={contacts}/>

        {/* ── Market Intelligence CTA — bottom of Pulse, both mobile + desktop ── */}
        <div style={{
          background:'var(--surface)', border:'1px solid var(--line)',
          borderRadius:16, boxShadow:'var(--shadow)', padding:'16px 18px',
          marginBottom:12,
        }}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
            <TrendingUp size={16} color="var(--accent-ink)"/>
            <span style={{fontWeight:800,fontSize:13}}>Market Intelligence</span>
          </div>
          <div style={{fontSize:12,color:'var(--muted)',lineHeight:1.55,marginBottom:14}}>
            Explore community consensus, trending stocks and sentiment across all sectors.
          </div>
          <button
            className="btn btn-pri btn-sm"
            style={{width:'100%',justifyContent:'center'}}
            onClick={()=>setPage('market_intel')}
          >
            <TrendingUp size={14}/> Explore Market Intelligence →
          </button>
        </div>

        {/* ── Invite Friends CTA ── */}
        <div style={{
          background:'var(--surface)', border:'1px solid var(--line)',
          borderRadius:16, boxShadow:'var(--shadow)', padding:'16px 18px',
          marginBottom:12,
        }}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
            <UserPlus size={16} color="var(--accent-ink)"/>
            <span style={{fontWeight:800,fontSize:13}}>Invite Friends</span>
          </div>
          <div style={{fontSize:12,color:'var(--muted)',lineHeight:1.55,marginBottom:14}}>
            Share your personal invite link. Friends who join are auto-added to your circle.
          </div>
          <button
            className="btn btn-soft btn-sm"
            style={{width:'100%',justifyContent:'center'}}
            onClick={onShowInvite}
          >
            <Link size={14}/> Get My Invite Link
          </button>
        </div>
      </div>
    </div>

    {showNewReco && (
      <MakeRecoModal
        assetClasses={assetClasses} setAssetClasses={setAssetClasses}
        contacts={contacts} groups={groups} holdings={holdings} me={me}
        onClose={()=>setShowNewReco(false)}
        onCreate={(rec)=>{ setRecsMade(rs=>[rec,...rs]); setShowNewReco(false); }}
      />
    )}
  </>
  );
}
/* =================================================================== INSTRUMENTS */
// Module-level cache — loaded once per browser session from Neon

export function SecurityQuickPanel({ticker,name,allRecos=[],circleRecos=[],onOpenFull,onClose,modal=false}) {
  const community  = computeConsensus(allRecos);
  const circle     = computeConsensus(circleRecos);
  const trend      = computeTrend(circleRecos.length>=2 ? circleRecos : allRecos);
  const recent     = (circleRecos.length ? circleRecos : allRecos).slice(0,3);
  const circleUniq = [...new Map(circleRecos.map(r=>[r.from,r])).values()].slice(0,5);
  const latestPrice= allRecos.find(r=>r.current_price||r.reco_price)?.current_price || allRecos.find(r=>r.reco_price)?.reco_price;

  const content = (
    <div style={{background:'var(--surface)',overflow:'hidden'}}>

      {/* Header */}
      <div style={{padding:'14px 18px',borderBottom:'1px solid var(--line)',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div>
          <div style={{fontWeight:900,fontSize:17,lineHeight:1.2}}>{ticker}</div>
          <div style={{fontSize:12,color:'var(--muted)',marginTop:3}}>{name}</div>
          {latestPrice&&<div style={{fontSize:13,fontWeight:700,marginTop:4}}>₹{Number(latestPrice).toLocaleString('en-IN')}</div>}
        </div>
        <div style={{display:'flex',gap:6,alignItems:'flex-start'}}>
          <button className="btn btn-ghost btn-sm" style={{fontSize:11,whiteSpace:'nowrap'}} onClick={onOpenFull}>Full Page →</button>
          <button className="iconbtn" onClick={onClose}><X size={15}/></button>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{maxHeight:modal?'72vh':'calc(100vh - 180px)',overflowY:'auto',padding:'14px 18px',display:'flex',flexDirection:'column',gap:14}}>

        {/* Consensus bar */}
        {community.total>0&&(
          <div>
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--muted)',marginBottom:8}}>
              Consensus Overview <span style={{fontWeight:400}}>(All Investors)</span>
            </div>
            <div style={{display:'flex',height:10,borderRadius:6,overflow:'hidden',marginBottom:8}}>
              <div style={{width:`${community.bullPct}%`,background:'var(--gain)',transition:'width .4s'}}/>
              <div style={{width:`${community.neutralPct}%`,background:'rgba(141,144,173,.3)'}}/>
              <div style={{width:`${community.bearPct}%`,background:'var(--loss)',transition:'width .4s'}}/>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:11}}>
              <span style={{color:'var(--gain)',fontWeight:700}}>{community.bullPct}% Bullish</span>
              <span style={{color:'var(--muted)'}}>{community.neutralPct}% Neutral</span>
              <span style={{color:'var(--loss)',fontWeight:700}}>{community.bearPct}% Bearish</span>
            </div>
          </div>
        )}

        {/* My Circle vs Community comparison */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          {[['My Circle',circle,circleRecos.length],['Community',community,allRecos.length]].map(([label,c,count])=>(
            <div key={label} style={{background:'var(--surface-2)',borderRadius:10,padding:'12px 14px'}}>
              <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--muted)',marginBottom:6}}>{label}</div>
              {c.total>0?(
                <>
                  <div style={{fontSize:24,fontWeight:900,lineHeight:1,color:c.bullPct>=55?'var(--gain)':c.bearPct>=55?'var(--loss)':'var(--muted)'}}>{c.bullPct}%</div>
                  <div style={{fontSize:11,fontWeight:700,color:c.bullPct>=55?'var(--gain)':c.bearPct>=55?'var(--loss)':'var(--muted)',marginTop:2}}>{c.label}</div>
                  <div style={{fontSize:10,color:'var(--muted)',marginTop:2}}>{count} investor{count!==1?'s':''}</div>
                </>
              ):<div style={{fontSize:12,color:'var(--muted)',paddingTop:4}}>No data</div>}
            </div>
          ))}
        </div>

        {/* Avatar stack of circle investors */}
        {circleUniq.length>0&&(
          <div style={{display:'flex',alignItems:'center',gap:2}}>
            {circleUniq.map((r,i)=>(
              <div key={i} className="av" style={{width:28,height:28,fontSize:10,flexShrink:0,
                marginLeft:i?-8:0,border:'2px solid var(--surface)',background:'var(--grad)',zIndex:5-i}}>
                {initialsOf(r.full_name||r.username||'?')}
              </div>
            ))}
            {circleRecos.length>5&&<span style={{fontSize:11,color:'var(--muted)',marginLeft:12}}>+{circleRecos.length-5}</span>}
          </div>
        )}

        {/* Recommended by */}
        {recent.length>0&&(
          <div>
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--muted)',marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span>Recommended by {circleRecos.length?'(My Circle)':'(Community)'}</span>
              {(circleRecos.length||allRecos.length)>3&&(
                <button className="btn btn-ghost btn-sm" style={{fontSize:10,padding:'2px 8px'}} onClick={onOpenFull}>
                  View All {circleRecos.length||allRecos.length}
                </button>
              )}
            </div>
            {recent.map((r,i)=>{
              const isBuy=r.recommendation_type==='Buy';
              return (
                <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 0',borderBottom:i<recent.length-1?'1px solid var(--line)':'none'}}>
                  <div className="av" style={{width:30,height:30,fontSize:11,flexShrink:0,background:'var(--grad)'}}>{initialsOf(r.full_name||r.username||'?')}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.full_name||r.username||'Investor'}</div>
                    {r.conviction&&<div style={{fontSize:10,color:'var(--muted)'}}>{r.conviction}</div>}
                  </div>
                  <span style={{fontSize:10,color:'var(--muted)',flexShrink:0}}>
                    {r.created_at?new Date(r.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'}):''}
                  </span>
                  <span style={{fontSize:10,fontWeight:800,padding:'2px 8px',borderRadius:4,flexShrink:0,
                    background:isBuy?'var(--gain-soft)':'var(--loss-soft)',color:isBuy?'var(--gain)':'var(--loss)'}}>
                    {isBuy?'BUY':'SELL'}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Consensus trend chart */}
        {trend.length>=2&&(
          <div>
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--muted)',marginBottom:4,display:'flex',justifyContent:'space-between'}}>
              <span>Consensus Trend {circleRecos.length>=2?'(My Circle)':'(Community)'}</span>
              <span style={{fontWeight:900,color:circle.bullPct>=55?'var(--gain)':circle.bearPct>=55?'var(--loss)':'var(--muted)'}}>{trend[trend.length-1]}%</span>
            </div>
            <SparkLine data={trend} color={circle.bullPct>=55?'var(--gain)':circle.bearPct>=55?'var(--loss)':'#8d90ad'} height={55}/>
          </div>
        )}

        {/* AI Insight summary */}
        {allRecos.length>=2&&(
          <div style={{padding:'12px 14px',background:'var(--accent-soft)',borderRadius:10,borderLeft:'3px solid var(--accent-ink)'}}>
            <div style={{fontSize:11,fontWeight:800,color:'var(--accent-ink)',marginBottom:5,display:'flex',alignItems:'center',gap:6}}>
              <Lightbulb size={13}/> AI Insight Summary
            </div>
            <div style={{fontSize:12,color:'var(--ink-soft)',lineHeight:1.55}}>
              {ticker} is seeing <strong>{community.label.toLowerCase()}</strong> sentiment from {community.total} investor{community.total!==1?'s':''}.
              {community.bullPct>=60?' Strong buy conviction from the community.' :
               community.bearPct>=60?' Investors are flagging caution on this stock.' :
               ' Community opinion is mixed — review individual theses below.'}
            </div>
          </div>
        )}

        <button className="btn btn-pri" style={{width:'100%',justifyContent:'center'}} onClick={onOpenFull}>
          View Stock Insights →
        </button>

        {allRecos.length===0&&(
          <div style={{textAlign:'center',padding:'8px 0',color:'var(--muted)',fontSize:13}}>No recommendations for {ticker} yet.</div>
        )}
      </div>
    </div>
  );

  if (modal) return (
    <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',flexDirection:'column',justifyContent:'flex-end'}} onClick={onClose}>
      <div style={{background:'var(--surface)',borderRadius:'20px 20px 0 0',boxShadow:'0 -8px 40px rgba(0,0,0,.35)',overflow:'hidden'}} onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,background:'var(--line-2)',borderRadius:2,margin:'12px auto 4px'}}/>
        {content}
      </div>
    </div>
  );

  return (
    <div style={{position:'sticky',top:80,background:'var(--surface)',borderRadius:12,border:'1px solid var(--line-2)',overflow:'hidden',boxShadow:'0 4px 24px rgba(0,0,0,.08)'}}>
      {content}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PORTFOLIO INTELLIGENCE
   ═══════════════════════════════════════════════════════════════════ */

export function MarketIntelligencePage({ contacts, me, onOpenSecurity }) {
  const isMobile = useIsMobile();
  const [recos, setRecos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all'); // all | circle | community | verified
  const [sector, setSector] = useState('all');
  const [period, setPeriod] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [expandedTicker, setExpandedTicker] = useState(null); // inline row expansion

  const circleIds = useMemo(()=>contacts.map(c=>c.id),[contacts]);

  useEffect(()=>{
    // Only public recommendations contribute to community-wide market intelligence.
    dbGetConsensusRecosPublic()
      .then(rows=>{ setRecos(rows); setLoading(false); })
      .catch(e=>{ console.warn('Market Intel SQL error:',e?.message||e); setLoading(false); });
  },[]);

  // Group by ticker
  const tickerMap = useMemo(()=>{
    const byT={};
    recos.forEach(r=>{
      if (!byT[r.ticker]) byT[r.ticker]={ticker:r.ticker,name:r.asset_name||r.ticker,sector:r.sector||'',recos:[]};
      byT[r.ticker].recos.push(r);
    });
    return byT;
  },[recos]);

  const allTickers = useMemo(()=>Object.values(tickerMap).map(t=>{
    const filtered = tab==='circle'    ? t.recos.filter(r=>circleIds.includes(r.from))
                   : tab==='community' ? t.recos
                   : t.recos; // 'all'
    const community  = computeConsensus(t.recos);
    const circle     = computeConsensus(t.recos.filter(r=>circleIds.includes(r.from)));
    const tabCons    = computeConsensus(filtered);
    return {...t, community, circle, tabCons, filteredRecos:filtered};
  }).filter(t=>t.filteredRecos.length>0
    && (sector==='all'||t.sector===sector)
    && (!search||t.ticker.includes(search.toUpperCase())||t.name.toLowerCase().includes(search.toLowerCase()))
  ).sort((a,b)=>b.filteredRecos.length-a.filteredRecos.length),[tickerMap,tab,circleIds,sector,search]);

  // Discovery cards
  const strongest   = [...allTickers].sort((a,b)=>b.tabCons.strength-a.tabCons.strength)[0];
  const emerging    = [...allTickers].filter(t=>t.filteredRecos.length>=2&&t.filteredRecos.length<=5).sort((a,b)=>b.tabCons.bullPct-a.tabCons.bullPct)[0];
  const mostDiscussed= [...allTickers].sort((a,b)=>b.filteredRecos.length-a.filteredRecos.length)[0];
  const mostDivided = [...allTickers].filter(t=>t.tabCons.total>=3).sort((a,b)=>Math.abs(50-b.tabCons.bullPct)-Math.abs(50-a.tabCons.bullPct))[0];

  const sectors = ['all',...[...new Set(recos.map(r=>r.sector).filter(Boolean))]];
  const selData  = selectedTicker ? tickerMap[selectedTicker] : null;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Intelligence</div>
          <div className="page-title">Market Intelligence</div>
          <div className="page-sub">Track market sentiment and investor conviction across stocks and sectors</div>
        </div>
        {loading&&<Loader size={16} className="spin" style={{color:'var(--muted)'}}/>}
      </div>

      {/* Discovery cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12,marginBottom:20}}>
        {[
          {label:'Strongest Consensus',   icon:<Target size={16}/>,      item:strongest},
          {label:'Biggest Conviction Increase', icon:<Zap size={16}/>,  item:emerging},
          {label:'Most Discussed',        icon:<MessageSquare size={16}/>,item:mostDiscussed},
          {label:'Most Divided',          icon:<Activity size={16}/>,    item:mostDivided},
        ].map(({label,icon,item},i)=>item?(
          <div key={i} className="card" style={{padding:'14px 16px',cursor:'pointer',minWidth:0}} onClick={()=>setSelectedTicker(item.ticker)}>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
              <span style={{color:'var(--accent-ink)',opacity:.7}}>{icon}</span>
              <span style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--muted)'}}>{label}</span>
            </div>
            <div style={{fontWeight:900,fontSize:18,marginBottom:3}}>{item.ticker}</div>
            <div style={{fontSize:12,color:item.tabCons.bullPct>=55?'var(--gain)':item.tabCons.bearPct>=55?'var(--loss)':'var(--muted)',fontWeight:700,marginBottom:6}}>
              {item.tabCons.bullPct>=55?'+':''}{item.tabCons.bullPct}% {item.tabCons.label}
            </div>
            <SparkLine
              data={computeTrend(item.filteredRecos)}
              color={item.tabCons.bullPct>=55?'var(--gain)':item.tabCons.bearPct>=55?'var(--loss)':'#8d90ad'}
              height={36}
            />
            <div style={{fontSize:11,color:'var(--muted)',marginTop:4}}>{item.filteredRecos.length} investor{item.filteredRecos.length!==1?'s':''}</div>
          </div>
        ):null)}
      </div>

      {/* Filters + tabs */}
      <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap',marginBottom:16}}>
        <div className="seg">
          {[['all','All Stocks'],['circle','My Circle'],['community','Community']].map(([v,l])=>(
            <button key={v} className={tab===v?'active':''} onClick={()=>setTab(v)}>{l}</button>
          ))}
        </div>
        <select className="rte-select" value={sector} onChange={e=>setSector(e.target.value)} style={{height:32}}>
          {sectors.map(s=><option key={s} value={s}>{s==='all'?'All Sectors':s}</option>)}
        </select>
        <div style={{position:'relative',flex:1,maxWidth:220}}>
          <Search size={14} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--muted)'}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search stocks…"
            style={{width:'100%',paddingLeft:30,height:32,border:'1px solid var(--line-2)',borderRadius:8,fontSize:13,outline:'none',background:'var(--surface)',color:'var(--ink)'}}/>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:selData&&!isMobile?'1fr 340px':'1fr',gap:16,alignItems:'start'}}>
        <div className="card">
          {isMobile ? (
            /* ── Mobile: asset card list ── */
            <div style={{display:'flex',flexDirection:'column',gap:0}}>
              {allTickers.slice(0,30).map(t=>(
                <div key={t.ticker} onClick={()=>setSelectedTicker(prev=>prev===t.ticker?null:t.ticker)}
                  style={{padding:'13px 16px',borderBottom:'1px solid var(--line)',cursor:'pointer',background:selectedTicker===t.ticker?'var(--accent-soft)':'transparent',transition:'background .12s'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                    <div style={{minWidth:0,flex:1}}>
                      <div style={{fontWeight:800,fontSize:14}}>{t.ticker}</div>
                      <div style={{fontSize:11,color:'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.name}</div>
                      {t.sector&&<div style={{fontSize:10,color:'var(--muted)'}}>{t.sector}</div>}
                    </div>
                    <div style={{textAlign:'right',flexShrink:0,marginLeft:10}}>
                      <span style={{fontSize:12,color:t.community.bullPct>=55?'var(--gain)':t.community.bearPct>=55?'var(--loss)':'var(--muted)',fontWeight:700}}>
                        {t.community.bullPct>=55?'↑ Bullish':t.community.bearPct>=55?'↓ Bearish':'→ Neutral'}
                      </span>
                      <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{t.filteredRecos.length} investor{t.filteredRecos.length!==1?'s':''}</div>
                    </div>
                  </div>
                  {t.community.total>0&&(
                    <div style={{marginBottom:4}}>
                      <div style={{fontSize:10,color:'var(--muted)',marginBottom:3}}>Community</div>
                      <ConsensusBar cons={t.community} width={'100%'} mini/>
                    </div>
                  )}
                  {t.circle.total>0&&(
                    <div style={{marginBottom:4}}>
                      <div style={{fontSize:10,color:'var(--muted)',marginBottom:3}}>My circle</div>
                      <ConsensusBar cons={t.circle} width={'100%'} mini/>
                    </div>
                  )}
                  {t.community.total===0&&t.circle.total===0&&(<div style={{fontSize:11,color:'var(--muted)',fontStyle:'italic',marginBottom:4}}>No recommendations yet</div>)}
                  <div style={{display:'flex',justifyContent:'flex-end',marginTop:6}}>
                    <button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={e=>{e.stopPropagation();onOpenSecurity(t.ticker,t.name);}}>
                      <ChevronRight size={13}/> Security Intel
                    </button>
                  </div>
                </div>
              ))}
              {allTickers.length===0&&(<div style={{padding:'32px 16px',textAlign:'center',color:'var(--muted)',fontSize:13}}>No stocks match current filters.</div>)}
            </div>
          ) : (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{borderBottom:'2px solid var(--line)'}}>
                  {['Stock','My Circle Consensus','Community Consensus','Trend (7d)','Investors','Avg Credibility','Action'].map((h,i)=>(
                    <th key={i} style={{padding:'10px 14px',textAlign:i===0?'left':'center',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',color:'var(--muted)',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allTickers.slice(0,30).map(t=>{
                  const sel      = t.ticker===selectedTicker;
                  const expanded = t.ticker===expandedTicker;
                  const avgIci   = null; // ici_score not a confirmed DB column — show '—'
                  const toggleExpand = e => { e.stopPropagation(); setExpandedTicker(expanded?null:t.ticker); };
                  return (
                    <React.Fragment key={t.ticker}>
                      <tr onClick={()=>setSelectedTicker(sel?null:t.ticker)}
                        style={{borderBottom:expanded?'none':'1px solid var(--line)',cursor:'pointer',background:sel?'var(--accent-soft)':'transparent',transition:'background .12s'}}>
                        <td style={{padding:'12px 14px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:10}}>
                            <div className="av" style={{width:32,height:32,fontSize:11,flexShrink:0,background:'var(--grad)'}}>{t.ticker.slice(0,2)}</div>
                            <div>
                              <div style={{fontWeight:800,fontSize:14}}>{t.ticker}</div>
                              <div style={{fontSize:11,color:'var(--muted)',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.name}</div>
                              {t.sector&&<div style={{fontSize:10,color:'var(--muted)'}}>{t.sector}</div>}
                            </div>
                          </div>
                        </td>
                        <td style={{padding:'12px 14px',textAlign:'center',minWidth:130}}><ConsensusBar cons={t.circle} width={110}/></td>
                        <td style={{padding:'12px 14px',textAlign:'center',minWidth:130}}><ConsensusBar cons={t.community} width={110}/></td>
                        <td style={{padding:'12px 14px',textAlign:'center'}}>
                          <span style={{fontSize:12,color:t.community.bullPct>=55?'var(--gain)':t.community.bearPct>=55?'var(--loss)':'var(--muted)',fontWeight:700}}>
                            {t.community.bullPct>=55?'↑':t.community.bearPct>=55?'↓':'→'}
                            {' '}{t.community.bullPct>=55?'Bullish':t.community.bearPct>=55?'Bearish':'Neutral'}
                          </span>
                        </td>
                        <td style={{padding:'12px 14px',textAlign:'center'}}>
                          <div style={{fontWeight:700,fontSize:16}}>{t.filteredRecos.length}</div>
                          <div style={{fontSize:10,color:'var(--muted)'}}>investors</div>
                        </td>
                        <td style={{padding:'12px 14px',textAlign:'center'}}>
                          <div style={{fontWeight:700,fontSize:16,color:'var(--accent-ink)'}}>{avgIci||'—'}</div>
                          <div style={{fontSize:10,color:'var(--muted)'}}>ICI avg</div>
                        </td>
                        <td style={{padding:'12px 14px',textAlign:'center'}}>
                          <div style={{display:'flex',gap:4,justifyContent:'center'}}>
                            <button className="iconbtn" title={expanded?'Collapse':'Who recommended'} onClick={toggleExpand}
                              style={{color:expanded?'var(--accent-ink)':'var(--muted)'}}>
                              <ChevronDown size={15} style={{transform:expanded?'rotate(180deg)':'none',transition:'transform .2s'}}/>
                            </button>
                            <button className="iconbtn" title="Stock Insights" onClick={e=>{e.stopPropagation();onOpenSecurity(t.ticker,t.name);}}><ChevronRight size={16}/></button>
                          </div>
                        </td>
                      </tr>
                      {expanded&&(
                        <tr style={{borderBottom:'1px solid var(--line)',background:'var(--surface-2)'}}>
                          <td colSpan={7} style={{padding:'0 14px 14px 60px'}}>
                            <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--muted)',margin:'10px 0 8px'}}>
                              Who recommended — {t.filteredRecos.length} investor{t.filteredRecos.length!==1?'s':''}
                            </div>
                            <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                              {t.filteredRecos.map((r,i)=>{
                                const inCircle = circleIds.includes(r.from);
                                const isBuy    = r.recommendation_type==='Buy';
                                return (
                                  <div key={i} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px',
                                    background:'var(--surface)',borderRadius:8,border:'1px solid var(--line-2)',fontSize:12}}>
                                    <div className="av" style={{width:22,height:22,fontSize:9,flexShrink:0,background:'var(--grad)'}}>
                                      {initialsOf(r.full_name||r.username||'?')}
                                    </div>
                                    <span style={{fontWeight:600,maxWidth:110,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                      {r.full_name||r.username||'Investor'}
                                    </span>
                                    {inCircle&&<span style={{fontSize:9,background:'var(--accent-soft)',color:'var(--accent-ink)',borderRadius:3,padding:'1px 4px',fontWeight:700}}>Circle</span>}
                                    <span style={{fontSize:10,fontWeight:800,padding:'2px 6px',borderRadius:4,
                                      background:isBuy?'var(--gain-soft)':'var(--loss-soft)',color:isBuy?'var(--gain)':'var(--loss)'}}>
                                      {isBuy?'BUY':'SELL'}
                                    </span>
                                    {r.conviction&&<span style={{fontSize:10,color:'var(--muted)'}}>{r.conviction}</span>}
                                    <span style={{fontSize:10,color:'var(--muted)'}}>
                                      {r.created_at?new Date(r.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'}):''}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {allTickers.length===0&&!loading&&<tr><td colSpan={7} style={{padding:'32px',textAlign:'center',color:'var(--muted)',fontSize:14}}>{recos.length===0?'No recommendations on the platform yet.':'No results match your filters.'}</td></tr>}
              </tbody>
            </table>
          </div>
          ) /* end isMobile ternary */}
        </div>

        {selData&&(
          isMobile
            ? <SecurityQuickPanel ticker={selData.ticker} name={selData.name} allRecos={selData.recos} circleRecos={selData.recos.filter(r=>circleIds.includes(r.from))} onOpenFull={()=>onOpenSecurity(selData.ticker,selData.name)} onClose={()=>setSelectedTicker(null)} modal/>
            : <SecurityQuickPanel ticker={selData.ticker} name={selData.name} allRecos={selData.recos} circleRecos={selData.recos.filter(r=>circleIds.includes(r.from))} onOpenFull={()=>onOpenSecurity(selData.ticker,selData.name)} onClose={()=>setSelectedTicker(null)}/>
        )}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECURITY INTELLIGENCE
   ═══════════════════════════════════════════════════════════════════ */

export function SecurityIntelligencePage({ securityTicker, contacts, me, onOpenSecurity }) {
  const isMobile = useIsMobile();
  const { ticker, name } = securityTicker || {};
  const [recos, setRecos]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab]         = useState('consensus'); // consensus | timeline | investors | stats | ai
  const [aiSummary, setAiSummary] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [investorIcis, setInvestorIcis] = useState({}); // uid → {score,band}

  const circleIds = useMemo(()=>contacts.map(c=>c.id),[contacts]);

  // Fetch real ICI scores for all investors when recos loads
  useEffect(()=>{
    if (!recos.length) return;
    const uids = [...new Set(recos.map(r=>r.from).filter(Boolean))];
    if (!uids.length) return;
    dbGetInvestorIciBatch(uids)
      .then(rows=>{
        const scores = {};
        rows.forEach(row=>{
          const hitPct  = row.closed > 0 ? (row.wins / row.closed * 100) : 0;
          const riskAdj = Number(row.ret_stddev) > 0 ? Math.max(Number(row.median_ret) / Number(row.ret_stddev), 0) : 0;
          scores[row.uid] = computeIci({
            years_history:        Number(row.years_history) || 0,
            total:                row.total,
            hit_rate_pct:         hitPct,
            median_return:        Number(row.median_ret)  || 0,
            risk_adjusted_return: riskAdj,
            deleted_count:        0,
          });
        });
        setInvestorIcis(scores);
      })
      .catch(()=>{});
  },[recos]);

  useEffect(()=>{
    if (!ticker) return;
    setLoading(true); setRecos([]);
    dbGetTickerRecos(ticker)
      .then(rows=>{ setRecos(rows); setLoading(false); })
      .catch(()=>setLoading(false));
  },[ticker]);


  // stats useMemo hoisted above early return to comply with React Rules of Hooks.
  // (hooks must be called in the same order on every render; early returns violate this)
  const stats = useMemo(()=>{
    if (!recos.length) return null;
    const byMonth = {};
    // Neon returns timestamp columns as Date objects — must stringify before .slice()
    const toIso = v => v instanceof Date ? v.toISOString() : String(v||'');
    recos.forEach(r=>{
      const mo = toIso(r.created_at).slice(0,7);
      if (!mo) return;
      if (!byMonth[mo]) byMonth[mo]={mo,buy:0,sell:0};
      if (r.recommendation_type==='Buy') byMonth[mo].buy++; else byMonth[mo].sell++;
    });
    const months = Object.values(byMonth).sort((a,b)=>a.mo.localeCompare(b.mo));
    const convMap = {};
    recos.forEach(r=>{ if(r.conviction) convMap[r.conviction]=(convMap[r.conviction]||0)+1; });
    const firstDate = recos[recos.length-1]?.created_at;
    const activeR  = recos;
    const exitedR  = [];  // status column not in schema
    return { months, convMap, firstDate, total:recos.length, active:activeR.length, exited:exitedR.length };
  },[recos]);

  if (!ticker) return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Insights</div>
          <div className="page-title">Stock Insights</div>
        </div>
      </div>

      {/* ── Discovery landing ── */}
      <div style={{maxWidth:540,margin:'0 auto',padding:'40px 16px 0'}}>
        {/* Search box — large and prominent */}
        <div style={{background:'var(--surface)',border:'2px solid var(--accent)',borderRadius:16,padding:'4px 8px 4px 16px',display:'flex',alignItems:'center',gap:10,marginBottom:24,boxShadow:'0 4px 24px rgba(109,93,245,.12)'}}>
          <Search size={20} color="var(--accent)" style={{flexShrink:0}}/>
          <div style={{flex:1}}>
            <InstrumentSearch
              onSelect={inst=>{ if(inst&&onOpenSecurity) onOpenSecurity(inst.symbol,inst.name); }}
              placeholder="Search any stock or ETF — e.g. RELIANCE, HDFC Bank…"
            />
          </div>
        </div>

        {/* Instructional copy */}
        <div style={{textAlign:'center',padding:'0 8px'}}>
          <div style={{fontSize:15,fontWeight:700,marginBottom:10,color:'var(--ink)'}}>Discover any security's community intelligence</div>
          <div style={{fontSize:13,color:'var(--muted)',lineHeight:1.7}}>
            Type any stock name or ticker above to instantly explore community consensus,
            investor conviction trends, and who on myInvestorCircle is tracking it —
            and whether they're bullish or bearish.
          </div>
          <div style={{fontSize:12,color:'var(--muted)',marginTop:16,padding:'10px 14px',background:'var(--surface-2)',borderRadius:10,lineHeight:1.6}}>
            💡 You can also arrive here by clicking the <strong>ChevronRight →</strong> or
            <strong> Full Page</strong> button on any security in
            <strong> Portfolio Intelligence</strong> or <strong>Market Intelligence</strong>.
            Once a security is open, use the search bar above to switch to any other asset.
          </div>
        </div>
      </div>
    </>
  );

  // No status filter - column not confirmed in schema; show all recommendations
  const activeRecos  = recos;  // all fetched recos are current (no status column)
  const circleRecos  = recos.filter(r=>circleIds.includes(r.from));
  const community    = computeConsensus(activeRecos);
  const circle       = computeConsensus(circleRecos);

  // Stats computation
  // AI summary — deterministic analysis from recommendation data
  const buildAiSummary = () => {
    if (aiSummary || aiLoading || !recos.length) return;
    setAiLoading(true);
    const activeR = recos;
    const bullR   = activeR.filter(r=>r.recommendation_type==='Buy');
    const bearR   = activeR.filter(r=>r.recommendation_type==='Sell');
    const theses  = activeR.filter(r=>r.thesis).map(r=>getThesisText(r.thesis));
    // Simulate a brief async "analysis" then show structured summary
    setTimeout(()=>{
      const bullThemes = bullR.slice(0,3).map(r=>getThesisText(r.thesis)||null).filter(Boolean);
      const bearThemes = bearR.slice(0,3).map(r=>getThesisText(r.thesis)||null).filter(Boolean);
      const community  = computeConsensus(activeR);
      const sentiment  = community.bullPct>=70?'strongly bullish':community.bullPct>=55?'moderately bullish':community.bearPct>=70?'strongly bearish':community.bearPct>=55?'cautious':'divided';
      setAiSummary({
        sentiment, community,
        bullThemes: bullThemes.length ? bullThemes : (bullR.length ? [`${bullR.length} investor${bullR.length>1?'s':''} tracking as a Buy opportunity`] : []),
        bearThemes: bearThemes.length ? bearThemes : (bearR.length ? [`${bearR.length} investor${bearR.length>1?'s':''} flagging caution`] : ['No bearish recommendations on record']),
        highConv:  activeR.filter(r=>r.conviction==='High Conviction'||r.conviction==='Very High').length,
        uniqueInv: new Set(activeR.map(r=>r.from)).size,
      });
      setAiLoading(false);
    }, 800);
  };
  const investorMap = {};  // keyed by recommender uid — populated below
  recos.forEach(r=>{
    if (!investorMap[r.from]) investorMap[r.from] = {...r};
  });
  const investors = Object.values(investorMap);
  const inCircle  = investors.filter(r=>circleIds.includes(r.from));
  const notCircle = investors.filter(r=>!circleIds.includes(r.from));

  return (
    <>
      <div className="page-head" style={{alignItems:'flex-start'}}>
        <div style={{flex:1}}>
          <div className="eyebrow">Stock Insights</div>
          <div style={{display:'flex',alignItems:'baseline',gap:14,flexWrap:'wrap'}}>
            <div className="page-title">{ticker}</div>
            <div style={{fontSize:16,color:'var(--muted)',fontWeight:400}}>{name}</div>
          </div>
          <div className="page-sub">{activeRecos.length} active recommendation{activeRecos.length!==1?'s':''} · {investors.length} investor{investors.length!==1?'s':''} tracking</div>
        </div>
        {loading&&<Loader size={16} className="spin" style={{color:'var(--muted)'}}/>}
      </div>

      {/* ── Switch-security search — compact bar for navigating to another asset ── */}
      <div style={{
        display:'flex', alignItems:'center', gap:10,
        background:'var(--surface-2)', border:'1px solid var(--line)',
        borderRadius:12, padding:'4px 8px 4px 12px', marginBottom:20,
        maxWidth: isMobile ? '100%' : 420,
      }}>
        <Search size={14} color="var(--muted)" style={{flexShrink:0}}/>
        <div style={{flex:1,fontSize:13}}>
          <InstrumentSearch
            onSelect={inst=>{ if(inst&&onOpenSecurity) onOpenSecurity(inst.symbol,inst.name); }}
            placeholder={`Switch security — type any stock or ETF…`}
          />
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:12,marginBottom:20}}>
        {[['Community Consensus',community,'All Investors on MIC'],['My Circle Consensus',circle,`${circleIds.length} connections`]].map(([label,cons,sub])=>(
          <div key={label} className="card" style={{padding:'20px 22px'}}>
            <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--muted)',marginBottom:12}}>{label}</div>
            {cons.total>0?(
              <>
                <div style={{fontSize:32,fontWeight:900,color:cons.bullPct>=55?'var(--gain)':cons.bearPct>=55?'var(--loss)':'var(--muted)',marginBottom:4}}>{cons.bullPct}%<span style={{fontSize:16,fontWeight:400,color:'var(--muted)'}}> Bullish</span></div>
                <ConsensusBar cons={cons} width={'100%'}/>
                <div style={{fontSize:12,color:'var(--muted)',marginTop:8}}>{sub}</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginTop:12}}>
                  {[['Buy',cons.bull,'var(--gain)'],['Neutral',cons.neutral,'var(--muted)'],['Sell',cons.bear,'var(--loss)']].map(([l,v,c])=>(
                    <div key={l} style={{textAlign:'center',padding:'8px',background:'var(--surface-2)',borderRadius:8}}>
                      <div style={{fontSize:18,fontWeight:900,color:c}}>{v}</div>
                      <div style={{fontSize:10,color:'var(--muted)',fontWeight:700}}>{l}</div>
                    </div>
                  ))}
                </div>
              </>
            ):<div style={{fontSize:13,color:'var(--muted)',paddingTop:8}}>{sub==='All Investors on MIC'?'No recommendations on platform yet':'None of your connections have recommended this'}</div>}
          </div>
        ))}
      </div>

      {/* Tabs */}
      {/* ── Tabs — prominent pill bar with icons ── */}
      <div style={{display:'flex',gap:6,marginBottom:20,overflowX:'auto',padding:'2px 0',WebkitOverflowScrolling:'touch'}}>
        {[
          ['consensus', 'Consensus',    <Activity size={14}/> ],
          ['timeline',  'Rec. History', <Clock size={14}/>    ],
          ['investors', 'Investors',    <Users size={14}/>    ],
          ['stats',     'Statistics',   <BarChart2 size={14}/>],
          ['ai',        'AI Summary',   <Sparkles size={14}/>],
        ].map(([v,l,icon])=>(
          <button key={v}
            onClick={()=>{ setTab(v); if(v==='ai') buildAiSummary(); }}
            style={{
              display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap',
              padding:'8px 14px', borderRadius:10, border:'none', cursor:'pointer',
              fontSize:13, fontWeight:tab===v?700:500,
              background: tab===v ? 'var(--accent)' : 'var(--surface-2)',
              color:       tab===v ? '#fff'          : 'var(--muted)',
              boxShadow:   tab===v ? '0 2px 8px rgba(109,93,245,.3)' : 'none',
              transition:'background .15s,color .15s,box-shadow .15s',
              flexShrink: 0,
            }}
          >{icon}{l}</button>
        ))}
      </div>

      {/* Tab: Consensus */}
      {tab==='consensus'&&(
        <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:16}}>
          {/* Strength gauge */}
          <div className="card">
            <div className="card-head"><Target size={15}/> Consensus Strength</div>
            <div className="card-body" style={{textAlign:'center',padding:'24px'}}>
              <div style={{fontSize:64,fontWeight:900,color:community.strength>=65?'var(--gain)':community.strength>=40?'#fbbf24':'var(--muted)',lineHeight:1,marginBottom:8}}>
                {community.strength}
              </div>
              <div style={{fontSize:14,fontWeight:700,color:'var(--ink)',marginBottom:4}}>{community.label}</div>
              <div style={{fontSize:12,color:'var(--muted)',marginBottom:20}}>out of 100 — based on {community.total} active recommendations</div>
              <div style={{height:8,borderRadius:6,overflow:'hidden',background:'var(--line)',position:'relative'}}>
                <div style={{position:'absolute',left:0,top:0,height:'100%',width:`${community.strength}%`,
                  background:`linear-gradient(90deg,var(--gain),${community.strength>=65?'var(--gain)':'#fbbf24'})`,transition:'width .6s'}}/>
              </div>
            </div>
          </div>
          {/* Circle vs Community */}
          <div className="card">
            <div className="card-head"><Globe size={15}/> Circle vs Community</div>
            <div className="card-body" style={{display:'flex',flexDirection:'column',gap:16,padding:'16px 18px'}}>
              {[['My Circle',circle],['Community',community]].map(([l,c])=>(
                <div key={l}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                    <span style={{fontSize:13,fontWeight:600}}>{l}</span>
                    <span style={{fontSize:13,fontWeight:700,color:c.bullPct>=55?'var(--gain)':c.bearPct>=55?'var(--loss)':'var(--muted)'}}>{c.label}</span>
                  </div>
                  <ConsensusBar cons={c} width={'100%'}/>
                  <div style={{fontSize:12,color:'var(--muted)',marginTop:6}}>{c.total} investor{c.total!==1?'s':''}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Recommendation History */}
      {tab==='timeline'&&(
        <div className="card">
          <div className="card-head"><Clock size={15}/> Recommendation History <span style={{fontSize:11,color:'var(--muted)',fontWeight:400,marginLeft:4}}>(immutable — all calls are permanent)</span></div>
          {recos.length===0&&!loading?(
            <div style={{padding:'32px',textAlign:'center',color:'var(--muted)',fontSize:14}}>No recommendations for {ticker} yet.</div>
          ):(
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{borderBottom:'2px solid var(--line)'}}>
                    {['Investor','Type','Date','Entry Price','Conviction','Status'].map((h,i)=>(
                      <th key={i} style={{padding:'10px 14px',textAlign:i===0?'left':'center',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',color:'var(--muted)'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recos.map(r=>{
                    const inMyCircle = circleIds.includes(r.from);
                    return (
                      <tr key={r.id} style={{borderBottom:'1px solid var(--line)'}}>
                        <td style={{padding:'12px 14px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <div className="av" style={{width:30,height:30,fontSize:11,flexShrink:0,background:'var(--grad)'}}>{initialsOf(r.full_name||r.username||'?')}</div>
                            <div>
                              <div style={{fontWeight:700,fontSize:13}}>{r.full_name||r.username||'Anonymous'}</div>
                              {inMyCircle&&<span style={{fontSize:9,fontWeight:800,padding:'2px 6px',borderRadius:4,background:'var(--accent-soft)',color:'var(--accent-ink)',textTransform:'uppercase',letterSpacing:'.05em'}}>My Circle</span>}
                            </div>
                          </div>
                        </td>
                        <td style={{padding:'12px 14px',textAlign:'center'}}>
                          <span style={{fontSize:11,fontWeight:800,padding:'3px 9px',borderRadius:5,
                            background:r.recommendation_type==='Buy'?'var(--gain-soft)':'var(--loss-soft)',
                            color:r.recommendation_type==='Buy'?'var(--gain)':'var(--loss)'}}>
                            {r.recommendation_type==='Buy'?'BUY':'SELL'}
                          </span>
                        </td>
                        <td style={{padding:'12px 14px',textAlign:'center',fontSize:13,color:'var(--muted)'}}>
                          {r.created_at?new Date(r.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—'}
                        </td>
                        <td style={{padding:'12px 14px',textAlign:'center',fontSize:13,fontWeight:600}}>
                          {r.reco_price?`₹${Number(r.reco_price).toLocaleString('en-IN')}`:'—'}
                        </td>
                        <td style={{padding:'12px 14px',textAlign:'center'}}><ConvBadge level={r.conviction}/></td>
                        <td style={{padding:'12px 14px',textAlign:'center'}}>
                          <span style={{fontSize:11,fontWeight:700,padding:'3px 9px',borderRadius:5,
                            background:'var(--gain-soft)',color:'var(--gain)'}}>
                            Active
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Investors */}
      {tab==='investors'&&(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {[['In My Circle', inCircle, true], ['Community', notCircle, false]].map(([label, list, isCircle])=>(
            list.length > 0 && (
              <div key={label} className="card">
                <div className="card-head">
                  {isCircle ? <Users size={15}/> : <Globe size={15}/>} {label} ({list.length})
                </div>
                <div className="card-body" style={{display:'flex',flexDirection:'column',gap:0,padding:0}}>
                  {list.map((r,i)=>{
                    const ici = investorIcis[r.from];
                    const iciScore = ici?.score;
                    const iciBand  = ici?.band;
                    const bandColor = iciBand==='Strong'?'var(--gain)':iciBand==='Good'?'var(--accent)':iciBand==='Building'?'#f59e0b':'var(--muted)';
                    const profileUrl = r.username ? `/#/investor/${r.username}` : null;
                    return (
                      <div key={r.from} style={{
                        display:'flex', alignItems:'center', gap:12, padding:'12px 18px',
                        borderBottom: i < list.length-1 ? '1px solid var(--line)' : 'none',
                      }}>
                        {/* Avatar */}
                        <div className="av" style={{width:40,height:40,fontSize:14,flexShrink:0,background:'var(--grad)',cursor:profileUrl?'pointer':'default'}}
                          onClick={()=>profileUrl&&(window.location.hash=profileUrl)}>
                          {initialsOf(r.full_name||r.username||'?')}
                        </div>

                        {/* Name + handle */}
                        <div style={{flex:1,minWidth:0}}>
                          <div
                            style={{fontWeight:700,fontSize:14,cursor:profileUrl?'pointer':'default',
                              color:profileUrl?'var(--accent-ink)':'var(--ink)',
                              textDecoration:profileUrl?'underline':'none',textDecorationColor:'rgba(109,93,245,.3)'}}
                            onClick={()=>profileUrl&&(window.location.hash=profileUrl)}
                            title={profileUrl?`View ${r.full_name||r.username}'s profile`:undefined}
                          >
                            {r.full_name||r.username||'Anonymous'}
                          </div>
                          {r.username&&<div style={{fontSize:11,color:'var(--muted)'}}>@{r.username}</div>}
                        </div>

                        {/* ICI Score */}
                        <div style={{textAlign:'center',flexShrink:0,minWidth:44}}>
                          {iciScore !== undefined ? (
                            <>
                              <div style={{fontSize:18,fontWeight:900,color:bandColor,lineHeight:1}}>{iciScore}</div>
                              <div style={{fontSize:9,color:bandColor,fontWeight:700,marginTop:2}}>{iciBand}</div>
                            </>
                          ) : (
                            <>
                              <div style={{fontSize:18,fontWeight:900,color:'var(--muted)',lineHeight:1}}>—</div>
                              <div style={{fontSize:9,color:'var(--muted)',marginTop:2}}>ICI</div>
                            </>
                          )}
                        </div>

                        {/* Conviction + direction */}
                        <div style={{display:'flex',gap:6,alignItems:'center',flexShrink:0}}>
                          <ConvBadge level={r.conviction}/>
                          <span style={{fontSize:11,fontWeight:800,padding:'3px 9px',borderRadius:5,whiteSpace:'nowrap',
                            background:r.recommendation_type==='Buy'?'var(--gain-soft)':'var(--loss-soft)',
                            color:r.recommendation_type==='Buy'?'var(--gain)':'var(--loss)'}}>
                            {r.recommendation_type==='Buy'?'BUY':'SELL'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          ))}
          {investors.length===0&&!loading&&(
            <div className="card"><div style={{padding:'32px',textAlign:'center',color:'var(--muted)',fontSize:14}}>
              No investor recommendations for {ticker} yet.
            </div></div>
          )}
        </div>
      )}

      {/* ── Statistics Tab ─────────────────────────────────────────── */}
      {tab==='stats'&&(
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          {!stats?(
            <div className="card"><div style={{padding:'32px',textAlign:'center',color:'var(--muted)'}}>No recommendation history for {ticker} yet.</div></div>
          ):(
            <>
              {/* Overview stat cards */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:12}}>
                {[
                  {label:'Total Recommendations', val:stats.total, icon:<Activity size={16}/>},
                  {label:'Currently Active',       val:stats.active, icon:<TrendingUp size={16}/>, color:'var(--gain)'},
                  {label:'Exited / Closed',        val:stats.exited, icon:<TrendingDown size={16}/>, color:'var(--muted)'},
                  {label:'Unique Investors',        val:new Set(recos.map(r=>r.from)).size, icon:<Users size={16}/>},
                ].map((s,i)=>(
                  <div key={i} className="card" style={{padding:'16px 18px'}}>
                    <div style={{color:s.color||'var(--accent-ink)',opacity:.7,marginBottom:8}}>{s.icon}</div>
                    <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--muted)',marginBottom:4}}>{s.label}</div>
                    <div style={{fontSize:24,fontWeight:900,color:s.color||'var(--ink)'}}>{s.val}</div>
                  </div>
                ))}
              </div>

              {/* Monthly recommendation trend — SVG sparkline */}
              {stats.months.length>0&&(
                <div className="card">
                  <div className="card-head"><Target size={15}/> Recommendation Activity by Month</div>
                  <div className="card-body" style={{padding:'16px 20px'}}>
                    {(()=>{
                      const maxVal = Math.max(...stats.months.map(m=>m.buy+m.sell), 1);
                      const W = 560, H = 90, pad = 32, barW = Math.min(28, (W-2*pad)/Math.max(stats.months.length,1)-4);
                      const xStep = (W-2*pad) / Math.max(stats.months.length, 1);
                      return (
                        <svg viewBox={`0 0 ${W} ${H+40}`} style={{width:'100%',maxWidth:W,display:'block'}}>
                          {stats.months.map((m,i)=>{
                            const x  = pad + i*xStep;
                            const bH = (m.buy/maxVal)*(H-10);
                            const sH = (m.sell/maxVal)*(H-10);
                            return (
                              <g key={m.mo}>
                                <rect x={x} y={H-bH} width={barW} height={bH} rx={3} fill="var(--gain)" opacity={.8}/>
                                <rect x={x} y={H-bH-sH} width={barW} height={sH} rx={3} fill="var(--loss)" opacity={.8}/>
                                <text x={x+barW/2} y={H+14} textAnchor="middle" fontSize={8} fill="var(--muted)">
                                  {m.mo.slice(5)}
                                </text>
                                {(m.buy+m.sell)>0&&<text x={x+barW/2} y={H-bH-sH-4} textAnchor="middle" fontSize={9} fill="var(--ink)" fontWeight={700}>{m.buy+m.sell}</text>}
                              </g>
                            );
                          })}
                          {/* Legend */}
                          <rect x={W-90} y={2} width={10} height={10} rx={2} fill="var(--gain)" opacity={.8}/>
                          <text x={W-76} y={11} fontSize={9} fill="var(--muted)">Buy</text>
                          <rect x={W-50} y={2} width={10} height={10} rx={2} fill="var(--loss)" opacity={.8}/>
                          <text x={W-36} y={11} fontSize={9} fill="var(--muted)">Sell</text>
                        </svg>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Conviction breakdown */}
              {Object.keys(stats.convMap).length>0&&(
                <div className="card">
                  <div className="card-head"><Zap size={15}/> Conviction Breakdown</div>
                  <div className="card-body" style={{display:'flex',flexWrap:'wrap',gap:10,padding:'12px 16px'}}>
                    {Object.entries(stats.convMap).sort((a,b)=>b[1]-a[1]).map(([label,count])=>(
                      <div key={label} style={{display:'flex',flexDirection:'column',alignItems:'center',
                        padding:'10px 16px',background:'var(--surface-2)',borderRadius:10,minWidth:80}}>
                        <div style={{fontSize:22,fontWeight:900,color:'var(--accent-ink)'}}>{count}</div>
                        <div style={{fontSize:11,color:'var(--muted)',marginTop:3,textAlign:'center'}}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── AI Summary Tab ─────────────────────────────────────────── */}
      {tab==='ai'&&(
        <div>
          {aiLoading&&(
            <div className="card" style={{padding:'48px',textAlign:'center'}}>
              <Loader size={28} className="spin" style={{color:'var(--accent-ink)',marginBottom:12}}/>
              <div style={{fontWeight:700,marginBottom:4}}>Analysing recommendations…</div>
              <div style={{fontSize:13,color:'var(--muted)'}}>Reading {recos.length} recommendations for {ticker}</div>
            </div>
          )}
          {!aiLoading&&!aiSummary&&(
            <div className="card" style={{padding:'48px',textAlign:'center'}}>
              <Lightbulb size={32} style={{color:'var(--accent-ink)',marginBottom:12,opacity:.6}}/>
              <div style={{fontWeight:700,marginBottom:8}}>AI Investment Summary</div>
              <div style={{fontSize:13,color:'var(--muted)',marginBottom:20}}>
                Synthesise bullish and bearish themes from {activeRecos.length} active recommendation{activeRecos.length!==1?'s':''} on {ticker}
              </div>
              <button className="btn btn-pri" onClick={buildAiSummary} disabled={!activeRecos.length}>
                <Lightbulb size={14}/> Generate Summary
              </button>
            </div>
          )}
          {!aiLoading&&aiSummary&&(
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              {/* Sentiment header */}
              <div className="card" style={{padding:'20px 24px'}}>
                <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
                  <Lightbulb size={20} style={{color:'var(--accent-ink)'}}/>
                  <div>
                    <div style={{fontWeight:900,fontSize:16}}>AI Insight Summary</div>
                    <div style={{fontSize:12,color:'var(--muted)'}}>Based on {aiSummary.uniqueInv} investor{aiSummary.uniqueInv!==1?'s':''} · {aiSummary.highConv} high conviction call{aiSummary.highConv!==1?'s':''}</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{marginLeft:'auto'}} onClick={()=>{setAiSummary(null);buildAiSummary();}}>
                    <RefreshCw size={12}/> Refresh
                  </button>
                </div>
                <div style={{padding:'12px 16px',background: aiSummary.community.bullPct>=55?'var(--gain-soft)':aiSummary.community.bearPct>=55?'var(--loss-soft)':'var(--surface-2)',
                  borderRadius:10,borderLeft:`3px solid ${aiSummary.community.bullPct>=55?'var(--gain)':aiSummary.community.bearPct>=55?'var(--loss)':'var(--muted)'}`}}>
                  <div style={{fontWeight:700,fontSize:15,textTransform:'capitalize',marginBottom:4}}>
                    {aiSummary.sentiment}
                  </div>
                  <div style={{fontSize:13,color:'var(--ink-soft)'}}>
                    {aiSummary.community.bullPct}% of investors bullish · {aiSummary.community.bearPct}% bearish · {aiSummary.community.total} total active recommendations
                  </div>
                </div>
              </div>

              {/* Bullish themes */}
              {aiSummary.bullThemes.length>0&&(
                <div className="card">
                  <div className="card-head" style={{color:'var(--gain)'}}><TrendingUp size={15}/> Bullish Themes</div>
                  <div className="card-body" style={{display:'flex',flexDirection:'column',gap:10,padding:'12px 16px'}}>
                    {aiSummary.bullThemes.map((t,i)=>(
                      <div key={i} style={{display:'flex',gap:10,padding:'10px 12px',background:'var(--gain-soft)',borderRadius:8}}>
                        <div style={{color:'var(--gain)',marginTop:1,flexShrink:0}}>↑</div>
                        <div style={{fontSize:13,lineHeight:1.5}}>{t}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bearish / risk themes */}
              <div className="card">
                <div className="card-head" style={{color:'var(--loss)'}}><TrendingDown size={15}/> Risks &amp; Bearish Views</div>
                <div className="card-body" style={{display:'flex',flexDirection:'column',gap:10,padding:'12px 16px'}}>
                  {aiSummary.bearThemes.map((t,i)=>(
                    <div key={i} style={{display:'flex',gap:10,padding:'10px 12px',background:'var(--loss-soft)',borderRadius:8}}>
                      <div style={{color:'var(--loss)',marginTop:1,flexShrink:0}}>↓</div>
                      <div style={{fontSize:13,lineHeight:1.5}}>{t}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{fontSize:11,color:'var(--muted)',textAlign:'center',padding:'4px 0'}}>
                Summary is generated from investor recommendations on myInvestorCircle and reflects community opinion, not financial advice.
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}


// ── ResetPasswordPage ─────────────────────────────────────────────────────────
// Shown when the app loads with ?mode=resetPassword&oobCode=... in the URL.
// The oobCode was generated by Firebase Admin SDK in api/reset.py and is valid
// for 1 hour. confirmPasswordReset() validates and consumes it.
