// Marketing.jsx / MarketingPages.jsx — split (Phase: bootstrap/perf
// architecture). SiteFooter renders on every investor page (persistent
// chrome), so it and the small SocialLinks it uses stay eager. AboutPage/
// ContactPage (the bulk of this file — the contact form alone is ~360
// lines)/PrivacyPolicyPage are nav-only and live in MarketingPages.jsx,
// React.lazy-loaded from App.jsx. Keep this split — don't re-merge "for
// cleanliness".
import React, { useState, useRef, useEffect } from "react";
import {
  Check,
  Send,
  ChevronDown,
  Mail,
  AlertTriangle,
  Loader,
  Twitter,
  Facebook,
  Instagram
} from "lucide-react";
import {
  getAboutUsContent as dbGetAboutUsContent,
  submitContactForm as dbSubmitContactForm,
  voteFeature as dbVoteFeature
} from "../../services/api/lookupsApi";
import { ABOUT_DEFAULT_HTML, PRIVACY_HTML, contactInputSt, SOCIAL_LINKS } from "../../constants/app";
import { useIsMobile } from "../../hooks/index";

/* lucide still ships the pre-rebrand bird for X; it reads as the platform
   more clearly than a bare letter at 17px, so it stays until lucide offers
   a real X mark. */
const SOCIAL_ICONS = { x: Twitter, facebook: Facebook, instagram: Instagram };

export function SocialLinks({ size = 17 }) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:10}}>
      {SOCIAL_LINKS.map(({ key, label, url }) => {
        const Icon = SOCIAL_ICONS[key];
        return (
          <a key={key} href={url} target="_blank" rel="noopener noreferrer"
            aria-label={`My Investor Circle on ${label}`} title={label}
            style={{display:'flex',alignItems:'center',justifyContent:'center',
              width:34,height:34,borderRadius:'50%',flexShrink:0,
              background:'var(--surface-2)',border:'1px solid var(--line)',
              color:'var(--muted)',textDecoration:'none',transition:'.15s'}}
            onMouseEnter={e=>{e.currentTarget.style.color='var(--accent-ink)';
                              e.currentTarget.style.borderColor='var(--accent-line)';}}
            onMouseLeave={e=>{e.currentTarget.style.color='var(--muted)';
                              e.currentTarget.style.borderColor='var(--line)';}}>
            <Icon size={size}/>
          </a>
        );
      })}
    </div>
  );
}

export function SiteFooter({ page, setPage }) {
  const links = [
    { id:'about',   label:'About MIC'      },
    { id:'privacy', label:'Privacy Policy'  },
    { id:'contact', label:'Contact Us'      },
  ];
  return (
    <div style={{
      marginTop:48, paddingTop:18, borderTop:'1px solid var(--line)',
      display:'flex', flexDirection:'column', gap:14, alignItems:'center',
    }}>
      <SocialLinks size={16}/>
      <div style={{
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
    </div>
  );
}

/* =================================================================== PRIVACY POLICY PAGE */

