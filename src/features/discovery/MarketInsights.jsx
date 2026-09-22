// Split out of Discovery.jsx (see that file's header comment) — Market
// Insights is a nav-only page (App.jsx renders it behind page==="market_intel",
// lazy-loaded), not needed for the signed-in Home Feed's initial render.
import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Users,
  Lightbulb,
  Search,
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
  Flame,
  BarChart2,
  Activity,
  Zap,
  Target,
  Clock,
  Share2,
  ArrowLeft,
  Home
} from "lucide-react";
import {
  getInvestorIciBatch as dbGetInvestorIciBatch
} from "../../services/api/profileApi";
import {
  computeIci,
  forwardRecommendation as dbForwardReco,
  getConsensusRecosPublic as dbGetConsensusRecosPublic,
  getTickerRecos as dbGetTickerRecos,
  getPublicTickerIdeas as dbGetPublicTickerIdeas,
  updateDelivery as dbUpdateDelivery
} from "../../services/api/recommendationsApi";
import {
  reactToReco as dbReactToReco,
  trackReco as dbTrackReco,
  getMyTrackedRecos as dbGetMyTrackedRecos
} from "../../services/api/engagementApi";
import { ConsensusBar, ConvBadge, IdeaDisclaimer, InstrumentSearch, LinkSharePopover, MemberBadgeOverlay, SectionErrorBoundary, SparkLine, StatusBadge2, WidgetHeader } from "../../components/common";
import { useMemberTagsMap } from "../../MemberTagsContext";
import { FeedCard, IdeaSharePopover, InvestedToggle, MakeRecoModal, ThesisRenderer } from "../recommendations/Recommendations";
import { useIsMobile } from "../../hooks/index";
import { computeConsensus, computeTrend, consensusStrengthColor, fmtDate, getThesisText, ideaStatusSummary, initialsOf, scoreFeedRec } from "../../utils/format";
import { fetchPublicProfileInfo, openProfile, openReco, goHome } from "../../utils/navigation";
import { getSeenIds, markSeen, rankWhatYouMissed } from "../../utils/whatYouMissed";
import { getSeenState as getTrendingSeenState, markSeen as markTrendingSeen, rankTrending } from "../../utils/trending";
import { trackInvestor as dbTrackInvestor, untrackInvestor as dbUntrackInvestor } from "../../services/api/trackingApi";
import { deriveTrackedActivity, getSeenCommentCounts, saveSeenCommentCounts } from "../../utils/trackedActivity";
import { getDailyPrices, getPublicDailyPrice, byTicker, priceKey } from "../../services/api/pricingApi";
export function SecurityQuickPanel({ticker,name,allRecos=[],circleRecos=[],onOpenFull,onViewAllInvestors,onClose,modal=false}) {
  const memberTagsByUser = useMemberTagsMap();
  const community  = computeConsensus(allRecos);
  const circle     = computeConsensus(circleRecos);
  const trend      = computeTrend(circleRecos.length>=2 ? circleRecos : allRecos);
  // "Recommended by" must show ALL investors, not just circle ones — this
  // panel is platform-wide discovery (the 4 cards it opens from already
  // deliberately surface tickers from across MIC, not just the viewer's
  // circle). It previously showed only circleRecos whenever the viewer had
  // ANY circle overlap for that ticker, silently hiding every community
  // investor from the list and from the "View All N" count below — e.g. a
  // ticker with 5 total investors would show "2" with no indication 3 were
  // hidden. circleIds (via circleMemberIds) is used only to badge which
  // rows are circle members, never to filter the list.
  const circleMemberIds = new Set(circleRecos.map(r=>r.from));
  const recent     = allRecos.slice(0,3);
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
                  <div style={{fontSize:24,fontWeight:900,lineHeight:1,color:consensusStrengthColor(c)}}>{c.bullPct}%</div>
                  <div style={{fontSize:11,fontWeight:700,color:consensusStrengthColor(c),marginTop:2}}>{c.label}</div>
                  <div style={{fontSize:10,color:'var(--muted)',marginTop:2}}>{count} investor{count!==1?'s':''}</div>
                </>
              ):<div style={{fontSize:12,color:'var(--muted)',paddingTop:4}}>No data</div>}
            </div>
          ))}
        </div>

        {/* Recommended by */}
        {recent.length>0&&(
          <div>
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--muted)',marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span>Posted by</span>
              {allRecos.length>3&&(
                <button className="btn btn-ghost btn-sm" style={{fontSize:10,padding:'2px 8px'}} onClick={onViewAllInvestors||onOpenFull}>
                  View All {allRecos.length}
                </button>
              )}
            </div>
            {recent.map((r,i)=>{
              const isBuy=r.recommendation_type==='Buy';
              const inCircle=circleMemberIds.has(r.from);
              const clickable=!!r.username;
              return (
                <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 0',borderBottom:i<recent.length-1?'1px solid var(--line)':'none'}}>
                  <div style={{position:'relative',width:30,height:30,flexShrink:0}}>
                    <div className="av" style={{width:30,height:30,fontSize:11,background:'var(--grad)',cursor:clickable?'pointer':'default'}} onClick={clickable?()=>openProfile(r.username):undefined}>{initialsOf(r.full_name||r.username||'?')}</div>
                    <MemberBadgeOverlay tags={memberTagsByUser[r.from]} size={30}/>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:5}}>
                      <span
                        style={{fontSize:12,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',cursor:clickable?'pointer':'default',textDecoration:clickable?'underline':'none',textDecorationColor:'var(--line)'}}
                        onClick={clickable?()=>openProfile(r.username):undefined}
                      >{r.full_name||r.username||'Investor'}</span>
                      {inCircle&&<span style={{fontSize:8.5,fontWeight:800,padding:'1px 5px',borderRadius:4,background:'var(--accent-soft)',color:'var(--accent-ink)',textTransform:'uppercase',letterSpacing:'.03em',flexShrink:0}}>Circle</span>}
                    </div>
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
              <span style={{fontWeight:900,color:consensusStrengthColor(circle)}}>{trend[trend.length-1]}%</span>
            </div>
            <SparkLine data={trend} color={consensusStrengthColor(circle)} height={55}/>
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
          <div style={{textAlign:'center',padding:'8px 0',color:'var(--muted)',fontSize:13}}>No ideas for {ticker} yet.</div>
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
  const memberTagsByUser = useMemberTagsMap();
  const isMobile = useIsMobile();
  const [recos, setRecos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all'); // all | circle | community | verified
  const [sector, setSector] = useState('all');
  const [period, setPeriod] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [expandedTicker, setExpandedTicker] = useState(null); // inline row expansion
  const [sortBy, setSortBy] = useState('strength'); // strength | recent | investors | alpha
  const [visibleCount, setVisibleCount] = useState(15); // "Load more" pagination for the full list

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
    const lastActive = filtered.length ? Math.max(...filtered.map(r=>new Date(r.created_at).getTime())) : 0;
    return {...t, community, circle, tabCons, filteredRecos:filtered, lastActive};
  }).filter(t=>t.filteredRecos.length>0
    && (sector==='all'||t.sector===sector)
    && (!search||t.ticker.includes(search.toUpperCase())||t.name.toLowerCase().includes(search.toLowerCase()))
  ).sort((a,b)=>{
    if (sortBy==='recent')    return b.lastActive-a.lastActive;
    if (sortBy==='investors') return b.filteredRecos.length-a.filteredRecos.length;
    if (sortBy==='alpha')     return a.ticker.localeCompare(b.ticker);
    // 'strength' (default) — this page's stated purpose is sentiment/conviction,
    // so lead with how strongly one-sided each stock's consensus is; investor
    // count breaks ties between equally one-sided stocks.
    return (b.tabCons.strength-a.tabCons.strength) || (b.filteredRecos.length-a.filteredRecos.length);
  }),[tickerMap,tab,circleIds,sector,search,sortBy]);

  // Reset pagination whenever the result set changes shape
  useEffect(()=>{ setVisibleCount(15); },[tab,sector,search,sortBy]);

  // Discovery cards — each one highlights a DIFFERENT signal. Already-
  // featured tickers are excluded from later cards (`pick`) so all four
  // don't collapse onto a single dominant stock just because the platform
  // is early-stage and one ticker happens to lead on several axes at once;
  // a card that genuinely has no other qualifying ticker simply doesn't
  // render (see the `item?(...):null` guard below) rather than repeating.
  const usedTickers = new Set();
  const pick = (candidates) => {
    const hit = candidates.find(t => !usedTickers.has(t.ticker));
    if (hit) usedTickers.add(hit.ticker);
    return hit || null;
  };

  // RECENCY — a gentle multiplier, not a hard filter or a heavy decay like
  // Pulse's Trending/What You Missed widgets. This page answers "what does
  // the platform generally think," not "what just happened" — a stock the
  // whole community has debated for weeks is still meaningfully "strongest
  // consensus" even if today happened to be quiet. A 30-day half-life lets
  // genuinely fresh activity float a ticker up without blanking out
  // legitimate historical consensus, which matters at today's low traffic:
  // a handful of recos a month apart is still the entire dataset for a
  // ticker, and an aggressive decay would empty most of these cards rather
  // than reorder them.
  const RECENCY_HALFLIFE_DAYS = 30;
  const daysSinceLastActivity = (recos) => {
    if (!recos.length) return Infinity;
    const latest = Math.max(...recos.map(r=>new Date(r.created_at).getTime()));
    return (Date.now() - latest) / 86400000;
  };
  const recencyFactor = (recos) => Math.pow(0.5, daysSinceLastActivity(recos) / RECENCY_HALFLIFE_DAYS);
  const lastActiveLabel = (recos) => {
    if (!recos.length) return null;
    const latest = new Date(Math.max(...recos.map(r=>new Date(r.created_at).getTime())));
    return fmtDate(latest);
  };

  // Directional AGREEMENT (bull% vs bear%) — how one-sided the community is,
  // nudged by recency so a ticker with the same split but more current
  // discussion edges out a dormant one.
  const strongest = pick(
    [...allTickers].sort((a,b)=>
      (b.tabCons.strength*recencyFactor(b.filteredRecos)) - (a.tabCons.strength*recencyFactor(a.filteredRecos)))
  );

  // Investor CONVICTION — a distinct signal from agreement direction: how
  // strongly the recommenders themselves rated their confidence (the
  // conviction field each recommendation already carries), not how many
  // agree with each other. Was previously "Biggest Conviction Increase"
  // sorted by bullPct — the same signal as Strongest Consensus over a
  // narrower slice, and no time-based "increase" was ever actually
  // computed, so it near-always picked the same ticker. Renamed to match
  // what it honestly measures.
  const CONVICTION_SCORE = { High:3, Medium:2, Low:1 };
  const avgConviction = (recos) => {
    const scored = recos.map(r=>CONVICTION_SCORE[r.conviction]).filter(Boolean);
    return scored.length ? scored.reduce((a,b)=>a+b,0)/scored.length : 0;
  };
  const highConviction = pick(
    [...allTickers]
      .map(t=>({...t, avgConv:avgConviction(t.filteredRecos)}))
      .filter(t=>t.avgConv>0)
      .sort((a,b)=>
        (b.avgConv*recencyFactor(b.filteredRecos)) - (a.avgConv*recencyFactor(a.filteredRecos))
        || b.filteredRecos.length-a.filteredRecos.length)
  );

  // Raw DISCUSSION VOLUME — most recommendations, regardless of direction,
  // recency-weighted so a ticker that was chatty once but has gone quiet
  // for months doesn't permanently outrank one people are discussing now.
  const mostDiscussed = pick(
    [...allTickers].sort((a,b)=>
      (b.filteredRecos.length*recencyFactor(b.filteredRecos)) - (a.filteredRecos.length*recencyFactor(a.filteredRecos)))
  );

  // Most DIVIDED — closest to a 50/50 bull/bear split among tickers with a
  // meaningful sample. `closeness` is 50 minus the distance from 50%, so
  // higher = more balanced/divided; ascending distance (the original fix)
  // is equivalent to descending closeness, just expressed so it can be
  // recency-weighted the same way as the other three cards. The previous
  // descending-distance sort put the LEAST divided ticker first instead, so
  // a unanimous 100%-bullish stock was winning "Most Divided" — the exact
  // inverse of the label's meaning.
  const mostDivided = pick(
    [...allTickers].filter(t=>t.tabCons.total>=3)
      .map(t=>({...t, closeness: 50-Math.abs(50-t.tabCons.bullPct)}))
      .sort((a,b)=>
        (b.closeness*recencyFactor(b.filteredRecos)) - (a.closeness*recencyFactor(a.filteredRecos)))
  );

  const sectors = ['all',...[...new Set(recos.map(r=>r.sector).filter(Boolean))]];
  const selData  = selectedTicker ? tickerMap[selectedTicker] : null;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Intelligence</div>
          <div className="page-title">Market Insights</div>
          <div className="page-sub">Track market sentiment and investor conviction across stocks and sectors</div>
        </div>
        {loading&&<Loader size={16} className="spin" style={{color:'var(--muted)'}}/>}
      </div>

      {/* Discovery cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:10,marginBottom:20}}>
        {[
          {label:'Strongest Consensus',   icon:<Target size={14}/>,      item:strongest},
          {label:'Highest Conviction',    icon:<Zap size={14}/>,         item:highConviction},
          {label:'Most Discussed',        icon:<MessageSquare size={14}/>,item:mostDiscussed},
          {label:'Most Divided',          icon:<Activity size={14}/>,    item:mostDivided},
        ].map(({label,icon,item},i)=>item?(
          <div key={i} className="card" style={{padding:'11px 13px',cursor:'pointer',minWidth:0}} onClick={()=>setSelectedTicker(item.ticker)}>
            <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:5}}>
              <span style={{color:'var(--accent-ink)',opacity:.7}}>{icon}</span>
              <span style={{fontSize:9.5,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--muted)'}}>{label}</span>
            </div>
            <div style={{fontWeight:900,fontSize:16,marginBottom:2}}>{item.ticker}</div>
            <div style={{fontSize:11.5,color:consensusStrengthColor(item.tabCons),fontWeight:700,marginBottom:5}}>
              {item.tabCons.bullPct>item.tabCons.bearPct?'+':''}{item.tabCons.bullPct}% {item.tabCons.label}
            </div>
            <SparkLine
              data={computeTrend(item.filteredRecos)}
              color={consensusStrengthColor(item.tabCons)}
              height={26}
            />
            <div style={{fontSize:10.5,color:'var(--muted)',marginTop:3}}>
              {item.filteredRecos.length} investor{item.filteredRecos.length!==1?'s':''}
              {lastActiveLabel(item.filteredRecos) && ` · ${lastActiveLabel(item.filteredRecos)}`}
            </div>
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
        <select className="rte-select" value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{height:32}} title="Sort by">
          <option value="strength">Sort: Consensus Strength</option>
          <option value="recent">Sort: Most Recent</option>
          <option value="investors">Sort: Most Investors</option>
          <option value="alpha">Sort: Alphabetical</option>
        </select>
        <div style={{position:'relative',flex:1,maxWidth:220}}>
          <Search size={14} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--muted)'}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search stocks…"
            style={{width:'100%',paddingLeft:30,height:32,border:'1px solid var(--line-2)',borderRadius:8,fontSize:13,outline:'none',background:'var(--surface)',color:'var(--ink)'}}/>
        </div>
      </div>

      {!loading&&allTickers.length>0&&(
        <div style={{fontSize:12,color:'var(--muted)',marginBottom:8}}>
          Showing {Math.min(visibleCount,allTickers.length)} of {allTickers.length} stock{allTickers.length!==1?'s':''}
        </div>
      )}

      <div style={{display:'grid',gridTemplateColumns:selData&&!isMobile?'1fr 340px':'1fr',gap:16,alignItems:'start'}}>
        <div className="card">
          {isMobile ? (
            /* ── Mobile: asset card list ── */
            <div style={{display:'flex',flexDirection:'column',gap:0}}>
              {allTickers.slice(0,visibleCount).map(t=>(
                <div key={t.ticker} onClick={()=>setSelectedTicker(prev=>prev===t.ticker?null:t.ticker)}
                  style={{padding:'13px 16px',borderBottom:'1px solid var(--line)',cursor:'pointer',background:selectedTicker===t.ticker?'var(--accent-soft)':'transparent',transition:'background .12s'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                    <div style={{minWidth:0,flex:1}}>
                      <div style={{fontWeight:800,fontSize:14}}>{t.ticker}</div>
                      <div style={{fontSize:11,color:'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.name}</div>
                      {t.sector&&<div style={{fontSize:10,color:'var(--muted)'}}>{t.sector}</div>}
                    </div>
                    <div style={{textAlign:'right',flexShrink:0,marginLeft:10}}>
                      <span style={{fontSize:12,color:consensusStrengthColor(t.community),fontWeight:700}}>
                        {t.community.bullPct>t.community.bearPct?'↑ ':t.community.bearPct>t.community.bullPct?'↓ ':'→ '}{t.community.label}
                      </span>
                      <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{t.filteredRecos.length} investor{t.filteredRecos.length!==1?'s':''}</div>
                      <div style={{display:'flex',alignItems:'center',gap:4,marginTop:4,justifyContent:'flex-end'}} title={`Consensus strength: ${t.tabCons.strength}/100`}>
                        <div style={{width:38,height:5,borderRadius:3,background:'var(--line)',overflow:'hidden'}}>
                          <div style={{height:'100%',width:`${t.tabCons.strength}%`,background:consensusStrengthColor(t.tabCons)}}/>
                        </div>
                        <span style={{fontSize:9.5,fontWeight:700,color:'var(--muted)'}}>{t.tabCons.strength}</span>
                      </div>
                    </div>
                  </div>
                  {(t.community.total>0||t.circle.total>0)&&(
                    <div style={{display:'flex',gap:10,marginBottom:4}}>
                      {t.community.total>0&&(
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:9.5,color:'var(--muted)',marginBottom:3,textTransform:'uppercase',letterSpacing:'.03em'}}>Community</div>
                          <ConsensusBar cons={t.community} width={'100%'} mini/>
                        </div>
                      )}
                      {t.circle.total>0&&(
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:9.5,color:'var(--muted)',marginBottom:3,textTransform:'uppercase',letterSpacing:'.03em'}}>My Circle</div>
                          <ConsensusBar cons={t.circle} width={'100%'} mini/>
                        </div>
                      )}
                    </div>
                  )}
                  {t.community.total===0&&t.circle.total===0&&(<div style={{fontSize:11,color:'var(--muted)',fontStyle:'italic',marginBottom:4}}>No ideas yet</div>)}
                  <div style={{display:'flex',justifyContent:'flex-end',marginTop:6}}>
                    <button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={e=>{e.stopPropagation();onOpenSecurity(t.ticker,t.name);}}>
                      <ChevronRight size={13}/> Stock Insights
                    </button>
                  </div>
                </div>
              ))}
              {allTickers.length===0&&(<div style={{padding:'32px 16px',textAlign:'center',color:'var(--muted)',fontSize:13}}>No stocks match current filters.</div>)}
              {allTickers.length>visibleCount&&(
                <div style={{padding:'14px 16px',textAlign:'center'}}>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setVisibleCount(v=>v+15)}>
                    Load more ({allTickers.length-visibleCount} remaining)
                  </button>
                </div>
              )}
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
                {allTickers.slice(0,visibleCount).map(t=>{
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
                          <span style={{fontSize:12,color:consensusStrengthColor(t.community),fontWeight:700}}>
                            {t.community.bullPct>t.community.bearPct?'↑':t.community.bearPct>t.community.bullPct?'↓':'→'}
                            {' '}{t.community.label}
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
                            <button className="iconbtn" title={expanded?'Collapse':'Who posted'} onClick={toggleExpand}
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
                              Who posted — {t.filteredRecos.length} investor{t.filteredRecos.length!==1?'s':''}
                            </div>
                            <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                              {t.filteredRecos.map((r,i)=>{
                                const inCircle = circleIds.includes(r.from);
                                const isBuy    = r.recommendation_type==='Buy';
                                return (
                                  <div key={i} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px',
                                    background:'var(--surface)',borderRadius:8,border:'1px solid var(--line-2)',fontSize:12}}>
                                    <div style={{position:'relative',width:22,height:22,flexShrink:0}}>
                                      <div className="av" style={{width:22,height:22,fontSize:9,background:'var(--grad)'}}>
                                        {initialsOf(r.full_name||r.username||'?')}
                                      </div>
                                      <MemberBadgeOverlay tags={memberTagsByUser[r.from]} size={22}/>
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
                {allTickers.length===0&&!loading&&<tr><td colSpan={7} style={{padding:'32px',textAlign:'center',color:'var(--muted)',fontSize:14}}>{recos.length===0?'No ideas on the platform yet.':'No results match your filters.'}</td></tr>}
              </tbody>
            </table>
            {allTickers.length>visibleCount&&(
              <div style={{padding:'14px',textAlign:'center'}}>
                <button className="btn btn-ghost btn-sm" onClick={()=>setVisibleCount(v=>v+15)}>
                  Load more ({allTickers.length-visibleCount} remaining)
                </button>
              </div>
            )}
          </div>
          ) /* end isMobile ternary */}
        </div>

        {selData&&(
          isMobile
            ? <SecurityQuickPanel ticker={selData.ticker} name={selData.name} allRecos={selData.recos} circleRecos={selData.recos.filter(r=>circleIds.includes(r.from))} onOpenFull={()=>onOpenSecurity(selData.ticker,selData.name)} onViewAllInvestors={()=>onOpenSecurity(selData.ticker,selData.name,'investors')} onClose={()=>setSelectedTicker(null)} modal/>
            : <SecurityQuickPanel ticker={selData.ticker} name={selData.name} allRecos={selData.recos} circleRecos={selData.recos.filter(r=>circleIds.includes(r.from))} onOpenFull={()=>onOpenSecurity(selData.ticker,selData.name)} onViewAllInvestors={()=>onOpenSecurity(selData.ticker,selData.name,'investors')} onClose={()=>setSelectedTicker(null)}/>
        )}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECURITY INTELLIGENCE
   ═══════════════════════════════════════════════════════════════════ */

