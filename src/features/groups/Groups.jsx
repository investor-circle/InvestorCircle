import React, { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  Plus,
  X,
  Check,
  Layers,
  ChevronDown,
  UserPlus,
  Trash2,
  Pencil,
  Globe,
  Lock,
  Copy,
  Bell,
  Loader,
  Lightbulb,
  MessageSquare,
  ThumbsUp,
  Share2,
  Info,
  Users,
  ArrowUpDown,
  SlidersHorizontal
} from "lucide-react";
import {
  addGroupMembers as dbAddGroupMembers,
  createGroup as dbCreateGroup,
  deleteGroup as dbDeleteGroup,
  exitGroup as dbExitGroup,
  removeGroupMember as dbRemoveGroupMember,
  renameGroup as dbRenameGroup,
  updateCircleSettings as dbUpdateCircleSettings,
  getMyGroups,
  getCircleBySlug as dbGetCircleBySlug,
  getCircleEligibleMembers as dbGetCircleEligibleMembers,
  getCircleJoinRequests as dbGetCircleJoinRequests,
  reviewCircleJoinRequest as dbReviewCircleJoinRequest,
  regenerateCircleInviteLink as dbRegenerateCircleInviteLink,
  requestJoinCircle as dbRequestJoinCircle
} from "../../services/api/groupsApi";
import { getCircleIdeas as dbGetCircleIdeas } from "../../services/api/recommendationsApi";
import { Avatar, ConvBadge, RetBadge, SmallAnchoredPopover, TypeBadge } from "../../components/common";
import { fmtDate, initialsOf, recoStats } from "../../utils/format";
import { gotoUserProfile, gotoCircle } from "../../utils/navigation";
import { useIsMobile } from "../../hooks/index";

/** Circles = the product-facing rename of the pre-existing Group concept.
 * Still backed by ic_groups/group_members (see api/_lib/handlers/groups.js).
 * A circle is 'private' (owner adds Connections directly) or 'public'
 * (subscribable via request + owner approval, or a shareable invite link). */
export function GroupsSection({ groups, setGroups, contacts, configs, canCreateGroups, recsReceived, onOpenRecos, me }) {
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [addTo, setAddTo] = useState(null);
  const [editGroup, setEditGroup] = useState(null);
  const [requestsFor, setRequestsFor] = useState(null);
  const myId = me?.id || "me";

  const nameOf = (id) => {
    if(id===myId||id==="me") return me?.name||"You";
    return contacts.find(c=>c.id===id)?.name || id;
  };
  const avOf = (id) => {
    if(id===myId||id==="me") return {name:me?.name||"You",initials:me?.initials||"ME",color:"#6d5df5"};
    const c = contacts.find(x=>x.id===id);
    return c || {name:id,initials:initialsOf(id),color:"#8d90ad"};
  };
  const statsOf = (g) => recoStats(recsReceived, r=>r.shareType==="group"&&r.groupId===g.id);

  const rows = useMemo(()=>{
    let r = [...groups];
    if(q.trim()){ const s=q.toLowerCase(); r=r.filter(g=>g.name.toLowerCase().includes(s)); }
    return r;
  },[groups,q]);

  const doCreateGroup = async (name, memberIds, color, circleType, description) => {
    if(groups.some(g=>g.my_role==="admin"&&g.name.toLowerCase()===name.toLowerCase())){
      alert(`You already have a circle named "${name}".`); return;
    }
    const g = await dbCreateGroup(name, color||"#6d5df5", myId, memberIds, circleType, description);
    setGroups(await getMyGroups(myId));
    setShowNew(false);
    return g;
  };
  const doRenameGroup = async (gid, newName, description) => {
    await dbUpdateCircleSettings(gid, newName, description);
    setGroups(await getMyGroups(myId));
    setEditGroup(null);
  };
  const doDeleteGroup = async (g) => {
    if(!confirm(`Delete "${g.name}"?`)) return;
    await dbDeleteGroup(g.id, myId);
    setGroups(gs=>gs.filter(x=>x.id!==g.id));
  };
  const doExitGroup = async (g) => {
    if(!confirm(`Exit "${g.name}"? You will stop receiving ideas shared in this circle.`)) return;
    await dbExitGroup(g.id, myId);
    setGroups(gs=>gs.filter(x=>x.id!==g.id));
  };
  const doAddMembers = async (gid, ids) => {
    await dbAddGroupMembers(gid, ids, myId);
    setGroups(await getMyGroups(myId));
    setAddTo(null);
  };
  const doRemoveMember = async (gid, uid) => {
    await dbRemoveGroupMember(gid, uid);
    setGroups(gs=>gs.map(g=>g.id===gid?{...g,members:g.members.filter(m=>m.user_id!==uid)}:g));
  };
  const doRegenerateInvite = async (g) => {
    const code = await dbRegenerateCircleInviteLink(g.id);
    if(code) setGroups(gs=>gs.map(x=>x.id===g.id?{...x,invite_code:code}:x));
  };

  return (<>
    <div className="toolbar">
      <div className="searchbox grow"><Search size={16} color="var(--muted)"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search circles…"/></div>
      <button className="btn btn-pri btn-sm" disabled={!canCreateGroups} onClick={()=>setShowNew(true)}><Plus size={15}/> New Circle</button>
    </div>
    {rows.length===0 ? <div className="card"><div className="empty">No circles yet. Create one to build a community around your ideas, or share them with a group of connections at once.</div></div> :
    <div className="card"><div className="card-body" style={{padding:"8px 0"}}><div className="tscroll"><table className="grid" style={{minWidth:900}}>
      <thead><tr>
        <th>Circle</th><th>Type</th><th>Created on</th><th>Members</th><th>My role</th><th style={{textAlign:"right"}}>Actions</th>
      </tr></thead>
      <tbody>{rows.map(g=>{ const open=expanded===g.id; const iAmAdmin=g.my_role==="admin"; const isPublic=g.circle_type==="public";
        const inviteLink = g.slug ? `${window.location.origin}${window.location.pathname}#/circle/${g.slug}` : null;
        return (<React.Fragment key={g.id}>
          <tr className="hoverable" style={{cursor:"pointer"}} onClick={()=>setExpanded(open?null:g.id)}>
            <td><span className="nowrap"><span className="av" style={{width:28,height:28,background:g.color,fontSize:12,marginRight:8,display:"inline-flex",alignItems:"center",justifyContent:"center",borderRadius:8}}><Layers size={13}/></span>
              <b>{g.name}</b><ChevronDown size={14} style={{transform:open?"rotate(180deg)":"none",transition:".15s",marginLeft:6}}/></span></td>
            <td>{isPublic
              ? <span className="pill accent" style={{fontSize:11}}><Globe size={11} style={{verticalAlign:-1,marginRight:3}}/>Public</span>
              : <span className="pill" style={{fontSize:11}}><Lock size={11} style={{verticalAlign:-1,marginRight:3}}/>Private</span>}
              {iAmAdmin && isPublic && g.pending_request_count>0 && (
                <span className="pill" style={{fontSize:10,marginLeft:6,background:"#f59e0b22",color:"#b45309"}} onClick={e=>{e.stopPropagation();setRequestsFor(g);}}>
                  <Bell size={10} style={{verticalAlign:-1,marginRight:2}}/>{g.pending_request_count} request{g.pending_request_count>1?"s":""}
                </span>
              )}
            </td>
            <td className="muted small">{fmtDate(g.created_at)}</td>
            <td><span className="pill">{(g.members||[]).filter(m=>m.status==="active").length} members</span></td>
            <td>{iAmAdmin ? <span className="pill accent">Owner</span> : <span className="pill">Member</span>}</td>
            <td onClick={e=>e.stopPropagation()}>
              <div className="actions" style={{justifyContent:"flex-end",gap:6}}>
                <button className="btn btn-ghost btn-sm" onClick={()=>gotoCircle(g.slug)}>Open</button>
                {iAmAdmin && <><button className="iconbtn" title="Circle settings" onClick={()=>setEditGroup(g)}><Pencil size={14}/></button>
                <button className="iconbtn danger" title="Delete circle" onClick={()=>doDeleteGroup(g)}><Trash2 size={14}/></button></>}
                {!iAmAdmin && <button className="btn btn-ghost btn-sm" style={{color:"var(--loss)"}} onClick={()=>doExitGroup(g)}>Exit</button>}
              </div>
            </td>
          </tr>
          {open && <tr className="expand-row"><td colSpan={6}><div className="expand-inner" onClick={e=>e.stopPropagation()}>
            {g.description && <div className="muted small" style={{marginBottom:12}}>{g.description}</div>}
            {isPublic && inviteLink && (
              <div style={{display:"flex",alignItems:"center",gap:8,background:"var(--surface-2)",border:"1px solid var(--line)",borderRadius:10,padding:"8px 12px",marginBottom:12,flexWrap:"wrap"}}>
                <span className="muted small" style={{flex:1,minWidth:180,wordBreak:"break-all"}}>{inviteLink}</span>
                <button className="btn btn-ghost btn-sm" onClick={()=>navigator.clipboard.writeText(inviteLink)}><Copy size={13}/> Copy link</button>
                {iAmAdmin && <button className="btn btn-ghost btn-sm" onClick={()=>doRegenerateInvite(g)}>Regenerate</button>}
              </div>
            )}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <b style={{fontSize:14}}>Members of {g.name}</b>
              {iAmAdmin && <button className="btn btn-soft btn-sm" onClick={()=>setAddTo(g)}><UserPlus size={14}/> Add members</button>}
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:12}}>
              {(g.members||[]).filter(m=>m.status==="active").map(m=>(
                <div key={m.user_id} style={{display:"flex",alignItems:"center",gap:8,background:"var(--surface-2)",border:"1px solid var(--line)",borderRadius:10,padding:"6px 12px"}}>
                  {/* Avatar + name: click opens public profile */}
                  <div style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}
                    title={`View ${m.name||nameOf(m.user_id)}'s public profile`}
                    onClick={()=>gotoUserProfile(m.user_id)}>
                    <Avatar f={avOf(m.user_id)} size={28}/>
                    <div>
                      <div style={{fontWeight:600,fontSize:13,color:"var(--accent-ink)",textDecoration:"underline",textDecorationStyle:"dotted",textUnderlineOffset:3}}>{m.name||nameOf(m.user_id)}</div>
                      <div className="muted" style={{fontSize:11}}>{m.role==="admin"?"Owner":"Member"}</div>
                    </div>
                  </div>
                  {iAmAdmin && m.user_id!==myId && <button className="iconbtn danger" style={{marginLeft:4}} onClick={()=>doRemoveMember(g.id,m.user_id)}><X size={13}/></button>}
                  {!iAmAdmin && m.user_id===myId && <button className="btn btn-ghost btn-sm" style={{color:"var(--loss)",marginLeft:4}} onClick={()=>doExitGroup(g)}>Exit</button>}
                </div>
              ))}
            </div>
          </div></td></tr>}
        </React.Fragment>);
      })}</tbody>
    </table></div></div></div>}
    {showNew && <CircleModal title="New Circle" contacts={contacts} max={configs.maxGroupMembers} alreadyIn={[myId,"me"]}
        onClose={()=>setShowNew(false)} onSave={(name,ids,color,circleType,description)=>doCreateGroup(name,ids,color,circleType,description)}/>}
    {addTo && <AddMembersModal group={addTo} max={configs.maxGroupMembers}
        onClose={()=>setAddTo(null)} onSave={(ids)=>doAddMembers(addTo.id,ids)}/>}
    {editGroup && <EditCircleModal group={editGroup} groups={groups} myId={myId}
        onClose={()=>setEditGroup(null)} onSave={(name,description)=>doRenameGroup(editGroup.id,name,description)}/>}
    {requestsFor && <JoinRequestsModal group={requestsFor} onClose={()=>setRequestsFor(null)}
        onReviewed={async()=>{ setGroups(await getMyGroups(myId)); }}/>}
  </>);
}

/* ── New Circle modal — name, description, private/public, initial members ── */
export function CircleModal({ title, contacts, max, alreadyIn, onClose, onSave, addOnly }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [circleType, setCircleType] = useState("private");
  const [members, setMembers] = useState([]);
  const [membersOpen,   setMembersOpen]   = useState(addOnly);
  const [memberSearch,  setMemberSearch]  = useState("");
  const available = contacts.filter(c=>!alreadyIn.includes(c.id));
  const filteredAvailable = memberSearch.trim()
    ? available.filter(c=>c.name.toLowerCase().includes(memberSearch.trim().toLowerCase()))
    : available;
  const toggle = (id) => setMembers(m=>m.includes(id)?m.filter(x=>x!==id):[...m,id]);
  const valid = (addOnly||name.trim()) && (addOnly ? members.length>0 : true);
  return (<div className="overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">
      {!addOnly && <>
      <div className="field"><label>Circle name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Long-Term Compounders" autoFocus/></div>
      <div className="field"><label>Description (optional)</label><input value={description} onChange={e=>setDescription(e.target.value)} placeholder="What is this circle about?"/></div>
      <div className="field">
        <label>Visibility</label>
        <div style={{display:"flex",gap:10}}>
          <button type="button" className={"btn btn-sm"+(circleType==="private"?" btn-pri":" btn-ghost")} style={{flex:1,justifyContent:"center"}} onClick={()=>setCircleType("private")}>
            <Lock size={13}/> Private
          </button>
          <button type="button" className={"btn btn-sm"+(circleType==="public"?" btn-pri":" btn-ghost")} style={{flex:1,justifyContent:"center"}} onClick={()=>setCircleType("public")}>
            <Globe size={13}/> Public
          </button>
        </div>
        <div className="muted small" style={{marginTop:6,lineHeight:1.5}}>
          {circleType==="private"
            ? "Only you can add members, from your Connections. Not publicly discoverable — any member can post ideas here."
            : "Anyone who Tracks or is Connected with you can request to join, or use an invite link you share. Only you (the admin) can post ideas here — and every idea posted also appears in everyone's Home feed."}
        </div>
      </div>
      </>}
      <div style={{border:"1px solid var(--line)",borderRadius:11}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 13px",cursor:addOnly?"default":"pointer"}} onClick={()=>!addOnly && setMembersOpen(o=>!o)}>
          <div style={{flex:1}}>
            <label style={{margin:0,display:"block"}}>Add from your Connections</label>
            {!addOnly && <div className="muted small" style={{marginTop:2}}>{members.length>0 ? `${members.length} selected` : "Choose who to add now (optional)."}</div>}
          </div>
          {!addOnly && <ChevronDown size={16} className="muted" style={{transform:membersOpen?"rotate(180deg)":"none",transition:".15s",flexShrink:0}}/>}
        </div>
        {(membersOpen||addOnly) && (
          <div style={{padding:"0 13px 13px"}}>
            {available.length===0
              ? <div className="muted small">No accepted connections available to add yet.</div>
              : (<>
                  <div style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
                    <div className="searchbox" style={{flex:1}}>
                      <Search size={14} color="var(--muted)"/>
                      <input value={memberSearch} onChange={e=>setMemberSearch(e.target.value)} placeholder="Search connections…" onClick={e=>e.stopPropagation()}/>
                    </div>
                    {(() => {
                      const allFilteredSelected = filteredAvailable.length>0 && filteredAvailable.every(c=>members.includes(c.id));
                      return (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={()=>{
                          const filteredIds = filteredAvailable.map(c=>c.id);
                          setMembers(m=> allFilteredSelected ? m.filter(id=>!filteredIds.includes(id)) : [...new Set([...m, ...filteredIds])]);
                        }}>{allFilteredSelected ? "Unselect all" : "Select all"}</button>
                      );
                    })()}
                  </div>
                  <div style={{maxHeight:220,overflowY:"auto",display:"flex",flexDirection:"column",gap:2}}>
                    {filteredAvailable.length===0
                      ? <div className="muted small" style={{padding:"6px 2px"}}>No connections match &ldquo;{memberSearch}&rdquo;.</div>
                      : filteredAvailable.map(c=>(
                        <label key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 6px",borderRadius:8,cursor:"pointer"}}>
                          <input type="checkbox" checked={members.includes(c.id)} onChange={()=>toggle(c.id)}
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
    <div className="modal-foot"><span/><div style={{display:"flex",gap:10}}>
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-pri" disabled={!valid} onClick={()=>onSave(name.trim(),members,undefined,circleType,description.trim())}>{addOnly?"Add members":"Create Circle"}</button>
    </div></div>
  </div></div>);
}
// Backward-compatible aliases — some callers still import these by their pre-Circle names.
export const GroupModal = CircleModal;
export const EditGroupModal = EditCircleModal;

/* ── Add members modal — pulls server-computed eligible people (Connections,
   plus Trackers for a public circle) rather than a static contacts list ── */
export function AddMembersModal({ group, onClose, onSave }) {
  const [people, setPeople] = useState(null);
  const [selected, setSelected] = useState([]);
  useEffect(()=>{ dbGetCircleEligibleMembers(group.id).then(setPeople); },[group.id]);
  const toggle = (id) => setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
  return (<div className="overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3>Add members to {group.name}</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">
      <div className="field">
        <label>Eligible people {selected.length>0&&`(${selected.length} selected)`}</label>
        <div className="muted small" style={{marginBottom:10}}>
          {group.circle_type==="public"
            ? "People who Track you or are your Connections."
            : "Your Connections."}
        </div>
        {people===null
          ? <div className="muted small"><Loader size={14} className="spin"/> Loading…</div>
          : people.length===0
            ? <div className="muted small">No eligible people to add right now.</div>
            : <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {people.map(p=><span key={p.id} className={"chip"+(selected.includes(p.id)?" sel":"")} onClick={()=>toggle(p.id)}>{selected.includes(p.id)&&<Check size={13}/>}{p.full_name||p.username}</span>)}
              </div>}
      </div>
    </div>
    <div className="modal-foot"><span/><div style={{display:"flex",gap:10}}>
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-pri" disabled={selected.length===0} onClick={()=>onSave(selected)}>Add members</button>
    </div></div>
  </div></div>);
}

export function EditCircleModal({ group, groups, myId, onClose, onSave }) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description||"");
  const trimmed = name.trim();
  const isSame = trimmed.toLowerCase() === group.name.toLowerCase() && description===(group.description||"");
  const isDuplicate = trimmed.toLowerCase() !== group.name.toLowerCase() && groups.some(g =>
    g.id !== group.id && g.my_role === "admin" && g.name.toLowerCase() === trimmed.toLowerCase()
  );
  const valid = trimmed && !isDuplicate;
  return (<div className="overlay" onClick={onClose}><div className="modal" style={{width:440}} onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3>Circle settings</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">
      <div className="field"><label>Circle name</label>
        <input value={name} autoFocus onChange={e=>setName(e.target.value)} placeholder="Circle name"/>
        {isDuplicate && <div className="neg small" style={{marginTop:6}}>You already have a circle with this name. Please choose a different name.</div>}
      </div>
      <div className="field"><label>Description</label>
        <input value={description} onChange={e=>setDescription(e.target.value)} placeholder="What is this circle about?"/>
      </div>
    </div>
    <div className="modal-foot"><span/><div style={{display:"flex",gap:10}}>
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-pri" disabled={!valid||isSame} onClick={()=>onSave(trimmed,description.trim())}><Check size={14}/> Save</button>
    </div></div>
  </div></div>);
}

/* ── Join requests modal — owner approves/rejects pending Subscribe requests ── */
export function JoinRequestsModal({ group, onClose, onReviewed }) {
  const [requests, setRequests] = useState(null);
  const [busy, setBusy] = useState({});
  const load = () => dbGetCircleJoinRequests(group.id).then(setRequests);
  useEffect(()=>{ load(); },[group.id]);
  const review = async (r, approve) => {
    setBusy(b=>({...b,[r.id]:true}));
    await dbReviewCircleJoinRequest(r.id, approve);
    await load();
    await onReviewed();
    setBusy(b=>({...b,[r.id]:false}));
  };
  return (<div className="overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3>Join requests — {group.name}</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">
      {requests===null
        ? <div className="muted small"><Loader size={14} className="spin"/> Loading…</div>
        : requests.length===0
          ? <div className="empty">No pending requests.</div>
          : <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {requests.map(r=>(
                <div key={r.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:"var(--surface-2)",border:"1px solid var(--line)",borderRadius:10}}>
                  <Avatar f={{name:r.full_name,initials:initialsOf(r.full_name||r.username||"?"),color:"#6d5df5"}} size={30}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:13}}>{r.full_name||r.username}</div>
                    <div className="muted small">@{r.username} · requested {fmtDate(r.created_at)}</div>
                  </div>
                  <button className="btn btn-pri btn-sm" disabled={busy[r.id]} onClick={()=>review(r,true)}><Check size={13}/> Approve</button>
                  <button className="btn btn-ghost btn-sm" disabled={busy[r.id]} onClick={()=>review(r,false)}><X size={13}/> Decline</button>
                </div>
              ))}
            </div>}
    </div>
    <div className="modal-foot"><span/><button className="btn btn-ghost" onClick={onClose}>Close</button></div>
  </div></div>);
}

/* ── CirclePage — dedicated, shareable page for a single Circle ────────────
   Route: #/circle/:slug (optionally ?invite=<code>). Works for a logged-out
   visitor (e.g. opening a WhatsApp-shared link) — the backend enforces that
   private circles never reveal details to non-members (see
   api/_lib/handlers/groups.js action=by-slug). */
/* ── CircleSharePopover — compact share icon + Copy link/WhatsApp popover,
   mirrors SharePublicPopover in Recommendations.jsx (same anchored-popover-
   on-desktop / bottom-sheet-on-mobile pattern) ── */
function CircleSharePopover({ circle, anchorEl, onClose }) {
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const link = `${window.location.origin}${window.location.pathname}#/circle/${circle.slug}`;
  const waText = encodeURIComponent(`Join "${circle.name}" on myInvestorCircle:\n${link}`);
  const copyLink = () => navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => { setCopied(false); onClose(); }, 1600); });

  const content = (
    <>
      <div style={{fontWeight:700,fontSize:14,marginBottom:12,display:'flex',alignItems:'center',gap:6}}><Share2 size={15} color="var(--accent)"/> Share this Circle</div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        <button className="btn btn-pri btn-sm" style={{justifyContent:'center'}} onClick={copyLink}>{copied ? <><Check size={14}/> Copied!</> : <><Copy size={14}/> Copy link</>}</button>
        <a href={`https://wa.me/?text=${waText}`} target="_blank" rel="noopener noreferrer" className="btn btn-soft btn-sm" style={{justifyContent:'center',textDecoration:'none'}} onClick={onClose}><span style={{fontSize:15,lineHeight:1}}>💬</span> Share on WhatsApp</a>
      </div>
      <button className="btn btn-ghost btn-sm" style={{width:'100%',justifyContent:'center',marginTop:10}} onClick={onClose}>Cancel</button>
    </>
  );

  if (isMobile) return createPortal(
    <div style={{position:'fixed',inset:0,zIndex:9999,display:'flex',flexDirection:'column',justifyContent:'flex-end'}} onClick={onClose}>
      <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,.45)'}}/>
      <div ref={popRef} style={{position:'relative',background:'var(--surface)',borderRadius:'20px 20px 0 0',padding:'20px 20px 36px',boxShadow:'0 -8px 40px rgba(0,0,0,.28)'}} onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,background:'var(--line)',borderRadius:2,margin:'0 auto 18px'}}/>
        {content}
      </div>
    </div>,
    document.body
  );

  if (!pos) return null;
  return createPortal(
    <div ref={popRef} style={{position:'fixed',top:pos.top,right:pos.right,zIndex:9999,background:'var(--surface)',border:'1px solid var(--line)',borderRadius:14,boxShadow:'0 8px 32px rgba(0,0,0,.18)',padding:'16px 18px',minWidth:270,maxWidth:320,fontFamily:'var(--font)'}} onClick={e=>e.stopPropagation()}>
      {content}
    </div>,
    document.body
  );
}

// Ideas-list sort options for the Circle page — same {key,dir}-driven shape
// and icon-only SmallAnchoredPopover trigger already used for Portfolio's
// holdings grid and Connections' contact lists, reused here rather than
// inventing another dropdown pattern.
const CIRCLE_IDEAS_SORT_OPTIONS = [
  { value: "activity_desc", label: "Most recent activity", key: "activity", dir: "desc" },
  { value: "activity_asc",  label: "Oldest activity",      key: "activity", dir: "asc"  },
  { value: "likes_desc",    label: "Most liked",           key: "likes",    dir: "desc" },
  { value: "comments_desc", label: "Most discussed",       key: "comments", dir: "desc" },
  { value: "ticker_asc",    label: "Ticker A–Z",           key: "ticker",   dir: "asc"  },
];
const CIRCLE_IDEAS_FILTER_OPTIONS = [
  { value: "all",  label: "All ideas" },
  { value: "Buy",  label: "Buy" },
  { value: "Sell", label: "Sell" },
];

export function CirclePage({ slug, inviteCode, highlightIdeaId, autoOpenRequests, viewerUser, onBack, onNavigateProfile }) {
  const [circle,  setCircle]  = useState(undefined); // undefined = loading, null = not found
  const [joining, setJoining] = useState(false);
  const [showAdd,      setShowAdd]      = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [ideas,    setIdeas]    = useState(null); // null = not loaded yet
  const [ideasErr, setIdeasErr] = useState(false);
  const [ideaQuery,      setIdeaQuery]      = useState("");
  const [ideaSearchOpen, setIdeaSearchOpen] = useState(false);
  const [ideaTypeFilter, setIdeaTypeFilter] = useState("all");
  const [ideaFilterOpen, setIdeaFilterOpen] = useState(false);
  const [ideaSort,       setIdeaSort]       = useState({ key: "activity", dir: "desc" });
  const [ideaSortOpen,   setIdeaSortOpen]   = useState(false);
  const ideaFilterBtnRef = useRef(null);
  const ideaSortBtnRef   = useRef(null);
  const [shareOpen,    setShareOpen]    = useState(false);
  const shareBtnRef = useRef(null);
  const [descOpen,     setDescOpen]     = useState(false);
  const [membersOpen,  setMembersOpen]  = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [removingMembers, setRemovingMembers] = useState(false);

  const load = () => dbGetCircleBySlug(slug).then(c => setCircle(c || null));
  useEffect(()=>{ setCircle(undefined); load(); },[slug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-linked from a "someone requested to join your Circle" notification.
  useEffect(()=>{
    if(autoOpenRequests && circle?.is_owner) setShowRequests(true);
  },[autoOpenRequests, circle?.is_owner]);

  // Ideas feed — only once we know the circle exists AND the viewer is
  // actually a member/owner (the server enforces this too; skipping the
  // call entirely for a non-member avoids an expected 403 round-trip).
  useEffect(()=>{
    if(!circle || !(circle.is_owner || circle.is_member)) { setIdeas(null); return; }
    setIdeas(null); setIdeasErr(false);
    dbGetCircleIdeas(circle.id).then(setIdeas).catch(()=>setIdeasErr(true));
  },[circle?.id, circle?.is_owner, circle?.is_member]);

  // Deep-linked from a "shared an idea in this Circle" notification — scroll
  // the specific idea into view once the feed has loaded.
  useEffect(()=>{
    if(!highlightIdeaId || !ideas || !ideas.length) return;
    const el = document.getElementById(`circle-idea-${highlightIdeaId}`);
    if (el) setTimeout(()=>el.scrollIntoView({behavior:'smooth', block:'center'}), 150);
  },[ideas, highlightIdeaId]);

  const handleJoin = async () => {
    if (!viewerUser) {
      sessionStorage.setItem("pending_join_circle_slug", slug);
      if (inviteCode) sessionStorage.setItem("pending_join_circle_invite", inviteCode);
      onBack();
      return;
    }
    setJoining(true);
    const res = await dbRequestJoinCircle(circle.id, inviteCode);
    if (res?.error) alert("Couldn't send your request to join. Please try again.");
    await load();
    setJoining(false);
  };

  const handleBulkRemoveMembers = async () => {
    if (selectedMembers.length===0) return;
    if (!confirm(`Remove ${selectedMembers.length} member${selectedMembers.length>1?"s":""} from this circle?`)) return;
    setRemovingMembers(true);
    await Promise.all(selectedMembers.map(uid => dbRemoveGroupMember(circle.id, uid)));
    setSelectedMembers([]);
    await load();
    setRemovingMembers(false);
  };

  if (circle === undefined) return (
    <div style={{textAlign:'center',padding:'60px 0',color:'var(--muted)'}}>
      <Loader size={28} className="spin" style={{marginBottom:14}}/><div>Loading circle…</div>
    </div>
  );
  if (circle === null) return (
    <div style={{textAlign:'center',padding:'60px 0'}}>
      <Layers size={36} color="var(--muted)" style={{marginBottom:14}}/>
      <div style={{fontWeight:700,fontSize:16,marginBottom:8}}>Circle not found</div>
      <div className="muted small" style={{marginBottom:20}}>This circle doesn't exist, or is private and you don't have access.</div>
      {onBack && <button className="btn btn-ghost" onClick={onBack}>Go back</button>}
    </div>
  );

  const isPublic = circle.circle_type === "public";

  const canShowMembers = circle.is_owner || circle.is_member || isPublic;
  const memberList = circle.members || [];
  const filteredMembers = memberSearch.trim()
    ? memberList.filter(m=>(m.name||"").toLowerCase().includes(memberSearch.trim().toLowerCase()))
    : memberList;
  const toggleMemberSel = (uid) => setSelectedMembers(s=>s.includes(uid)?s.filter(x=>x!==uid):[...s,uid]);
  const allFilteredSelectable = filteredMembers.filter(m=>m.role!=='admin');
  const allFilteredSelected = allFilteredSelectable.length>0 && allFilteredSelectable.every(m=>selectedMembers.includes(m.user_id));

  // Search/filter/sort over the ideas list — same derived-const pattern as
  // filteredMembers just above (plain computation, not a hook, since we're
  // already past this component's conditional early returns).
  let visibleIdeas = ideas;
  if (ideas) {
    visibleIdeas = [...ideas];
    if (ideaTypeFilter!=="all") visibleIdeas = visibleIdeas.filter(i=>i.recommendation_type===ideaTypeFilter);
    if (ideaQuery.trim()) {
      const s = ideaQuery.trim().toLowerCase();
      visibleIdeas = visibleIdeas.filter(i =>
        (i.ticker||"").toLowerCase().includes(s) ||
        (i.asset_name||"").toLowerCase().includes(s) ||
        (i.recommender_name||"").toLowerCase().includes(s)
      );
    }
    const ideaCmp = {
      activity: (a,b)=>new Date(a.last_activity_at)-new Date(b.last_activity_at),
      likes:    (a,b)=>(a.likes||0)-(b.likes||0),
      comments: (a,b)=>(a.comments_count||0)-(b.comments_count||0),
      ticker:   (a,b)=>(a.ticker||"").localeCompare(b.ticker||""),
    }[ideaSort.key];
    visibleIdeas.sort((a,b)=> ideaSort.dir==="asc" ? ideaCmp(a,b) : -ideaCmp(a,b));
  }

  return (<div style={{maxWidth:760,margin:'0 auto'}}>
    <div className="card" style={{marginBottom:14,position:'relative'}}>
      <div className="card-body" style={{padding:'18px 20px'}}>
        {onBack && <button className="iconbtn" title="Close" onClick={onBack} style={{position:'absolute',top:12,right:12}}><X size={16}/></button>}

        <div style={{display:'flex',alignItems:'flex-start',gap:12,paddingRight:30}}>
          <div className="av" style={{width:44,height:44,background:circle.color||'var(--grad)',flexShrink:0}}><Layers size={18}/></div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              <h2 style={{margin:0,fontSize:18}}>{circle.name}</h2>
              {isPublic
                ? <span className="pill accent" style={{fontSize:11}}><Globe size={11} style={{verticalAlign:-1,marginRight:3}}/>Public</span>
                : <span className="pill" style={{fontSize:11}}><Lock size={11} style={{verticalAlign:-1,marginRight:3}}/>Private</span>}
              {circle.description && (
                <button className="iconbtn" title={descOpen?"Hide description":"Show description"} onClick={()=>setDescOpen(o=>!o)} style={{width:22,height:22}}>
                  <Info size={13}/>
                </button>
              )}
            </div>
            <div className="muted small" style={{marginTop:3}}>
              {circle.member_count} member{circle.member_count!==1?"s":""} · by{" "}
              <span className="clickable" style={{color:"var(--accent-ink)",textDecoration:"underline",textDecorationStyle:"dotted"}}
                onClick={()=>onNavigateProfile ? onNavigateProfile(circle.owner_username) : gotoUserProfile(circle.created_by)}>
                {circle.owner_name}
              </span>
            </div>
            {descOpen && circle.description && <p style={{fontSize:13,lineHeight:1.55,margin:'8px 0 0',color:'var(--ink-soft)'}}>{circle.description}</p>}
          </div>
        </div>

        {/* ── Actions row: status/CTA + icon buttons ── */}
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginTop:14,paddingTop:14,borderTop:'1px solid var(--line)'}}>
          {circle.is_owner ? (
            <span className="pill accent">Owner</span>
          ) : circle.is_member ? (
            <span className="pill" style={{background:'var(--gain-soft)',color:'var(--gain)'}}><Check size={12} style={{verticalAlign:-1,marginRight:3}}/>Member</span>
          ) : isPublic ? (
            circle.my_join_request_status === 'pending'
              ? <span className="pill" style={{fontSize:12}}>Request pending</span>
              : <button className="btn btn-pri btn-sm" disabled={joining} onClick={handleJoin}>
                  {joining ? <Loader size={13} className="spin"/> : <UserPlus size={13}/>} {viewerUser ? "Subscribe" : "Sign in to subscribe"}
                </button>
          ) : null}

          <div style={{marginLeft:'auto',display:'flex',gap:6}}>
            {(circle.is_owner || circle.is_member) && (
              <button ref={shareBtnRef} className="iconbtn" title="Share this circle" onClick={()=>setShareOpen(true)}><Share2 size={15}/></button>
            )}
            {circle.is_owner && <button className="iconbtn" title="Add members" onClick={()=>setShowAdd(true)}><UserPlus size={15}/></button>}
            {circle.is_owner && isPublic && (
              <button className="iconbtn" title="Join requests" onClick={()=>setShowRequests(true)} style={{position:'relative'}}>
                <Bell size={15}/>
                {circle.pending_request_count>0 && (
                  <span style={{position:'absolute',top:-4,right:-4,background:'var(--accent)',color:'#fff',borderRadius:'50%',fontSize:10,fontWeight:800,minWidth:16,height:16,padding:'0 3px',display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1}}>
                    {circle.pending_request_count>9?'9+':circle.pending_request_count}
                  </span>
                )}
              </button>
            )}
            {circle.is_owner && <button className="iconbtn" title="Circle settings" onClick={()=>setShowSettings(true)}><Pencil size={15}/></button>}
          </div>
        </div>
      </div>
    </div>

    {shareOpen && <CircleSharePopover circle={circle} anchorEl={shareBtnRef.current} onClose={()=>setShareOpen(false)}/>}

    {canShowMembers && (
      <div className="card" style={{marginBottom:14}}>
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',cursor:'pointer'}} onClick={()=>setMembersOpen(o=>!o)}>
          <Users size={14} className="muted"/>
          <span style={{fontWeight:700,fontSize:13.5,flex:1}}>Members ({circle.member_count})</span>
          <ChevronDown size={16} className="muted" style={{transform:membersOpen?"rotate(180deg)":"none",transition:".15s"}}/>
        </div>
        {membersOpen && (
          <div className="card-body" style={{paddingTop:0}}>
            {memberList.length===0 ? <div className="empty">No members yet.</div> : (<>
              <div style={{display:'flex',gap:8,marginBottom:10,alignItems:'center',flexWrap:'wrap'}}>
                <div className="searchbox" style={{flex:1,minWidth:160}}>
                  <Search size={14} color="var(--muted)"/>
                  <input value={memberSearch} onChange={e=>setMemberSearch(e.target.value)} placeholder="Search members…"/>
                </div>
                {circle.is_owner && allFilteredSelectable.length>0 && (
                  <button className="btn btn-ghost btn-sm" onClick={()=>{
                    const ids = allFilteredSelectable.map(m=>m.user_id);
                    setSelectedMembers(s=> allFilteredSelected ? s.filter(id=>!ids.includes(id)) : [...new Set([...s, ...ids])]);
                  }}>{allFilteredSelected?"Unselect all":"Select all"}</button>
                )}
                {circle.is_owner && selectedMembers.length>0 && (
                  <button className="btn btn-ghost btn-sm" style={{color:'var(--loss)'}} disabled={removingMembers} onClick={handleBulkRemoveMembers}>
                    {removingMembers?<Loader size={13} className="spin"/>:<Trash2 size={13}/>} Remove ({selectedMembers.length})
                  </button>
                )}
              </div>
              <div style={{maxHeight:280,overflowY:'auto',display:'flex',flexDirection:'column',gap:6}}>
                {filteredMembers.length===0
                  ? <div className="muted small" style={{padding:'6px 2px'}}>No members match &ldquo;{memberSearch}&rdquo;.</div>
                  : filteredMembers.map(m=>(
                    <div key={m.user_id} style={{display:'flex',alignItems:'center',gap:10,background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:10,padding:'6px 10px'}}>
                      {circle.is_owner && m.role!=='admin' && (
                        <input type="checkbox" checked={selectedMembers.includes(m.user_id)} onChange={()=>toggleMemberSel(m.user_id)}
                          style={{width:15,height:15,accentColor:'var(--accent)',flexShrink:0}}/>
                      )}
                      <div style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',flex:1,minWidth:0}}
                        onClick={()=>onNavigateProfile ? onNavigateProfile(m.username) : gotoUserProfile(m.user_id)}>
                        <Avatar f={{name:m.name,avatarUrl:m.avatar_url,color:m.avatar_color,initials:initialsOf(m.name||"?")}} size={28}/>
                        <div style={{minWidth:0}}>
                          <div style={{fontWeight:600,fontSize:13}}>{m.name}</div>
                          <div className="muted" style={{fontSize:11}}>{m.role==='admin'?'Owner':'Member'}</div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </>)}
          </div>
        )}
      </div>
    )}

    {(circle.is_owner || circle.is_member) && (
      <div className="card" style={{marginTop:16}}>
        {/* Search/filter/sort for the ideas list — same icon-only trigger
            + SmallAnchoredPopover pattern already used for Portfolio's
            holdings grid and Connections' contact lists. */}
        <div className="card-head" style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{display:'flex',alignItems:'center',gap:6,flex:1,minWidth:0}}><Lightbulb size={14}/> Ideas shared here</span>
          {ideas && ideas.length>0 && (
            <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
              <button className={"icon-btn"+(ideaSearchOpen?" active":"")} style={{width:30,height:30}} title="Search ideas" onClick={()=>setIdeaSearchOpen(v=>!v)}><Search size={13}/></button>
              <div style={{position:'relative'}}>
                <button ref={ideaFilterBtnRef} className={"icon-btn"+(ideaTypeFilter!=="all"?" active":"")} style={{width:30,height:30}} title="Filter ideas" onClick={()=>setIdeaFilterOpen(v=>!v)}><SlidersHorizontal size={13}/></button>
                {ideaFilterOpen && (
                  <SmallAnchoredPopover anchorEl={ideaFilterBtnRef.current} onClose={()=>setIdeaFilterOpen(false)}>
                    <div className="cap" style={{marginBottom:6}}>Idea type</div>
                    {CIRCLE_IDEAS_FILTER_OPTIONS.map(o=>{
                      const active = o.value===ideaTypeFilter;
                      return (
                        <div key={o.value} onClick={()=>{setIdeaTypeFilter(o.value);setIdeaFilterOpen(false);}}
                          style={{padding:'8px 9px',borderRadius:8,cursor:'pointer',fontSize:13,fontWeight:active?700:500,color:active?'var(--accent-ink)':'var(--ink)',background:active?'var(--accent-soft)':'transparent'}}>
                          {o.label}
                        </div>
                      );
                    })}
                  </SmallAnchoredPopover>
                )}
              </div>
              <div style={{position:'relative'}}>
                <button ref={ideaSortBtnRef} className={"icon-btn"+((ideaSort.key!=="activity"||ideaSort.dir!=="desc")?" active":"")} style={{width:30,height:30}} title="Sort ideas" onClick={()=>setIdeaSortOpen(v=>!v)}><ArrowUpDown size={13}/></button>
                {ideaSortOpen && (
                  <SmallAnchoredPopover anchorEl={ideaSortBtnRef.current} onClose={()=>setIdeaSortOpen(false)}>
                    {CIRCLE_IDEAS_SORT_OPTIONS.map(o=>{
                      const active = o.key===ideaSort.key && o.dir===ideaSort.dir;
                      return (
                        <div key={o.value} onClick={()=>{setIdeaSort({key:o.key,dir:o.dir});setIdeaSortOpen(false);}}
                          style={{padding:'8px 9px',borderRadius:8,cursor:'pointer',fontSize:13,fontWeight:active?700:500,color:active?'var(--accent-ink)':'var(--ink)',background:active?'var(--accent-soft)':'transparent'}}>
                          {o.label}
                        </div>
                      );
                    })}
                  </SmallAnchoredPopover>
                )}
              </div>
            </div>
          )}
        </div>
        {ideaSearchOpen && ideas && ideas.length>0 && (
          <div style={{padding:'12px 16px 0'}}>
            <div className="searchbox">
              <Search size={14} color="var(--muted)"/>
              <input autoFocus value={ideaQuery} onChange={e=>setIdeaQuery(e.target.value)} placeholder="Search ticker, name or ideator…"/>
              {ideaQuery && <button onClick={()=>setIdeaQuery("")} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',display:'flex'}}><X size={13}/></button>}
            </div>
          </div>
        )}
        <div className="card-body" style={{display:'flex',flexDirection:'column',gap:10}}>
          {ideas===null && !ideasErr && <div className="muted small" style={{padding:'8px 0'}}><Loader size={14} className="spin"/> Loading…</div>}
          {ideasErr && <div className="muted small">Couldn&apos;t load ideas right now.</div>}
          {ideas && ideas.length===0 && <div className="empty">No ideas shared with this circle yet.</div>}
          {ideas && ideas.length>0 && visibleIdeas.length===0 && <div className="empty">No ideas match your search/filter.</div>}
          {ideas && visibleIdeas.map(idea=>{
            const isHighlighted = String(idea.id)===String(highlightIdeaId);
            return (
            <div key={idea.id} id={`circle-idea-${idea.id}`} className="hoverable" style={{display:'flex',gap:12,padding:'12px 14px',
                background: isHighlighted ? 'var(--accent-soft, rgba(109,93,245,.1))' : 'var(--surface-2)',
                border: isHighlighted ? '1.5px solid var(--accent)' : '1px solid var(--line)',
                borderRadius:10,cursor:'pointer',transition:'background .3s, border-color .3s'}}
              onClick={()=>{
                const dest = idea.recommender_username ? `#/investor/${idea.recommender_username}/reco/${idea.id}` : null;
                if (dest) window.location.hash = dest;
              }}>
              <Avatar f={{name:idea.recommender_name,avatarUrl:idea.recommender_avatar_url,color:idea.recommender_avatar_color,initials:initialsOf(idea.recommender_name||"?")}} size={34}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:2}}>
                  <span style={{fontWeight:700,fontSize:13.5}}>{idea.ticker}</span>
                  <TypeBadge t={idea.recommendation_type}/>
                  {idea.conviction && <ConvBadge level={idea.conviction}/>}
                  <span className="muted small">· {idea.asset_name}</span>
                </div>
                <div className="muted small" style={{marginBottom:4}}>
                  by <b>{idea.recommender_name}</b> · {fmtDate(idea.last_activity_at)}
                  {idea.last_activity_at !== idea.created_at && <span> (active)</span>}
                </div>
                <div style={{display:'flex',alignItems:'center',gap:14,fontSize:12,color:'var(--muted)'}}>
                  {idea.current_price!=null && idea.reco_price!=null && idea.reco_price>0 && (
                    <RetBadge pct={
                      idea.recommendation_type==='Sell'
                        ? (idea.reco_price - idea.current_price) / idea.reco_price * 100
                        : (idea.current_price - idea.reco_price) / idea.reco_price * 100
                    }/>
                  )}
                  <span style={{display:'flex',alignItems:'center',gap:4}}><ThumbsUp size={12}/> {idea.likes||0}</span>
                  <span style={{display:'flex',alignItems:'center',gap:4}}><MessageSquare size={12}/> {idea.comments_count||0}</span>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      </div>
    )}

    {showAdd && <AddMembersModal group={{id:circle.id,name:circle.name,circle_type:circle.circle_type}} onClose={()=>setShowAdd(false)}
        onSave={async(ids)=>{ await dbAddGroupMembers(circle.id, ids); setShowAdd(false); load(); }}/>}
    {showSettings && <EditCircleModal group={{id:circle.id,name:circle.name,description:circle.description}} groups={[]} myId={circle.created_by}
        onClose={()=>setShowSettings(false)} onSave={async(name,description)=>{ await dbUpdateCircleSettings(circle.id,name,description); setShowSettings(false); load(); }}/>}
    {showRequests && <JoinRequestsModal group={{id:circle.id,name:circle.name}} onClose={()=>setShowRequests(false)} onReviewed={load}/>}
  </div>);
}
