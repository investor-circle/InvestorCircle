import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  TrendingUp,
  TrendingDown,
  X,
  ChevronDown,
  ArrowUpDown,
  AlertTriangle,
  Loader
} from "lucide-react";
import { SOCIAL_BRAND, SOCIAL_PATHS, TYPE_COLORS } from "../constants/app";
import { classColor, consensusStrengthColor, fmt, fmtDate, fmtSigned, initialsOf } from "../utils/format";
import { loadInstruments } from "../utils/instruments";

export const TypeTag = ({ t }) => <span className="ttag"><span className="dot" style={{ background:TYPE_COLORS[t]||"#999" }}/>{t}</span>;

export const Avatar = ({ f, size=40 }) => {
  if (!f) return <div className="av" style={{ width:size, height:size, background:"var(--grad)", fontSize:size*0.38 }}>?</div>;
  const avatarUrl = f.avatarUrl || f.avatar_url;
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className="av" style={{ width:size, height:size, objectFit:"cover" }}/>;
  }
  return <div className="av" style={{ width:size, height:size, background:f.color||"var(--grad)", fontSize:size*0.38 }}>{f.initials||initialsOf(f.name||"?")}</div>;
};

/* ── useIsMobile — JS-driven responsive control (bypasses CSS media query issues) ── */

export function SortTh({ label, k, sort, setSort, align }) {
  const active = sort.key===k;
  return (
    <th className={"sortable"+(active?" sorted":"")} style={align?{textAlign:align}:null}
        onClick={()=>setSort(s=>({ key:k, dir: s.key===k && s.dir==="asc" ? "desc":"asc" }))}>
      {label}<span className="si">{active ? (sort.dir==="asc"?<ChevronDown size={13} style={{transform:"rotate(180deg)"}}/>:<ChevronDown size={13}/>) : <ArrowUpDown size={12}/>}</span>
    </th>
  );
}

export function RecoBreakdown({ stats, onPnl, pnlLabel }) {
  return (
    <div className="statgrid">
      <div className="stat"><div className="v">{stats.count}</div><div className="l">Ideas</div></div>
      <div className="stat"><div className="v">{stats.acted}</div><div className="l">I acted on</div></div>
      <div className="stat"><div className="v">{stats.liked}</div><div className="l">I liked</div></div>
      <div className="stat"><div className="v">{stats.disliked}</div><div className="l">I disliked</div></div>
      <div className="stat"><div className="v pos">{stats.inMoney}</div><div className="l">In the money</div></div>
      <div className="stat"><div className="v neg">{stats.outMoney}</div><div className="l">Out of money</div></div>
      <div className="stat click" onClick={(e)=>{ e.stopPropagation(); onPnl(); }}>
        <div className={"v "+(stats.pnl>=0?"pos":"neg")}>{fmtSigned(stats.pnl)}</div>
        <div className="l" style={{color:"var(--accent-ink)"}}>{pnlLabel||"My P&L"} ↗</div></div>
    </div>
  );
}

/* ── Notification Panel ─────────────────────────────────────────────────────── */

export const Money = ({ itm }) => <span className={"pill "+(itm?"gain":"loss")}>{itm?<TrendingUp size={12}/>:<TrendingDown size={12}/>} {itm?"In the money":"Out of the money"}</span>;

export const ClassTag = ({ c }) => <span className="ttag nowrap"><span className="dot" style={{ background:classColor(c) }}/>{c}</span>;

export function HoldPreviewTable({ holdings }) {
  return (<table className="grid"><thead><tr><th>Symbol</th><th>Name</th><th>Type</th><th style={{textAlign:"right"}}>Shares</th><th style={{textAlign:"right"}}>Cost</th><th style={{textAlign:"right"}}>Price</th><th style={{textAlign:"right"}}>Value</th></tr></thead>
    <tbody>{holdings.map(h=>(<tr key={h.id} className="hoverable"><td className="sym">{h.sym}</td><td className="muted small">{h.name}</td><td><TypeTag t={h.type}/></td>
      <td style={{textAlign:"right"}} className="tnum">{h.sh}</td><td style={{textAlign:"right"}} className="tnum">{fmt(h.cost)}</td><td style={{textAlign:"right"}} className="tnum">{fmt(h.price)}</td>
      <td style={{textAlign:"right"}} className="tnum">{fmt(h.sh*h.price)}</td></tr>))}</tbody></table>);
}

export function SocialIconBtn({ platform, url }) {
  const brand = SOCIAL_BRAND[platform] || {};
  const hasBrand = url && brand.icon;
  const inner = (
    <div style={{
      width:34, height:34, borderRadius:9,
      background: hasBrand ? brand.active : url ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.04)',
      border: `1px solid ${hasBrand ? brand.border : 'rgba(255,255,255,.1)'}`,
      display:'flex', alignItems:'center', justifyContent:'center',
      cursor: url ? 'pointer' : 'default',
      transition:'all .15s',
    }}
    onMouseEnter={e=>{ if(url) e.currentTarget.style.background = hasBrand ? brand.active.replace('.18','.32').replace('.2','.32') : 'rgba(255,255,255,.18)'; }}
    onMouseLeave={e=>{ e.currentTarget.style.background = hasBrand ? brand.active : url ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.04)'; }}>
      <svg width={16} height={16} viewBox="0 0 24 24" fill={hasBrand ? brand.icon : url ? 'rgba(255,255,255,.6)' : 'rgba(255,255,255,.2)'}>
        <path d={SOCIAL_PATHS[platform]}/>
      </svg>
    </div>
  );
  if (!url) return inner;
  return <a href={url.startsWith('http') ? url : `https://${url}`} target="_blank" rel="noopener noreferrer" style={{textDecoration:'none'}}>{inner}</a>;
}

/* ─── ICI Donut ─────────────────────────────────────────────────────────────── */

export function IciDonut({ score, band }) {
  const SIZE = 200;
  const cx = SIZE / 2, cy = SIZE / 2;
  const r = 82;
  const circ    = 2 * Math.PI * r;
  const pct     = Math.max(0, Math.min(100, score || 0));
  const filled  = (pct / 100) * circ;          // exact score% of circumference
  const col  = pct >= 70 ? '#4ade80' : pct >= 50 ? '#a78bfa' : pct >= 30 ? '#fbbf24' : '#f87171';
  const dark = pct >= 70 ? '#052e16' : pct >= 50 ? '#2e1065' : pct >= 30 ? '#451a03' : '#3b0a14';
  const glow = pct >= 70 ? 'rgba(74,222,128,.6)' : pct >= 50 ? 'rgba(167,139,250,.6)' : pct >= 30 ? 'rgba(251,191,36,.6)' : 'rgba(248,113,113,.6)';
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:10,flexShrink:0}}>
      <div style={{position:'relative',width:SIZE,height:SIZE}}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {/* Outer halo ring */}
          <circle cx={cx} cy={cy} r={r+15} fill="none" stroke={col} strokeWidth={1} opacity={.12}/>
          {/* Inner dark fill of donut hole */}
          <circle cx={cx} cy={cy} r={r} fill={dark} opacity={.55}/>
          {/* Track — full grey ring */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={16}/>
          {/* Score arc — starts at 12 o'clock via rotate(-90), fills exactly score% clockwise */}
          <g transform={`rotate(-90 ${cx} ${cy})`}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={col} strokeWidth={16}
              strokeDasharray={`${filled} ${circ - filled}`}
              strokeLinecap="round"
              style={{filter:`drop-shadow(0 0 10px ${glow})`}}/>
          </g>
          {/* Centre text */}
          <text x={cx} y={cy - 11} textAnchor="middle" dominantBaseline="middle"
            fontSize={46} fontWeight={900} fill="#fff"
            fontFamily="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
            letterSpacing="-2">{score}</text>
          <text x={cx} y={cy + 22} textAnchor="middle" dominantBaseline="middle"
            fontSize={13} fill="rgba(255,255,255,.35)"
            fontFamily="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">/100</text>
        </svg>
      </div>
      <div style={{fontSize:13,fontWeight:800,color:col,letterSpacing:'.1em',textTransform:'uppercase',textShadow:`0 0 16px ${glow}`}}>{band}</div>
    </div>
  );
}

/* ─── Small helpers ─────────────────────────────────────────────────────────── */

export function ScoreBox({ val, label, big, col, mobile }) {
  return (
    <div style={{
      textAlign:'center',
      padding: mobile ? '9px 6px' : '13px 10px',
      background:'var(--surface-2)',
      border:'1px solid var(--line)',
      borderRadius:12,
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      minWidth:0,overflow:'hidden',
    }}>
      <div style={{
        fontSize: big ? (mobile?19:24) : (mobile?14:18),
        fontWeight:800,
        color:col||'var(--ink)',
        fontFamily:'var(--font)',
        letterSpacing: big?'-.5px':'-.2px',
        lineHeight:1,
        maxWidth:'100%',
        overflow:'hidden',
        textOverflow:'ellipsis',
        whiteSpace:'nowrap',
      }}>{val}</div>
      <div style={{
        fontSize: mobile ? 9.5 : 11,
        color:'var(--muted)',
        marginTop:mobile?3:5,
        fontWeight:600,
        textTransform:'uppercase',
        letterSpacing:'.04em',
        lineHeight:1.2,
        wordBreak:'break-word',
      }}>{label}</div>
    </div>
  );
}

export function RetBadge({ pct, size=13 }) {
  const n=Number(pct||0), pos=n>=0;
  return <span style={{fontWeight:800,fontSize:size,color:pos?'var(--gain)':'var(--loss)',letterSpacing:'-.2px'}}>{pos?'+':''}{n.toFixed(1)}%</span>;
}

export function TypeBadge({ t }) {
  return <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:5,background:t==='Sell'?'var(--loss-soft)':'var(--gain-soft)',color:t==='Sell'?'var(--loss)':'var(--gain)'}}>{t||'Buy'}</span>;
}

export function ConvBadge({ level }) {
  if(!level) return null;
  const col=level==='High'?'var(--accent)':level==='Medium'?'var(--amber)':'var(--muted)';
  return <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:5,border:`1px solid ${col}`,color:col}}>{level}</span>;
}

export function StatusBadge2({ status }) {
  const cfg={Active:{bg:'#dbeafe',col:'#1d4ed8'},Closed:{bg:'var(--gain-soft)',col:'var(--gain)'},Expired:{bg:'#f3f4f6',col:'var(--muted)'}}[status]||{bg:'#f3f4f6',col:'var(--muted)'};
  return <span style={{fontSize:11,fontWeight:600,padding:'3px 9px',borderRadius:5,background:cfg.bg,color:cfg.col}}>{status}</span>;
}

/**
 * Compact info line for a CLOSED idea (exited or expired) — the label,
 * closing date, closing price, and the return from posting price to that
 * close. Renders nothing for an idea that's still open (getClosedInfo(r)
 * returns null). Takes the {kind,date,price,pending,retPct} shape
 * src/utils/format.js's getClosedInfo() produces, not a raw reco row —
 * callers compute that once and pass it in, so this stays a pure renderer.
 */
export function ClosedInfoLine({ info, cur='INR' }) {
  if (!info) return null;
  const exited = info.kind === 'exited';
  return (
    <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',fontSize:11.5,padding:'7px 10px',borderRadius:8,
      background: exited ? 'var(--loss-soft)' : 'var(--surface-2)',
      color: exited ? 'var(--loss)' : 'var(--ink-soft)'}}>
      <b>{exited ? 'Exited' : 'Expired'}</b>
      {info.date && <span>{fmtDate(info.date)}</span>}
      {info.pending
        ? <span style={{color:'var(--muted)'}}>· {exited ? 'exit' : 'expiry'} price pending</span>
        : <>
            <span>· {fmt(info.price, cur)}</span>
            {info.retPct != null && <><span>·</span><RetBadge pct={info.retPct*100} size={11.5}/></>}
          </>}
    </div>
  );
}

/* ─── SharePublicPopover (unchanged) ────────────────────────────────────────── */
/* ─── ReceivedSharePopover — for received recommendations ─────────────────────── */

export class ProfileErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(err) { return { error: err }; }
  componentDidCatch(err, info) { console.error('PublicProfile render error:', err, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{padding:'40px 24px',textAlign:'center'}}>
          <AlertTriangle size={32} color="var(--loss)" style={{marginBottom:14}}/>
          <div style={{fontWeight:700,fontSize:16,marginBottom:8,color:'var(--ink)'}}>Profile failed to render</div>
          <div style={{fontSize:13,color:'var(--muted)',marginBottom:16,maxWidth:440,margin:'0 auto 16px'}}>
            Something went wrong building the profile view. The error below may help diagnose the issue.
          </div>
          <div style={{background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:10,
              padding:'12px 16px',fontSize:12,fontFamily:'monospace',color:'var(--loss)',textAlign:'left',
              maxWidth:560,margin:'0 auto',wordBreak:'break-all'}}>
            {this.state.error.message}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Generic render-error boundary — catches a thrown error anywhere in its
 * subtree and shows a small inline "X failed to load" card with the error
 * message instead of taking down everything above it. Without a boundary
 * like this, an uncaught render error unmounts React all the way up to
 * whichever ancestor (if any) does have one — with nothing between a page
 * section and the app root, that section's crash blanks the entire app.
 * `label` names the section in the fallback text (e.g. "Home feed").
 */
export class SectionErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(err) { return { error: err }; }
  componentDidCatch(err, info) { console.error(`${this.props.label || 'Section'} render error:`, err, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{padding:'24px 18px',textAlign:'center',background:'var(--surface)',border:'1px solid var(--line)',borderRadius:16}}>
          <AlertTriangle size={26} color="var(--loss)" style={{marginBottom:10}}/>
          <div style={{fontWeight:700,fontSize:14,marginBottom:6,color:'var(--ink)'}}>{this.props.label || 'This section'} failed to load</div>
          <div style={{fontSize:12,color:'var(--muted)',marginBottom:10}}>Try refreshing the page. If it keeps happening, this detail may help:</div>
          <div style={{background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:8,
              padding:'8px 12px',fontSize:11,fontFamily:'monospace',color:'var(--loss)',textAlign:'left',wordBreak:'break-all'}}>
            {this.state.error.message}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Small popover anchored below an icon-only trigger button — the filter/
 * sort pattern used by the search/filter/sort icon row on both the
 * public-profile Investment Ideas list and Portfolio's holdings grid.
 * Closes on any click outside itself or the anchor button.
 */
export function SmallAnchoredPopover({ anchorEl, onClose, children, width=200 }) {
  const [pos, setPos] = useState(null);
  const popRef = useRef(null);

  useEffect(() => {
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    }
    // anchorEl.contains(), not a strict !== check — the anchor is usually an
    // icon-only button, so a real click's e.target is the child <svg>/icon
    // inside it, not the button element itself. A strict !== comparison
    // treats that as an outside click, closes the popover on mousedown, and
    // then the button's own onClick toggle re-opens it on the same click —
    // the popover could only ever be dismissed by clicking elsewhere.
    const h = (e) => { if (popRef.current && !popRef.current.contains(e.target) && !anchorEl?.contains(e.target)) onClose(); };
    setTimeout(() => document.addEventListener('mousedown', h), 0);
    // The popover is `position:fixed`, computed once from the anchor
    // button's rect at open time — it does not track the button as the page
    // scrolls (the anchor sits in normal document flow and moves; the fixed
    // popover doesn't), so it visually detaches from its trigger and is left
    // floating over unrelated content. Closing on any scroll (capture: true,
    // since scroll doesn't bubble) is the same fix outside-click already
    // applies for the equivalent "this popover no longer makes sense" case.
    const onScroll = () => onClose();
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', h);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pos) return null;
  return createPortal(
    <div ref={popRef} style={{position:'fixed',top:pos.top,right:pos.right,zIndex:9999,background:'var(--surface)',border:'1px solid var(--line)',borderRadius:12,boxShadow:'0 8px 32px rgba(0,0,0,.18)',padding:10,minWidth:width,fontFamily:'var(--font)'}} onClick={e=>e.stopPropagation()}>
      {children}
    </div>,
    document.body
  );
}

export function WidgetHeader({ icon: Icon, emoji, label, action, onAction }) {
  return (
    <div style={{background:'var(--grad)',padding:'10px 14px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <span style={{fontWeight:700,fontSize:11,color:'#fff',display:'flex',alignItems:'center',gap:5,textTransform:'uppercase',letterSpacing:'.5px'}}>
        {Icon && <Icon size={12} color="rgba(255,255,255,.85)"/>}
        {emoji && <span style={{fontSize:13}}>{emoji}</span>}
        {label}
      </span>
      {action && (
        <button onClick={onAction} style={{background:'rgba(255,255,255,.15)',border:'none',color:'#fff',cursor:'pointer',fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:6,letterSpacing:'.3px'}}>
          {action}
        </button>
      )}
    </div>
  );
}

/* ─── Sidebar Widget: Fresh from Network (#7) ─── */

export function InstrumentSearch({ onSelect, placeholder, initialValue }) {
  const [q, setQ] = useState(initialValue || "");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  // Pre-warm cache on mount
  useEffect(() => { loadInstruments(); }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const doSearch = async (term) => {
    if (!term || term.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    const all = await loadInstruments();
    const t = term.toLowerCase();
    const hits = all.filter(i =>
      i.symbol.toLowerCase().startsWith(t) ||
      i.name.toLowerCase().includes(t)
    ).slice(0, 18);
    setResults(hits);
    setOpen(hits.length > 0);
    setLoading(false);
  };

  const select = (inst) => {
    setQ(`${inst.symbol} — ${inst.name}`);
    setOpen(false);
    onSelect({
      symbol:     inst.symbol,
      name:       inst.name,
      exchange:   inst.exchange,
      assetClass: inst.asset_class,
      currency:   inst.currency,
      sector:     inst.sector || null,   // ← pass sector from master
    });
  };

  const CURRENCY_SYMBOL = { INR:"₹", USD:"$", GBP:"£", EUR:"€" };

  return (
    <div style={{position:"relative"}} ref={ref}>
      <div style={{display:"flex",alignItems:"center",gap:8,background:"var(--surface)",border:"1px solid var(--line-2)",borderRadius:11,padding:"10px 13px",transition:".12s"}}
           onFocus={()=>q.length>=2&&setOpen(results.length>0)}>
        <Search size={15} color="var(--muted)"/>
        <input
          value={q}
          onChange={e=>{ setQ(e.target.value); doSearch(e.target.value); }}
          placeholder={placeholder || "Search by symbol or name…"}
          style={{border:"none",outline:"none",background:"transparent",fontSize:14,flex:1}}
        />
        {loading && <Loader size={14} className="spin" color="var(--muted)"/>}
        {q && !loading && <X size={14} style={{cursor:"pointer",color:"var(--muted)"}} onClick={()=>{setQ("");setResults([]);setOpen(false);onSelect(null);}}/>}
      </div>
      {open && (
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:12,boxShadow:"0 8px 28px rgba(0,0,0,.13)",zIndex:200,maxHeight:300,overflowY:"auto"}}>
          {results.map(inst=>(
            <div key={inst.symbol+inst.exchange}
                 style={{padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid var(--line)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}
                 onMouseDown={()=>select(inst)}
                 onMouseEnter={e=>e.currentTarget.style.background="var(--surface-2)"}
                 onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{minWidth:0}}>
                <span style={{fontWeight:700,fontSize:13}}>{inst.symbol}</span>
                <span className="muted" style={{marginLeft:8,fontSize:12,display:"inline-block",maxWidth:260,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{inst.name}</span>
              </div>
              <div style={{display:"flex",gap:5,flexShrink:0}}>
                <span className="chip mini">{inst.exchange}</span>
                <span className="chip mini">{inst.asset_class}</span>
                <span className="chip mini">{CURRENCY_SYMBOL[inst.currency]||inst.currency}</span>
              </div>
            </div>
          ))}
          {results.length===0 && <div className="empty" style={{padding:20,fontSize:13}}>No instruments found</div>}
        </div>
      )}
    </div>
  );
}

/* ── Admin: Seed Data ────────────────────────────────────────────────────────── */

export function ConsensusBar({cons={},width=110,mini=false}) {
  if (!cons.total) return <span style={{color:'var(--muted)',fontSize:12}}>—</span>;
  const col = consensusStrengthColor(cons);
  return (
    <div>
      <div style={{fontSize:mini?10:12,fontWeight:700,color:col,marginBottom:2}}>{cons.label}</div>
      <div style={{display:'flex',height:4,borderRadius:3,overflow:'hidden',width,background:'rgba(141,144,173,.15)'}}>
        <div style={{width:`${cons.bullPct}%`,background:'var(--gain)',transition:'width .4s'}}/>
        <div style={{width:`${cons.neutralPct}%`,background:'rgba(141,144,173,.35)'}}/>
        <div style={{width:`${cons.bearPct}%`,background:'var(--loss)',transition:'width .4s'}}/>
      </div>
      {!mini&&<div style={{fontSize:10,color:'var(--muted)',marginTop:3,display:'flex',gap:10}}>
        <span style={{color:'var(--gain)'}}>{cons.bullPct}% B</span>
        <span style={{color:'var(--loss)'}}>{cons.bearPct}% S</span>
        <span>{cons.total} investor{cons.total!==1?'s':''}</span>
      </div>}
    </div>
  );
}

export function StrengthDot({cons={}}) {
  const strength = cons.strength||0;
  const col = consensusStrengthColor(cons);
  const label = strength>=60?'Strong':strength>=20?'Moderate':'Weak';
  return (
    <div style={{textAlign:'center'}}>
      <div style={{fontSize:22,fontWeight:900,color:col,lineHeight:1}}>{strength}</div>
      <div style={{fontSize:10,color:col,fontWeight:700}}>{label}</div>
    </div>
  );
}

/* ── SparkLine — simple SVG trend line ─────────────────────────── */
/* ─── PeopleSearch — search users by name or username ──────────────────────── */

export function SparkLine({data=[], color='var(--gain)', height=50}) {
  if (data.length < 2) return null;
  const max=Math.max(...data,1), min=Math.min(...data,0), range=max-min||1;
  const pts = data.map((v,i)=>`${(i/(data.length-1))*100},${100-((v-min)/range)*80-10}`).join(' ');
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{width:'100%',height,display:'block'}}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="3"
        strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
    </svg>
  );
}

/* ── computeTrend — monthly bullish% from recommendation dates ──── */
