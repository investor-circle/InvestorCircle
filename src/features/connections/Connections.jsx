import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Users,
  Search,
  Bell,
  Lock,
  X,
  Check,
  Send,
  Layers,
  ChevronDown,
  Mail,
  UserPlus,
  Trash2,
  Loader,
  Copy,
  Radar,
  Eye
} from "lucide-react";
import {
  acceptConnection,
  getMyConnections,
  rejectConnection,
  removeConnection,
  sendConnectionRequest
} from "../../services/api/connectionsApi";
import {
  lookupUser as dbLookupUser,
  getInvestorIciBatch as dbGetInvestorIciBatch
} from "../../services/api/profileApi";
import { computeIci } from "../../services/api/recommendationsApi";
import {
  upsertSharingPref
} from "../../services/api/sharingApi";
import {
  trackInvestor as dbTrackInvestor,
  untrackInvestor as dbUntrackInvestor,
  getTrackingCounts as dbGetTrackingCounts,
  getMyTrackers as dbGetMyTrackers,
  getMyTrackingList as dbGetMyTrackingList
} from "../../services/api/trackingApi";
import { Avatar, RecoBreakdown, SortTh, TypeTag } from "../../components/common";
import { CONTACT_COLORS, TODAY } from "../../constants/app";
import { GroupsSection } from "../groups/Groups";
import { useIsMobile } from "../../hooks/index";
import { sendEmail, sendPush } from "../../services/notify";
import { fmt, fmtPct, fmtSigned, initialsOf, recoStats } from "../../utils/format";
import { gotoUserProfile } from "../../utils/navigation";

export function Network({ connections, setConnections, groups, setGroups, sharing, setSharing, configs,
    canCreateGroups, pendingInvites, setPendingInvites, recsReceived, onOpenRecos, me,
    initTab, onInitTabConsumed, trackingCounts, onTrackingCountsChange }) {
  const [tab, setTab] = useState(initTab || "contacts");
  useEffect(()=>{
    if(initTab){ setTab(initTab); onInitTabConsumed && onInitTabConsumed(); }
  },[initTab]); // eslint-disable-line react-hooks/exhaustive-deps
  const pendingReceived = connections.filter(c=>c.status==="pending"&&c.direction==="received").length;
  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Network</div><div className="page-title">Your network</div>
          <div className="page-sub">Manage connections, tracking and Circles</div></div>
      </div>
      <div className="seg net-tabs" style={{marginBottom:20,flexWrap:"wrap"}}>
        <button className={tab==="contacts"?"active":""} onClick={()=>setTab("contacts")}>
          <Users size={15}/> Connections · {connections.filter(c=>c.status==="accepted").length}
          {pendingReceived>0 && <span className="nav-badge" style={{position:"static",marginLeft:6}}>{pendingReceived}</span>}
        </button>
        <button className={tab==="groups"?"active":""} onClick={()=>setTab("groups")}>
          <Layers size={15}/> Circles · {groups.length}
        </button>
        <button className={tab==="trackers"?"active":""} onClick={()=>setTab("trackers")}>
          <Eye size={15}/> Tracking me · {trackingCounts?.trackersCount ?? 0}
        </button>
        <button className={tab==="tracking"?"active":""} onClick={()=>setTab("tracking")}>
          <Radar size={15}/> I&apos;m tracking · {trackingCounts?.trackingCount ?? 0}
        </button>
      </div>
      {tab==="contacts" && <ContactsSection connections={connections} setConnections={setConnections}
            groups={groups} sharing={sharing} setSharing={setSharing} configs={configs}
            pendingInvites={pendingInvites} setPendingInvites={setPendingInvites}
            recsReceived={recsReceived} onOpenRecos={onOpenRecos} me={me}/>}
      {tab==="trackers" && <TrackingMeSection me={me} setConnections={setConnections} onTrackingCountsChange={onTrackingCountsChange}/>}
      {tab==="tracking" && <ImTrackingSection me={me} setConnections={setConnections} onTrackingCountsChange={onTrackingCountsChange}/>}
      {tab==="groups" && <GroupsSection groups={groups} setGroups={setGroups}
            contacts={connections.filter(c=>c.status==="accepted").map((c,i)=>({id:c.user_id,name:c.name,color:CONTACT_COLORS[i%CONTACT_COLORS.length],connectionId:c.connection_id}))}
            configs={configs} canCreateGroups={canCreateGroups} me={me}
            recsReceived={recsReceived} onOpenRecos={onOpenRecos}/>}
    </>
  );
}

const SORT_OPTIONS = [
  { value: "date_desc", label: "Newest first" },
  { value: "date_asc",  label: "Oldest first" },
  { value: "name_asc",  label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
];

function SortSelect({ value, onChange }) {
  return (
    <select className="inline-select sm" value={value} onChange={e=>onChange(e.target.value)} aria-label="Sort by">
      {SORT_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/* ── Shared row card for the Tracking me / I'm tracking lists ───────────────── */
function TrackingRow({ person, ici, connectionStatus, primaryAction, onConnect, connectBusy, isNew }) {
  const band = ici?.band;
  const bandColor = band==="Strong" ? "#4ade80" : band==="Good" ? "#a78bfa" : band==="Building" ? "#fbbf24" : "var(--muted)";
  return (
    <div className="card" style={isNew?{padding:0,borderColor:"var(--accent)",background:"var(--accent-soft, rgba(109,93,245,.05))"}:{padding:0}}>
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",flex:1,minWidth:180}}
          onClick={()=>gotoUserProfile(person.id)}>
          <Avatar f={{name:person.full_name,avatarUrl:person.avatar_url,color:person.avatar_color,initials:initialsOf(person.full_name||person.username||"?")}} size={40}/>
          <div style={{minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{fontWeight:700,fontSize:13.5,color:"var(--accent-ink)",textDecoration:"underline",textDecorationStyle:"dotted",textUnderlineOffset:3}}>{person.full_name||person.username}</div>
              {isNew && <span className="pill accent" style={{fontSize:10,padding:"2px 7px"}}>New</span>}
            </div>
            <div className="muted small">@{person.username||"—"}</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
          {ici && <div style={{textAlign:"center"}}>
            <div style={{fontWeight:800,fontSize:14,color:bandColor}}>{ici.score}</div>
            <div className="muted" style={{fontSize:10,textTransform:"uppercase",letterSpacing:".04em"}}>ICI</div>
          </div>}
          <div style={{textAlign:"center"}}>
            <div style={{fontWeight:800,fontSize:14}}>{ici?.total ?? "—"}</div>
            <div className="muted" style={{fontSize:10,textTransform:"uppercase",letterSpacing:".04em"}}>Ideas</div>
          </div>
          {primaryAction}
          {connectionStatus==="accepted"
            ? <span className="pill" style={{fontSize:11,background:"var(--gain-soft)",color:"var(--gain)"}}>Connected</span>
            : connectionStatus==="pending"
              ? <span className="pill" style={{fontSize:11}}>Pending</span>
              : <button className="btn btn-ghost btn-sm" disabled={connectBusy} onClick={onConnect}>
                  {connectBusy?<Loader size={13} className="spin"/>:<><UserPlus size={13}/> Connect</>}
                </button>}
        </div>
      </div>
    </div>
  );
}

/** Fetches ICI/Ideas stats for a page of people in ONE batched call (never per-row). */
function useIciBatch(ids) {
  const [icis, setIcis] = useState({});
  useEffect(()=>{
    if(!ids.length) return;
    dbGetInvestorIciBatch(ids).then(rows=>{
      const map = {};
      rows.forEach(row=>{
        const closed = Number(row.closed)||0;
        const hitPct = closed>0 ? (Number(row.wins)/closed*100) : 0;
        const riskAdj = Number(row.ret_stddev)>0 ? Math.max(Number(row.median_ret)/Number(row.ret_stddev),0) : 0;
        const ici = computeIci({
          years_history: Number(row.years_history)||0, total: row.total,
          hit_rate_pct: hitPct, median_return: Number(row.median_ret)||0,
          risk_adjusted_return: riskAdj, deleted_count: 0,
        });
        map[row.uid] = { ...ici, total: row.total };
      });
      setIcis(map);
    }).catch(()=>{});
  },[ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  return icis;
}

const PAGE_SIZE = 20;

/* ── "Tracking me" — people who track the current user ──────────────────────── */
export function TrackingMeSection({ me, setConnections, onTrackingCountsChange }) {
  const myId = me?.id || "me";
  const [people, setPeople] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState({});
  const [sort, setSort] = useState("date_desc");
  const icis = useIciBatch(useMemo(()=>people.map(p=>p.id),[people]));

  // "New since last visit" — a lightweight per-device cutoff (no schema
  // change needed for a purely visual affordance). Captured ONCE at mount
  // so highlighting stays stable for this viewing session; bumped after
  // mount so the NEXT visit's cutoff starts from here.
  const lastSeenKey = `mic_trackingme_seen_${myId}`;
  const [lastSeenAt] = useState(()=> { try { return localStorage.getItem(lastSeenKey); } catch { return null; } });
  useEffect(()=>{
    try { localStorage.setItem(lastSeenKey, new Date().toISOString()); } catch {}
  },[]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPage = async (offset, sortVal) => {
    setLoading(true);
    const { people: rows, hasMore: more } = await dbGetMyTrackers(PAGE_SIZE, offset, sortVal ?? sort);
    setPeople(prev => offset===0 ? rows : [...prev, ...rows]);
    setHasMore(more);
    setLoading(false);
  };
  // Re-fetches from the top whenever the sort changes (also covers initial mount).
  useEffect(()=>{ loadPage(0, sort); },[sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const doTrackBack = async (person) => {
    setBusy(b=>({...b,[person.id]:true}));
    await dbTrackInvestor(person.id);
    setPeople(ps=>ps.map(p=>p.id===person.id?{...p,am_i_tracking:true}:p));
    onTrackingCountsChange && onTrackingCountsChange(c=>({...c, trackingCount:(c.trackingCount||0)+1}));
    setBusy(b=>({...b,[person.id]:false}));
  };
  const doConnect = async (person) => {
    setBusy(b=>({...b,[person.id]:true}));
    const res = await sendConnectionRequest(myId, person.id);
    if(res && !res.error){
      setPeople(ps=>ps.map(p=>p.id===person.id?{...p,connection_status:"pending"}:p));
      setConnections(await getMyConnections(myId));
    }
    setBusy(b=>({...b,[person.id]:false}));
  };

  const isNew = (p) => !!lastSeenAt && new Date(p.created_at) > new Date(lastSeenAt);

  if(loading && people.length===0) return <div className="card"><div className="empty"><Loader size={16} className="spin"/> Loading…</div></div>;
  if(people.length===0) return <div className="card"><div className="empty">No one is tracking you yet. Share your public profile to grow your audience.</div></div>;

  return (<div style={{display:"flex",flexDirection:"column",gap:8}}>
    <div style={{display:"flex",justifyContent:"flex-end",marginBottom:2}}>
      <SortSelect value={sort} onChange={setSort}/>
    </div>
    {people.map(p=>(
      <TrackingRow key={p.id} person={p} ici={icis[p.id]} connectionStatus={p.connection_status} connectBusy={busy[p.id]} isNew={isNew(p)}
        onConnect={()=>doConnect(p)}
        primaryAction={p.am_i_tracking
          ? <span className="pill accent" style={{fontSize:11}}><Check size={11} style={{verticalAlign:-1,marginRight:2}}/>Tracking</span>
          : <button className="btn btn-pri btn-sm" disabled={busy[p.id]} onClick={()=>doTrackBack(p)}>
              {busy[p.id]?<Loader size={13} className="spin"/>:<><Radar size={13}/> Track back</>}
            </button>}/>
    ))}
    {hasMore && <button className="btn btn-ghost" disabled={loading} onClick={()=>loadPage(people.length)}>
      {loading?<Loader size={14} className="spin"/>:"Load more"}
    </button>}
  </div>);
}

/* ── "I'm tracking" — people the current user tracks ─────────────────────────── */
export function ImTrackingSection({ me, setConnections, onTrackingCountsChange }) {
  const myId = me?.id || "me";
  const [people, setPeople] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState({});
  const [sort, setSort] = useState("date_desc");
  const icis = useIciBatch(useMemo(()=>people.map(p=>p.id),[people]));

  const loadPage = async (offset, sortVal) => {
    setLoading(true);
    const { people: rows, hasMore: more } = await dbGetMyTrackingList(PAGE_SIZE, offset, sortVal ?? sort);
    setPeople(prev => offset===0 ? rows : [...prev, ...rows]);
    setHasMore(more);
    setLoading(false);
  };
  // Re-fetches from the top whenever the sort changes (also covers initial mount).
  useEffect(()=>{ loadPage(0, sort); },[sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const doUntrack = async (person) => {
    setBusy(b=>({...b,[person.id]:true}));
    await dbUntrackInvestor(person.id);
    setPeople(ps=>ps.filter(p=>p.id!==person.id));
    onTrackingCountsChange && onTrackingCountsChange(c=>({...c, trackingCount:Math.max((c.trackingCount||1)-1,0)}));
    setBusy(b=>({...b,[person.id]:false}));
  };
  const doConnect = async (person) => {
    setBusy(b=>({...b,[person.id]:true}));
    const res = await sendConnectionRequest(myId, person.id);
    if(res && !res.error){
      setPeople(ps=>ps.map(p=>p.id===person.id?{...p,connection_status:"pending"}:p));
      setConnections(await getMyConnections(myId));
    }
    setBusy(b=>({...b,[person.id]:false}));
  };

  if(loading && people.length===0) return <div className="card"><div className="empty"><Loader size={16} className="spin"/> Loading…</div></div>;
  if(people.length===0) return <div className="card"><div className="empty">You&apos;re not tracking anyone yet. Track an investor from their profile to see their ideas here.</div></div>;

  return (<div style={{display:"flex",flexDirection:"column",gap:8}}>
    <div style={{display:"flex",justifyContent:"flex-end",marginBottom:2}}>
      <SortSelect value={sort} onChange={setSort}/>
    </div>
    {people.map(p=>(
      <TrackingRow key={p.id} person={p} ici={icis[p.id]} connectionStatus={p.connection_status} connectBusy={busy[p.id]}
        onConnect={()=>doConnect(p)}
        primaryAction={
          <button className="btn btn-sm" style={{background:"var(--surface-2)",border:"1px solid var(--line)"}} disabled={busy[p.id]} onClick={()=>doUntrack(p)}>
            {busy[p.id]?<Loader size={13} className="spin"/>:<><Check size={13}/> Tracking</>}
          </button>}/>
    ))}
    {hasMore && <button className="btn btn-ghost" disabled={loading} onClick={()=>loadPage(people.length)}>
      {loading?<Loader size={14} className="spin"/>:"Load more"}
    </button>}
  </div>);
}

/* ── Contacts section ─────────────────────────────────────────────────────── */

export function ContactsSection({ connections, setConnections, groups, sharing, setSharing, configs,
    pendingInvites, setPendingInvites, recsReceived, onOpenRecos, me }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({key:"name",dir:"asc"});
  const [showAdd, setShowAdd] = useState(false);
  const [openContact, setOpenContact] = useState(null);
  const [expandId, setExpandId] = useState(null);
  const [busy, setBusy] = useState({});
  const myId = me?.id || "me";

  // ALL connections shown (all statuses) so user can see pending/rejected
  const rows = useMemo(() => {
    let r = [...connections];
    if (q.trim()) { const s=q.toLowerCase(); r=r.filter(c=>c.name.toLowerCase().includes(s)||c.email.toLowerCase().includes(s)); }
    const dir=sort.dir==="asc"?1:-1;
    r.sort((a,b)=>{
      if(sort.key==="name")   return a.name.localeCompare(b.name)*dir;
      if(sort.key==="status") return a.status.localeCompare(b.status)*dir;
      return 0;
    });
    return r;
  }, [connections, q, sort]);

  const statsOf = (c) => recoStats(recsReceived, r => r.from===c.user_id||(r.byName&&r.byName===c.name));
  const commonGroups = (c) => groups.filter(g=>g.members?.some(m=>m.user_id===c.user_id));
  const myPermFor = (c) => {
    const s = sharing[c.user_id];
    if (!s) return "off";
    if (s.visibility==="off") return "off";
    return s.level==="full"?"full":"names";
  };

  const doAccept = async (c) => {
    setBusy(b=>({...b,[c.connection_id]:true}));
    const [, reqInfo] = await Promise.all([
      acceptConnection(c.connection_id, myId),
      dbLookupUser('id', c.user_id).catch(() => null),
    ]);
    if (reqInfo?.email) {
      sendEmail('connection_accepted', { to_email:reqInfo.email, their_name:me?.name||'', their_username:me?.username||'' });
    }
    // Push notification to the person whose request was accepted
    sendPush(c.user_id, {
      title: '🤝 Connection accepted',
      body:  `${me?.name || 'Someone'} accepted your connection request`,
      url:   me?.username
        ? `https://myinvestorcircle.com/#/investor/${me.username}`
        : 'https://myinvestorcircle.com',
      tag:   'connection_accepted',
    });
    setConnections(await getMyConnections(myId));
    setBusy(b=>({...b,[c.connection_id]:false}));
  };
  const doReject = async (c) => {
    setBusy(b=>({...b,[c.connection_id]:true}));
    await rejectConnection(c.connection_id, myId);
    setConnections(await getMyConnections(myId));
    setBusy(b=>({...b,[c.connection_id]:false}));
  };
  const doRemove = async (c) => {
    if(!confirm(`Remove ${c.name} from your network?`)) return;
    await removeConnection(c.connection_id, myId);
    setConnections(cs=>cs.filter(x=>x.connection_id!==c.connection_id));
    setSharing(s=>{const ns={...s}; delete ns[c.user_id]; return ns;});
  };
  const setMyPerm_ = async (userId, val) => {
    const next = { visibility: val==="off"?"off":"all", level: val==="full"?"full":"names", selected:[] };
    setSharing(s=>({...s,[userId]:next}));
    await upsertSharingPref(myId, userId, "user", next);
  };

  const accepted = rows.filter(c=>c.status==="accepted");
  const pendingReceived = rows.filter(c=>c.status==="pending"&&c.direction==="received");
  const pendingSent = rows.filter(c=>c.status==="pending"&&c.direction==="sent");
  const rejected = rows.filter(c=>c.status==="rejected");

  const ContactRow = ({c, showActions}) => {
    const stats = statsOf(c);
    const mine = myPermFor(c);
    const open = expandId===c.connection_id;
    const cg = commonGroups(c);
    const av = {name:c.name,initials:initialsOf(c.name),color:CONTACT_COLORS[connections.indexOf(c)%CONTACT_COLORS.length]};
    return (<React.Fragment key={c.connection_id}>
      <tr className={"hoverable"+(c.status!=="accepted"?" hiddenrow":"")} style={{cursor:"pointer"}} onClick={()=>setExpandId(open?null:c.connection_id)}>
        <td><div style={{display:"flex",gap:11,alignItems:"center"}}>
          {/* Avatar + name: click opens public profile; rest of row click expands */}
          <div style={{display:"flex",gap:11,alignItems:"center",cursor:"pointer"}}
            title={`View ${c.name}'s public profile`}
            onClick={e=>{e.stopPropagation(); gotoUserProfile(c.user_id);}}>
            <Avatar f={av} size={36}/>
            <div className="sym" style={{color:"var(--accent-ink)",textDecoration:"underline",textDecorationStyle:"dotted",textUnderlineOffset:3}}>{c.name}</div>
          </div>
          {c.status==="pending"&&c.direction==="sent"     && <span className="pill" style={{fontSize:11,background:"#f59e0b22",color:"#b45309"}}>Pending</span>}
          {c.status==="pending"&&c.direction==="received" && <span className="pill accent" style={{fontSize:11}}>Wants to connect</span>}
          {c.status==="rejected" && <span className="pill loss" style={{fontSize:11}}>Rejected</span>}
          <ChevronDown size={14} className="muted" style={{transform:open?"rotate(180deg)":"none",transition:".15s"}}/>
        </div></td>
        <td className="muted small">{c.email}</td>
        <td>{cg.length===0?<span className="muted small">—</span>:<div style={{display:"flex",flexWrap:"wrap",gap:5}}>{cg.map(g=><span key={g.id} className="chip mini">{g.name}</span>)}</div>}</td>
        <td className="tnum">{c.status==="accepted"?stats.count:<span className="muted">—</span>}</td>
        <td style={{textAlign:"right"}}>
          {c.status==="accepted"
            ? <span className="clickable tnum nowrap" onClick={(e)=>{e.stopPropagation();onOpenRecos({by:c.name});}}>{fmtSigned(stats.pnl)} ↗</span>
            : <span className="muted">—</span>}</td>
        <td onClick={e=>e.stopPropagation()}>
          {c.status==="accepted"
            ? <select className="inline-select sm" value={mine} onChange={e=>setMyPerm_(c.user_id,e.target.value)}>
                <option value="off">Not shared</option><option value="names">Names only</option><option value="full">Amounts & P&L</option>
              </select>
            : <span className="muted small">—</span>}</td>
        <td onClick={e=>e.stopPropagation()}>
          {c.status==="pending"&&c.direction==="received" && (
            <div style={{display:"flex",gap:6}}>
              <button className="btn btn-pri btn-sm" disabled={busy[c.connection_id]} onClick={()=>doAccept(c)}><Check size={13}/> Accept</button>
              <button className="btn btn-ghost btn-sm" disabled={busy[c.connection_id]} onClick={()=>doReject(c)}><X size={13}/> Decline</button>
            </div>)}
          {(c.status==="pending"&&c.direction==="sent"||c.status==="rejected") && (
            <button className="iconbtn danger" title="Remove" onClick={()=>doRemove(c)}><Trash2 size={14}/></button>)}
          {c.status==="accepted" && (
            <button className="iconbtn danger" title="Remove from network" onClick={()=>doRemove(c)}><Trash2 size={14}/></button>)}
        </td>
      </tr>
      {open && c.status==="accepted" && <tr className="expand-row"><td colSpan={7}><div className="expand-inner" onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <b style={{fontSize:14}}>{c.name}&apos;s ideas to you</b>
          <button className="btn btn-ghost btn-sm" style={{color:"var(--loss)"}} onClick={()=>doRemove(c)}><Trash2 size={13}/> Remove</button>
        </div>
        <RecoBreakdown stats={statsOf(c)} pnlLabel="My P&L" onPnl={()=>onOpenRecos({by:c.name})}/>
      </div></td></tr>}
    </React.Fragment>);
  };

  return (<>
    {pendingInvites.length>0 && <div className="note info" style={{marginBottom:14}}><Mail size={16}/><div>Pending email invitations: {pendingInvites.map(p=>p.email).join(", ")}.</div></div>}
    <div className="toolbar">
      <div className="searchbox grow"><Search size={16} color="var(--muted)"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search by name or email…"/></div>
      <button className="btn btn-pri btn-sm" onClick={()=>setShowAdd(true)}><UserPlus size={15}/> Add connection</button>
    </div>

    {/* Pending incoming requests */}
    {pendingReceived.length>0 && (
      <div className="card" style={{marginBottom:16,border:"2px solid var(--accent)"}}>
        <div className="card-head" style={{color:"var(--accent)"}}><Bell size={15}/> {pendingReceived.length} pending connection request{pendingReceived.length>1?"s":""}</div>
        <div className="card-body" style={{padding:"8px 0"}}><table className="grid" style={{minWidth:800}}>
          <tbody>{pendingReceived.map(c=><ContactRow key={c.connection_id} c={c}/>)}</tbody>
        </table></div>
      </div>
    )}

    {/* Accepted contacts */}
    {connections.length===0
      ? <div className="card"><div className="empty">No connections yet. Use &ldquo;Add connection&rdquo; to invite people.</div></div>
      : <div className="card"><div className="card-body" style={{padding:"8px 0"}}><div className="tscroll"><table className="grid" style={{minWidth:900}}>
          <thead><tr>
            <SortTh label="Name"            k="name"   sort={sort} setSort={setSort}/>
            <th>Email</th>
            <th>Common groups</th>
            <SortTh label="Recos to me"     k="recos"  sort={sort} setSort={setSort}/>
            <SortTh label="My P&amp;L"      k="pnl"    sort={sort} setSort={setSort} align="right"/>
            <th>I share</th>
            <th>Actions</th>
          </tr></thead>
          <tbody>
            {accepted.map(c=><ContactRow key={c.connection_id} c={c}/>)}
            {pendingSent.map(c=><ContactRow key={c.connection_id} c={c}/>)}
            {rejected.map(c=><ContactRow key={c.connection_id} c={c}/>)}
          </tbody>
        </table></div></div></div>}

    {showAdd && <AddConnectionModal existing={connections} me={me} onClose={()=>setShowAdd(false)}
        onAddExisting={async(uid,info)=>{
          const res = await sendConnectionRequest(myId, uid);
          if (res.error==="already_exists") return;
          if (info?.email) sendEmail('connection_request', {
            to_email:      info.email,
            from_name:     me?.name || 'Someone',
            from_username: me?.username || '',
          });
          const conns = await getMyConnections(myId);
          setConnections(conns);
        }}
        onInvite={(email)=>{
          setPendingInvites(p=>p.some(x=>x.email===email)?p:[...p,{email,date:TODAY}]);
          sendEmail('invite', {
            to_email:    email,
            from_name:   me?.name || 'A fellow investor',
            invite_link: `https://myinvestorcircle.com/?ref=${me?.username||''}`,
          });
        }}/>}
    {openContact && <PortfolioModal contact={openContact} onClose={()=>setOpenContact(null)}/>}
  </>);
}

/* ── Add connection modal ──────────────────────────────────────────────────── */

export function AddConnectionModal({ existing, me, onClose, onAddExisting, onInvite }) {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const myName = me?.name || "your admin";
  const submit = async () => {
    const e = email.trim().toLowerCase();
    if(!/^\S+@\S+\.\S+$/.test(e)){ setResult({type:"warn",msg:"Please enter a valid email address."}); return; }
    if(existing.some(c=>c.email===e)){ setResult({type:"warn",msg:"You already have a connection with this person."}); return; }
    setBusy(true);
    try {
      const row = await dbLookupUser('email', e);
      if (row) {
        if (row.id === me?.id){ setResult({type:"warn",msg:"That is your own email address."}); setBusy(false); return; }
        await onAddExisting(row.id, {name:row.full_name,email:row.email});
        setResult({type:"ok",msg:`Connection request sent to ${row.full_name}. They will see it in their notifications.`});
      } else {
        onInvite(e);
        setResult({type:"info",msg:`${e} is not on My Investor Circle yet. An invitation note from ${myName} will be shared with them.`});
      }
    } catch(err) { setResult({type:"warn",msg:"Could not reach database: "+err.message}); }
    setBusy(false);
  };
  return (<div className="overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3><UserPlus size={18} style={{verticalAlign:-3,color:"var(--accent)"}}/> Add connection</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">
      <div className="field"><label>Email address</label>
        <input value={email} onChange={e=>{setEmail(e.target.value);setResult(null);}} placeholder="name@example.com" onKeyDown={e=>e.key==="Enter"&&!busy&&submit()} autoFocus/></div>
      <div className="muted small" style={{marginBottom:result?14:0}}>If they have a My Investor Circle account a connection request is sent. They must accept before you can share ideas.</div>
      {result && <div className={"note "+result.type}>{result.type==="ok"?<Check size={16}/>:<Mail size={16}/>}<div>{result.msg}</div></div>}
    </div>
    <div className="modal-foot"><span/>
      <div style={{display:"flex",gap:10}}>
        <button className="btn btn-ghost" onClick={onClose}>{result?"Done":"Cancel"}</button>
        <button className="btn btn-pri" disabled={!email||busy} onClick={submit}>
          {busy?<><Loader size={14} className="spin"/> Checking…</>:<><Send size={15}/> Send request</>}
        </button>
      </div>
    </div>
  </div></div>);
}

export function PortfolioModal({ contact, onClose }) {
  const full = contact.shared.level==="full";
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-head"><div style={{ display:"flex", gap:12, alignItems:"center" }}><Avatar f={contact} size={42}/>
          <div><h3>{contact.name}</h3><div className="muted small">{contact.title}</div></div></div>
          <button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
        <div className="modal-body">
          <div className="muted small" style={{ marginBottom:14, display:"flex", gap:6, alignItems:"center" }}>
            {contact.shared.level==="names" ? <><Lock size={13}/> Amounts and P&L are hidden — only names are shared.</> : <>Showing everything {contact.name.split(" ")[0]} shared with you.</>}</div>
          <table className="grid">
            <thead><tr><th>Asset</th><th>Type</th>{full && <><th style={{textAlign:"right"}}>Value</th><th style={{textAlign:"right"}}>P&L</th></>}</tr></thead>
            <tbody>{contact.shared.holdings.map((h,i)=>(
              <tr key={i} className="hoverable"><td><span className="sym">{h.sym}</span><div className="muted small">{h.name}</div></td>
                <td>{h.type?<TypeTag t={h.type}/>:<span className="muted">—</span>}</td>
                {full && <><td style={{textAlign:"right"}} className="tnum">{fmt(h.value)}</td>
                  <td style={{textAlign:"right"}} className={"tnum "+(h.pnlPct>=0?"pos":"neg")}>{fmtPct(h.pnlPct)}</td></>}</tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── InviteModal — personal referral link sharing ──────────────────────────── */

export function InviteModal({ username, referralCount=0, onClose }) {
  const isMobile = useIsMobile();
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}${window.location.pathname}?ref=${username||''}`;
  const waText = encodeURIComponent(
    `Hey! I track and share stock ideas on myInvestorCircle — a trusted network for serious investors. Join me here:\n${link}`
  );
  const copy = () => {
    navigator.clipboard.writeText(link)
      .then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2000); })
      .catch(()=>{});
  };

  const content = (
    <div style={{padding: isMobile?'20px 20px 36px':'28px 28px 24px'}}>
      {!isMobile && <div style={{fontWeight:900,fontSize:20,marginBottom:4}}>Invite Friends to myInvestorCircle</div>}
      <div style={{fontSize:14,color:'var(--muted)',lineHeight:1.55,marginBottom:20}}>
        Share your personal invite link. Anyone who signs up through it is automatically added to your investment circle — you can see each other's ideas right away.
      </div>

      {/* Referral stats */}
      {referralCount > 0 && (
        <div style={{background:'var(--gain-soft)',borderRadius:10,padding:'10px 14px',marginBottom:16,fontSize:13,fontWeight:700,color:'var(--gain)',display:'flex',alignItems:'center',gap:8}}>
          🎉 {referralCount} friend{referralCount!==1?'s':''} joined through your invite!
        </div>
      )}

      {/* Link box */}
      <div style={{background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:10,padding:'10px 14px',fontSize:12,color:'var(--muted)',wordBreak:'break-all',marginBottom:14,lineHeight:1.5}}>
        {link}
      </div>

      {/* Actions */}
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        <button className="btn btn-pri" style={{justifyContent:'center'}} onClick={copy}>
          {copied ? <><Check size={15}/> Copied!</> : <><Copy size={15}/> Copy Invite Link</>}
        </button>
        <a href={`https://wa.me/?text=${waText}`} target="_blank" rel="noopener noreferrer"
          className="btn btn-soft" style={{justifyContent:'center',textDecoration:'none'}} onClick={onClose}>
          <span style={{fontSize:17,lineHeight:1}}>💬</span> Share on WhatsApp
        </a>
      </div>

      <div style={{fontSize:11,color:'var(--muted)',marginTop:14,textAlign:'center',lineHeight:1.5}}>
        They get added to your circle as soon as they sign up — no extra steps needed.
      </div>

      <button className="btn btn-ghost" style={{width:'100%',justifyContent:'center',marginTop:12}} onClick={onClose}>
        Close
      </button>
    </div>
  );

  if (isMobile) return createPortal(
    <div style={{position:'fixed',inset:0,zIndex:9999,display:'flex',flexDirection:'column',justifyContent:'flex-end'}} onClick={onClose}>
      <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,.45)'}}/>
      <div style={{position:'relative',background:'var(--surface)',borderRadius:'20px 20px 0 0',maxHeight:'85vh',overflowY:'auto',boxShadow:'0 -8px 40px rgba(0,0,0,.28)'}} onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,background:'var(--line)',borderRadius:2,margin:'12px auto 0'}}/>
        <div style={{fontWeight:900,fontSize:18,padding:'16px 20px 0'}}>Invite Friends</div>
        {content}
      </div>
    </div>,
    document.body
  );

  return createPortal(
    <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center'}} onClick={onClose}>
      <div style={{background:'var(--surface)',borderRadius:18,width:440,maxWidth:'calc(100vw - 32px)',boxShadow:'0 16px 48px rgba(0,0,0,.2)',position:'relative'}} onClick={e=>e.stopPropagation()}>
        <button style={{position:'absolute',top:14,right:14,border:'none',background:'none',cursor:'pointer',color:'var(--muted)'}} onClick={onClose}><X size={18}/></button>
        {content}
      </div>
    </div>,
    document.body
  );
}
