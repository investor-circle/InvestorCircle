import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  TrendingUp,
  TrendingDown,
  Plus,
  X,
  ChevronRight,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  Trash2,
  Upload,
  Loader,
  RefreshCw,
  Globe,
  BarChart2,
  Zap
} from "lucide-react";
import {
  addPortfolioHolding as dbAddPortfolioHolding,
  deleteAllPortfolioHoldings as dbDeleteAllPortfolioHoldings,
  deletePortfolioHolding as dbDeletePortfolioHolding,
  getPortfolioHoldings as dbGetPortfolioHoldings
} from "../../services/api/lookupsApi";
import {
  getConsensusRecosAll as dbGetConsensusRecosAll
} from "../../services/api/recommendationsApi";
import { getDailyPrices, byTicker, priceKey } from "../../services/api/pricingApi";
import { ConsensusBar, InstrumentSearch, SmallAnchoredPopover, SortTh, StrengthDot } from "../../components/common";
import { SecurityQuickPanel } from "../discovery/Discovery";
import { PanPullModal } from "../recommendations/Recommendations";
import { useIsMobile } from "../../hooks/index";
import { computeConsensus } from "../../utils/format";

export function PortfolioIntelligencePage({ holdings, setHoldings, contacts, me, onOpenSecurity, setPage }) {
  const isMobile = useIsMobile();
  const [recoMap, setRecoMap] = useState({}); // { ticker: [reco,...] }
  const [loading, setLoading] = useState(true);
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [showManage, setShowManage] = useState(false);
  const [showAddHolding, setShowAddHolding] = useState(false);
  const [tab, setTab] = useState('all'); // all | bullish | neutral | bearish
  const [q, setQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const filterBtnRef = useRef(null);
  const sortBtnRef   = useRef(null);
  const [classFilter, setClassFilter] = useState('Stock'); // default to the common case; "All asset classes" is one click away
  const [sort, setSort] = useState({ key: 'value', dir: 'desc' });
  const [refreshKey, setRefreshKey] = useState(0); // bump to force-reload consensus data, independent of holdings changing

  // Declare ownerId BEFORE any hooks that reference it in dependency arrays (prevents TDZ crash)
  const ownerId   = me?.id || '';
  const circleIds = useMemo(()=>contacts.map(c=>c.id),[contacts]);

  // ── DB helpers ───────────────────────────────────────────────
  /** Convert a DB row → app holding object */
  const dbRow2Holding = r => ({
    id:           r.id,
    sym:          r.sym   || '',
    name:         r.name  || '',
    type:         r.type  || 'Stock',
    acct:         r.acct  || 'manual',
    acctName:     r.acct_name || 'Manual Portfolio',
    sh:           Number(r.sh)   || 0,
    cost:         Number(r.cost) || 0,
    price:        Number(r.price)|| 0,
    isin:         r.isin  || '',
    sector:       r.sector|| '',
    currency:     r.currency || 'INR',
    purchaseDate: r.purchase_date || null,
    source:       r.source || 'manual',
  });

  // Load holdings from DB whenever owner changes.
  // [ownerId] dependency ensures this re-runs on account switch — no dbLoaded flag needed.
  useEffect(()=>{
    if (!ownerId) return;
    dbGetPortfolioHoldings()
      .then(rows => {
        // Always replace state even with []. Removing this guard was the privacy fix:
        // a user with 0 holdings must not see a previous user's stale state.
        setHoldings((rows||[]).map(dbRow2Holding));
      })
      .catch(e => console.warn('load holdings:', e?.message||e));
  },[ownerId]);

  /** Upsert a single holding to DB */
  const saveHolding = async (h) => {
    // PRIVACY: never write a holding without a validated, non-empty owner id
    if (!ownerId || ownerId.length < 4) {
      console.error('saveHolding blocked — invalid ownerId:', ownerId);
      return;
    }
    try {
      await dbAddPortfolioHolding(h);
    } catch(e) { console.warn('saveHolding:', e?.message||e); }
  };

  /** Delete a holding from DB */
  const deleteHolding = async (id) => {
    if (!ownerId || ownerId.length < 4) return;
    try {
      await dbDeletePortfolioHolding(id);
    } catch(e) { console.warn('deleteHolding:', e?.message||e); }
  };

  /** Bulk-replace all holdings in DB (used by CAS import replace mode) */
  const replaceAllHoldings = async (newHoldings) => {
    if (!ownerId || ownerId.length < 4) {
      console.error('replaceAllHoldings blocked — invalid ownerId:', ownerId);
      return;
    }
    try {
      await dbDeleteAllPortfolioHoldings();
      for (const h of newHoldings) await saveHolding(h);
    } catch(e) { console.warn('replaceAllHoldings:', e?.message||e); }
  };

  // Load ALL active recommendations — re-runs whenever holding count changes
  // (covers CAS upload + manual add) or refreshKey is bumped (the "Refresh"
  // button, for "I've been sitting on this page a while, pull anything
  // new" — a real gap since nothing here auto-refreshes or subscribes to
  // live updates). refreshKey is a plain counter dedicated to this purpose,
  // not a proxy through some other state's identity.
  useEffect(()=>{
    setLoading(true);
    dbGetConsensusRecosAll()
      .then(rows=>{
        const map={};
        rows.forEach(r=>{
          const key=(r.ticker||'').toUpperCase().trim();
          if(key)(map[key]=map[key]||[]).push(r);
        });
        setRecoMap(map); setLoading(false);
      })
      .catch(e=>{ console.warn('recoMap SQL error:',e?.message||e); setLoading(false); });
  },[holdings.length, refreshKey]);

  // Batch-priced (Equity/ETF/Mutual Fund) holdings are keyed by the nightly
  // job's `instruments` identity — ticker for Stock/ETF, ISIN for Fund
  // (mutual funds have no exchange ticker; CAS statements carry the ISIN
  // instead — see scripts/stamp-prices.js's runFundPricing()). Other holding
  // types (Crypto/Bond/REIT/Others) have no batch source at all and simply
  // fall back to whatever price was last stamped on the holding itself
  // (entry price for a fresh manual add, or the CAS-imported price/NAV).
  const holdingAssetClass = (h) => h.type==='ETF' ? 'ETF' : h.type==='Fund' ? 'Mutual Funds' : 'Equity';
  const holdingPriceIdentifier = (h) => h.type==='Fund' ? (h.isin||'').trim().toUpperCase() : (h.sym||'').trim().toUpperCase();

  // "Since yesterday" daily price deltas AND the live price/value/gain shown
  // per holding both come from the same Phase 9 instrument-price snapshots
  // the nightly batch (scripts/stamp-prices.js) writes — the same table
  // Pulse's My Tracked widget reads (src/services/api/pricingApi.js). This
  // is deliberately NOT a client-triggered refresh: every user who opens
  // Portfolio sees whatever the last nightly run stamped, with no button to
  // click and no live provider call from the browser. A holding the batch
  // has never priced yet (added just now, or an out-of-scope asset type)
  // simply keeps showing its stored price until the next run picks it up.
  const holdingIdKey = useMemo(
    () => [...new Set(holdings.map(h=>holdingPriceIdentifier(h)).filter(Boolean))].sort().join(','),
    [holdings]
  );
  const [dailyPrices, setDailyPrices] = useState(null);
  useEffect(() => {
    if (!holdingIdKey) { setDailyPrices(null); return; }
    let cancelled = false;
    getDailyPrices(holdingIdKey.split(','))
      .then(rows => { if (!cancelled) setDailyPrices(byTicker(rows)); })
      .catch(() => {}); // pricing unavailable degrades to stored/stale prices, not an error
    return () => { cancelled = true; };
  }, [holdingIdKey]);
  const dailySnapshotFor = (h) => dailyPrices?.[priceKey(holdingPriceIdentifier(h), holdingAssetClass(h))] ?? null;

  const holdingsData = useMemo(()=>holdings.map(h=>{
    // Uppercase both sides so 'KPL' matches 'kpl' in recoMap
    const key    = (h.sym||'').toUpperCase().trim();
    const allR   = recoMap[key]||[];
    const circleR= allR.filter(r=>circleIds.includes(r.from));
    const community = computeConsensus(allR);
    const circle    = computeConsensus(circleR);
    const snap  = dailySnapshotFor(h);
    const price = snap?.close!=null ? snap.close : (h.price||0);
    const value = (h.sh||0)*price;
    const gain  = h.cost>0?((price-h.cost)/h.cost*100):0;
    return {...h, price, community, circle, value, gain, dailyChangePct: snap?.changePct ?? null, allR, circleR};
  }),[holdings,recoMap,circleIds,dailyPrices]);

  const assetClassOptions = useMemo(
    () => [...new Set(holdingsData.map(h=>h.type).filter(Boolean))].sort(),
    [holdingsData]
  );

  const bySignalTab = holdingsData.filter(h=>
    tab==='all'||
    (tab==='bullish'&&h.community.bullPct>=55)||
    (tab==='bearish'&&h.community.bearPct>=55)||
    (tab==='neutral'&&h.community.bullPct<55&&h.community.bearPct<55)
  );
  // classFilter defaults to 'Stock', but if this portfolio happens to hold
  // no Stock-type holdings at all (e.g. only ETFs/Crypto), that default
  // must not silently filter the list down to nothing with no visible way
  // to fix it — the filter dropdown itself only renders when there's more
  // than one asset class to choose from, so a stale/inapplicable default
  // needs to fall back to "all" on its own rather than needing a click.
  const classFilterActive = classFilter!=='all' && assetClassOptions.includes(classFilter);
  const bySearchAndClass = bySignalTab.filter(h=>{
    if (classFilterActive && h.type!==classFilter) return false;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      if (!(`${h.sym} ${h.name}`).toLowerCase().includes(s)) return false;
    }
    return true;
  });
  const filtered = useMemo(() => {
    const dir = sort.dir==='asc' ? 1 : -1;
    return [...bySearchAndClass].sort((a,b) => {
      if (sort.key==='sym')     return a.sym.localeCompare(b.sym)*dir;
      if (sort.key==='gain')    return ((a.gain||0)-(b.gain||0))*dir;
      if (sort.key==='consensus') return ((a.community.bullPct||0)-(b.community.bullPct||0))*dir;
      if (sort.key==='strength')  return ((a.community.strength||0)-(b.community.strength||0))*dir;
      return ((a.value||0)-(b.value||0))*dir; // default: value
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bySearchAndClass, sort]);

  const totalValue = holdingsData.reduce((s,h)=>s+(h.value||0),0);
  const avgBull = holdingsData.filter(h=>h.community.total>0).reduce((s,h,_,a)=>s+h.community.bullPct/a.length,0)||0;
  const highConv = holdingsData.filter(h=>h.community.strength>=60).length;
  const selected = holdingsData.find(h=>h.sym===selectedTicker);

  // ── Opportunity Signals ──────────────────────────────────────────
  // Exactly 4 categories, one holding each, deduped across categories (a
  // holding already used by an earlier category is skipped by later ones)
  // so the grid is always predictable: at most 4 cards, never the same
  // stock twice. Priority order below is the order categories claim a
  // holding in, not necessarily render order.
  const now = Date.now();
  const signals = useMemo(()=>{
    const thirtyDays = 30*24*60*60*1000;
    const strongConv = [...holdingsData]
      .filter(h=>h.community.strength>=65&&h.community.bullPct>=60)
      .sort((a,b)=>b.community.strength-a.community.strength).slice(0,3);
    const weakening = holdingsData.filter(h=>
      h.community.total>=3 && h.circle.total>=2 &&
      h.circle.bullPct < h.community.bullPct - 15
    ).sort((a,b)=>(a.circle.bullPct-a.community.bullPct)-(b.circle.bullPct-b.community.bullPct)).slice(0,3);
    // Daily Mover — the same daily close-to-close delta Pulse's My Tracked
    // widget surfaces, applied here to what you actually hold rather than
    // what you track. DAILY_MOVER_THRESHOLD mirrors trackedActivity.js's
    // bar for "worth a line in a daily digest."
    const DAILY_MOVER_THRESHOLD = 0.02;
    const dailyMover = holdingsData
      .filter(h => h.dailyChangePct!=null && Math.abs(h.dailyChangePct)/100 >= DAILY_MOVER_THRESHOLD)
      .sort((a,b)=>Math.abs(b.dailyChangePct)-Math.abs(a.dailyChangePct));
    const emerging = holdingsData.filter(h=>{
      const recent = (h.allR||[]).filter(r => r.created_at && (now - new Date(r.created_at)) < thirtyDays);
      return recent.length>=2 && h.community.total<=6;
    }).sort((a,b)=>b.community.bullPct-a.community.bullPct).slice(0,3);

    // Claim exactly one holding per category, skipping any already claimed
    // by an earlier category — guarantees at most 4 cards, never the same
    // stock twice, in a fixed narrative order (strength -> movement ->
    // divergence -> early signal).
    const used = new Set();
    const claim = (pool, kind) => {
      const h = pool.find(x => !used.has(x.sym));
      if (!h) return null;
      used.add(h.sym);
      return { kind, h };
    };
    const cards = [
      claim(strongConv, 'strong'),
      claim(dailyMover, 'mover'),
      claim(weakening, 'diverging'),
      claim(emerging, 'emerging'),
    ].filter(Boolean);
    return { cards };
  },[holdingsData]);

  const SIGNAL_META = {
    strong:     { label:'Strong Conviction', color:'var(--gain)',  soft:'var(--gain-soft)' },
    mover:      { label:'Daily Mover',       color:'var(--accent-ink)', soft:'var(--accent-soft)' },
    diverging:  { label:'Circle Diverging',  color:'#92400e', soft:'#fef3c7' },
    emerging:   { label:'Emerging Idea',     color:'var(--accent-ink)', soft:'var(--accent-soft)' },
  };

  return (
    <>
      {/* ── Compact header: just the title (the "Intelligence" eyebrow was
           redundant with "Portfolio Intelligence" right below it) — the old
           page-head + 4 bulky summary cards ate ~250px before a single
           holding was visible. The 3 CTAs sit on the right when there's
           room; .page-head's own flex-wrap already drops the whole button
           group to its own row under the title rather than squeezing in —
           but that group must then stay ONE row itself (not further wrap
           into 2-3 ragged lines), so it's nowrap + horizontally scrollable
           as a last resort instead. ── */}
      <div className="page-head" style={{marginBottom:12}}>
        <div className="page-title">Portfolio Intelligence</div>
        <div style={{display:'flex',gap:10,flexWrap:'nowrap',overflowX:'auto',justifyContent:'flex-end',WebkitOverflowScrolling:'touch'}}>
          {loading&&<Loader size={16} className="spin" style={{color:'var(--muted)',marginRight:4,flexShrink:0}}/>}
          <button className="btn btn-ghost btn-sm" style={{flexShrink:0,whiteSpace:'nowrap'}} title="Reload consensus data from latest ideas"
            onClick={()=>setRefreshKey(k=>k+1)}>
            <RefreshCw size={13}/> Refresh
          </button>
          <button className="btn btn-ghost btn-sm" style={{flexShrink:0,whiteSpace:'nowrap'}} onClick={()=>setShowAddHolding(true)}><Plus size={13}/> Add Holding</button>
          <button className="btn btn-soft btn-sm" style={{flexShrink:0,whiteSpace:'nowrap'}} onClick={()=>setShowManage(true)}><Upload size={13}/> Upload CAS</button>
        </div>
      </div>

      {/* Stat strip — one slim row instead of 4 tall cards. Dividers instead
          of card chrome, sub-copy folded onto the same line as the value. */}
      <div className="card" style={{display:'flex',flexWrap:'wrap',marginBottom:14,overflow:'hidden'}}>
        {[
          {icon:<BarChart2 size={14}/>,label:'Holdings',val:holdings.length,sub:holdings.length?`${holdingsData.filter(h=>h.community.total>0).length} tracked`:'Upload CAS to begin'},
          {icon:<Globe size={14}/>,label:'Total Value',val:`₹${Math.round(totalValue).toLocaleString('en-IN')}`,accent:true},
          {icon:<TrendingUp size={14}/>,label:'Avg Sentiment',val:`${Math.round(avgBull)}% Bullish`},
          {icon:<Zap size={14}/>,label:'High Conviction',val:highConv,sub:'strong consensus'},
        ].map((s,i)=>(
          <div key={i} style={{flex:'1 1 170px',padding:'10px 16px',borderRight:!isMobile&&i<3?'1px solid var(--line)':'none',borderBottom:isMobile&&i<3?'1px solid var(--line)':'none'}}>
            <div style={{display:'flex',alignItems:'center',gap:5,fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--muted)',marginBottom:2}}>
              <span style={{color:'var(--accent-ink)',opacity:.8,display:'flex'}}>{s.icon}</span>{s.label}
            </div>
            <div style={{fontSize:16,fontWeight:900,color:s.accent?'var(--accent-ink)':'var(--ink)'}}>
              {s.val}{s.sub&&<span style={{fontSize:11,fontWeight:400,color:'var(--muted)',marginLeft:7}}>{s.sub}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Opportunity Signals — up to 4 cards, one per category, deduped —
          single row on desktop, 2×2 on mobile. */}
      {signals.cards.length>0&&(
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:800,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--muted)',marginBottom:8,display:'flex',alignItems:'center',gap:6}}>
            <Zap size={13}/> Opportunity Signals
          </div>
          <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr 1fr':'repeat(4,1fr)',gap:10}}>
            {signals.cards.map(({kind,h})=>{
              const meta = SIGNAL_META[kind];
              return (
                <div key={kind+h.sym} className="card" style={{padding:'12px 14px',cursor:'pointer',borderTop:`3px solid ${meta.color}`,borderRadius:12,minWidth:0}}
                  onClick={()=>setSelectedTicker(h.sym)}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6,gap:6}}>
                    <span style={{fontSize:9,fontWeight:800,textTransform:'uppercase',letterSpacing:'.05em',color:meta.color,background:meta.soft,padding:'2px 7px',borderRadius:4,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{meta.label}</span>
                    {kind==='strong'    && <span style={{fontSize:10,color:'var(--muted)',flexShrink:0}}>{h.community.strength}/100</span>}
                    {kind==='mover'     && <span style={{fontSize:10,fontWeight:700,color:h.dailyChangePct>=0?'var(--gain)':'var(--loss)',flexShrink:0,display:'flex',alignItems:'center',gap:2}}>{h.dailyChangePct>=0?<TrendingUp size={11}/>:<TrendingDown size={11}/>}{h.dailyChangePct>=0?'+':''}{h.dailyChangePct.toFixed(1)}%</span>}
                    {kind==='diverging' && <span style={{fontSize:10,color:'var(--muted)',flexShrink:0}}>↓{Math.round(h.community.bullPct-h.circle.bullPct)}%</span>}
                    {kind==='emerging'  && <span style={{fontSize:10,color:'var(--muted)',flexShrink:0}}>+Recent</span>}
                  </div>
                  <div style={{fontWeight:900,fontSize:15}}>{h.sym}</div>
                  <div style={{fontSize:11,color:'var(--muted)',marginBottom:6,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.name}</div>
                  {kind==='diverging'
                    ? <div style={{fontSize:11,color:'var(--muted)'}}>Community {h.community.bullPct}% · Circle {h.circle.bullPct}% bull</div>
                    : kind==='mover'
                    ? <div style={{fontSize:11,color:'var(--muted)'}}>Since yesterday's close</div>
                    : <ConsensusBar cons={h.community} width={'100%'} mini/>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main grid: table + quick panel — stacks on mobile */}
      <div style={{display:'grid',gridTemplateColumns:selected&&!isMobile?'1fr 340px':'1fr',gap:16,alignItems:'start'}}>
        <div className="card">
          {/* Header + search/filter/sort icons — same icon-only pattern as
              the public-profile Investment Ideas list (SmallAnchoredPopover
              for filter/sort, search toggling a full-width box below). */}
          <div className="card-head">
            <span style={{display:'flex',alignItems:'center',gap:8}}><BarChart2 size={15}/> My Holdings — Market Consensus Overlay</span>
            <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
              <button className={"icon-btn"+(searchOpen?" active":"")} style={{width:32,height:32}} title="Search holdings" onClick={()=>setSearchOpen(v=>!v)}><Search size={14}/></button>
              {assetClassOptions.length>1 && (
                <div style={{position:'relative'}}>
                  <button ref={filterBtnRef} className={"icon-btn"+(classFilterActive?" active":"")} style={{width:32,height:32}} title="Filter by asset class" onClick={()=>setFilterOpen(v=>!v)}><SlidersHorizontal size={14}/></button>
                  {filterOpen && (
                    <SmallAnchoredPopover anchorEl={filterBtnRef.current} onClose={()=>setFilterOpen(false)}>
                      <div className="cap" style={{marginBottom:6}}>Asset class</div>
                      <select className="inline-select sm" style={{width:'100%'}} value={classFilter} onChange={e=>setClassFilter(e.target.value)}>
                        <option value="all">All classes</option>
                        {assetClassOptions.map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                    </SmallAnchoredPopover>
                  )}
                </div>
              )}
              <div style={{position:'relative'}}>
                <button ref={sortBtnRef} className={"icon-btn"+(sort.key!=='value'||sort.dir!=='desc'?" active":"")} style={{width:32,height:32}} title="Sort holdings" onClick={()=>setSortOpen(v=>!v)}><ArrowUpDown size={14}/></button>
                {sortOpen && (
                  <SmallAnchoredPopover anchorEl={sortBtnRef.current} onClose={()=>setSortOpen(false)}>
                    {[['value:desc','Value (high→low)'],['value:asc','Value (low→high)'],['gain:desc','Gain (high→low)'],['gain:asc','Gain (low→high)'],['sym:asc','Symbol (A→Z)'],['consensus:desc','Consensus (bullish first)'],['strength:desc','Strength (high→low)']].map(([val,label])=>{
                      const [key,dir] = val.split(':');
                      const active = sort.key===key && sort.dir===dir;
                      return (
                        <div key={val} onClick={()=>{setSort({key,dir});setSortOpen(false);}}
                          style={{padding:'8px 9px',borderRadius:8,cursor:'pointer',fontSize:13,fontWeight:active?700:500,color:active?'var(--accent-ink)':'var(--ink)',background:active?'var(--accent-soft)':'transparent'}}>
                          {label}
                        </div>
                      );
                    })}
                  </SmallAnchoredPopover>
                )}
              </div>
            </div>
          </div>
          {holdings.length>0 && (
            <div style={{padding:'12px 16px 0'}}>
              <div className="seg">
                {[['all','All'],['bullish','Bullish'],['neutral','Neutral'],['bearish','Bearish']].map(([v,l])=>(
                  <button key={v} className={tab===v?'active':''} onClick={()=>setTab(v)}>{l}</button>
                ))}
              </div>
            </div>
          )}
          {searchOpen && (
            <div className="searchbox" style={{margin:'12px 16px 0'}}>
              <Search size={13} color="var(--muted)"/>
              <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search symbol or name…" style={{fontSize:13}}/>
              {q && <button onClick={()=>setQ('')} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',display:'flex'}}><X size={13}/></button>}
            </div>
          )}
          {holdings.length===0?(
            <div style={{padding:'48px 24px',textAlign:'center'}}>
              <BarChart2 size={32} style={{color:'var(--muted)',marginBottom:12,opacity:.4}}/>
              <div style={{fontSize:15,fontWeight:700,marginBottom:6}}>No holdings yet</div>
              <div style={{fontSize:13,color:'var(--muted)',marginBottom:20}}>Add holdings manually or import your entire portfolio from a CAS PDF</div>
              <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}>
                <button className="btn btn-pri" onClick={()=>setShowAddHolding(true)}><Plus size={14}/> Add Holding</button>
                <button className="btn btn-ghost" onClick={()=>setShowManage(true)}><Upload size={14}/> Upload CAS PDF</button>
              </div>
            </div>
          ):( isMobile ? (
            /* ── Mobile: asset card list (search/filter/sort now live in the
                 card-head above, same controls power both layouts) ── */
            <div style={{display:'flex',flexDirection:'column',gap:10,padding:'14px 16px'}}>
              {filtered.map(h=>(
                <div key={h.id} onClick={()=>setSelectedTicker(prev=>prev===h.sym?null:h.sym)}
                  style={{background:'var(--surface)',border:`1px solid ${selectedTicker===h.sym?'var(--accent)':'var(--line)'}`,borderRadius:12,padding:'13px 15px',cursor:'pointer',transition:'border-color .15s'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                    <div style={{minWidth:0,flex:1}}>
                      <div style={{fontWeight:800,fontSize:15,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.sym}</div>
                      <div style={{fontSize:11,color:'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.name}</div>
                    </div>
                    <div style={{textAlign:'right',flexShrink:0,marginLeft:10}}>
                      <div style={{fontWeight:700,fontSize:14}}>₹{h.value.toLocaleString('en-IN')}</div>
                      <div style={{fontSize:11,color:h.gain>=0?'var(--gain)':'var(--loss)',fontWeight:600}}>{h.gain>=0?'+':''}{h.gain.toFixed(1)}%</div>
                    </div>
                  </div>
                  {(h.community.total>0||h.circle.total>0)&&(
                    <div style={{display:'flex',gap:10,marginBottom:6}}>
                      {h.community.total>0&&(
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:9.5,color:'var(--muted)',marginBottom:3,textTransform:'uppercase',letterSpacing:'.03em'}}>Community</div>
                          <ConsensusBar cons={h.community} width={'100%'} mini/>
                        </div>
                      )}
                      {h.circle.total>0&&(
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:9.5,color:'var(--muted)',marginBottom:3,textTransform:'uppercase',letterSpacing:'.03em'}}>My Circle</div>
                          <ConsensusBar cons={h.circle} width={'100%'} mini/>
                        </div>
                      )}
                    </div>
                  )}
                  {h.community.total===0&&h.circle.total===0&&(<div style={{fontSize:11,color:'var(--muted)',fontStyle:'italic',marginBottom:4}}>No ideas yet</div>)}
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8,paddingTop:8,borderTop:'1px solid var(--line)'}}>
                    <button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={e=>{e.stopPropagation();onOpenSecurity(h.sym,h.name);}}><ChevronRight size={13}/> Stock Insights</button>
                    <button style={{border:'none',background:'none',cursor:'pointer',color:'var(--loss)',opacity:.5,padding:4}}
                      onClick={e=>{e.stopPropagation();setHoldings(p=>p.filter(x=>x.id!==h.id));deleteHolding(h.id);}}
                      onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.5}><Trash2 size={14}/></button>
                  </div>
                </div>
              ))}
              {filtered.length===0&&(<div style={{padding:'32px 16px',textAlign:'center',color:'var(--muted)',fontSize:13}}>No holdings match the current filter.</div>)}
            </div>
          ) : (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{borderBottom:'2px solid var(--line)'}}>
                    <SortTh label="Stock" k="sym" sort={sort} setSort={setSort}/>
                    <SortTh label="Current Value" k="value" sort={sort} setSort={setSort} align="center"/>
                    <SortTh label="Overall Gain" k="gain" sort={sort} setSort={setSort} align="center"/>
                    <SortTh label="Market Consensus (All Investors)" k="consensus" sort={sort} setSort={setSort} align="center"/>
                    <th style={{padding:'10px 14px',textAlign:'center',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',color:'var(--muted)',whiteSpace:'nowrap'}}>Consensus in My Circle</th>
                    <SortTh label="Strength" k="strength" sort={sort} setSort={setSort} align="center"/>
                    <th/><th/>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(h=>{
                    const sel = h.sym===selectedTicker;
                    return (
                      <tr key={h.id} onClick={()=>setSelectedTicker(sel?null:h.sym)}
                        style={{borderBottom:'1px solid var(--line)',cursor:'pointer',background:sel?'var(--accent-soft)':'transparent',transition:'background .12s'}}>
                        <td style={{padding:'13px 14px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:10}}>
                            <div className="av" style={{width:34,height:34,fontSize:12,flexShrink:0,background:'var(--grad)'}}>{h.sym?.slice(0,2)||'—'}</div>
                            <div>
                              <div style={{fontWeight:800,fontSize:14}}>{h.sym}</div>
                              <div style={{fontSize:11,color:'var(--muted)',maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.name}</div>
                              <div style={{fontSize:10,color:'var(--muted)'}}>{h.sh} shares · ₹{Number(h.cost).toLocaleString('en-IN')} avg</div>
                            </div>
                          </div>
                        </td>
                        <td style={{padding:'13px 14px',textAlign:'center'}}>
                          <div style={{fontWeight:700,fontSize:14}}>₹{Math.round(h.value).toLocaleString('en-IN')}</div>
                          <div style={{fontSize:11,color:'var(--muted)'}}>₹{Number(h.price).toLocaleString('en-IN')} now</div>
                        </td>
                        <td style={{padding:'13px 14px',textAlign:'center'}}>
                          <span style={{fontWeight:800,color:h.gain>=0?'var(--gain)':'var(--loss)',fontSize:15}}>{h.gain>=0?'+':''}{h.gain.toFixed(1)}%</span>
                          <div style={{fontSize:10,color:'var(--muted)'}}>₹{Math.round((h.price-h.cost)*h.sh).toLocaleString('en-IN')}</div>
                        </td>
                        <td style={{padding:'13px 14px',textAlign:'center',minWidth:140}}>
                          <ConsensusBar cons={h.community} width={120}/>
                        </td>
                        <td style={{padding:'13px 14px',textAlign:'center',minWidth:140}}>
                          <ConsensusBar cons={h.circle} width={120}/>
                        </td>
                        <td style={{padding:'13px 14px',textAlign:'center',minWidth:70}}>
                          <StrengthDot cons={h.community}/>
                        </td>
                        <td style={{padding:'13px 14px',textAlign:'center'}}>
                          <button className="iconbtn" title="Stock Insights"
                            onClick={e=>{e.stopPropagation();onOpenSecurity(h.sym,h.name);}}>
                            <ChevronRight size={16}/>
                          </button>
                        </td>
                        <td style={{padding:'13px 6px',textAlign:'center'}}>
                          <button className="iconbtn" title="Remove holding"
                            onClick={e=>{e.stopPropagation();setHoldings(p=>p.filter(x=>x.id!==h.id));deleteHolding(h.id);}}
                            style={{opacity:.4,color:'var(--loss)'}}
                            onMouseEnter={e=>e.currentTarget.style.opacity=1}
                            onMouseLeave={e=>e.currentTarget.style.opacity=.4}>
                            <Trash2 size={14}/>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) /* end isMobile ternary */ )}
        </div>

        {selected&&(
          isMobile
            ? <SecurityQuickPanel ticker={selected.sym} name={selected.name} allRecos={selected.allR} circleRecos={selected.circleR} onOpenFull={()=>onOpenSecurity(selected.sym,selected.name)} onClose={()=>setSelectedTicker(null)} modal/>
            : <SecurityQuickPanel ticker={selected.sym} name={selected.name} allRecos={selected.allR} circleRecos={selected.circleR} onOpenFull={()=>onOpenSecurity(selected.sym,selected.name)} onClose={()=>setSelectedTicker(null)}/>
        )}
      </div>

      {/* Modals */}
      {showManage&&<PanPullModal onClose={()=>setShowManage(false)} onApply={async (h,mode)=>{
          if (mode==='replace') { setHoldings(h); await replaceAllHoldings(h); }
          else {
            const toAdd = h.filter(nh=>!holdings.find(x=>x.sym===nh.sym));
            setHoldings(p=>[...p,...toAdd]);
            for (const nh of toAdd) await saveHolding(nh);
          }
          setShowManage(false);
        }}/>}
      {showAddHolding&&<AddHoldingModal onClose={()=>setShowAddHolding(false)} onAdd={async h=>{ setHoldings(p=>[...p,h]); await saveHolding(h); setShowAddHolding(false); }}/>}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ADD HOLDING MODAL
   ═══════════════════════════════════════════════════════════════════ */

export function AddHoldingModal({ onClose, onAdd }) {
  const [mode,        setMode]        = useState('search');   // 'search' | 'manual'
  const [selected,    setSelected]    = useState(null);        // instrument from search
  const [ticker,      setTicker]      = useState('');
  const [name,        setName]        = useState('');
  const [assetType,   setAssetType]   = useState('Stock');
  const [sector,      setSector]      = useState('');
  const [currency,    setCurrency]    = useState('INR');
  // Optional financial fields
  const [qty,         setQty]         = useState('');
  const [purchPrice,  setPurchPrice]  = useState('');
  const [purchDate,   setPurchDate]   = useState('');
  const [err,         setErr]         = useState('');

  const TYPE_OPTS = ['Stock','ETF','Fund','Crypto','Bond','REIT','Others'];
  const CCY_OPTS  = ['INR','USD','EUR','GBP','JPY','SGD','AED'];

  const handleSelect = instr => {
    setSelected(instr);
    setTicker((instr.symbol||instr.ticker||'').toUpperCase());
    setName(instr.name||'');
    setSector(instr.sector||'');
    setCurrency(instr.currency||'INR');
    // Map asset_class → holding type
    const ac = (instr.asset_class||instr.type||'').toLowerCase();
    setAssetType(ac.includes('etf')?'ETF':ac.includes('fund')||ac.includes('mf')?'Fund':ac.includes('crypto')?'Crypto':'Stock');
  };

  const canAdd = ticker.trim() && name.trim();

  const handleAdd = () => {
    if (!ticker.trim()) { setErr('Ticker / symbol is required.'); return; }
    if (!name.trim())   { setErr('Asset name is required.'); return; }
    const sh   = parseFloat(qty)        || 0;
    const cost = parseFloat(purchPrice) || 0;
    onAdd({
      id:        `hold_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      sym:       ticker.trim().toUpperCase(),
      name:      name.trim(),
      type:      assetType,
      acct:      'manual',
      acctName:  'Manual Portfolio',
      sh,
      cost,
      price:     cost,   // proxy until the nightly batch prices this ticker/ISIN
      isin:      selected?.isin || '',
      sector:    sector.trim(),
      currency,
      purchaseDate: purchDate || new Date().toISOString().slice(0,10),
      source:    'manual',
    });
  };

  const FieldLabel = ({children,hint}) => (
    <label style={{fontSize:12,fontWeight:700,color:'var(--muted)',display:'block',marginBottom:5}}>
      {children}{hint&&<span style={{fontWeight:400,marginLeft:6,fontSize:11}}>{hint}</span>}
    </label>
  );

  const inputSt = {
    width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--line-2)',
    background:'var(--surface)', color:'var(--ink)', fontSize:13, outline:'none',
    boxSizing:'border-box',
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{width:540, maxHeight:'92vh', overflowY:'auto'}} onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div className="modal-head">
          <h3 style={{display:'flex',alignItems:'center',gap:8}}>
            <Plus size={18} style={{color:'var(--accent-ink)'}}/> Add Holding
          </h3>
          <button className="icon-btn" onClick={onClose}><X size={20}/></button>
        </div>

        <div className="modal-body" style={{display:'flex',flexDirection:'column',gap:18,padding:'20px 24px'}}>

          {/* Mode toggle */}
          <div className="seg">
            <button className={mode==='search'?'active':''} onClick={()=>setMode('search')}>Search Asset</button>
            <button className={mode==='manual'?'active':''} onClick={()=>setMode('manual')}>Add Manually</button>
          </div>

          {/* Search mode */}
          {mode==='search'&&(
            <div>
              <FieldLabel>Search by name or ticker</FieldLabel>
              <InstrumentSearch
                onSelect={handleSelect}
                placeholder="e.g. Reliance, HDFCBANK, Nifty 50 ETF…"
                initialValue={ticker}
              />
              {selected&&(
                <div style={{marginTop:10,padding:'10px 14px',background:'var(--accent-soft)',borderRadius:10,
                  border:'1px solid var(--line-2)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:14}}>{selected.symbol||selected.ticker}</div>
                    <div style={{fontSize:12,color:'var(--muted)'}}>{selected.name}
                      {selected.exchange&&<span> · {selected.exchange}</span>}
                      {(selected.sector)&&<span> · {selected.sector}</span>}
                    </div>
                  </div>
                  <button className="iconbtn" onClick={()=>{setSelected(null);setTicker('');setName('');}} title="Clear"><X size={14}/></button>
                </div>
              )}
            </div>
          )}

          {/* Manual mode — ticker + name */}
          {mode==='manual'&&(
            <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:12}}>
              <div>
                <FieldLabel>Ticker / Symbol *</FieldLabel>
                <input value={ticker} onChange={e=>{setTicker(e.target.value.toUpperCase());setErr('');}}
                  placeholder="e.g. RELIANCE" maxLength={20} style={inputSt} autoFocus/>
              </div>
              <div>
                <FieldLabel>Asset Name *</FieldLabel>
                <input value={name} onChange={e=>{setName(e.target.value);setErr('');}}
                  placeholder="e.g. Reliance Industries Ltd" style={inputSt}/>
              </div>
            </div>
          )}

          {/* Asset details — shown once ticker+name are available */}
          {(mode==='manual'||(mode==='search'&&selected))&&(
            <>
              {/* Separator */}
              <div style={{borderTop:'1px solid var(--line)',margin:'0 -24px'}}/>

              {/* Ticker/name row for search mode (editable override) */}
              {mode==='search'&&(
                <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:12}}>
                  <div>
                    <FieldLabel hint="editable">Ticker</FieldLabel>
                    <input value={ticker} onChange={e=>setTicker(e.target.value.toUpperCase())} maxLength={20} style={inputSt}/>
                  </div>
                  <div>
                    <FieldLabel hint="editable">Name</FieldLabel>
                    <input value={name} onChange={e=>setName(e.target.value)} style={inputSt}/>
                  </div>
                </div>
              )}

              {/* Type / Sector / Currency */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                <div>
                  <FieldLabel>Asset Type</FieldLabel>
                  <select value={assetType} onChange={e=>setAssetType(e.target.value)} style={inputSt}>
                    {TYPE_OPTS.map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <FieldLabel hint="(optional)">Sector</FieldLabel>
                  <input value={sector} onChange={e=>setSector(e.target.value)} placeholder="e.g. Banking" style={inputSt}/>
                </div>
                <div>
                  <FieldLabel>Currency</FieldLabel>
                  <select value={currency} onChange={e=>setCurrency(e.target.value)} style={inputSt}>
                    {CCY_OPTS.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Optional section */}
              <div style={{background:'var(--surface-2)',borderRadius:12,padding:'16px 18px'}}>
                <div style={{fontSize:11,fontWeight:800,textTransform:'uppercase',letterSpacing:'.07em',
                  color:'var(--muted)',marginBottom:14,display:'flex',alignItems:'center',gap:8}}>
                  <span>Track Amounts</span>
                  <span style={{fontWeight:400,textTransform:'none',letterSpacing:0,fontSize:11}}>— optional, leave blank to track without disclosing</span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                  <div>
                    <FieldLabel>Quantity / Units</FieldLabel>
                    <input type="number" min="0" step="any" value={qty}
                      onChange={e=>setQty(e.target.value)} placeholder="e.g. 50" style={inputSt}/>
                  </div>
                  <div>
                    <FieldLabel>Purchase Price {currency&&<span style={{color:'var(--muted)',fontWeight:400}}>({currency})</span>}</FieldLabel>
                    <input type="number" min="0" step="any" value={purchPrice}
                      onChange={e=>setPurchPrice(e.target.value)} placeholder="per unit" style={inputSt}/>
                  </div>
                  <div>
                    <FieldLabel>Purchase Date</FieldLabel>
                    <input type="date" value={purchDate} onChange={e=>setPurchDate(e.target.value)}
                      max={new Date().toISOString().slice(0,10)} style={inputSt}/>
                  </div>
                </div>
                {qty&&purchPrice&&(
                  <div style={{marginTop:10,fontSize:12,color:'var(--muted)'}}>
                    Total invested: <strong style={{color:'var(--ink)'}}>{currency} {(parseFloat(qty)*parseFloat(purchPrice)).toLocaleString('en-IN',{maximumFractionDigits:2})}</strong>
                  </div>
                )}
              </div>

              {err&&<div style={{color:'var(--loss)',fontSize:13,fontWeight:600}}>{err}</div>}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="modal-foot" style={{justifyContent:'space-between'}}>
          <div style={{fontSize:12,color:'var(--muted)'}}>
            {!canAdd&&<span>* Ticker and name required</span>}
          </div>
          <div style={{display:'flex',gap:10}}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-pri" disabled={!canAdd} onClick={handleAdd}>
              <Plus size={14}/> Add to Portfolio
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MARKET INTELLIGENCE
   ═══════════════════════════════════════════════════════════════════ */
