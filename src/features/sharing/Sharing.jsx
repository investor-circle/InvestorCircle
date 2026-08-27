import React from "react";
import {
  Flame
} from "lucide-react";
import {
  setFeedPref as dbSetFeedPref
} from "../../services/api/lookupsApi";

export function Sharing({ feedConfigOptions, userFeedPrefs, setUserFeedPrefs, effectiveFeedConfig, setEffectiveFeedConfig, myId }) {
  return (<>
    <div className="page-head"><div><div className="eyebrow">Sharing & Privacy</div><div className="page-title">Feed Settings</div>
      <div className="page-sub">Personalise what appears in your idea feed.</div></div></div>

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

/* =================================================================== PUBLIC PROFILE */

// Fallback sector list — used when sector_master table is unavailable.
// Kept in sync with the hardcoded options the sector dropdown showed historically.
