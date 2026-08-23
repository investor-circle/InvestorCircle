import React, { useState, useRef, useEffect } from "react";
import {
  Check,
  Send,
  ChevronDown,
  Mail,
  AlertTriangle,
  Loader
} from "lucide-react";
import {
  getAboutUsContent as dbGetAboutUsContent,
  submitContactForm as dbSubmitContactForm,
  voteFeature as dbVoteFeature
} from "../../services/api/lookupsApi";
import { ABOUT_DEFAULT_HTML, PRIVACY_HTML, contactInputSt } from "../../constants/app";
import { useIsMobile } from "../../hooks/index";

export function AboutPage() {
  const [html,    setHtml]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dbGetAboutUsContent()
      .then(h => { setHtml(h); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">About</div>
          <div className="page-title">My Investor Circle</div>
        </div>
      </div>

      {loading
        ? <div style={{textAlign:'center',padding:'60px 0',color:'var(--muted)'}}>
            <Loader size={24} className="spin" style={{marginBottom:12}}/>
            <div>Loading…</div>
          </div>
        : <div>
            <div className="card">
              <div className="card-body" style={{padding:'32px 36px'}}>
                <div
                  className="ql-content"
                  dangerouslySetInnerHTML={{ __html: html || ABOUT_DEFAULT_HTML }}
                />
              </div>
            </div>
          </div>
      }
    </>
  );
}

export function ContactFormField({ label, req, children }) {
  return (
    <div>
      <label style={{fontSize:11,fontWeight:800,letterSpacing:'.6px',color:'var(--muted)',
        display:'block',marginBottom:6,textTransform:'uppercase'}}>
        {label}{req && <span style={{color:'var(--accent)',marginLeft:3}}>*</span>}
      </label>
      {children}
    </div>
  );
}

export function ContactPage({ setPage }) {
  const isMobile = useIsMobile();
  const categoryRef = useRef(null); // used by "Share an idea" button to scroll + auto-select

  /* ── form state ── */
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [subject,  setSubject]  = useState('');
  const [message,  setMessage]  = useState('');
  const [category, setCategory] = useState('');
  const [sending,  setSending]  = useState(false);
  const [sent,     setSent]     = useState(false);
  const [formErr,  setFormErr]  = useState('');

  /* ── FAQ state ── */
  const [openFaq, setOpenFaq] = useState(null);

  /* ── feature-vote state (localStorage so vote persists per browser) ── */
  const [voted,     setVoted]     = useState(() => { try { return JSON.parse(localStorage.getItem('mic_feat_votes')||'[]'); } catch{return[];} });
  const [votesDone, setVotesDone] = useState(() => localStorage.getItem('mic_vote_done')==='1');
  const [votingNow, setVotingNow] = useState(false);
  const [voteOk,    setVoteOk]    = useState(false);

  const CATEGORIES = [
    { key:'bug',        label:'Report a Bug',                  emoji:'🐛', color:'#c2453d', bg:'#fef2f2' },
    { key:'feature',    label:'Suggest a Feature or Idea',     emoji:'💡', color:'#6d5df5', bg:'#eeecff' },
    { key:'question',   label:'Ask a Question',                emoji:'❓', color:'#0284c7', bg:'#e0f2fe' },
    { key:'partner',    label:'Partnerships',                  emoji:'🤝', color:'#15924e', bg:'#ecfdf5' },
    { key:'media',      label:'Media & Press',                 emoji:'📰', color:'#b45309', bg:'#fffbeb' },
    { key:'misleading', label:'Report Misleading Content',     emoji:'⚠️', color:'#b45309', bg:'#fffbeb' },
    { key:'abuse',      label:'Report Abuse / Fake Profile',   emoji:'🚫', color:'#c2453d', bg:'#fef2f2' },
    { key:'other',      label:'Others',                        emoji:'✍️', color:'#8d90ad', bg:'var(--surface-2)' },
  ];

  const SUBJECT_MAP = {
    bug:'Bug Report', feature:'Feature / Idea Suggestion', question:'Question',
    partner:'Partnership Inquiry', media:'Media & Press',
    misleading:'Report: Misleading Content', abuse:'Report: Abuse / Fake Profile',
    other:'General Enquiry',
  };

  const FEATURES = [
    { key:'portfolio_import',  label:'Portfolio Import' },
    { key:'ai_summaries',      label:'AI Idea Summaries' },
    { key:'mutual_fund',       label:'Mutual Fund Ideas Sharing' },
    { key:'leaderboards',      label:'Investor Leaderboards' },
    { key:'overlap',           label:'Portfolio Overlap with Your Network' },
    { key:'mobile_app',        label:'Mobile App' },
  ];

  const FAQS = [
    { q:'Can I edit my idea after publishing?',
      a:'No. Ideas are immutable to maintain transparency. You can publish follow-up updates or formally close an idea — but the original call stays on record.' },
    { q:'Can I delete my ideas?',
      a:'No. My Investor Circle is designed to maintain a permanent, transparent historical record. Once an idea is published it becomes part of your public track record.' },
    { q:'Are users on My Investor Circle verified?',
      a:'Some profiles display SEBI registration status. Unless explicitly shown on a user\'s profile, My Investor Circle does not verify that a user is registered with SEBI or any other regulatory authority.' },
    { q:'Do you provide investment advice?',
      a:'No. My Investor Circle is a technology platform where users share their own investment ideas and build public track records. We do not provide personalised investment advice or recommend any securities.' },
    { q:'How is my data used?',
      a:'We only use your data to operate the platform and never sell it to third parties. Ideas you mark as Public are visible to anyone. Private ideas are visible only to the people you share them with.' },
    { q:'How do I set up my public profile?',
      a:'Go to Track Record in the left nav. If you haven\'t set a username yet, you\'ll be prompted to do so. Once set, your ideas and ICI score are publicly viewable at your profile URL.' },
  ];

  const pickCategory = (key) => {
    setCategory(key);
    setSubject(SUBJECT_MAP[key] || '');
  };

  const toggleVote = (key) => {
    if (votesDone) return;
    setVoted(prev => prev.includes(key) ? prev.filter(k=>k!==key) : [...prev, key]);
  };

  const submitVotes = async () => {
    if (!voted.length || votesDone) return;
    setVotingNow(true);
    try {
      for (const key of voted) {
        await dbVoteFeature(key);
      }
    } catch(_) {}
    localStorage.setItem('mic_feat_votes', JSON.stringify(voted));
    localStorage.setItem('mic_vote_done', '1');
    setVotesDone(true); setVoteOk(true); setVotingNow(false);
  };

  const sendForm = async () => {
    if (!email.trim() || !subject.trim() || !message.trim()) {
      setFormErr('Please fill in Email, Subject and Message.'); return;
    }
    setFormErr(''); setSending(true);
    let saved = false;
    try {
      await dbSubmitContactForm({ name: name||null, email: email.trim(), subject: subject.trim(), category: category||null, message: message.trim() });
      saved = true;
    } catch(_) {}
    if (!saved) {
      // Graceful fallback: open mailto
      const bod = encodeURIComponent(`Name: ${name||'—'}\n\n${message}`);
      window.open(`mailto:hello@myinvestorcircle.com?subject=${encodeURIComponent(subject)}&body=${bod}`);
    }
    setSent(true); setSending(false);
  };

  /* ── small inline components ── */
  // ContactFormField and contactInputSt are defined at module level above ContactPage
  // to prevent React remounting them on every state change (which caused focus loss)

  const formSection = (
    <div className="card" id="contact-form">
      <div className="card-head" style={{justifyContent:'flex-start',gap:8}}><Send size={15}/> Send us a message</div>
      <div className="card-body" style={{display:'flex',flexDirection:'column',gap:16}}>
        {sent
          ? <div style={{textAlign:'center',padding:'28px 12px'}}>
              <div style={{fontSize:40,marginBottom:14}}>🎉</div>
              <div style={{fontSize:18,fontWeight:800,marginBottom:6}}>Message sent!</div>
              <div style={{fontSize:14,color:'var(--muted)',lineHeight:1.75}}>Thanks for reaching out. We'll get back to you within 1–2 business days.</div>
              <button className="btn btn-ghost btn-sm" style={{marginTop:18}}
                onClick={()=>{setSent(false);setName('');setEmail('');setSubject('');setMessage('');setCategory('');}}>
                Send another
              </button>
            </div>
          : <>
              <ContactFormField label="Name" req={false}>
                <input style={contactInputSt} value={name} placeholder="Your name" onChange={e=>setName(e.target.value)}/>
              </ContactFormField>
              <ContactFormField label="Email Address" req>
                <input style={contactInputSt} type="email" value={email} placeholder="you@example.com" onChange={e=>setEmail(e.target.value)}/>
              </ContactFormField>
              <ContactFormField label="Subject" req>
                <input style={contactInputSt} value={subject} placeholder="What's this about?" onChange={e=>setSubject(e.target.value)}/>
              </ContactFormField>
              <ContactFormField label="Message" req>
                <textarea style={{...contactInputSt,resize:'vertical',lineHeight:1.7}} rows={5} value={message}
                  placeholder="Tell us what's on your mind…" onChange={e=>setMessage(e.target.value)}/>
              </ContactFormField>
              {formErr && <div style={{fontSize:13,color:'var(--loss)',display:'flex',alignItems:'center',gap:6}}><AlertTriangle size={13}/>{formErr}</div>}
              <button className="btn btn-pri" disabled={sending} onClick={sendForm} style={{alignSelf:'flex-start',gap:7}}>
                {sending?<><Loader size={14} className="spin"/>Sending…</>:<><Send size={14}/>Send Message</>}
              </button>
            </>}
      </div>
    </div>
  );

  /* ── feature-vote card ── */
  const voteCard = (
    <div className="card">
      <div className="card-head" style={{alignItems:'flex-start',flexDirection:'column',gap:2,paddingBottom:14}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%'}}>
          <span style={{fontWeight:800,fontSize:15}}>Feature Voting 🗳️</span>
        </div>
        <span style={{fontSize:12,color:'var(--muted)',fontWeight:400}}>What should we build next? Pick as many as you like.</span>
      </div>
      <div className="card-body" style={{paddingTop:0}}>
        {voteOk
          ? <div style={{textAlign:'center',padding:'18px 8px'}}>
              <div style={{fontSize:32,marginBottom:8}}>✅</div>
              <div style={{fontSize:15,fontWeight:800,marginBottom:4}}>Vote recorded!</div>
              <div style={{fontSize:13,color:'var(--muted)',lineHeight:1.7}}>Thanks for helping us prioritise. Your votes are in.</div>
            </div>
          : <>
              <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:14}}>
                {FEATURES.map(f => {
                  const on = voted.includes(f.key);
                  return (
                    <button key={f.key} disabled={votesDone} onClick={()=>toggleVote(f.key)}
                      style={{display:'flex',alignItems:'center',gap:12,background:on?'var(--accent-soft)':'var(--surface-2)',
                        border:`1.5px solid ${on?'var(--accent-line)':'var(--line)'}`,borderRadius:10,
                        padding:'10px 14px',cursor:votesDone?'not-allowed':'pointer',
                        textAlign:'left',width:'100%',fontFamily:'var(--font)',transition:'.12s'}}>
                      <div style={{width:20,height:20,borderRadius:5,flexShrink:0,transition:'.12s',
                          border:`2px solid ${on?'var(--accent)':'var(--line-2)'}`,
                          background:on?'var(--accent)':'transparent',
                          display:'flex',alignItems:'center',justifyContent:'center'}}>
                        {on && <Check size={12} color="#fff" strokeWidth={3}/>}
                      </div>
                      <span style={{fontSize:13,fontWeight:600,color:on?'var(--accent-ink)':'var(--ink)'}}>{f.label}</span>
                    </button>
                  );
                })}
              </div>
              {votesDone
                ? <div style={{fontSize:12,color:'var(--muted)',textAlign:'center',padding:'4px 0'}}>You've already voted — thank you!</div>
                : <button className="btn btn-pri" style={{width:'100%'}} disabled={!voted.length||votingNow} onClick={submitVotes}>
                    {votingNow?<><Loader size={14} className="spin"/>Submitting…</>:`Submit Vote (${voted.length} selected)`}
                  </button>}
            </>}
      </div>
    </div>
  );

  /* ── FAQ card ── */
  const faqCard = (
    <div className="card">
      <div className="card-head">Frequently Asked Questions</div>
      <div>
        {FAQS.map((faq,i) => {
          const open = openFaq===i;
          return (
            <div key={i} style={{borderBottom:i<FAQS.length-1?'1px solid var(--line)':'none'}}>
              <button onClick={()=>setOpenFaq(open?null:i)}
                style={{width:'100%',background:'none',border:'none',cursor:'pointer',
                  padding:'15px 18px',display:'flex',alignItems:'flex-start',justifyContent:'space-between',
                  gap:10,fontFamily:'var(--font)',textAlign:'left'}}>
                <span style={{fontSize:14,fontWeight:700,color:'var(--ink)',lineHeight:1.45,flex:1}}>{faq.q}</span>
                <ChevronDown size={15} color="var(--muted)"
                  style={{flexShrink:0,marginTop:2,transform:open?'rotate(180deg)':'none',transition:'.2s'}}/>
              </button>
              {open && (
                <div style={{padding:'0 18px 16px',fontSize:14,lineHeight:1.8,color:'var(--ink-soft)'}}>
                  {faq.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {/* ── Page header ── */}
      <div className="page-head">
        <div>
          <div className="eyebrow">Connect</div>
          <div className="page-title">Contact Us</div>
          <div className="page-sub">We'd love to hear from you</div>
        </div>
      </div>

      {/* ── Intro banner ── */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-body" style={{padding:'22px 26px'}}>
          <p style={{fontSize:15,lineHeight:1.85,color:'var(--ink-soft)',margin:0}}>
            Whether you've found a bug, have a feature idea, want to collaborate, or simply want to say hello — we're always happy to hear from fellow investors and market enthusiasts. My Investor Circle is still in its early days, and many of the features you're seeing today were inspired by conversations with people like you.{' '}
            <strong style={{color:'var(--ink)'}}>Your feedback genuinely helps shape what we build next.</strong>
          </p>
        </div>
      </div>

      {/* ── Main two-column grid ── */}
      <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 370px',gap:20,alignItems:'start'}}>

        {/* ═══ LEFT COLUMN ═══ */}
        <div style={{display:'flex',flexDirection:'column',gap:20}}>

          {/* Get in touch */}
          <div className="card">
            <div className="card-head" style={{justifyContent:'flex-start',gap:8}}><Mail size={15}/> Get in touch</div>
            <div className="card-body">
              <div style={{display:'flex',alignItems:'center',gap:14}}>
                <div style={{width:44,height:44,borderRadius:12,background:'var(--accent-soft)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <Mail size={20} color="var(--accent-ink)"/>
                </div>
                <div>
                  <div style={{fontSize:12,color:'var(--muted)',fontWeight:600,marginBottom:3,textTransform:'uppercase',letterSpacing:'.5px'}}>Email</div>
                  <a href="mailto:hello@myinvestorcircle.com"
                    style={{fontSize:15,fontWeight:700,color:'var(--accent-ink)',textDecoration:'none'}}>
                    hello@myinvestorcircle.com
                  </a>
                </div>
              </div>
              <div style={{marginTop:14,padding:'11px 14px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:10,fontSize:13,color:'var(--ink-soft)'}}>
                📬 We aim to respond within <strong style={{color:'var(--ink)'}}>1–2 business days</strong>.
              </div>
            </div>
          </div>

          {/* Category picker */}
          <div className="card" ref={categoryRef}>
            <div className="card-head" style={{justifyContent:'flex-start'}}>What can we help with?</div>
            <div className="card-body">
              <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:9}}>
                {CATEGORIES.map(cat => {
                  const active = category===cat.key;
                  return (
                    <button key={cat.key} onClick={()=>pickCategory(cat.key)}
                      style={{border:`2px solid ${active?cat.color:'var(--line)'}`,borderRadius:12,
                        padding:'12px 14px',background:active?cat.bg:'var(--surface)',cursor:'pointer',
                        textAlign:'left',display:'flex',alignItems:'center',gap:10,transition:'.15s',
                        fontFamily:'var(--font)'}}>
                      <span style={{fontSize:18,flexShrink:0}}>{cat.emoji}</span>
                      <span style={{fontSize:13,fontWeight:600,color:active?cat.color:'var(--ink)',lineHeight:1.35}}>{cat.label}</span>
                    </button>
                  );
                })}
              </div>
              {category && (
                <div style={{marginTop:10,fontSize:12,color:'var(--muted)',display:'flex',alignItems:'center',gap:5}}>
                  <Check size={12} color="var(--gain)"/> Category selected — the subject below has been pre-filled.
                </div>
              )}
            </div>
          </div>

          {/* Contact form */}
          {formSection}

          {/* On mobile, insert right-column content here */}
          {isMobile && <>{voteCard}{faqCard}</>}
        </div>

        {/* ═══ RIGHT COLUMN (desktop only) ═══ */}
        {!isMobile && (
          <div style={{display:'flex',flexDirection:'column',gap:20}}>
            {voteCard}
            {faqCard}
          </div>
        )}
      </div>

      {/* ── Community First banner ── */}
      <div style={{marginTop:22,background:'var(--grad)',borderRadius:18,padding:'26px 30px',color:'#fff',
          display:'flex',alignItems:'center',justifyContent:'space-between',gap:20,flexWrap:'wrap',
          boxShadow:'0 12px 32px rgba(109,93,245,.32)'}}>
        <div style={{maxWidth:520}}>
          <div style={{fontSize:17,fontWeight:800,letterSpacing:'-.3px',marginBottom:7}}>
            Community First 🤝
          </div>
          <div style={{fontSize:14,lineHeight:1.8,color:'rgba(255,255,255,.88)'}}>
            My Investor Circle is being built in public. We're constantly improving based on community feedback. If you have an idea that would make My Investor Circle more useful for investors, we'd genuinely love to hear it.
          </div>
        </div>
        <button onClick={()=>{
            pickCategory('feature');
            setTimeout(()=>{ categoryRef.current?.scrollIntoView({behavior:'smooth',block:'start'}); }, 50);
          }}
          style={{background:'rgba(255,255,255,.18)',color:'#fff',border:'2px solid rgba(255,255,255,.35)',
            borderRadius:12,padding:'11px 22px',fontWeight:700,fontSize:14,cursor:'pointer',
            fontFamily:'var(--font)',backdropFilter:'blur(6px)',whiteSpace:'nowrap',flexShrink:0,
            transition:'.15s'}}>
          Share an idea →
        </button>
      </div>

      {/* ── Page footer links ── */}
      <div style={{marginTop:28,paddingTop:18,borderTop:'1px solid var(--line)',display:'flex',gap:24,
          flexWrap:'wrap',justifyContent:'center',alignItems:'center'}}>
        <button onClick={()=>setPage?.('about')} style={{background:'none',border:'none',cursor:'pointer',
          fontSize:13,color:'var(--muted)',fontWeight:500,fontFamily:'var(--font)',padding:0}}>
          About MIC
        </button>
        <span style={{color:'var(--line-2)'}}>·</span>
        <span style={{fontSize:13,color:'var(--line-2)'}}>Privacy Policy</span>
      </div>
    </>
  );
}

/* =================================================================== SITE FOOTER */

export function SiteFooter({ page, setPage }) {
  const links = [
    { id:'about',   label:'About MIC'      },
    { id:'privacy', label:'Privacy Policy'  },
    { id:'contact', label:'Contact Us'      },
  ];
  return (
    <div style={{
      marginTop:48, paddingTop:18, borderTop:'1px solid var(--line)',
      display:'flex', gap:6, flexWrap:'wrap', justifyContent:'center',
      alignItems:'center', fontSize:12,
    }}>
      <span style={{color:'var(--muted)'}}>© {new Date().getFullYear()} My Investor Circle</span>
      {links.map(link => (
        <React.Fragment key={link.id}>
          <span style={{color:'var(--line-2)'}}>·</span>
          <button onClick={()=>setPage(link.id)} style={{
            background:'none', border:'none', cursor:'pointer', fontSize:12,
            fontWeight: page===link.id ? 700 : 400,
            color: page===link.id ? 'var(--accent-ink)' : 'var(--muted)',
            fontFamily:'var(--font)', padding:0,
            textDecoration: page===link.id ? 'underline' : 'none',
            textUnderlineOffset: 3,
          }}>
            {link.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

/* =================================================================== PRIVACY POLICY PAGE */

export function PrivacyPolicyPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Legal</div>
          <div className="page-title">Privacy Policy</div>
          <div className="page-sub">Effective July 2025 · Governing Law: India · DPDP Act 2023 compliant</div>
        </div>
      </div>
      <div className="card">
        <div className="card-body" style={{padding:'32px 36px'}}>
          <div dangerouslySetInnerHTML={{__html: PRIVACY_HTML}}/>
        </div>
      </div>
    </>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   INTELLIGENCE LAYER — shared helpers + three page components
   ═══════════════════════════════════════════════════════════════════ */

/* ── consensus computation ────────────────────────────────────────── */
