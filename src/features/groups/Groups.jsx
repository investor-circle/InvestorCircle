import React, { useState, useMemo } from "react";
import {
  Search,
  Plus,
  X,
  Check,
  Layers,
  ChevronDown,
  UserPlus,
  Trash2,
  Pencil
} from "lucide-react";
import {
  addGroupMembers as dbAddGroupMembers,
  createGroup as dbCreateGroup,
  deleteGroup as dbDeleteGroup,
  exitGroup as dbExitGroup,
  removeGroupMember as dbRemoveGroupMember,
  renameGroup as dbRenameGroup,
  getMyGroups
} from "../../services/api/groupsApi";
import { Avatar } from "../../components/common";
import { fmtDate, initialsOf, recoStats } from "../../utils/format";
import { gotoUserProfile } from "../../utils/navigation";

export function GroupsSection({ groups, setGroups, contacts, configs, canCreateGroups, recsReceived, onOpenRecos, me }) {
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [addTo, setAddTo] = useState(null);
  const [editGroup, setEditGroup] = useState(null);
  const [busy, setBusy] = useState({});
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

  const doCreateGroup = async (name, memberIds, color) => {
    if(groups.some(g=>g.my_role==="admin"&&g.name.toLowerCase()===name.toLowerCase())){
      alert(`You already have a group named "${name}".`); return;
    }
    setBusy(b=>({...b,create:true}));
    const g = await dbCreateGroup(name, color||"#6d5df5", myId, memberIds);
    setGroups(await getMyGroups(myId));
    setBusy(b=>({...b,create:false}));
    setShowNew(false);
    return g;
  };
  const doRenameGroup = async (gid, newName) => {
    await dbRenameGroup(gid, newName, myId);
    setGroups(gs=>gs.map(g=>g.id===gid?{...g,name:newName}:g));
    setEditGroup(null);
  };
  const doDeleteGroup = async (g) => {
    if(!confirm(`Delete "${g.name}"?`)) return;
    await dbDeleteGroup(g.id, myId);
    setGroups(gs=>gs.filter(x=>x.id!==g.id));
  };
  const doExitGroup = async (g) => {
    if(!confirm(`Exit "${g.name}"? You will stop receiving recommendations shared in this group.`)) return;
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

  return (<>
    <div className="toolbar">
      <div className="searchbox grow"><Search size={16} color="var(--muted)"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search groups…"/></div>
      <button className="btn btn-pri btn-sm" disabled={!canCreateGroups} onClick={()=>setShowNew(true)}><Plus size={15}/> New group</button>
    </div>
    {rows.length===0 ? <div className="card"><div className="empty">No groups yet. Create one to start sharing recommendations with multiple people at once.</div></div> :
    <div className="card"><div className="card-body" style={{padding:"8px 0"}}><div className="tscroll"><table className="grid" style={{minWidth:820}}>
      <thead><tr>
        <th>Group name</th><th>Created on</th><th>Members</th><th>My role</th><th>Recos</th><th style={{textAlign:"right"}}>Actions</th>
      </tr></thead>
      <tbody>{rows.map(g=>{ const open=expanded===g.id; const iAmAdmin=g.my_role==="admin";
        return (<React.Fragment key={g.id}>
          <tr className="hoverable" style={{cursor:"pointer"}} onClick={()=>setExpanded(open?null:g.id)}>
            <td><span className="nowrap"><span className="av" style={{width:28,height:28,background:g.color,fontSize:12,marginRight:8,display:"inline-flex",alignItems:"center",justifyContent:"center",borderRadius:8}}><Layers size={13}/></span>
              <b>{g.name}</b><ChevronDown size={14} style={{transform:open?"rotate(180deg)":"none",transition:".15s",marginLeft:6}}/></span></td>
            <td className="muted small">{fmtDate(g.created_at)}</td>
            <td><span className="pill">{(g.members||[]).filter(m=>m.status==="active").length} members</span></td>
            <td>{iAmAdmin ? <span className="pill accent">Admin</span> : <span className="pill">Member</span>}</td>
            <td className="tnum">{statsOf(g).count}</td>
            <td onClick={e=>e.stopPropagation()}>
              <div className="actions" style={{justifyContent:"flex-end",gap:6}}>
                {iAmAdmin && <><button className="iconbtn" title="Rename" onClick={()=>setEditGroup(g)}><Pencil size={14}/></button>
                <button className="iconbtn danger" title="Delete group" onClick={()=>doDeleteGroup(g)}><Trash2 size={14}/></button></>}
                {!iAmAdmin && <button className="btn btn-ghost btn-sm" style={{color:"var(--loss)"}} onClick={()=>doExitGroup(g)}>Exit group</button>}
              </div>
            </td>
          </tr>
          {open && <tr className="expand-row"><td colSpan={6}><div className="expand-inner" onClick={e=>e.stopPropagation()}>
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
                      <div className="muted" style={{fontSize:11}}>{m.role==="admin"?"Admin":"Member"}</div>
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
    {showNew && <GroupModal title="New group" contacts={contacts} max={configs.maxGroupMembers} alreadyIn={[myId,"me"]}
        onClose={()=>setShowNew(false)} onSave={(name,ids)=>doCreateGroup(name,ids)}/>}
    {addTo && <GroupModal title="Add members" addOnly contacts={contacts} max={configs.maxGroupMembers}
        alreadyIn={(addTo.members||[]).filter(m=>m.status==="active").map(m=>m.user_id)}
        onClose={()=>setAddTo(null)} onSave={(_,ids)=>doAddMembers(addTo.id,ids)}/>}
    {editGroup && <EditGroupModal group={editGroup} groups={groups} myId={myId}
        onClose={()=>setEditGroup(null)} onSave={(name)=>doRenameGroup(editGroup.id,name)}/>}
  </>);
}

export function GroupModal({ title, contacts, max, alreadyIn, onClose, onSave, addOnly }) {
  const [name, setName] = useState("");
  const [members, setMembers] = useState([]);
  const available = contacts.filter(c=>!alreadyIn.includes(c.id));
  const toggle = (id) => setMembers(m=>m.includes(id)?m.filter(x=>x!==id):[...m,id]);
  const valid = (addOnly||name.trim()) && (addOnly ? members.length>0 : true);
  return (<div className="overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">
      {!addOnly && <div className="field"><label>Group name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Value Hunters" autoFocus/></div>}
      <div className="field"><label>Add from confirmed contacts {members.length>0&&`(${members.length} selected)`}</label>
        {available.length===0
          ? <div className="muted small">No confirmed contacts available to add. Only accepted connections can join groups.</div>
          : <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {available.map(c=><span key={c.id} className={"chip"+(members.includes(c.id)?" sel":"")} onClick={()=>toggle(c.id)}>{members.includes(c.id)&&<Check size={13}/>}{c.name}</span>)}
            </div>}
      </div>
    </div>
    <div className="modal-foot"><span/><div style={{display:"flex",gap:10}}>
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-pri" disabled={!valid} onClick={()=>onSave(name.trim(),members)}>{addOnly?"Add members":"Create group"}</button>
    </div></div>
  </div></div>);
}

export function EditGroupModal({ group, groups, myId, onClose, onSave }) {
  const [name, setName] = useState(group.name);
  const trimmed = name.trim();
  const isSame = trimmed.toLowerCase() === group.name.toLowerCase();
  const isDuplicate = !isSame && groups.some(g =>
    g.id !== group.id &&
    (g.admins.includes("me")||g.admins.includes(myId)) &&
    g.name.toLowerCase() === trimmed.toLowerCase()
  );
  const valid = trimmed && !isDuplicate;
  return (<div className="overlay" onClick={onClose}><div className="modal" style={{width:420}} onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3>Rename group</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">
      <div className="field"><label>Group name</label>
        <input value={name} autoFocus onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&valid&&onSave(trimmed)} placeholder="Group name"/>
        {isDuplicate && <div className="neg small" style={{marginTop:6}}>You already have a group with this name. Please choose a different name.</div>}
      </div>
    </div>
    <div className="modal-foot"><span/><div style={{display:"flex",gap:10}}>
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-pri" disabled={!valid||isSame} onClick={()=>onSave(trimmed)}><Check size={14}/> Save</button>
    </div></div>
  </div></div>);
}
