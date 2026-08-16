import React from "react";
import {
  Bell,
  X,
  Check
} from "lucide-react";
import { useIsMobile } from "../../hooks/index";
import { fmtDate, initialsOf } from "../../utils/format";

export function NotificationPanel({ notifications, myId, onAccept, onReject, onRead, onReadAll, onClose, onNavigate, pushPermission, onEnablePush, onDisablePush }) {
  const isMobile = useIsMobile();
  const unread = notifications.filter(n => !n.is_read);
  const TYPE_LABEL = {
    connection_request:      "wants to connect with you",
    connection_accepted:     "accepted your connection request",
    connection_rejected:     "declined your connection request",
    group_added:             "added you to a Circle",
    group_member_exit:       "left your Circle",
    circle_join_request:     "requested to join your Circle",
    circle_join_approved:    "approved your request to join their Circle",
    circle_join_rejected:    "declined your request to join their Circle",
    tracking_new:            "started tracking you",
    recommendation:          "shared a recommendation with you",
    circle_idea:             "shared an idea in a Circle",
    exit_signal:             "issued an exit signal",
    contact_recommendation:  "posted a new recommendation",
    contact_comment:         "commented on your recommendation",
    contact_like:            "liked your recommendation",
    network_like:            "liked a recommendation",
    network_comment:         "commented on a recommendation",
  };
  const TYPE_ICON = {
    contact_recommendation: "💡",
    contact_comment:        "💬",
    contact_like:           "👍",
    network_like:           "👍",
    network_comment:        "💬",
  };

  // Build the display text — friendly, natural language for all notification types
  const notifText = (n) => {
    const ticker = n.metadata?.ticker
      ? <b style={{color:'var(--accent)'}}>{n.metadata.ticker}</b>
      : null;
    const byLine = n.metadata?.recommenderName
      ? <> by <b>{n.metadata.recommenderName}</b></>
      : null;

    // Consolidated likes: "Rahul and 2 others liked your INFY recommendation"
    if (n.type === 'contact_like') {
      const names  = n.metadata?.likerNames || [n.from_name || 'Someone'];
      const count  = n.metadata?.likeCount  || 1;
      const who = count === 1
        ? <b>{names[0]}</b>
        : count === 2 && names.length >= 2
        ? <><b>{names[0]}</b> and <b>{names[1]}</b></>
        : <><b>{names[0]}</b> and <b>{count - 1} others</b></>;
      return <>{who} liked your {ticker ? <>{ticker} </> : ''}recommendation</>;
    }

    // Smart-bundled tracking: "Rahul Sharma started tracking you" or
    // "Ankur + 10 new investors started tracking you" once it bundles.
    if (n.type === 'tracking_new') {
      const count = n.metadata?.count || 1;
      const leadName = n.metadata?.leadName || n.from_name || 'Someone';
      if (count <= 1) return <><b>{leadName}</b> started tracking you</>;
      return <><b>{leadName}</b> + {count - 1} new investor{count - 1 === 1 ? '' : 's'} started tracking you</>;
    }

    // "Vivaan Rawat shared an idea in Piggy Wealth — HFCL"
    if (n.type === 'circle_idea') {
      const groupName = n.metadata?.groupName;
      return <><b>{n.from_name||'Someone'}</b> shared an idea{groupName ? <> in <b>{groupName}</b></> : ' in a Circle'}{ticker ? <> — {ticker}</> : ''}</>;
    }

    // Network: "Ankur Gupta liked INDSWFTLAB by Abhijheet"
    if (n.type === 'network_like')
      return <><b>{n.from_name||'Someone'}</b> liked {ticker}{byLine}</>;
    if (n.type === 'network_comment')
      return <><b>{n.from_name||'Someone'}</b> commented on {ticker||'a recommendation'}{byLine}</>;

    // Other engagement types
    if (n.type === 'contact_comment')
      return <><b>{n.from_name||'Someone'}</b> commented on your {ticker ? <>{ticker} </> : ''}recommendation</>;
    if (n.type === 'contact_recommendation')
      return <><b>{n.from_name||'Someone'}</b> posted a new recommendation{ticker ? <> — {ticker}</> : ''}</>;

    // Connection + generic types
    const label = TYPE_LABEL[n.type] || n.type;
    const group = n.metadata?.groupName ? <> — <b>{n.metadata.groupName}</b></> : null;
    return <><b>{n.from_name||'Someone'}</b> {label}{ticker ? <> — {ticker}</> : ''}{group}</>;
  };
  // On mobile: fixed to viewport (prevents overflow beyond screen edges)
  // On desktop: absolute, anchored to the bell button
  const panelStyle = isMobile
    ? { position:'fixed', top:68, left:8, right:8, width:'auto',
        background:'var(--surface)', border:'1px solid var(--line)',
        borderRadius:16, boxShadow:'0 8px 32px rgba(0,0,0,.18)', zIndex:300,
        maxHeight:'70vh', display:'flex', flexDirection:'column' }
    : { position:'absolute', top:44, right:0, width:380,
        background:'var(--surface)', border:'1px solid var(--line)',
        borderRadius:16, boxShadow:'0 8px 32px rgba(0,0,0,.12)', zIndex:200,
        maxHeight:520, display:'flex', flexDirection:'column' };
  return (
    <div style={panelStyle} onClick={e=>e.stopPropagation()}>
      <div style={{padding:"14px 18px",borderBottom:"1px solid var(--line)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <b style={{fontSize:14}}>Notifications {unread.length>0 && <span className="nav-badge" style={{position:"static",marginLeft:6}}>{unread.length}</span>}</b>
        <div style={{display:"flex",gap:8}}>
          {unread.length>0 && <button className="btn btn-ghost btn-sm" onClick={onReadAll}>Mark all read</button>}
          <button className="icon-btn" onClick={onClose}><X size={16}/></button>
        </div>
      </div>
      <div style={{overflowY:"auto",flex:1}}>
        {/* ── Push permission banners — shown in-context only ── */}
        {'Notification' in window && pushPermission === 'default' && onEnablePush && (
          <div style={{padding:"12px 16px",background:"rgba(109,93,245,.06)",borderBottom:"1px solid var(--line)",display:"flex",alignItems:"center",gap:10}}>
            <Bell size={16} color="var(--accent)"/>
            <div style={{flex:1,fontSize:12,lineHeight:1.5}}>
              <b style={{fontSize:13}}>Enable push notifications</b><br/>
              <span style={{color:"var(--muted)"}}>Get notified about likes, comments and new recommendations even when the app is closed.</span>
            </div>
            <div style={{display:"flex",gap:6,flexShrink:0}}>
              <button className="btn btn-pri btn-sm" onClick={onEnablePush}>Enable</button>
              <button className="btn btn-ghost btn-sm" onClick={onClose}>Later</button>
            </div>
          </div>
        )}
        {pushPermission === 'granted' && onDisablePush && (
          <div style={{padding:"8px 16px",background:"rgba(74,222,128,.06)",borderBottom:"1px solid var(--line)",display:"flex",alignItems:"center",gap:8,fontSize:12,color:"var(--muted)"}}>
            <Bell size={13} color="#22863a"/>
            <span>Push notifications are <b style={{color:"#22863a"}}>on</b></span>
            <button onClick={onDisablePush} style={{marginLeft:"auto",background:"none",border:"1px solid var(--line)",borderRadius:6,cursor:"pointer",fontSize:11,color:"var(--muted)",padding:"2px 8px"}}>Turn off</button>
          </div>
        )}
        {pushPermission === 'disabled' && onEnablePush && (
          <div style={{padding:"8px 16px",background:"var(--surface-2)",borderBottom:"1px solid var(--line)",display:"flex",alignItems:"center",gap:8,fontSize:12,color:"var(--muted)"}}>
            <Bell size={13} color="var(--muted)"/>
            <span>Push notifications are off</span>
            <button onClick={onEnablePush} style={{marginLeft:"auto",background:"none",border:"1px solid var(--line)",borderRadius:6,cursor:"pointer",fontSize:11,color:"var(--accent)",padding:"2px 8px"}}>Turn on</button>
          </div>
        )}
        {notifications.length===0 && <div className="empty" style={{padding:32}}>No notifications yet</div>}
        {notifications.map(n=>{
          const isEngagement = ['contact_recommendation','contact_comment','contact_like','network_like','network_comment'].includes(n.type);
          const avBg = isEngagement
            ? (n.type==='contact_like'||n.type==='network_like') ? '#e05252'
            : (n.type==='contact_comment'||n.type==='network_comment') ? '#0ea5b7'
            : '#22863a'
            : '#6d5df5';
          const isNavReco = ['contact_like','contact_comment','network_like','network_comment','contact_recommendation'].includes(n.type);
          const isNavConn = ['connection_request','connection_accepted','connection_rejected'].includes(n.type);
          const isNavTracking = n.type === 'tracking_new';
          const isNavCircleIdea = n.type === 'circle_idea';
          const isClickable = onNavigate && (isNavReco || isNavConn || isNavTracking || isNavCircleIdea);
          return (
          <div key={n.id}
            onClick={isClickable ? () => onNavigate(n) : undefined}
            style={{
              position: 'relative',
              padding:  "12px 18px 12px 21px",   // left padding accounts for the 3px border
              borderBottom: "1px solid var(--line)",
              borderLeft:   n.is_read
                ? "3px solid transparent"          // reserve space — no layout shift on mark-read
                : "3px solid var(--accent)",
              background:   n.is_read
                ? "transparent"
                : "rgba(109,93,245,.08)",
              display: "flex", gap: 12, alignItems: "flex-start",
              cursor:  isClickable ? 'pointer' : 'default',
              transition: 'background .2s, border-left-color .2s',
            }}
            onMouseEnter={isClickable ? e => { e.currentTarget.style.background = 'var(--surface-2)'; } : undefined}
            onMouseLeave={isClickable ? e => { e.currentTarget.style.background = n.is_read ? 'transparent' : 'rgba(109,93,245,.08)'; } : undefined}
          >
            <div className="av" style={{
              width: 36, height: 36, flexShrink: 0,
              background: avBg,
              fontSize: isEngagement ? 16 : 13,
            }}>
              {isEngagement ? TYPE_ICON[n.type] : initialsOf(n.from_name||"?")}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{
                fontSize:   13,
                lineHeight: 1.5,
                fontWeight: n.is_read ? 400 : 600,
                color:      n.is_read ? 'var(--ink-soft)' : 'var(--ink)',
              }}>
                {notifText(n)}
              </div>
              <div style={{
                fontSize:  11,
                marginTop: 2,
                color:     n.is_read ? 'var(--muted)' : 'var(--muted)',
                opacity:   n.is_read ? 0.7 : 1,
              }}>
                {fmtDate(n.created_at)}
                {!n.is_read && (
                  <span style={{
                    display: 'inline-block', width: 6, height: 6,
                    borderRadius: '50%', background: 'var(--accent)',
                    marginLeft: 6, verticalAlign: 'middle',
                  }}/>
                )}
              </div>
              {/* Action buttons for connection requests — stopPropagation so row click doesn't fire */}
              {n.type==="connection_request" && !n.is_read && (
                <div style={{display:"flex",gap:8,marginTop:8}}>
                  <button className="btn btn-pri btn-sm"
                    onClick={e=>{e.stopPropagation();onAccept(n);}}><Check size={13}/> Accept</button>
                  <button className="btn btn-ghost btn-sm"
                    onClick={e=>{e.stopPropagation();onReject(n);}}><X size={13}/> Decline</button>
                </div>
              )}
              {n.type==="connection_request" && n.is_read && (
                <span className="pill muted" style={{fontSize:11,marginTop:4}}>Responded</span>
              )}
            </div>
            {/* Mark-read tick — only for unread non-connection-request notifications */}
            {!n.is_read && n.type!=="connection_request" && (
              <button className="icon-btn" title="Mark read"
                onClick={e=>{e.stopPropagation();onRead(n);}}>
                <Check size={14}/>
              </button>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Network shell ─────────────────────────────────────────────────────────── */
