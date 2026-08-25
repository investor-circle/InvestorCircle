import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Users,
  Search,
  Bell,
  X,
  Check,
  Layers,
  UserPlus,
  Trash2,
  Loader,
  Copy,
  Radar,
  Eye,
  Info,
  ArrowUpDown
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
  trackInvestor as dbTrackInvestor,
  untrackInvestor as dbUntrackInvestor,
  getTrackingCounts as dbGetTrackingCounts,
  getMyTrackers as dbGetMyTrackers,
  getMyTrackingList as dbGetMyTrackingList
} from "../../services/api/trackingApi";
import { getMyTrackedRecos as dbGetMyTrackedRecos } from "../../services/api/engagementApi";
import { Avatar, RecoBreakdown, SmallAnchoredPopover, SortTh } from "../../components/common";
import { CONTACT_COLORS } from "../../constants/app";
import { GroupsSection } from "../groups/Groups";
import { useIsMobile } from "../../hooks/index";
import { sendEmail, sendPush } from "../../services/notify";
import { fmtDate, fmtSigned, initialsOf, recoStats } from "../../utils/format";
import { gotoUserProfile } from "../../utils/navigation";

export function Network({ connections, setConnections, groups, setGroups, configs,
    canCreateGroups, recsReceived, onOpenRecos, me, setPage,
    initTab, onInitTabConsumed, trackingCounts, onTrackingCountsChange }) {
  const [tab, setTab] = useState(initTab || "contacts");
  useEffect(()=>{
    if(initTab){ setTab(initTab); onInitTabConsumed && onInitTabConsumed(); }
  },[initTab]); // eslint-disable-line react-hooks/exhaustive-deps
  const pendingReceived = connections.filter(c=>c.status==="pending"&&c.direction==="received").length;

  const TABS = [
    { id:"contacts", icon:Users,  label:"Connections",  count:connections.filter(c=>c.status==="accepted").length, badge:pendingReceived },
    { id:"groups",   icon:Layers, label:"Circles",       count:groups.length },
    { id:"trackers", icon:Eye,    label:"Tracking me",   count:trackingCounts?.trackersCount ?? 0 },
    { id:"tracking", icon:Radar,  label:"I'm tracking",  count:trackingCounts?.trackingCount ?? 0 },
  ];

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Network</div><div className="page-title">Your network</div>
          <div className="page-sub">Manage connections, tracking and Circles</div></div>
        <button className="btn btn-pri btn-sm" onClick={()=>setPage && setPage("discover")}>
          <UserPlus size={15}/> Grow your network
        </button>
      </div>
      {/* Two lines per tab (label, then count) instead of one long "Label · N"
          string — a single row of 4 short, fixed-height buttons that can
          neither wrap into a ragged multi-row mess nor need to scroll. */}
      <div className="seg net-tabs" style={{marginBottom:20}}>
        {TABS.map(t=>(
          <button key={t.id} className={tab===t.id?"active":""} onClick={()=>setTab(t.id)}
            style={{flexDirection:"column",gap:2}}>
            <span style={{display:"flex",alignItems:"center",gap:5}}><t.icon size={14}/> {t.label}</span>
            <span style={{display:"flex",alignItems:"center",gap:4,fontSize:12,fontWeight:800}}>
              {t.count}
              {t.badge>0 && <span className="nav-badge" style={{position:"static"}}>{t.badge}</span>}
            </span>
          </button>
        ))}
      </div>
      {tab==="contacts" && <ContactsSection connections={connections} setConnections={setConnections}
            groups={groups}
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
  { value: "date_desc",  label: "Newest first" },
  { value: "date_asc",   label: "Oldest first" },
  { value: "name_asc",   label: "Name A–Z" },
  { value: "name_desc",  label: "Name Z–A" },
  { value: "ici_desc",   label: "ICI (high→low)" },
  { value: "ideas_desc", label: "Ideas posted (high→low)" },
];
// Sorted client-side (see useTrackingPeople below) — ICI and idea count
// are computed in the browser via computeIci()/useIciBatch, the same
// single source of truth every other ICI display in the app uses, rather
// than a second copy of that formula ported into SQL just for ordering.
const CLIENT_SORT_KEYS = new Set(["ici_desc", "ideas_desc"]);
// Upper bound on how many people we'll fetch (in PAGE_SIZE-sized hops) to
// sort client-side — matches investor-ici-batch's own 500-uid cap, so we
// never fetch more people than we could score anyway.
const CLIENT_SORT_FETCH_CAP = 500;

// Connections tab's sort dropdown — same {key,dir} shape ContactsSection's
// SortTh column headers already use, so a dropdown pick and a header click
// stay perfectly in sync (one shared `sort` state, two ways to set it).
const CONTACTS_SORT_OPTIONS = [
  { value: "name_asc",   label: "Name A–Z",                key: "name",  dir: "asc"  },
  { value: "name_desc",  label: "Name Z–A",                 key: "name",  dir: "desc" },
  { value: "recos_desc", label: "Ideas to me (high→low)",   key: "recos", dir: "desc" },
  { value: "pnl_desc",   label: "My P&L (high→low)",        key: "pnl",   dir: "desc" },
  { value: "ici_desc",   label: "ICI (high→low)",           key: "ici",   dir: "desc" },
  { value: "ideas_desc", label: "Ideas posted (high→low)",  key: "ideas", dir: "desc" },
];

// Icon-only trigger + popover — same pattern Portfolio's holdings-grid
// header uses for its filter/sort icons — instead of a full <select>, so
// the search box + sort control fit on one row on mobile without wrapping.
// `options` defaults to SORT_OPTIONS (Tracking me / I'm tracking); the
// Connections tab passes CONTACTS_SORT_OPTIONS through the wrapper below.
function SortIconButton({ value, onChange, options=SORT_OPTIONS }) {
  const [open, setOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const active = value !== options[0].value;
  return (
    <div style={{position:"relative",flexShrink:0}}>
      <button ref={setAnchorEl} className={"icon-btn"+(active?" active":"")} style={{width:36,height:36}}
        title="Sort by" onClick={()=>setOpen(v=>!v)}><ArrowUpDown size={15}/></button>
      {open && (
        <SmallAnchoredPopover anchorEl={anchorEl} onClose={()=>setOpen(false)} width={220}>
          {options.map(o=>{
            const isActive = o.value===value;
            return (
              <div key={o.value} onClick={()=>{onChange(o.value);setOpen(false);}}
                style={{padding:"8px 9px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:isActive?700:500,color:isActive?"var(--accent-ink)":"var(--ink)",background:isActive?"var(--accent-soft)":"transparent"}}>
                {o.label}
              </div>
            );
          })}
        </SmallAnchoredPopover>
      )}
    </div>
  );
}

function ContactsSortIconButton({ sort, setSort }) {
  const current = CONTACTS_SORT_OPTIONS.find(o=>o.key===sort.key && o.dir===sort.dir)?.value || "name_asc";
  return (
    <SortIconButton value={current} options={CONTACTS_SORT_OPTIONS} onChange={v=>{
      const opt = CONTACTS_SORT_OPTIONS.find(o=>o.value===v);
      if (opt) setSort({key:opt.key, dir:opt.dir});
    }}/>
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

/**
 * Shared data-loading for TrackingMeSection / ImTrackingSection.
 *
 * date/name sorts stay server-paginated, one page per request, as before.
 * ici_desc/ideas_desc sort client-side instead: those values only exist
 * once computeIci() runs in the browser (see useIciBatch above), so
 * ordering by them server-side would mean porting that formula into SQL —
 * a second copy that WILL drift from the one real implementation. Instead,
 * for those two sort keys this fetches everyone matching the search
 * (bounded to CLIENT_SORT_FETCH_CAP, in PAGE_SIZE-sized hops), batches
 * their ICI once, and sorts/paginates in the browser.
 */
function useTrackingPeople(fetchFn, sort, q) {
  const [people, setPeople] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const isClientSort = CLIENT_SORT_KEYS.has(sort);
  const icis = useIciBatch(useMemo(()=>people.map(p=>p.id),[people]));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (isClientSort) {
        let all = [], offset = 0, more = true;
        while (more && all.length < CLIENT_SORT_FETCH_CAP) {
          const { people: rows, hasMore: m } = await fetchFn(PAGE_SIZE, offset, "date_desc", q);
          if (cancelled) return;
          all = all.concat(rows);
          more = m;
          offset += PAGE_SIZE;
        }
        if (cancelled) return;
        setPeople(all);
        setVisibleCount(PAGE_SIZE);
        setHasMore(false); // "load more" below is client-side (visibleCount) in this mode
      } else {
        const { people: rows, hasMore: more } = await fetchFn(PAGE_SIZE, 0, sort, q);
        if (cancelled) return;
        setPeople(rows);
        setHasMore(more);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, q]);

  const displayed = useMemo(() => {
    if (!isClientSort) return people;
    const sorted = [...people].sort((a,b) => {
      if (sort==="ici_desc")   return (icis[b.id]?.score ?? -1) - (icis[a.id]?.score ?? -1);
      if (sort==="ideas_desc") return (icis[b.id]?.total ?? 0)  - (icis[a.id]?.total ?? 0);
      return 0;
    });
    return sorted.slice(0, visibleCount);
  }, [people, icis, sort, visibleCount]);

  const canLoadMore = isClientSort ? visibleCount < people.length : hasMore;
  const loadMore = async () => {
    if (isClientSort) { setVisibleCount(v=>v+PAGE_SIZE); return; }
    setLoading(true);
    const { people: rows, hasMore: more } = await fetchFn(PAGE_SIZE, people.length, sort, q);
    setPeople(prev => [...prev, ...rows]);
    setHasMore(more);
    setLoading(false);
  };

  return { people: displayed, icis, loading, canLoadMore, loadMore, setPeople };
}

/** Debounced search box shared by both tracking lists. */
function TrackingSearchBox({ value, onChange }) {
  return (
    <div className="searchbox" style={{flex:"1 1 auto",minWidth:0}}>
      <Search size={14} color="var(--muted)"/>
      <input value={value} onChange={e=>onChange(e.target.value)} placeholder="Search by name or username…" style={{fontSize:13,minWidth:0}}/>
    </div>
  );
}

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(()=>setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/* ── "Tracking me" — people who track the current user ──────────────────────── */
export function TrackingMeSection({ me, setConnections, onTrackingCountsChange }) {
  const myId = me?.id || "me";
  const [busy, setBusy] = useState({});
  const [sort, setSort] = useState("date_desc");
  const [qInput, setQInput] = useState("");
  const q = useDebouncedValue(qInput, 300);
  const { people, icis, loading, canLoadMore, loadMore, setPeople } = useTrackingPeople(dbGetMyTrackers, sort, q);

  // "New since last visit" — a lightweight per-device cutoff (no schema
  // change needed for a purely visual affordance). Captured ONCE at mount
  // so highlighting stays stable for this viewing session; bumped after
  // mount so the NEXT visit's cutoff starts from here.
  const lastSeenKey = `mic_trackingme_seen_${myId}`;
  const [lastSeenAt] = useState(()=> { try { return localStorage.getItem(lastSeenKey); } catch { return null; } });
  useEffect(()=>{
    try { localStorage.setItem(lastSeenKey, new Date().toISOString()); } catch {}
  },[]); // eslint-disable-line react-hooks/exhaustive-deps

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

  if(loading && people.length===0 && !q) return <div className="card"><div className="empty"><Loader size={16} className="spin"/> Loading…</div></div>;

  return (<div style={{display:"flex",flexDirection:"column",gap:8}}>
    <div style={{display:"flex",gap:8,flexWrap:"nowrap",marginBottom:2}}>
      <TrackingSearchBox value={qInput} onChange={setQInput}/>
      <SortIconButton value={sort} onChange={setSort}/>
    </div>
    {people.length===0 && !loading && (
      <div className="card"><div className="empty">
        {q ? `No one matches "${q}".` : "No one is tracking you yet. Share your public profile to grow your audience."}
      </div></div>
    )}
    {people.map(p=>(
      <TrackingRow key={p.id} person={p} ici={icis[p.id]} connectionStatus={p.connection_status} connectBusy={busy[p.id]} isNew={isNew(p)}
        onConnect={()=>doConnect(p)}
        primaryAction={p.am_i_tracking
          ? <span className="pill accent" style={{fontSize:11}}><Check size={11} style={{verticalAlign:-1,marginRight:2}}/>Tracking</span>
          : <button className="btn btn-pri btn-sm" disabled={busy[p.id]} onClick={()=>doTrackBack(p)}>
              {busy[p.id]?<Loader size={13} className="spin"/>:<><Radar size={13}/> Track back</>}
            </button>}/>
    ))}
    {canLoadMore && <button className="btn btn-ghost" disabled={loading} onClick={loadMore}>
      {loading?<Loader size={14} className="spin"/>:"Load more"}
    </button>}
  </div>);
}

/* ── "I'm tracking" — people the current user tracks ─────────────────────────── */
export function ImTrackingSection({ me, setConnections, onTrackingCountsChange }) {
  const myId = me?.id || "me";
  const [busy, setBusy] = useState({});
  const [sort, setSort] = useState("date_desc");
  const [qInput, setQInput] = useState("");
  const q = useDebouncedValue(qInput, 300);
  const { people, icis, loading, canLoadMore, loadMore, setPeople } = useTrackingPeople(dbGetMyTrackingList, sort, q);

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

  if(loading && people.length===0 && !q) return <div className="card"><div className="empty"><Loader size={16} className="spin"/> Loading…</div></div>;

  return (<div style={{display:"flex",flexDirection:"column",gap:8}}>
    <div style={{display:"flex",gap:8,flexWrap:"nowrap",marginBottom:2}}>
      <TrackingSearchBox value={qInput} onChange={setQInput}/>
      <SortIconButton value={sort} onChange={setSort}/>
    </div>
    {people.length===0 && !loading && (
      <div className="card"><div className="empty">
        {q ? `No one matches "${q}".` : <>You&apos;re not tracking anyone yet. Track an investor from their profile to see their ideas here.</>}
      </div></div>
    )}
    {people.map(p=>(
      <TrackingRow key={p.id} person={p} ici={icis[p.id]} connectionStatus={p.connection_status} connectBusy={busy[p.id]}
        onConnect={()=>doConnect(p)}
        primaryAction={
          <button className="btn btn-sm" style={{background:"var(--surface-2)",border:"1px solid var(--line)"}} disabled={busy[p.id]} onClick={()=>doUntrack(p)}>
            {busy[p.id]?<Loader size={13} className="spin"/>:<><Check size={13}/> Tracking</>}
          </button>}/>
    ))}
    {canLoadMore && <button className="btn btn-ghost" disabled={loading} onClick={loadMore}>
      {loading?<Loader size={14} className="spin"/>:"Load more"}
    </button>}
  </div>);
}

/* ── Contacts section ─────────────────────────────────────────────────────── */

// Normalizes a `recommendation_tracking`-joined row (my-tracked-recos'
// snake_case shape) into the camelCase shape recoStats()/getClosedInfo()
// already read everywhere else in the app — see mapReceivedRow() in
// api/_lib/handlers/recommendations.js for the shape this mirrors.
const mapTrackedRowForPnl = (r) => ({
  id:           r.id,
  invested:     r.is_invested,
  investedPrice: r.invested_price != null ? Number(r.invested_price) : null,
  priceAt:      Number(r.reco_price || 0),
  price:        Number(r.current_price || 0),
  exitSignal:   r.exit_signal,
  exitDate:     r.exit_date,
  exitPrice:    r.exit_price != null ? Number(r.exit_price) : null,
  targetDate:   r.target_date,
  expiryPrice:  r.expiry_price != null ? Number(r.expiry_price) : null,
});

export function ContactsSection({ connections, setConnections, groups,
    recsReceived, onOpenRecos, me }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({key:"name",dir:"asc"});
  const [busy, setBusy] = useState({});
  const [trackedRecos, setTrackedRecos] = useState([]);
  const [pnlExplainerOpen, setPnlExplainerOpen] = useState(false);
  const isMobile = useIsMobile();
  const myId = me?.id || "me";

  // My P&L (below) has to include ideas from a contact that I tracked
  // straight off their public profile, not just ones they delivered to me
  // directly — recsReceived alone would silently undercount (and mislead
  // the click-through) for anyone who tracks publicly-posted ideas outside
  // their received bucket.
  useEffect(() => {
    if (!myId) return;
    dbGetMyTrackedRecos().then(setTrackedRecos).catch(()=>{});
  }, [myId]);

  // For the "ICI" / "Ideas posted" sort options — same batched computeIci()
  // used by the Tracking me / I'm tracking pages, applied to my connections.
  const icis = useIciBatch(useMemo(()=>connections.map(c=>c.user_id),[connections]));

  const statsOf = (c) => recoStats(recsReceived, r => r.from===c.user_id||(r.byName&&r.byName===c.name));
  // Received ∪ (tracked but never received) — the received copy of an idea
  // wins on overlap since it's the richer row (has reaction/likes); a
  // tracked-only idea is normalized via mapTrackedRowForPnl above.
  const pnlFor = (c) => {
    const received = recsReceived.filter(r=>r.from===c.user_id||(r.byName&&r.byName===c.name));
    const receivedIds = new Set(received.map(r=>r.id));
    const trackedOnly = trackedRecos
      .filter(r=>r.recommender_id===c.user_id && !receivedIds.has(r.id))
      .map(mapTrackedRowForPnl);
    return recoStats([...received, ...trackedOnly], () => true);
  };
  const commonGroups = (c) => groups.filter(g=>g.members?.some(m=>m.user_id===c.user_id));

  // ALL connections shown (all statuses) so user can see pending/rejected
  const rows = useMemo(() => {
    let r = [...connections];
    if (q.trim()) { const s=q.toLowerCase(); r=r.filter(c=>c.name.toLowerCase().includes(s)||c.email.toLowerCase().includes(s)); }
    const dir=sort.dir==="asc"?1:-1;
    r.sort((a,b)=>{
      if(sort.key==="name")   return a.name.localeCompare(b.name)*dir;
      if(sort.key==="status") return a.status.localeCompare(b.status)*dir;
      if(sort.key==="recos")  return (statsOf(a).count-statsOf(b).count)*dir;
      if(sort.key==="pnl")    return (pnlFor(a).pnl-pnlFor(b).pnl)*dir;
      if(sort.key==="ici")    return ((icis[a.user_id]?.score??-1)-(icis[b.user_id]?.score??-1))*dir;
      if(sort.key==="ideas")  return ((icis[a.user_id]?.total??0)-(icis[b.user_id]?.total??0))*dir;
      return 0;
    });
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections, q, sort, recsReceived, trackedRecos, icis]);

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
  };

  const accepted = rows.filter(c=>c.status==="accepted");
  const pendingReceived = rows.filter(c=>c.status==="pending"&&c.direction==="received");
  const pendingSent = rows.filter(c=>c.status==="pending"&&c.direction==="sent");
  const rejected = rows.filter(c=>c.status==="rejected");

  const statusPill = (c) => c.status==="pending"&&c.direction==="sent" ? <span className="pill" style={{fontSize:11,background:"#f59e0b22",color:"#b45309"}}>Pending</span>
    : c.status==="pending"&&c.direction==="received" ? <span className="pill accent" style={{fontSize:11}}>Wants to connect</span>
    : c.status==="rejected" ? <span className="pill loss" style={{fontSize:11}}>Rejected</span>
    : null;

  const ContactRow = ({c}) => {
    const stats = statsOf(c);
    const pnlInfo = pnlFor(c);
    const cg = commonGroups(c);
    const av = {name:c.name,initials:initialsOf(c.name),avatarUrl:c.avatar_url,color:c.avatar_color||CONTACT_COLORS[connections.indexOf(c)%CONTACT_COLORS.length]};

    if (isMobile) return (
      <div key={c.connection_id} className="card" style={{padding:0,marginBottom:8}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",flex:1,minWidth:0}}
            onClick={()=>gotoUserProfile(c.user_id)}>
            <Avatar f={av} size={40}/>
            <div style={{minWidth:0}}>
              <div className="sym" style={{color:"var(--accent-ink)",textDecoration:"underline",textDecorationStyle:"dotted",textUnderlineOffset:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</div>
              <div className="muted small">{c.username ? `@${c.username}` : "—"}</div>
            </div>
          </div>
          {statusPill(c)}
        </div>
        {cg.length>0 && <div style={{display:"flex",flexWrap:"wrap",gap:5,padding:"0 14px 10px"}}>{cg.map(g=><span key={g.id} className="chip mini">{g.name}</span>)}</div>}
        {c.status==="accepted" && (
          <div style={{padding:"0 14px 12px"}}>
            <RecoBreakdown stats={{...stats, pnl:pnlInfo.pnl, pnlPending:pnlInfo.pnlPending}} pnlLabel="My P&L" onPnl={()=>onOpenRecos({tab:'tracked',by:c.name,invested:'yes'})}/>
          </div>
        )}
        <div style={{display:"flex",justifyContent:"flex-end",gap:6,padding:"0 14px 12px"}}>
          {c.status==="pending"&&c.direction==="received" && (<>
            <button className="btn btn-pri btn-sm" disabled={busy[c.connection_id]} onClick={()=>doAccept(c)}><Check size={13}/> Accept</button>
            <button className="btn btn-ghost btn-sm" disabled={busy[c.connection_id]} onClick={()=>doReject(c)}><X size={13}/> Decline</button>
          </>)}
          {(c.status==="pending"&&c.direction==="sent"||c.status==="rejected") && (
            <button className="btn btn-ghost btn-sm" style={{color:"var(--loss)"}} onClick={()=>doRemove(c)}><Trash2 size={13}/> Remove</button>)}
          {c.status==="accepted" && (
            <button className="btn btn-ghost btn-sm" style={{color:"var(--loss)"}} onClick={()=>doRemove(c)}><Trash2 size={13}/> Remove</button>)}
        </div>
      </div>
    );

    return (
      <tr key={c.connection_id} className={"hoverable"+(c.status!=="accepted"?" hiddenrow":"")}>
        <td><div style={{display:"flex",gap:11,alignItems:"center"}}>
          <div style={{display:"flex",gap:11,alignItems:"center",cursor:"pointer"}}
            title={`View ${c.name}'s public profile`}
            onClick={()=>gotoUserProfile(c.user_id)}>
            <Avatar f={av} size={36}/>
            <div>
              <div className="sym" style={{color:"var(--accent-ink)",textDecoration:"underline",textDecorationStyle:"dotted",textUnderlineOffset:3}}>{c.name}</div>
              {c.username && <div className="muted small">@{c.username}</div>}
            </div>
          </div>
          {statusPill(c)}
        </div></td>
        <td>{cg.length===0?<span className="muted small">—</span>:<div style={{display:"flex",flexWrap:"wrap",gap:5}}>{cg.map(g=><span key={g.id} className="chip mini">{g.name}</span>)}</div>}</td>
        <td className="tnum">{c.status==="accepted"?stats.count:<span className="muted">—</span>}</td>
        <td style={{textAlign:"right"}}>
          {c.status==="accepted"
            ? <span className="clickable tnum nowrap" onClick={()=>onOpenRecos({tab:'tracked',by:c.name,invested:'yes'})}>{fmtSigned(pnlInfo.pnl)} ↗</span>
            : <span className="muted">—</span>}</td>
        <td>
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
    );
  };

  return (<>
    <div className="toolbar">
      <div className="searchbox grow"><Search size={16} color="var(--muted)"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search by name or email…"/></div>
      <ContactsSortIconButton sort={sort} setSort={setSort}/>
    </div>

    {/* Pending incoming requests */}
    <PendingRequestsCard pendingReceived={pendingReceived} connections={connections}
      busy={busy} doAccept={doAccept} doReject={doReject}/>

    {/* Accepted contacts */}
    {connections.length===0
      ? <div className="card"><div className="empty">No connections yet. Use &ldquo;Grow your network&rdquo; above to discover people to follow.</div></div>
      : <>
      <div className="note info" style={{marginBottom:10,alignItems:"flex-start"}}>
        <Info size={16} style={{marginTop:1,flexShrink:0}}/>
        <div>
          <b>What is My P&amp;L?</b> A directional signal, not real money.{" "}
          {pnlExplainerOpen ? (
            <>
              For each idea from that person you marked &ldquo;invested&rdquo; — whether they sent it to you directly
              or you tracked it from their public profile — it applies a flat hypothetical ₹1,000 stake to the move
              from your entry price to the idea&apos;s closing price (or its live price if still open), then adds
              those up per person. It shows whether following a connection&apos;s ideas has tended to be profitable —
              it isn&apos;t a record of what you actually put in or made.{" "}
            </>
          ) : null}
          <span className="clickable" style={{fontWeight:700,whiteSpace:"nowrap"}} onClick={()=>setPnlExplainerOpen(v=>!v)}>
            {pnlExplainerOpen ? "Show less" : "Read more"}
          </span>
        </div>
      </div>
      {isMobile ? (
        <div>
          {accepted.map(c=><ContactRow key={c.connection_id} c={c}/>)}
          {pendingSent.map(c=><ContactRow key={c.connection_id} c={c}/>)}
          {rejected.map(c=><ContactRow key={c.connection_id} c={c}/>)}
        </div>
      ) : (
        <div className="card"><div className="card-body" style={{padding:"8px 0"}}><div className="tscroll"><table className="grid">
            <thead><tr>
              <SortTh label="Name"            k="name"   sort={sort} setSort={setSort}/>
              <th>Common groups</th>
              <SortTh label="Ideas to me"     k="recos"  sort={sort} setSort={setSort}/>
              <SortTh label="My P&amp;L"      k="pnl"    sort={sort} setSort={setSort} align="right"
                hint="Hypothetical ₹1,000-per-idea return on this person's ideas you marked invested (received or tracked) — a directional signal, not real money. Click a value to see the ideas behind it."/>
              <th>Actions</th>
            </tr></thead>
            <tbody>
              {accepted.map(c=><ContactRow key={c.connection_id} c={c}/>)}
              {pendingSent.map(c=><ContactRow key={c.connection_id} c={c}/>)}
              {rejected.map(c=><ContactRow key={c.connection_id} c={c}/>)}
            </tbody>
          </table></div></div></div>
      )}
      </>}
  </>);
}

/* ── Pending incoming requests ────────────────────────────────────────────────
   A dedicated, compact list (not the dense all-columns table the accepted/
   rejected/sent-pending sections share) so Accept/Decline are always visible
   without opening the row, name is a real click-through to the profile, and
   a long queue collapses to a few rows with its own search instead of eating
   the whole page. Sorted newest-request-first by default (created_at desc);
   the in-card search only filters this list, independent of the main
   connections search above it. ── */
function PendingRequestsCard({ pendingReceived, connections, busy, doAccept, doReject }) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const INITIAL_SHOW = 3;

  const sorted = useMemo(() => {
    let r = [...pendingReceived];
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      r = r.filter(c => c.name.toLowerCase().includes(s));
    }
    r.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    return r;
  }, [pendingReceived, search]);

  if (pendingReceived.length === 0) return null;

  const visible = expanded ? sorted : sorted.slice(0, INITIAL_SHOW);

  return (
    <div className="card" style={{marginBottom:16,border:"2px solid var(--accent)"}}>
      <div className="card-head" style={{color:"var(--accent)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <span style={{display:"flex",alignItems:"center",gap:8}}>
          <Bell size={15}/> {pendingReceived.length} pending connection request{pendingReceived.length!==1?"s":""}
        </span>
        {pendingReceived.length > INITIAL_SHOW && (
          <div className="searchbox" style={{padding:"5px 10px",maxWidth:200}}>
            <Search size={13} color="var(--muted)"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name…" style={{fontSize:12.5}}/>
          </div>
        )}
      </div>
      <div className="card-body" style={{padding:0}}>
        {visible.length===0
          ? <div className="muted small" style={{padding:"18px 16px"}}>No requests match &ldquo;{search}&rdquo;.</div>
          : visible.map(c=>{
              const av = {name:c.name, initials:initialsOf(c.name), avatarUrl:c.avatar_url, color:c.avatar_color||CONTACT_COLORS[connections.indexOf(c)%CONTACT_COLORS.length]};
              return (
                <div key={c.connection_id} className="hoverable"
                  style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:"11px 16px",borderBottom:"1px solid var(--line)",flexWrap:"wrap"}}>
                  <div style={{display:"flex",alignItems:"center",gap:11,minWidth:0,cursor:"pointer"}}
                    title={`View ${c.name}'s public profile`} onClick={()=>gotoUserProfile(c.user_id)}>
                    <Avatar f={av} size={36}/>
                    <div style={{minWidth:0}}>
                      <div className="sym" style={{color:"var(--accent-ink)",textDecoration:"underline",textDecorationStyle:"dotted",textUnderlineOffset:3}}>{c.name}</div>
                      <div className="muted small">{c.username ? `@${c.username}` : "Wants to connect"}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:16,marginLeft:"auto",flexShrink:0}}>
                    <div className="muted small nowrap" title="Date requested">{fmtDate(c.created_at)}</div>
                    <div style={{display:"flex",gap:6}}>
                      <button className="btn btn-pri btn-sm" disabled={busy[c.connection_id]} onClick={()=>doAccept(c)}><Check size={13}/> Accept</button>
                      <button className="btn btn-ghost btn-sm" disabled={busy[c.connection_id]} onClick={()=>doReject(c)}><X size={13}/> Decline</button>
                    </div>
                  </div>
                </div>
              );
            })}
      </div>
      {sorted.length > INITIAL_SHOW && (
        <div style={{padding:"10px 16px",textAlign:"center"}}>
          <button className="btn btn-ghost btn-sm" onClick={()=>setExpanded(v=>!v)}>
            {expanded ? "Show less" : `Show all ${sorted.length}`}
          </button>
        </div>
      )}
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
