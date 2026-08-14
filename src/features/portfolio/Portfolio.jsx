import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Search,
  Eye,
  EyeOff,
  TrendingUp,
  Plus,
  X,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  ChevronDown,
  Trash2,
  Filter,
  Download,
  Upload,
  FileSpreadsheet,
  FileText,
  Loader,
  RefreshCw,
  Globe,
  BarChart2,
  Zap
} from "lucide-react";
import { exportPortfolioExcel, exportPortfolioPDF } from "../../exporters";
import { parsePortfolioFile } from "../../importers";
import { isFinnhubConfigured } from "../../services/priceService";
import { track } from "../../firebase";
import {
  addPortfolioHolding as dbAddPortfolioHolding,
  deleteAllPortfolioHoldings as dbDeleteAllPortfolioHoldings,
  deletePortfolioHolding as dbDeletePortfolioHolding,
  getPortfolioHoldings as dbGetPortfolioHoldings
} from "../../services/api/lookupsApi";
import {
  getConsensusRecosAll as dbGetConsensusRecosAll
} from "../../services/api/recommendationsApi";
import { ConsensusBar, InstrumentSearch, Ring, Sparkline, StrengthDot, TypeTag } from "../../components/common";
import { ACCOUNTS, SPARK, TYPE_COLORS } from "../../constants/app";
import { SecurityQuickPanel } from "../discovery/Discovery";
import { ImportPreviewModal, PanPullModal } from "../recommendations/Recommendations";
import { useDerivedHoldings, useIsMobile } from "../../hooks/index";
import { computeConsensus, fmt, fmtPct, fmtSigned } from "../../utils/format";

export function Portfolio({ configs, holdings, setHoldings, refreshPrices, priceRefresh }) {
  const [acct, setAcct] = useState("all"); const [hide, setHide] = useState(false);
  const [importRes, setImportRes] = useState(null); const [importBusy, setImportBusy] = useState(false);
  const [showPan, setShowPan] = useState(false); const [menu, setMenu] = useState(false);
  const [showAddHolding, setShowAddHolding] = useState(false);
  const fileRef = useRef(null);
  const { rows } = useDerivedHoldings(holdings, configs.allowCryptoAccounts);
  const shown = acct==="all" ? rows : rows.filter(r=>r.acct===acct);
  const onPickFile = async (e) => {
    const file = e.target.files?.[0]; e.target.value=""; if(!file) return;
    setImportBusy(true);
    try { const res = await parsePortfolioFile(file); setImportRes({ ...res, fileName:file.name }); }
    catch(err){ setImportRes({ holdings:[], warnings:["Could not read this file: "+err.message], fileName:file.name }); }
    setImportBusy(false);
  };
  const applyImport = (newHoldings, mode) => {
    setHoldings(prev => mode==="replace" ? newHoldings : [...prev, ...newHoldings]);
    setImportRes(null);
  };
  const sTotal=shown.reduce((s,r)=>s+r.value,0), sCost=shown.reduce((s,r)=>s+r.costTot,0), sPnl=sTotal-sCost;
  const byType = useMemo(()=>{ const m={}; shown.forEach(r=>m[r.type]=(m[r.type]||0)+r.value); return Object.entries(m).map(([k,v])=>({label:k,value:v,color:TYPE_COLORS[k]||"#999"})); },[shown]);
  const top=[...shown].sort((a,b)=>b.value-a.value)[0]; const mask=(s)=>hide?"••••••":s;
  const fmtTime=(d)=>d?d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"}):"";
  return (<>
    <div className="page-head"><div><div className="eyebrow">My Portfolio</div><div className="page-title">Everything in one place</div>
      <div className="page-sub">{ACCOUNTS.length} accounts aggregated · {rows.length} holdings</div></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.pdf" style={{display:"none"}} onChange={onPickFile}/>
        <button className="btn btn-pri btn-sm" onClick={()=>setShowAddHolding(true)}><Plus size={15}/> Add holding</button>
        <div style={{position:"relative"}}>
          <button className="btn btn-soft btn-sm" onClick={()=>setMenu(m=>!m)}><Download size={15}/> Export <ChevronDown size={13}/></button>
          {menu && <div className="menu" onMouseLeave={()=>setMenu(false)}>
            <div className="menu-item" onClick={()=>{ exportPortfolioExcel(shown); setMenu(false); }}><FileSpreadsheet size={15}/> {shown.length===0?"Download template (.xlsx)":"Excel (.xlsx)"}</div>
            <div className="menu-item" onClick={()=>{ exportPortfolioPDF(shown); setMenu(false); }}><FileText size={15}/> PDF (.pdf)</div>
          </div>}
        </div>
        <button className="btn btn-soft btn-sm" disabled={importBusy} onClick={()=>fileRef.current?.click()}>
          {importBusy ? <><Loader size={15} className="spin"/> Reading…</> : <><Upload size={15}/> Import</>}</button>
        <button className="btn btn-soft btn-sm" onClick={()=>setShowPan(true)}><Upload size={15}/> Upload CAS</button>
        <button className="btn btn-ghost btn-sm" onClick={()=>setHide(v=>!v)}>{hide?<Eye size={15}/>:<EyeOff size={15}/>} {hide?"Show values":"Hide values"}</button>
      </div></div>

    {/* ── Live price refresh bar ── */}
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,flexWrap:"wrap"}}>
      {isFinnhubConfigured
        ? <button className="btn btn-pri btn-sm" disabled={priceRefresh.busy} onClick={refreshPrices} style={{gap:7}}>
            {priceRefresh.busy
              ? <><Loader size={14} className="spin"/> Refreshing all prices…</>
              : <><RefreshCw size={14}/> Refresh live prices</>}
          </button>
        : <button className="btn btn-soft btn-sm" disabled title="Add VITE_FINNHUB_KEY to .env to enable live prices" style={{gap:7,opacity:.55}}>
            <RefreshCw size={14}/> Refresh live prices
          </button>}
      {!isFinnhubConfigured &&
        <span className="muted small">Live prices disabled — add <code style={{background:"var(--surface-2,#f0f0f8)",padding:"1px 6px",borderRadius:5,fontFamily:"monospace"}}>VITE_FINNHUB_KEY</code> to <code style={{background:"var(--surface-2,#f0f0f8)",padding:"1px 6px",borderRadius:5,fontFamily:"monospace"}}>.env</code> to enable. See <b>README</b>.</span>}
      {isFinnhubConfigured && priceRefresh.lastAt &&
        <span className="muted small"><span className="hl green" style={{fontSize:12}}>✓ Updated {fmtTime(priceRefresh.lastAt)}</span></span>}
      {isFinnhubConfigured && !priceRefresh.lastAt && !priceRefresh.busy &&
        <span className="muted small">Prices are mock data — click to pull live quotes from Finnhub.</span>}
      {priceRefresh.errors.length>0 &&
        <span className="muted small" style={{color:"var(--loss)"}}>{priceRefresh.errors.length} symbol{priceRefresh.errors.length>1?"s":""} had no data (kept existing price)</span>}
    </div>
    <div className="hero-grad"><div>
      <div className="lbl">Total balance · {acct==="all"?"all accounts":ACCOUNTS.find(a=>a.id===acct)?.name}</div>
      <div className="balance tnum">{mask(fmt(sTotal))}</div>
      <div className="delta-light">{sPnl>=0?<ArrowUpRight size={17}/>:<ArrowDownRight size={17}/>} {mask(fmtSigned(sPnl))} ({fmtPct(sPnl/sCost)}) all time</div></div>
      <Sparkline data={SPARK} w={190} h={58} color="#ffffff"/></div>
    <div className="kpi-row">
      <div className="kpi"><div className="lbl"><Wallet size={14}/> Invested (cost)</div><div className="val tnum">{mask(fmt(sCost))}</div></div>
      <div className="kpi"><div className="lbl">Unrealized P&L</div><div className={"val tnum "+(sPnl>=0?"pos":"neg")}>{mask(fmtSigned(sPnl))}</div><div className={"sub "+(sPnl>=0?"pos":"neg")}>{fmtPct(sPnl/sCost)}</div></div>
      <div className="kpi"><div className="lbl">Holdings</div><div className="val">{shown.length}</div><div className="sub muted">in {new Set(shown.map(r=>r.acct)).size} accounts</div></div>
      <div className="kpi"><div className="lbl">Top position</div><div className="val">{top?.sym}</div><div className="sub muted">{fmt(top?.value||0)}</div></div></div>
    <div className="portfolio-layout" style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:18 }}>
      <div className="card"><div className="card-head">Holdings
        <select className="inline-select" value={acct} onChange={e=>setAcct(e.target.value)}><option value="all">All accounts</option>{ACCOUNTS.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        <div className="card-body" style={{ padding:"8px 10px" }}>
          {shown.length===0
            ? <div className="empty" style={{padding:"32px 16px"}}>
                <div style={{marginBottom:12}}>No holdings yet.</div>
                <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
                  <button className="btn btn-pri btn-sm" onClick={()=>setShowAddHolding(true)}><Plus size={14}/> Add holding</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>fileRef.current?.click()}><Upload size={14}/> Import Excel</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>{ exportPortfolioExcel([]); }}><Download size={14}/> Download template</button>
                </div>
              </div>
            : <table className="grid">
                <thead><tr><th>Asset</th><th>Account</th><th>Type</th><th style={{textAlign:"right"}}>Value</th><th style={{textAlign:"right"}}>P&L</th><th></th></tr></thead>
                <tbody>{shown.map(r=>(<tr key={r.id} className="hoverable">
                  <td><div className="sym">{r.sym}</div><div className="muted small">{r.name}</div></td>
                  <td className="muted small">{r.acctName}</td><td><TypeTag t={r.type}/></td>
                  <td style={{textAlign:"right"}} className="tnum">{mask(fmt(r.value))}</td>
                  <td style={{textAlign:"right"}} className={"tnum "+(r.pnl>=0?"pos":"neg")}>{hide?"••••":<>{fmtSigned(r.pnl)}<div className="small">{fmtPct(r.pnlPct)}</div></>}</td>
                  <td><button className="iconbtn danger" title="Remove holding" onClick={()=>setHoldings(hs=>hs.filter(h=>h.id!==r.id))}><Trash2 size={13}/></button></td>
                </tr>))}</tbody>
              </table>}
        </div></div>
      <div className="card" style={{ height:"fit-content" }}><div className="card-head">Allocation</div>
        <div className="card-body" style={{ display:"flex", flexDirection:"column", alignItems:"center" }}><Ring data={byType}/>
          <div style={{ width:"100%", marginTop:18, display:"flex", flexDirection:"column", gap:11 }}>
            {byType.map(d=>(<div key={d.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:13 }}>
              <span style={{ display:"flex", alignItems:"center", gap:9 }}><span className="dot" style={{background:d.color, width:10, height:10}}/>{d.label}</span>
              <b className="tnum">{((d.value/sTotal)*100).toFixed(0)}%</b></div>))}</div></div></div>
    </div>
    {importRes && <ImportPreviewModal result={importRes} onClose={()=>setImportRes(null)} onApply={applyImport}/>}
    {showPan && <PanPullModal onClose={()=>setShowPan(false)} onApply={(h,mode)=>{ applyImport(h,mode); setShowPan(false); }}/>}
    {showAddHolding && <AddHoldingModal onClose={()=>setShowAddHolding(false)} onAdd={(h)=>{ setHoldings(hs=>[...hs,h]); setShowAddHolding(false); }}/>}
  </>);
}
/* =================================================================== RECOMMENDATIONS */

export function PortfolioIntelligencePage({ holdings, setHoldings, contacts, me, refreshPrices, priceRefresh, onOpenSecurity, setPage }) {
  const isMobile = useIsMobile();
  const [recoMap, setRecoMap] = useState({}); // { ticker: [reco,...] }
  const [loading, setLoading] = useState(true);
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [showManage, setShowManage] = useState(false);
  const [showAddHolding, setShowAddHolding] = useState(false);
  const [tab, setTab] = useState('all'); // all | bullish | neutral | bearish

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
  // so consensus overlay stays fresh after CAS imports and manual additions
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[holdings.length]); // re-runs on holding add/remove; covers CAS upload + manual add

  const holdingsData = useMemo(()=>holdings.map(h=>{
    // Uppercase both sides so 'KPL' matches 'kpl' in recoMap
    const key    = (h.sym||'').toUpperCase().trim();
    const allR   = recoMap[key]||[];
    const circleR= allR.filter(r=>circleIds.includes(r.from));
    const community = computeConsensus(allR);
    const circle    = computeConsensus(circleR);
    const value = (h.sh||0)*(h.price||0);
    const gain  = h.cost>0?((h.price-h.cost)/h.cost*100):0;
    return {...h, community, circle, value, gain, allR, circleR};
  }),[holdings,recoMap,circleIds]);

  const filtered = holdingsData.filter(h=>
    tab==='all'||
    (tab==='bullish'&&h.community.bullPct>=55)||
    (tab==='bearish'&&h.community.bearPct>=55)||
    (tab==='neutral'&&h.community.bullPct<55&&h.community.bearPct<55)
  );

  const totalValue = holdingsData.reduce((s,h)=>s+(h.value||0),0);
  const avgBull = holdingsData.filter(h=>h.community.total>0).reduce((s,h,_,a)=>s+h.community.bullPct/a.length,0)||0;
  const highConv = holdingsData.filter(h=>h.community.strength>=60).length;
  const selected = holdingsData.find(h=>h.sym===selectedTicker);

  // ── Opportunity Signals ──────────────────────────────────────────
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
    const emerging = holdingsData.filter(h=>{
      const recent = (h.allR||[]).filter(r => r.created_at && (now - new Date(r.created_at)) < thirtyDays);
      return recent.length>=2 && h.community.total<=6;
    }).sort((a,b)=>b.community.bullPct-a.community.bullPct).slice(0,3);
    return { strongConv, weakening, emerging };
  },[holdingsData]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Intelligence</div>
          <div className="page-title">Portfolio Intelligence</div>
          <div className="page-sub">See what the market and your circle think about the stocks you hold</div>
        </div>
        <div style={{display:'flex',gap:10,flexWrap:'wrap',justifyContent:'flex-end'}}>
          {loading&&<Loader size={16} className="spin" style={{color:'var(--muted)',marginRight:4}}/>}
          <button className="btn btn-ghost btn-sm" title="Reload consensus data from latest recommendations"
            onClick={()=>{ setRecoMap({}); setLoading(true); /* holdings.length dep triggers reload */ setHoldings(h=>[...h]); }}>
            <RefreshCw size={13}/> Refresh Intelligence
          </button>
          <button className="btn btn-ghost btn-sm" onClick={()=>setShowAddHolding(true)}><Plus size={13}/> Add Holding</button>
          <button className="btn btn-soft btn-sm" onClick={()=>setShowManage(true)}><Upload size={13}/> Upload CAS</button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:20}}>
        {[
          {icon:<BarChart2 size={18}/>,label:'Total Holdings',val:holdings.length,sub:holdings.length?`${holdingsData.filter(h=>h.community.total>0).length} tracked by community`:'Upload CAS to begin'},
          {icon:<Globe size={18}/>,label:'Total Value',val:`₹${Math.round(totalValue).toLocaleString('en-IN')}`,accent:true},
          {icon:<TrendingUp size={18}/>,label:'Avg Market Sentiment',val:`${Math.round(avgBull)}% Bullish`,bar:true,pct:avgBull},
          {icon:<Zap size={18}/>,label:'High Conviction',val:highConv,sub:`holdings with strong consensus`},
        ].map((s,i)=>(
          <div key={i} className="card" style={{padding:'16px 18px'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,color:'var(--accent-ink)',opacity:.7}}>{s.icon}</div>
            <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--muted)',marginBottom:4}}>{s.label}</div>
            <div style={{fontSize:20,fontWeight:900,color:s.accent?'var(--accent-ink)':'var(--ink)'}}>{s.val}</div>
            {s.sub&&<div style={{fontSize:11,color:'var(--muted)',marginTop:3}}>{s.sub}</div>}
            {s.bar&&<div style={{height:3,borderRadius:2,overflow:'hidden',marginTop:8,background:'var(--line)'}}>
              <div style={{width:`${s.pct}%`,background:'var(--gain)',height:'100%',transition:'width .6s'}}/>
            </div>}
          </div>
        ))}
      </div>

      {/* Opportunity Signals — only shown when there are holdings with consensus data */}
      {holdingsData.some(h=>h.community.total>0)&&(signals.strongConv.length>0||signals.weakening.length>0||signals.emerging.length>0)&&(
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:800,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--muted)',marginBottom:10,display:'flex',alignItems:'center',gap:6}}>
            <Zap size={13}/> Opportunity Signals
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:10}}>
            {/* Strongest Conviction */}
            {signals.strongConv.length>0&&signals.strongConv.map(h=>(
              <div key={'sc'+h.sym} className="card" style={{padding:'12px 14px',cursor:'pointer',border:'1px solid var(--gain)',borderRadius:12}}
                onClick={()=>{setSelectedTicker(h.sym);}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                  <span style={{fontSize:9,fontWeight:800,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--gain)',background:'var(--gain-soft)',padding:'2px 7px',borderRadius:4}}>Strong Conviction</span>
                  <span style={{fontSize:10,color:'var(--muted)'}}>{h.community.strength}/100</span>
                </div>
                <div style={{fontWeight:900,fontSize:15}}>{h.sym}</div>
                <div style={{fontSize:11,color:'var(--muted)',marginBottom:6,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.name}</div>
                <ConsensusBar cons={h.community} width={'100%'} mini/>
              </div>
            ))}
            {/* Diverging — circle less bullish than community */}
            {signals.weakening.length>0&&signals.weakening.map(h=>(
              <div key={'wk'+h.sym} className="card" style={{padding:'12px 14px',cursor:'pointer',border:'1px solid #fbbf24',borderRadius:12}}
                onClick={()=>{setSelectedTicker(h.sym);}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                  <span style={{fontSize:9,fontWeight:800,textTransform:'uppercase',letterSpacing:'.06em',color:'#92400e',background:'#fef3c7',padding:'2px 7px',borderRadius:4}}>Circle Diverging</span>
                  <span style={{fontSize:10,color:'var(--muted)'}}>↓{Math.round(h.community.bullPct-h.circle.bullPct)}%</span>
                </div>
                <div style={{fontWeight:900,fontSize:15}}>{h.sym}</div>
                <div style={{fontSize:11,color:'var(--muted)',marginBottom:6,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.name}</div>
                <div style={{fontSize:11,color:'var(--muted)'}}>Community {h.community.bullPct}% bull · Circle {h.circle.bullPct}% bull</div>
              </div>
            ))}
            {/* Emerging — few but growing recos */}
            {signals.emerging.length>0&&signals.emerging.map(h=>(
              <div key={'em'+h.sym} className="card" style={{padding:'12px 14px',cursor:'pointer',border:'1px solid var(--accent)',borderRadius:12}}
                onClick={()=>{setSelectedTicker(h.sym);}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                  <span style={{fontSize:9,fontWeight:800,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--accent-ink)',background:'var(--accent-soft)',padding:'2px 7px',borderRadius:4}}>Emerging Idea</span>
                  <span style={{fontSize:10,color:'var(--muted)'}}>+Recent</span>
                </div>
                <div style={{fontWeight:900,fontSize:15}}>{h.sym}</div>
                <div style={{fontSize:11,color:'var(--muted)',marginBottom:6,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.name}</div>
                <ConsensusBar cons={h.community} width={'100%'} mini/>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="seg" style={{marginBottom:16}}>
        {[['all','All Holdings'],['bullish','Bullish'],['neutral','Neutral'],['bearish','Bearish']].map(([v,l])=>(
          <button key={v} className={tab===v?'active':''} onClick={()=>setTab(v)}>{l}</button>
        ))}
      </div>

      {/* Main grid: table + quick panel — stacks on mobile */}
      <div style={{display:'grid',gridTemplateColumns:selected&&!isMobile?'1fr 340px':'1fr',gap:16,alignItems:'start'}}>
        <div className="card">
          <div className="card-head"><BarChart2 size={15}/> My Holdings — Market Consensus Overlay</div>
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
            /* ── Mobile: asset card list (keeps scroll, search, filters at top) ── */
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
                  {h.community.total>0&&(<div style={{marginBottom:6}}><div style={{fontSize:10,color:'var(--muted)',marginBottom:3}}>Community</div><ConsensusBar cons={h.community} width={'100%'} mini/></div>)}
                  {h.circle.total>0&&(<div style={{marginBottom:6}}><div style={{fontSize:10,color:'var(--muted)',marginBottom:3}}>My circle</div><ConsensusBar cons={h.circle} width={'100%'} mini/></div>)}
                  {h.community.total===0&&h.circle.total===0&&(<div style={{fontSize:11,color:'var(--muted)',fontStyle:'italic',marginBottom:4}}>No recommendations yet</div>)}
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8,paddingTop:8,borderTop:'1px solid var(--line)'}}>
                    <button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={e=>{e.stopPropagation();onOpenSecurity(h.sym,h.name);}}><ChevronRight size={13}/> Security Intel</button>
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
                    {['Stock','Current Value','Overall Gain','Market Consensus (All Investors)','Consensus in My Circle','Strength','',''].map((h,i)=>(
                      <th key={i} style={{padding:'10px 14px',textAlign:i===0?'left':'center',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',color:'var(--muted)',whiteSpace:'nowrap'}}>{h}</th>
                    ))}
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
                          <StrengthDot strength={h.community.strength}/>
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
      price:     cost,   // use purchase price as proxy until live price refreshes
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
