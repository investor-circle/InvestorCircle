import React from "react";
import { SOCIAL_LINKS } from "../../constants/app";

/**
 * The public landing page — what a signed-out visitor gets at "/".
 *
 * Self-contained on purpose: it renders outside the `.app` wrapper (see the
 * auth gate in App.jsx), so the global STYLES string is not in scope and every
 * value here is literal. They are the same tokens as src/styles/globalStyles.js
 * — accent #6d5df5, the --grad ramp, the 16px/--shadow card — so this page and
 * the app it fronts look like one product.
 *
 * Signing in is one click rather than zero: the form lives in LoginPage, and
 * duplicating its Google account-linking and password flows here to save that
 * click would mean two copies of the auth path to keep correct.
 */

const FAQS = [
  {
    q: "Can I edit my idea after publishing?",
    a: "No. Ideas are immutable to maintain transparency. You can publish follow-up updates or formally close an idea — but the original stays on record.",
  },
  {
    q: "Can I delete my ideas?",
    a: "No. My Investor Circle keeps a permanent, transparent historical record. Once an idea is published it becomes part of your public track record.",
  },
  {
    q: "Are users on My Investor Circle verified?",
    a: "Some profiles display SEBI registration status. Unless explicitly shown on a member's profile, we do not verify that they are registered with SEBI or any other regulatory authority.",
  },
  {
    q: "Do you provide investment advice?",
    a: "No. My Investor Circle is a technology platform where members share their own investment ideas and build public track records. We do not provide personalised investment advice or recommend any securities.",
  },
  {
    q: "How is my data used?",
    a: "We only use your data to operate the platform and never sell it to third parties. Ideas you mark as Public are visible to anyone. Private ideas are visible only to the people you share them with.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Post an idea, on the record",
    body: "Entry price, target, horizon and conviction — with your thesis, timestamped the moment you publish it.",
    icon: <><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></>,
  },
  {
    n: "02",
    title: "It can never be edited or deleted",
    body: "You close a position with an exit signal, which records how it ended. Post updates freely — the original stays put.",
    icon: <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
  },
  {
    n: "03",
    title: "Your ICI score reflects all of it",
    body: "Hit rate, median return, risk-adjusted performance and transparency — computed across your whole history, not your best week.",
    icon: <><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></>,
  },
];

const CIRCLE = [
  {
    title: "Judge by history, not by follower count",
    body: "Every member has a public track record and an ICI score. Open a profile and see what they posted, when, and how each idea actually ended.",
    icon: <><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></>,
  },
  {
    title: "Grow a circle you have actually checked",
    body: "Connect with the investors whose reasoning holds up, and follow their ideas as they publish them. Your circle is people you chose, not an algorithm's guess.",
    icon: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></>,
  },
  {
    title: "Share as narrowly as you like",
    body: "Publish to your whole circle, to one group, or publicly to anyone. You decide who sees each idea, every time you post.",
    icon: <><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v14"/></>,
  },
];

const ICI_WEIGHTS = [
  ["Hit rate", 78, "20%"],
  ["Track length", 64, "15%"],
  ["Volume", 71, "15%"],
  ["Median return", 59, "15%"],
  ["Risk-adjusted", 66, "15%"],
  ["Transparency", 88, "10%"],
  ["Profile", 92, "10%"],
];

function Icon({ children, size = 21, color = "#5a49e6", width = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
  );
}

const SOCIAL_ICONS = {
  x: <path d="M22 4.01c-1 .49-1.98.689-3 .99-1.121-1.265-2.783-1.335-4.38-.737S11.977 6.323 12 8v1c-3.245.083-6.135-1.395-8-4 0 0-4.182 7.433 4 11-1.872 1.247-3.739 2.088-6 2 3.308 1.803 6.913 2.423 10.034 1.517 3.58-1.04 6.522-3.723 7.651-7.742a13.84 13.84 0 0 0 .497-3.753c0-.249 1.51-2.772 1.818-4.013z"/>,
  facebook: <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>,
  instagram: <><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></>,
};

const CSS = `
.lp{--lp-ink:#13142b;--lp-soft:#565a78;--lp-muted:#8d90ad;--lp-line:#e9e9f2;--lp-line2:#dddcec;
  --lp-accent:#6d5df5;--lp-accent-ink:#5a49e6;--lp-accent-soft:#eeecff;--lp-accent-line:#dcd8fb;
  --lp-surface:#fff;--lp-surface2:#f1f1f8;--lp-bg:#f5f5fb;--lp-dark:#0a0b18;
  --lp-grad:linear-gradient(135deg,#6d5df5 0%,#9a55ee 55%,#cf52d8 100%);
  background:var(--lp-bg);color:var(--lp-ink);
  font-family:'Plus Jakarta Sans',-apple-system,system-ui,sans-serif;-webkit-font-smoothing:antialiased;}
.lp *{box-sizing:border-box;}
.lp-wrap{max-width:1180px;margin:0 auto;padding-left:32px;padding-right:32px;}
.lp-sec{padding-top:78px;padding-bottom:78px;}
.lp-band{background:var(--lp-surface);border-top:1px solid var(--lp-line);border-bottom:1px solid var(--lp-line);}
.lp-card{background:var(--lp-surface);border:1px solid var(--lp-line);border-radius:16px;
  box-shadow:0 1px 2px rgba(20,20,50,.04),0 6px 18px rgba(20,20,50,.05);overflow:hidden;}
.lp-eyebrow{font-size:12px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:var(--lp-accent);margin-bottom:10px;}
.lp h1,.lp h2,.lp h3{margin:0;text-wrap:pretty;}
.lp-h1{font-size:56px;font-weight:800;letter-spacing:-2.2px;line-height:1.04;}
.lp-h2{font-size:34px;font-weight:800;letter-spacing:-1px;line-height:1.18;}
.lp-lede{font-size:16px;line-height:1.8;color:var(--lp-soft);margin:14px 0 0;text-wrap:pretty;}
.lp-btn{border:none;border-radius:12px;font-size:13px;font-weight:700;padding:10px 16px;cursor:pointer;
  display:inline-flex;align-items:center;justify-content:center;gap:8px;font-family:inherit;transition:.12s;}
.lp-btn-pri{background:var(--lp-grad);color:#fff;box-shadow:0 6px 16px rgba(124,92,252,.3);}
.lp-btn-pri:hover{filter:brightness(1.06);}
.lp-btn-ghost{background:var(--lp-surface);border:1px solid var(--lp-line2);color:var(--lp-ink);}
.lp-btn-ghost:hover{background:var(--lp-surface2);}
.lp-btn-lg{padding:13px 26px;font-size:14.5px;}
.lp-chip{display:inline-flex;align-items:center;gap:6px;background:var(--lp-surface);border:1px solid var(--lp-line2);
  color:var(--lp-soft);border-radius:999px;font-size:13px;font-weight:600;padding:6px 12px;}
.lp-nav{border-bottom:1px solid var(--lp-line);background:rgba(255,255,255,.86);backdrop-filter:blur(8px);
  position:sticky;top:0;z-index:5;}
.lp-navrow{height:72px;display:flex;align-items:center;gap:32px;}
.lp-navlinks{display:flex;align-items:center;gap:26px;margin-left:14px;}
.lp-navlink{background:none;border:none;padding:0;cursor:pointer;font-family:inherit;font-size:13.5px;font-weight:600;color:var(--lp-soft);}
.lp-navlink:hover{color:var(--lp-accent-ink);}
.lp-hero{position:relative;overflow:hidden;}
.lp-glow{position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(760px 420px at 8% -18%,rgba(109,93,245,.16),transparent 60%),
             radial-gradient(620px 380px at 98% 8%,rgba(207,82,216,.10),transparent 60%);}
.lp-herogrid{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 372px;gap:64px;align-items:start;
  padding-top:70px;padding-bottom:74px;}
.lp-grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px;}
.lp-grid2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:70px;align-items:center;}
.lp-proof{display:grid;grid-template-columns:minmax(0,1fr) 420px;gap:26px;align-items:start;}
.lp-stat{background:var(--lp-surface2);border-radius:11px;padding:12px 13px;}
.lp-social{width:34px;height:34px;border-radius:50%;flex-shrink:0;background:var(--lp-surface2);
  border:1px solid var(--lp-line);color:var(--lp-muted);display:flex;align-items:center;justify-content:center;
  text-decoration:none;transition:.15s;}
.lp-social:hover{color:var(--lp-accent-ink);border-color:var(--lp-accent-line);}
.lp-faqrow{padding:19px 24px;border-bottom:1px solid var(--lp-line);}
.lp-faqrow:last-child{border-bottom:none;}
.lp-dark{border-radius:16px;background:var(--lp-dark);padding:26px 24px;box-shadow:0 14px 36px rgba(10,11,24,.22);}

@media (max-width:900px){
  .lp-wrap{padding-left:22px;padding-right:22px;}
  /* Wordmark (199px) + both nav buttons (164px) + gaps exceed the 346px of
     content a 390px viewport allows, which pushed the whole page sideways.
     The hero card sits immediately below the nav and carries both actions, so
     the nav keeps only the short one and stays within the gutter. */
  .lp-brandname{font-size:15.5px;}
  .lp-nav .lp-btn-pri{display:none;}
  .lp-navbtn{padding:13px 15px;font-size:13.5px;}
  .lp-sec{padding-top:52px;padding-bottom:52px;}
  .lp-h1{font-size:36px;letter-spacing:-1.4px;}
  .lp-h2{font-size:26px;letter-spacing:-.9px;}
  .lp-lede{font-size:15px;}
  .lp-navlinks{display:none;}
  .lp-navrow{height:60px;gap:12px;}
  .lp-herogrid{grid-template-columns:minmax(0,1fr);gap:26px;padding-top:38px;padding-bottom:44px;}
  .lp-grid3,.lp-grid2,.lp-proof{grid-template-columns:minmax(0,1fr);gap:14px;}
  .lp-btn{padding:14px 18px;font-size:15px;}
  .lp-btn-lg{padding:15px 22px;font-size:15px;}
  .lp-social{width:44px;height:44px;}
  .lp-faqrow{padding:17px 18px;}
  .lp-dark{padding:22px 20px;}
}
`;

export default function LandingPage({ onSignIn, onCreateAccount }) {
  return (
    <div className="lp">
      <style>{CSS}</style>

      <div className="lp-nav">
        <div className="lp-wrap lp-navrow">
          <div style={{display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
            <img src="/favicon.png" alt="" width={32} height={32} style={{display:'block'}}/>
            <span className="lp-brandname" style={{fontSize:17,fontWeight:800,letterSpacing:'-.3px'}}>myInvestorCircle</span>
          </div>
          <div className="lp-navlinks">
            <button className="lp-navlink" onClick={()=>document.getElementById('lp-how')?.scrollIntoView({behavior:'smooth'})}>How it works</button>
            <button className="lp-navlink" onClick={()=>document.getElementById('lp-circle')?.scrollIntoView({behavior:'smooth'})}>Your circle</button>
            <button className="lp-navlink" onClick={()=>document.getElementById('lp-faq')?.scrollIntoView({behavior:'smooth'})}>Questions</button>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10,marginLeft:'auto',flexShrink:0}}>
            <button className="lp-btn lp-btn-ghost lp-navbtn" onClick={onSignIn}>Sign in</button>
            <button className="lp-btn lp-btn-pri lp-navbtn" onClick={onCreateAccount}>Create account</button>
          </div>
        </div>
      </div>

      <div className="lp-hero">
        <div className="lp-glow"/>
        <div className="lp-wrap lp-herogrid">
          <div>
            <div className="lp-chip" style={{background:'#eeecff',borderColor:'#dcd8fb',color:'#5a49e6',fontSize:12,fontWeight:700}}>
              Invite-only
            </div>
            <h1 className="lp-h1" style={{marginTop:20}}>
              Every idea on the record.<br/>
              <span style={{color:'#5a49e6'}}>Including the ones that went wrong.</span>
            </h1>
            <p style={{fontSize:18,lineHeight:1.75,color:'#565a78',margin:'22px 0 0',maxWidth:610,textWrap:'pretty'}}>
              myInvestorCircle is a private circle where an investment idea is posted once and can never be edited or deleted.
              No disappearing posts, no cherry-picked winners — just a history you can check before you decide whose judgement
              to trust.
            </p>
            <div style={{display:'flex',flexWrap:'wrap',gap:10,marginTop:30}}>
              {["Ideas are permanent","Outcomes scored, not claimed","You choose who sees what"].map(t=>(
                <div className="lp-chip" key={t}>
                  <Icon size={15} color="#15924e" width={2.2}><path d="M20 6 9 17l-5-5"/></Icon>{t}
                </div>
              ))}
            </div>
            <p style={{fontSize:13,lineHeight:1.7,color:'#8d90ad',margin:'30px 0 0',maxWidth:560}}>
              We do not provide investment advice or recommend securities. Members share their own ideas; you do your own research.
            </p>
          </div>

          <div className="lp-card" style={{borderRadius:18}}>
            <div style={{padding:'22px 24px 6px'}}>
              <div style={{fontSize:17,fontWeight:800,letterSpacing:'-.3px'}}>Welcome back</div>
              <div style={{fontSize:13,color:'#8d90ad',marginTop:4}}>Sign in to your circle.</div>
            </div>
            <div style={{padding:'16px 24px 24px',display:'flex',flexDirection:'column',gap:10}}>
              <button className="lp-btn lp-btn-ghost" style={{width:'100%',padding:'12px',borderWidth:'1.5px',borderColor:'#e8e8f2',fontSize:14}} onClick={onSignIn}>
                <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.94v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.94A9 9 0 0 0 0 9c0 1.45.35 2.83.94 4.03l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .94 4.97l3.01 2.33C4.66 5.17 6.65 3.58 9 3.58z"/></svg>
                Continue with Google
              </button>
              <div style={{display:'flex',alignItems:'center',gap:10,margin:'6px 0'}}>
                <div style={{flex:1,height:1,background:'#e8e8f2'}}/>
                <span style={{fontSize:11,color:'#b0b3cc',fontWeight:700}}>OR</span>
                <div style={{flex:1,height:1,background:'#e8e8f2'}}/>
              </div>
              <button className="lp-btn lp-btn-pri" style={{width:'100%',padding:'12px',fontSize:14}} onClick={onSignIn}>
                Sign in with email →
              </button>
              <div style={{marginTop:10,paddingTop:16,borderTop:'1px solid #e9e9f2',textAlign:'center',fontSize:13,color:'#565a78'}}>
                New here?{' '}
                <button onClick={onCreateAccount} style={{background:'none',border:'none',padding:0,cursor:'pointer',
                  fontFamily:'inherit',fontSize:13,fontWeight:700,color:'#5a49e6'}}>Create an account →</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="lp-band">
        <div className="lp-wrap lp-sec lp-grid2">
          <div>
            <div className="lp-eyebrow">The problem</div>
            <h2 className="lp-h2" style={{fontFamily:"'Fraunces',Georgia,serif",fontWeight:600,letterSpacing:'-1.2px',fontSize:40}}>
              “Can I really trust this?”
            </h2>
            <p className="lp-lede">
              You come across a stock idea on X, Instagram, Telegram or YouTube and you have no way to answer one simple
              question: what did this person post last year, and how did it actually go?
            </p>
            <p className="lp-lede">
              The winners stay pinned. The bad ones quietly disappear. Follower count tells you who is popular, not who is right.
            </p>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div style={{display:'flex',gap:14,alignItems:'flex-start',padding:'18px 20px',borderRadius:14,background:'#f8eae8',border:'1px solid #f0d6d2'}}>
              <Icon size={20} color="#c2453d" width={2}><path d="M18 6 6 18M6 6l12 12"/></Icon>
              <div>
                <div style={{fontSize:14.5,fontWeight:800}}>Elsewhere</div>
                <div style={{fontSize:13.5,lineHeight:1.7,color:'#565a78',marginTop:4}}>A post can be edited, deleted or quietly buried once it ages badly.</div>
              </div>
            </div>
            <div style={{display:'flex',gap:14,alignItems:'flex-start',padding:'18px 20px',borderRadius:14,background:'#e6f4ec',border:'1px solid #cfe8da'}}>
              <Icon size={20} color="#15924e" width={2.2}><path d="M20 6 9 17l-5-5"/></Icon>
              <div>
                <div style={{fontSize:14.5,fontWeight:800}}>Here</div>
                <div style={{fontSize:13.5,lineHeight:1.7,color:'#565a78',marginTop:4}}>An idea is permanent. Closing a position records the outcome instead of hiding it.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="lp-wrap lp-sec" id="lp-how">
        <div style={{textAlign:'center',maxWidth:640,margin:'0 auto 44px'}}>
          <div className="lp-eyebrow">How it works</div>
          <h2 className="lp-h2">Three steps, and none of them are reversible</h2>
        </div>
        <div className="lp-grid3">
          {STEPS.map(s=>(
            <div className="lp-card" key={s.n} style={{padding:'28px 26px'}}>
              <div style={{width:42,height:42,borderRadius:12,background:'#eeecff',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <Icon>{s.icon}</Icon>
              </div>
              <div style={{fontSize:12,fontWeight:800,letterSpacing:'1.2px',color:'#8d90ad',marginTop:20}}>STEP {s.n}</div>
              <h3 style={{fontSize:19,fontWeight:800,letterSpacing:'-.4px',marginTop:7}}>{s.title}</h3>
              <div style={{fontSize:14,lineHeight:1.8,color:'#565a78',marginTop:10}}>{s.body}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="lp-band">
        <div className="lp-wrap lp-sec">
          <div style={{maxWidth:620,marginBottom:40}}>
            <div className="lp-eyebrow">What you actually see</div>
            <h2 className="lp-h2">An idea, and the record behind the person who posted it</h2>
          </div>
          <div className="lp-proof">
            <div className="lp-card">
              <div style={{padding:'15px 18px',borderBottom:'1px solid #e9e9f2',display:'flex',alignItems:'center',gap:11}}>
                <div style={{width:36,height:36,borderRadius:'50%',background:'linear-gradient(135deg,#6d5df5,#cf52d8)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:800,flexShrink:0}}>AV</div>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:800}}>Arjun V.</div>
                  <div style={{fontSize:12,color:'#8d90ad'}}>@arjun_v · 12 Mar 2026</div>
                </div>
                <div style={{marginLeft:'auto',display:'flex',gap:7,flexShrink:0}}>
                  <span style={{border:'1px solid #dddcec',color:'#565a78',borderRadius:999,fontSize:11,fontWeight:600,padding:'3px 9px'}}>Energy</span>
                  <span style={{background:'#e6f4ec',color:'#15924e',borderRadius:999,fontSize:11,fontWeight:800,padding:'3px 9px'}}>OPEN</span>
                </div>
              </div>
              <div style={{padding:18}}>
                <div style={{display:'flex',alignItems:'baseline',gap:12,flexWrap:'wrap'}}>
                  <div style={{fontSize:22,fontWeight:800,letterSpacing:'-.6px'}}>RELIANCE</div>
                  <div style={{fontSize:13,color:'#8d90ad',fontWeight:600}}>Reliance Industries</div>
                  <div style={{marginLeft:'auto',display:'inline-flex',alignItems:'center',gap:5,fontWeight:700,fontSize:14,color:'#15924e'}}>
                    <Icon size={14} color="#15924e" width={2.6}><path d="m5 15 7-7 7 7"/></Icon>+6.2%
                  </div>
                </div>
                <div style={{fontSize:14,lineHeight:1.8,color:'#565a78',marginTop:12}}>
                  Refining margins have bottomed and the retail arm is compounding faster than the street is modelling.
                  Holding through the next two quarters unless the margin thesis breaks.
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:12,marginTop:18}}>
                  {[["ENTRY","₹2,412"],["TARGET","₹2,850"],["HORIZON","12m"],["CONVICTION","High"]].map(([k,v])=>(
                    <div className="lp-stat" key={k}>
                      <div style={{fontSize:11,fontWeight:700,color:'#8d90ad'}}>{k}</div>
                      <div style={{fontSize:16,fontWeight:800,letterSpacing:'-.3px',marginTop:4}}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{marginTop:16,padding:'10px 13px',borderRadius:10,background:'#f1f1f8',border:'1px solid #e9e9f2',fontSize:12,color:'#565a78',lineHeight:1.6}}>
                  Illustrative example. Not a recommendation.
                </div>
              </div>
            </div>

            <div className="lp-dark">
              <div style={{fontSize:11.5,fontWeight:800,letterSpacing:'1.4px',color:'#6d7196'}}>ICI SCORE</div>
              <div style={{display:'flex',alignItems:'center',gap:22,marginTop:18}}>
                <div style={{position:'relative',width:104,height:104,flexShrink:0}}>
                  <svg width="104" height="104" viewBox="0 0 104 104" aria-hidden="true">
                    <circle cx="52" cy="52" r="45" fill="none" stroke="#23253f" strokeWidth="10"/>
                    <circle cx="52" cy="52" r="45" fill="none" stroke="#8f7bff" strokeWidth="10" strokeLinecap="round"
                      strokeDasharray="282.7" strokeDashoffset="76.3" transform="rotate(-90 52 52)"/>
                  </svg>
                  <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                    <div style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:32,fontWeight:600,color:'#fff',lineHeight:1}}>73</div>
                    <div style={{fontSize:10.5,fontWeight:700,color:'#a7abc6',marginTop:3}}>STRONG</div>
                  </div>
                </div>
                <div style={{fontSize:13,lineHeight:1.75,color:'#a7abc6'}}>
                  Built from every idea this member has ever posted — the ones that worked and the ones that did not.
                </div>
              </div>
              <div style={{marginTop:22,display:'flex',flexDirection:'column',gap:11}}>
                {ICI_WEIGHTS.map(([label,pct,weight])=>(
                  <div key={label} style={{display:'flex',alignItems:'center',gap:10}}>
                    <span style={{fontSize:12.5,color:'#a7abc6',width:118,flexShrink:0}}>{label}</span>
                    <div style={{flex:1,height:6,borderRadius:3,background:'#23253f',overflow:'hidden'}}>
                      <div style={{width:`${pct}%`,height:'100%',background:'#8f7bff'}}/>
                    </div>
                    <span style={{fontSize:11.5,color:'#6d7196',fontWeight:700,width:30,textAlign:'right'}}>{weight}</span>
                  </div>
                ))}
              </div>
              <div style={{marginTop:20,fontSize:12,color:'#6d7196',lineHeight:1.65}}>
                Percentages are the weight each component carries in the score.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="lp-wrap lp-sec" id="lp-circle">
        <div style={{maxWidth:660,marginBottom:44}}>
          <div className="lp-eyebrow">Your circle</div>
          <h2 className="lp-h2">Find investors worth following, then build your circle around them</h2>
          <p className="lp-lede">
            A track record is only useful if you can act on it. Search for investors by what they have actually posted,
            connect with the ones whose reasoning holds up, and let your circle grow around evidence rather than noise.
          </p>
        </div>
        <div className="lp-grid3">
          {CIRCLE.map(c=>(
            <div className="lp-card" key={c.title} style={{padding:'28px 26px'}}>
              <div style={{width:42,height:42,borderRadius:12,background:'#eeecff',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <Icon>{c.icon}</Icon>
              </div>
              <h3 style={{fontSize:19,fontWeight:800,letterSpacing:'-.4px',marginTop:20}}>{c.title}</h3>
              <div style={{fontSize:14,lineHeight:1.8,color:'#565a78',marginTop:10}}>{c.body}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="lp-wrap" style={{paddingTop:0,paddingBottom:78}}>
        <div style={{background:'linear-gradient(135deg,#6d5df5 0%,#9a55ee 55%,#cf52d8 100%)',borderRadius:22,
          padding:'58px 40px',textAlign:'center',boxShadow:'0 14px 36px rgba(124,92,252,.32)'}}>
          <div style={{fontSize:12,letterSpacing:'1.5px',textTransform:'uppercase',color:'rgba(255,255,255,.65)',fontWeight:700}}>Our philosophy</div>
          <div style={{fontSize:'clamp(38px,7vw,52px)',fontWeight:900,letterSpacing:'-2px',color:'#fff',lineHeight:1.05,marginTop:18}}>SCOREKEEPER</div>
          <div style={{fontSize:15,color:'rgba(255,255,255,.6)',marginTop:6}}>not the</div>
          <div style={{fontSize:'clamp(38px,7vw,52px)',fontWeight:900,letterSpacing:'-2px',color:'rgba(255,255,255,.55)',lineHeight:1.05,marginTop:6}}>COACH</div>
          <div style={{fontSize:17,color:'rgba(255,255,255,.9)',marginTop:26,lineHeight:1.7,maxWidth:600,marginLeft:'auto',marginRight:'auto'}}>
            You decide who to trust — we simply make it easier to see the full picture.
          </div>
        </div>
      </div>

      <div className="lp-band" id="lp-faq">
        <div className="lp-wrap lp-sec">
          <div style={{maxWidth:620,marginBottom:36}}>
            <div className="lp-eyebrow">Questions</div>
            <h2 className="lp-h2">The things people ask first</h2>
          </div>
          <div className="lp-card">
            {FAQS.map(f=>(
              <div className="lp-faqrow" key={f.q}>
                <h3 style={{fontSize:15,fontWeight:700,lineHeight:1.5}}>{f.q}</h3>
                <div style={{fontSize:14,lineHeight:1.8,color:'#565a78',marginTop:10,maxWidth:840}}>{f.a}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="lp-wrap lp-sec" style={{textAlign:'center'}}>
        <h2 className="lp-h2" style={{fontSize:38}}>Start a record worth checking</h2>
        <p className="lp-lede" style={{maxWidth:520,margin:'16px auto 0'}}>
          Post your first idea, invite the people whose thinking you actually want to follow, and let the history do the talking.
        </p>
        <div style={{display:'flex',gap:12,justifyContent:'center',marginTop:28,flexWrap:'wrap'}}>
          <button className="lp-btn lp-btn-pri lp-btn-lg" onClick={onCreateAccount}>Create your account</button>
          <button className="lp-btn lp-btn-ghost lp-btn-lg" onClick={onSignIn}>Sign in</button>
        </div>
      </div>

      <div style={{background:'#fff',borderTop:'1px solid #e9e9f2'}}>
        <div className="lp-wrap" style={{paddingTop:40,paddingBottom:40,display:'flex',flexDirection:'column',alignItems:'center',gap:18}}>
          <div style={{display:'flex',gap:10}}>
            {SOCIAL_LINKS.map(({key,label,url})=>(
              <a key={key} href={url} target="_blank" rel="noopener noreferrer"
                className="lp-social" aria-label={`My Investor Circle on ${label}`} title={label}>
                <Icon size={16} color="currentColor" width={2}>{SOCIAL_ICONS[key]}</Icon>
              </a>
            ))}
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',fontSize:12.5,color:'#8d90ad',flexWrap:'wrap',justifyContent:'center'}}>
            <span>© {new Date().getFullYear()} My Investor Circle</span>
          </div>
          <div style={{fontSize:12.5,lineHeight:1.75,color:'#565a78',maxWidth:720,textAlign:'center'}}>
            My Investor Circle is a technology platform where members share their own investment ideas and build public track
            records. We do not provide personalised investment advice or recommend any securities. Unless explicitly shown on a
            profile, we do not verify that a member is registered with SEBI or any other regulatory authority.
          </div>
        </div>
      </div>
    </div>
  );
}
