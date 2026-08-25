import React, { useState } from "react";
import {
  Users,
  Lock,
  Eye,
  X,
  Layers,
  Flame
} from "lucide-react";
import {
  setFeedPref as dbSetFeedPref
} from "../../services/api/lookupsApi";
import { TypeTag } from "../../components/common";
import { fmt, fmtPct, initialsOf } from "../../utils/format";

export function Sharing({ sharing, setSharing, configs, holdings, contacts, groups, feedConfigOptions, userFeedPrefs, setUserFeedPrefs, effectiveFeedConfig, setEffectiveFeedConfig, myId }) {
  const [previewId, setPreviewId] = useState(null); const [pickFor, setPickFor] = useState(null);
  const nameOfLive = (id) => contacts.find(c=>c.id===id)?.name ?? groups.find(g=>g.id===id)?.name ?? id;
  const set=(id,patch)=>setSharing(s=>({...s,[id]:{...s[id],...patch}}));
  const Row = ({ id, name, sub, color, isGroup }) => {
    const cfg = sharing[id] || { visibility:"off", level:"names", selected:[] }; const off = cfg.visibility==="off";
    return (<tr className="hoverable">
      <td><div style={{ display:"flex", gap:11, alignItems:"center" }}>
        <div className="av" style={{ width:36, height:36, background:color, fontSize:13 }}>{isGroup?<Layers size={16}/>:initialsOf(name)}</div>
        <div><div style={{fontWeight:600}}>{name}</div><div className="muted small">{sub}</div></div></div></td>
      <td><select className="inline-select" value={cfg.visibility} onChange={e=>set(id,{visibility:e.target.value})}>
          <option value="off">Nothing</option><option value="all">Whole portfolio</option><option value="selected">Selected holdings</option></select>
        {cfg.visibility==="selected" && <div style={{marginTop:7}}><button className="btn btn-soft btn-sm" onClick={()=>setPickFor(id)}>{cfg.selected.length} chosen · edit</button></div>}</td>
      <td><div className="seg tiny" style={{ opacity:off?.45:1, pointerEvents:off?"none":"auto" }}>
          <button className={cfg.level==="names"?"active":""} onClick={()=>set(id,{level:"names"})}>Names</button>
          <button className={cfg.level==="full"?"active":""} disabled={!configs.allowAmountSharing} onClick={()=>set(id,{level:"full"})}>+ Amounts & P&L</button></div></td>
      <td style={{ textAlign:"right" }}><button className="btn btn-ghost btn-sm" disabled={off} onClick={()=>setPreviewId(id)}><Eye size={14}/> Preview</button></td>
    </tr>);
  };
  return (<>
    <div className="page-head"><div><div className="eyebrow">Sharing & Privacy</div><div className="page-title">Who sees what</div>
      <div className="page-sub">Set visibility per person or group, and how much detail.</div></div></div>
    {!configs.allowAmountSharing && <div className="card" style={{ marginBottom:16, borderLeft:"3px solid var(--accent)" }}><div className="card-body" style={{padding:"13px 16px", fontSize:13, display:"flex", gap:8, alignItems:"center"}}>
      <Lock size={15}/> Amount & P&L sharing is turned off by the administrator — only holding names can be shared right now.</div></div>}
    <div className="card" style={{ marginBottom:18 }}><div className="card-head"><span style={{display:"flex",gap:8,alignItems:"center"}}><Users size={16}/> Friends</span></div>
      <div className="card-body" style={{padding:"8px 10px"}}><div className="tscroll"><table className="grid" style={{minWidth:560}}><thead><tr><th>Connection</th><th>Can see</th><th>Detail level</th><th></th></tr></thead>
        <tbody>{contacts.map(f=><Row key={f.id} id={f.id} name={f.name} sub={f.title} color={f.color}/>)}</tbody></table></div></div></div>
    <div className="card"><div className="card-head"><span style={{display:"flex",gap:8,alignItems:"center"}}><Layers size={16}/> Groups</span></div>
      <div className="card-body" style={{padding:"8px 10px"}}><div className="tscroll"><table className="grid" style={{minWidth:560}}><thead><tr><th>Group</th><th>Can see</th><th>Detail level</th><th></th></tr></thead>
        <tbody>{groups.filter(g=>g.members.includes("me")).map(g=><Row key={g.id} id={g.id} name={g.name} sub={`${g.members.length} members`} color={g.color} isGroup/>)}</tbody></table></div></div></div>
    {pickFor && <HoldingsPicker entityName={nameOfLive(pickFor)} holdings={holdings} selected={sharing[pickFor].selected} onClose={()=>setPickFor(null)} onSave={(sel)=>{ set(pickFor,{selected:sel}); setPickFor(null); }}/>}
    {previewId && <SharePreview id={previewId} name={nameOfLive(previewId)} cfg={sharing[previewId]} holdings={holdings} onClose={()=>setPreviewId(null)}/>}

    {/* ── Feed Settings ── */}
    {feedConfigOptions.filter(o=>o.admin_enabled).length > 0 && (
      <div className="card" style={{marginTop:18}}>
        <div className="card-head"><span style={{display:'flex',gap:8,alignItems:'center'}}><Flame size={16}/> Feed Settings</span></div>
        <div className="card-body">
          <p style={{fontSize:13,color:'var(--ink-soft)',marginBottom:16,lineHeight:1.6}}>
            Personalise what appears in your idea feed. Options marked 🔒 are required by the platform and cannot be turned off.
          </p>
          {['sources','ranking','filters'].map(cat=>{
            const opts = feedConfigOptions.filter(o=>o.admin_enabled && o.category===cat);
            if(!opts.length) return null;
            const catLabel={sources:'Feed Sources',ranking:'Ranking',filters:'Filters'};
            return (
              <div key={cat} style={{marginBottom:18}}>
                <div className="cap" style={{marginBottom:10}}>{catLabel[cat]}</div>
                {opts.map(o=>{
                  const isLocked = o.always_on;
                  const currentVal = isLocked ? true
                    : (o.key in userFeedPrefs ? userFeedPrefs[o.key] : o.default_on);
                  const togglePref = async () => {
                    if(isLocked) return;
                    const next = !currentVal;
                    const newPrefs = {...userFeedPrefs,[o.key]:next};
                    setUserFeedPrefs(newPrefs);
                    // Recompute effective
                    const eff = {};
                    feedConfigOptions.forEach(x=>{
                      if(!x.admin_enabled){eff[x.key]=false;return;}
                      if(x.always_on){eff[x.key]=true;return;}
                      eff[x.key]=(x.key in newPrefs)?newPrefs[x.key]:x.default_on;
                    });
                    setEffectiveFeedConfig(eff);
                    if(myId){
                      dbSetFeedPref(o.key, next).catch(console.warn);
                    }
                  };
                  return (
                    <div key={o.key} style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:14,padding:'10px 0',borderBottom:'1px solid var(--line)'}}>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600,fontSize:13,display:'flex',alignItems:'center',gap:6}}>
                          {o.label}
                          {isLocked && <span title="Required by platform" style={{fontSize:10,padding:'1px 6px',borderRadius:4,background:'var(--accent-soft)',color:'var(--accent-ink)'}}>🔒 Required</span>}
                        </div>
                        <div style={{fontSize:12,color:'var(--muted)',marginTop:2}}>{o.description}</div>
                      </div>
                      <div className={"sw"+(currentVal?" on":"")}
                        style={{width:36,height:20,flexShrink:0,marginTop:2,opacity:isLocked?.5:1,cursor:isLocked?'not-allowed':'pointer'}}
                        onClick={togglePref}>
                        <div className="knob" style={{width:14,height:14,top:3}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    )}
  </>);
}

export function HoldingsPicker({ entityName, holdings, selected, onClose, onSave }) {
  const [sel, setSel] = useState(selected); const toggle=(id)=>setSel(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
  return (<div className="overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3>Holdings shared with {entityName}</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">{holdings.map(h=>(
      <label key={h.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 4px", borderBottom:"1px solid var(--line)", cursor:"pointer" }}>
        <input type="checkbox" checked={sel.includes(h.id)} onChange={()=>toggle(h.id)} style={{ width:17, height:17, accentColor:"var(--accent)" }}/>
        <span className="sym" style={{width:62}}>{h.sym}</span><span className="muted small" style={{flex:1}}>{h.name}</span><TypeTag t={h.type}/></label>))}</div>
    <div className="modal-foot"><span/><div style={{display:"flex",gap:10}}><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-pri" onClick={()=>onSave(sel)}>Save · {sel.length}</button></div></div>
  </div></div>);
}

export function SharePreview({ id, name, cfg, holdings, onClose }) {
  const rows = holdings.filter(h=> cfg.visibility==="all"?true:cfg.selected.includes(h.id)).map(h=>({...h,value:h.sh*h.price,pnlPct:(h.price-h.cost)/h.cost}));
  return (<div className="overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3>As seen by {name}</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body"><div className="muted small" style={{ marginBottom:14, display:"flex", gap:6, alignItems:"center" }}>
      {cfg.level==="full" ? "They see names, amounts and P&L for these holdings." : <><Lock size={13}/> They see names only — amounts and P&L stay private.</>}</div>
      <div className="tscroll"><table className="grid" style={{minWidth:420}}><thead><tr><th>Asset</th><th>Type</th>{cfg.level==="full" && <><th style={{textAlign:"right"}}>Value</th><th style={{textAlign:"right"}}>P&L</th></>}</tr></thead>
        <tbody>{rows.map(r=>(<tr key={r.id} className="hoverable"><td><span className="sym">{r.sym}</span><div className="muted small">{r.name}</div></td><td><TypeTag t={r.type}/></td>
          {cfg.level==="full" && <><td style={{textAlign:"right"}} className="tnum">{fmt(r.value)}</td><td style={{textAlign:"right"}} className={"tnum "+(r.pnlPct>=0?"pos":"neg")}>{fmtPct(r.pnlPct)}</td></>}</tr>))}</tbody></table></div></div>
  </div></div>);
}

/* =================================================================== PUBLIC PROFILE */

// Fallback sector list — used when sector_master table is unavailable.
// Kept in sync with the hardcoded options the sector dropdown showed historically.
