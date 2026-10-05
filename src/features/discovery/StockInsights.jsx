// Split out of Discovery.jsx (see that file's header comment) — Stock
// Insights is a nav-only page (App.jsx renders it behind page==="sec_intel"
// and the standalone /security/:ticker route, lazy-loaded), not needed for
// the signed-in Home Feed's initial render.
import React, { useState, useMemo, useRef, useEffect } from "react";
import { Users, Search, X, Loader, BarChart2, Activity, Share2, ArrowLeft, Home } from "lucide-react";
import { getInvestorIciBatch as dbGetInvestorIciBatch } from "../../services/api/profileApi";
import {
  computeIci,
  getTickerRecos as dbGetTickerRecos,
  getTickerViews as dbGetTickerViews,
  getPublicSecurity as dbGetPublicSecurity,
} from "../../services/api/recommendationsApi";
import { InstrumentSearch, LinkSharePopover } from "../../components/common";
import { useMemberTagsMap } from "../../MemberTagsContext";
import { useIsMobile } from "../../hooks/index";
import { goHome } from "../../utils/navigation";
import { getDailyPrices, getPublicDailyPrice } from "../../services/api/pricingApi";
import { researchBreakdown, researchBreakdownFromCounts, viewBreakdownFromCounts, currentViews, pageSections } from "../../utils/securityInsights";
import { LayerSummary, ResearchSection, ViewsSection, PeopleSection } from "./SecuritySections";

// The page's navigable sections. Only sections with data are offered (and
// rendered): a security with no Verified Research has no Research section, one
// with no Market Views has no Market Views section — never an empty card.
// Every section that exists is always mounted (the tabs just scroll to it and
// the scroll-spy below highlights the one on screen), the same "always rendered,
// tabs only scroll" approach as the public /security/:symbol page, so content
// stays in the document.
/* eslint-disable react/jsx-key -- lookup-table tuples destructured by .map() */
const sectionsFor = ({ hasResearch, hasViews }) => [
  hasResearch && ['research', 'Verified Research', <BarChart2 size={15}/>],
  hasViews    && ['views',    'Market Views',      <Activity size={15}/>],
  (hasResearch || hasViews) && ['people', 'People', <Users size={15}/>],
].filter(Boolean);
/* eslint-enable react/jsx-key */
// Tab ids callers used before this redesign (e.g. MarketInsights' "View all
// investors" opens straight to the people list).
const LEGACY_TAB = { consensus: 'research', timeline: 'research', stats: 'research', investors: 'people', ai: 'views' };
const normTab = (t) => LEGACY_TAB[t] || t;

export function SecurityIntelligencePage({ securityTicker, contacts, me, viewerUser, trackedIds, onOpenSecurity, onBack, onHome }) {
  const isMobile = useIsMobile();
  const memberTagsByUser = useMemberTagsMap();
  const { ticker, name } = securityTicker || {};
  const [recos, setRecos]     = useState([]);   // Verified Research (Buy/Hold/Sell) only
  const [views, setViews]     = useState([]);   // Market Views (Positive/Neutral/Negative) only — current page of commentary
  const [viewSummary, setViewSummary] = useState({ total:0, positive:0, neutral:0, negative:0, contributors:0 });
  const [viewStances, setViewStances] = useState([]); // lightweight who/what/when for every public view
  const [hasMoreViews, setHasMoreViews] = useState(false);
  // Exact server aggregates (null = not provided → derived from the full list): monthly activity and per-contributor view counts.
  const [researchMonthlyAgg, setResearchMonthlyAgg] = useState(null);
  const [viewMonthlyAgg, setViewMonthlyAgg] = useState(null);
  const [byContributor, setByContributor] = useState(null);
  const [researchCounts, setResearchCounts] = useState(null); // exact rating counts (public path), else derived from the full list
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tab, setTab]         = useState(normTab(securityTicker?.tab) || 'research'); // research | views | people
  const [investorIcis, setInvestorIcis] = useState({}); // uid → {score,band}
  const [searchOpen, setSearchOpen] = useState(false); // mobile: search starts collapsed to an icon
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const shareBtnRef = useRef(null);
  // One DOM node per section, populated via each <section>'s own callback
  // ref below — keyed by the same ids SECTIONS uses. Every section is now
  // always mounted (see SECTIONS' own comment), so these stay populated for
  // as long as a ticker is open, not just while its tab happens to be the
  // active one.
  const sectionRefs = useRef({});
  const scrollToSection = (v) => {
    setTab(v);
    sectionRefs.current[v]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Built explicitly (not read off window.location.href) so it's always the
  // canonical, indexable URL regardless of what tab/query state happens to
  // be in the address bar right now. web-public/ (a separate SSR app,
  // proxied in at this same path by vercel.json) is what actually renders
  // at this URL for a signed-out visitor or a crawler.
  const shareUrl = ticker ? `https://myinvestorcircle.com/security/${encodeURIComponent(ticker)}` : null;
  const copyShareLink = () => {
    if (!shareUrl) return;
    const done = () => { setCopied(true); setTimeout(()=>setCopied(false), 1600); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(shareUrl).then(done).catch(()=>{});
    else done();
  };

  // viewerUser is undefined/null for a signed-out visitor reaching this page
  // via /security/:ticker (see App.jsx) — same "nullable viewer, one
  // component" pattern as PublicProfilePage. "Your Circle" (renamed from "My
  // Circle" — the old name read as "everyone on myInvestorCircle" to some
  // users) is connections plus tracked investors; both are naturally empty
  // with no signed-in viewer, which is what lets the Consensus/Investors tabs
  // below degrade to a soft sign-in prompt with no extra branching there.
  const signedIn = !!viewerUser;
  const circleIds = useMemo(()=>{
    const ids = new Set((contacts||[]).map(c=>c.id));
    (trackedIds||new Set()).forEach(id=>ids.add(id));
    return ids;
  },[contacts, trackedIds]);

  // The page can stay mounted across multiple onOpenSecurity() calls (e.g.
  // navigating from one security's modal straight to another's insights
  // page), so re-sync the tab whenever the caller requests a specific one —
  // e.g. MarketInsights.jsx's "View all investors" link opens straight to
  // the Investors section, not just the Investors tab's old hide/show panel.
  // A plain scrollIntoView (not the smooth-scroll scrollToSection above) —
  // this is a fresh page landing, not a click mid-read, so there's nothing
  // to animate from.
  useEffect(()=>{
    if (!securityTicker?.tab) return;
    const t = normTab(securityTicker.tab);
    setTab(t);
    sectionRefs.current[t]?.scrollIntoView({ block: 'start' });
  }, [ticker, securityTicker?.tab]);

  const avail = pageSections({ research: recos.length, views: viewSummary.total });
  const SECTIONS = useMemo(() => sectionsFor(avail), [avail.hasResearch, avail.hasViews]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll-spy: highlights whichever tab's section is actually on screen as
  // the visitor scrolls, not just whichever was last clicked — every
  // section stays mounted now (see SECTIONS' own comment), so without this
  // the tab bar's highlight would go stale the moment someone scrolls
  // manually instead of clicking. rootMargin shrinks the observed viewport
  // to a band well below the sticky tab bar and well above the very bottom
  // edge, picking whichever section's heading is topmost within that band as
  // "current" — the same convention most scroll-spy nav bars use. The band
  // is kept wide (not a thin line near the top) specifically so a short
  // trailing section (e.g. AI Summary, which may be shorter than the
  // viewport) still gets a chance to register once the page is scrolled as
  // far as it can go, rather than leaving the previous tab stuck highlighted
  // because the heading never crossed a narrower band.
  useEffect(()=>{
    if (!ticker) return;
    const entries = SECTIONS
      .map(([id])=>[id, sectionRefs.current[id]])
      .filter(([,el])=>el);
    if (!entries.length) return;
    const observer = new IntersectionObserver(
      (observed)=>{
        const visible = observed.filter(e=>e.isIntersecting);
        if (!visible.length) return;
        const topMost = visible.reduce((a,b)=>a.boundingClientRect.top<b.boundingClientRect.top?a:b);
        const id = topMost.target.dataset.section;
        if (id) setTab(id);
      },
      { rootMargin: '-10% 0px -10% 0px', threshold: 0 }
    );
    entries.forEach(([,el])=>observer.observe(el));
    return ()=>observer.disconnect();
  }, [ticker, SECTIONS]);

  // Fetch real ICI scores for all investors when recos loads. Only meaningful
  // when signed in: the public (signed-out) data path below has no uid to
  // hand this batch lookup, only the author's username (see
  // getPublicTickerIdeas in db.js), so it would just look up nothing.
  useEffect(()=>{
    if (!signedIn || !recos.length) return;
    const uids = [...new Set(recos.map(r=>r.from).filter(Boolean))];
    if (!uids.length) return;
    dbGetInvestorIciBatch(uids)
      .then(rows=>{
        const scores = {};
        rows.forEach(row=>{
          const hitPct  = row.closed > 0 ? (row.wins / row.closed * 100) : 0;
          const riskAdj = Number(row.ret_stddev) > 0 ? Math.max(Number(row.median_ret) / Number(row.ret_stddev), 0) : 0;
          scores[row.uid] = computeIci({
            years_history:        Number(row.years_history) || 0,
            total:                row.total,
            hit_rate_pct:         hitPct,
            median_return:        Number(row.median_ret)  || 0,
            risk_adjusted_return: riskAdj,
            deleted_count:        0,
          });
        });
        setInvestorIcis(scores);
      })
      .catch(()=>{});
  },[recos, signedIn]);

  // Verified Research and Market Views are two separate datasets from two
  // separate endpoints (signed-in) / one public response with two fields
  // (signed-out) — fetched together, never merged.
  useEffect(()=>{
    if (!ticker) return;
    let cancelled = false;
    setLoading(true); setRecos([]); setViews([]); setViewStances([]); setHasMoreViews(false); setResearchCounts(null); setResearchMonthlyAgg(null); setViewMonthlyAgg(null); setByContributor(null);
    setViewSummary({ total:0, positive:0, neutral:0, negative:0, contributors:0 });
    const load = signedIn
      ? Promise.all([dbGetTickerRecos(ticker), dbGetTickerViews(ticker)])
          .then(([rows, v]) => ({ ideas: rows, views: v.views, summary: v.summary, stances: v.stances, hasMore: v.hasMore, counts: null, researchMonthly: null, viewMonthly: v.monthly, byContributor: v.byContributor }))
      : dbGetPublicSecurity(ticker)
          .then(d => ({ ideas: d.ideas, views: d.views, summary: d.viewSummary, stances: d.viewStances, hasMore: d.views.length < d.viewSummary.total, counts: d.researchCounts, researchMonthly: d.researchMonthly, viewMonthly: d.viewMonthly, byContributor: null }));
    load
      .then(d=>{
        if (cancelled) return;
        setRecos(d.ideas); setViews(d.views); setViewSummary(d.summary); setViewStances(d.stances); setHasMoreViews(!!d.hasMore); setResearchCounts(d.counts); setResearchMonthlyAgg(d.researchMonthly); setViewMonthlyAgg(d.viewMonthly); setByContributor(d.byContributor);
        setLoading(false);
      })
      .catch(()=>{ if (!cancelled) setLoading(false); });
    return ()=>{ cancelled = true; };
  },[ticker, signedIn]);

  // Older Market Views, a page at a time (signed-in only: the public page is
  // server-rendered and shows its capped page plus the exact counts).
  const loadMoreViews = () => {
    if (loadingMore || !signedIn) return;
    setLoadingMore(true);
    dbGetTickerViews(ticker, { offset: views.length })
      .then(v => { setViews(prev => [...prev, ...v.views]); setHasMoreViews(v.hasMore); })
      .catch(()=>{})
      .finally(()=>setLoadingMore(false));
  };

  // Daily price movement for the security itself (distinct from each idea's
  // own return_pct below, which is anchored to that idea's entry price, not
  // yesterday's close). Nightly-batch EOD snapshot — see pricingApi.js —
  // never a live quote. Signed-in uses the batch-shaped authenticated read
  // (one ticker in the array); signed-out uses the single-symbol public
  // counterpart, same split as fetchRecos above.
  const [dailyPrice, setDailyPrice] = useState(null);
  useEffect(()=>{
    if (!ticker) { setDailyPrice(null); return; }
    let cancelled = false;
    const fetchPrice = signedIn
      ? getDailyPrices([ticker]).then(rows=>rows[0] || null)
      : getPublicDailyPrice(ticker);
    fetchPrice.then(p=>{ if (!cancelled) setDailyPrice(p); }).catch(()=>{});
    return ()=>{ cancelled = true; };
  },[ticker, signedIn]);

  // Shown whenever this page was reached via a drill-down (a holding card,
  // a reco card's "Stock Insights" link, etc.) so there's always a quick
  // way back to where the user came from, not just the top-nav Home icon.
  const backHomeButtons = (onBack || onHome) && (
    <div style={{display:'flex',gap:6,flexShrink:0}}>
      {onBack && <button className="btn btn-ghost btn-sm" onClick={onBack} title="Go back"><ArrowLeft size={13}/> Back</button>}
      {onHome && <button className="btn btn-ghost btn-sm" onClick={onHome} title="Home"><Home size={13}/> Home</button>}
    </div>
  );

  if (!ticker) return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Insights</div>
          <div className="page-title">Stock Insights</div>
        </div>
        {backHomeButtons}
      </div>

      {/* ── Discovery landing ── */}
      <div style={{maxWidth:540,margin:'0 auto',padding:'40px 16px 0'}}>
        {/* Search box — large and prominent. The instrument list itself is an
            authenticated lookup, so a signed-out visitor gets a sign-in
            prompt here instead of a search box that would silently return
            nothing — this landing state is only reached from in-app
            navigation today, but keep it honest either way. */}
        {signedIn ? (
          <div style={{background:'var(--surface)',border:'2px solid var(--accent)',borderRadius:16,padding:'4px 8px 4px 16px',display:'flex',alignItems:'center',gap:10,marginBottom:24,boxShadow:'0 4px 24px rgba(109,93,245,.12)'}}>
            <Search size={20} color="var(--accent)" style={{flexShrink:0}}/>
            <div style={{flex:1}}>
              <InstrumentSearch
                onSelect={inst=>{ if(inst&&onOpenSecurity) onOpenSecurity(inst.symbol,inst.name); }}
                placeholder="Search any stock or ETF — e.g. RELIANCE, HDFC Bank…"
              />
            </div>
          </div>
        ) : (
          <div style={{background:'var(--surface-2)',border:'1px dashed var(--line)',borderRadius:16,padding:'16px',marginBottom:24,textAlign:'center'}}>
            <div style={{fontSize:13,color:'var(--muted)'}}>Sign in to search any stock or ETF on myInvestorCircle.</div>
          </div>
        )}

        {/* Instructional copy */}
        <div style={{textAlign:'center',padding:'0 8px'}}>
          <div style={{fontSize:15,fontWeight:700,marginBottom:10,color:'var(--ink)'}}>Verified research and independent market views on any security</div>
          <div style={{fontSize:13,color:'var(--muted)',lineHeight:1.7}}>
            Type any stock name or ticker above to explore verified research, independent
            Market Views, and who on myInvestorCircle has covered it.
          </div>
          <div style={{fontSize:12,color:'var(--muted)',marginTop:16,padding:'10px 14px',background:'var(--surface-2)',borderRadius:10,lineHeight:1.6}}>
            💡 You can also arrive here by clicking the <strong>ChevronRight →</strong> or
            <strong> Full Page</strong> button on any security in
            <strong> Portfolio Intelligence</strong> or <strong>Market Insights</strong>.
            Once a security is open, use the search bar above to switch to any other asset.
          </div>
        </div>
      </div>
    </>
  );

  // Verified Research and Market Views are separate datasets: nothing below
  // combines them, and a Market View never reaches a research figure.
  const researchB    = researchCounts ? researchBreakdownFromCounts(researchCounts) : researchBreakdown(recos, r=>r.from);
  const viewB        = viewBreakdownFromCounts(viewSummary);
  const contributors = currentViews(views, v=>v.from);   // each loaded contributor's latest view
  const securitySector = recos[0]?.sector || views[0]?.sector || '';
  const hasResearch = avail.hasResearch, hasViews = avail.hasViews, hasAny = avail.hasAny;

  return (
    <>
      <div className="page-head" style={{display:'block'}}>
        {/* ── Top line: eyebrow (left) + icon-only actions (right), always on
             the same row — this is the actual header, not the title. Back/
             Home/Share/search were previously grouped with the title block,
             which has a minWidth that eats all the room on a phone, pushing
             every action below the title AND subtitle together. Icon-only
             (no text labels) is what actually lets four buttons sit next to
             the eyebrow text on a narrow screen; `title` attributes keep
             them identifiable without the label. ── */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
          <div className="eyebrow" style={{marginBottom:0}}>Stock Insights</div>
          <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
            {onBack && <button className="iconbtn" title="Back" onClick={onBack}><ArrowLeft size={15}/></button>}
            {onHome && <button className="iconbtn" title="Home" onClick={onHome}><Home size={15}/></button>}
            {shareUrl && <button ref={shareBtnRef} className="iconbtn" title="Share" onClick={()=>setShareOpen(v=>!v)}><Share2 size={15}/></button>}
            {/* Switch-security search — icon-only trigger here too; the
                expanded input (mobile) or the wider desktop input render
                below, out of this row, so they never fight it for space.
                Hidden for a signed-out visitor: the instrument list is an
                authenticated lookup (see the ticker-less landing state
                above), so the box would just come back empty. */}
            {signedIn && isMobile && !searchOpen && (
              <button className="iconbtn" title="Switch security" onClick={()=>setSearchOpen(true)}><Search size={15}/></button>
            )}
            {loading&&<Loader size={16} className="spin" style={{color:'var(--muted)'}}/>}
          </div>
          {shareOpen && (
            <LinkSharePopover
              url={shareUrl}
              title={`Share ${ticker}`}
              message={`Check out ${ticker}${name?` (${name})`:''} on My Investor Circle:\n${shareUrl}`}
              anchorEl={shareBtnRef.current}
              copied={copied}
              onCopy={copyShareLink}
              onClose={()=>setShareOpen(false)}
            />
          )}
        </div>

        <div style={{display:'flex',alignItems:'baseline',gap:14,flexWrap:'wrap',marginTop:8}}>
          <div className="page-title">{ticker}</div>
          <div style={{fontSize:16,color:'var(--muted)',fontWeight:400}}>{name || recos[0]?.asset_name || views[0]?.asset_name || ''}</div>
        </div>
        <div className="page-sub">
          {loading ? 'Loading…' : !hasAny ? `No public research or Market Views on ${ticker} yet.` :
            [hasResearch && `${researchB.total} piece${researchB.total===1?'':'s'} of verified research`, hasViews && `${viewB.total} independent Market View${viewB.total===1?'':'s'}`].filter(Boolean).join(' · ')}
        </div>

        {/* Desktop switch-security input — full width isn't needed on a
            phone screen (the icon above expands to this instead), but there
            is always spare room for it here on desktop. */}
        {signedIn && !isMobile && (
          <div style={{width:260,marginTop:10,fontSize:12}}>
            <InstrumentSearch
              onSelect={inst=>{ if(inst&&onOpenSecurity) onOpenSecurity(inst.symbol,inst.name); }}
              placeholder={`Switch security…`}
            />
          </div>
        )}

        {signedIn && isMobile && searchOpen && (
          <div style={{display:'flex',alignItems:'center',gap:8,width:'100%',marginTop:10}}>
            <div style={{flex:1,fontSize:13}}>
              <InstrumentSearch
                onSelect={inst=>{ setSearchOpen(false); if(inst&&onOpenSecurity) onOpenSecurity(inst.symbol,inst.name); }}
                placeholder={`Switch security…`}
              />
            </div>
            <button className="iconbtn" style={{flexShrink:0}} onClick={()=>setSearchOpen(false)}><X size={15}/></button>
          </div>
        )}
      </div>

      {/* ── Header summary — price, sector, and the TWO layers side by side:
           Verified Research (Buy / Hold / Sell) and Market Views (Positive /
           Neutral / Negative). A layer with no data is not shown. ── */}
      {!loading && (
        <div style={{marginTop:16}}>
          {/* Nightly-batch EOD snapshot, never live/intraday — the visible
              "as of" date is deliberate, not just a hover title. */}
          {(dailyPrice || securitySector) && (
            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:10}}>
              {dailyPrice && (
                <>
                  <span className="pill" style={dailyPrice.changePct!=null?{color:dailyPrice.changePct>0?'var(--gain)':dailyPrice.changePct<0?'var(--loss)':undefined}:undefined}>
                    ₹{Number(dailyPrice.close).toLocaleString('en-IN')}
                    {dailyPrice.changePct!=null && ` ${dailyPrice.changePct>=0?'+':''}${Number(dailyPrice.changePct).toFixed(1)}%`}
                  </span>
                  <span style={{fontSize:12,color:'var(--muted)'}}>
                    as of {dailyPrice.date?new Date(dailyPrice.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—'}
                  </span>
                </>
              )}
              {securitySector && <span className="pill">{securitySector}</span>}
            </div>
          )}
          <LayerSummary research={hasResearch?researchB:null} views={hasViews?viewB:null} isMobile={isMobile}/>
          {!hasAny && (
            <div className="card"><div style={{padding:'32px',textAlign:'center',color:'var(--muted)',fontSize:14}}>
              No public research or Market Views on {ticker} yet.
            </div></div>
          )}
        </div>
      )}

      {/* ── Tabs — segmented control, sticky so they stay reachable while
           scrolling through what's now one long page instead of five swapped
           panels. Clicking one scrolls to its section (scrollToSection,
           smooth); the highlight also updates on its own while scrolling,
           via the IntersectionObserver set up above. ── */}
      {SECTIONS.length > 0 && <div style={{
        display:'flex', gap:4, marginTop:20, marginBottom:20, overflowX:'auto', WebkitOverflowScrolling:'touch',
        background:'var(--surface-2)', border:'1px solid var(--line)', borderRadius:14, padding:5,
        position:'sticky', top:0, zIndex:5,
      }}>
        {SECTIONS.map(([v,l,icon])=>(
          <button key={v}
            onClick={()=>scrollToSection(v)}
            style={{
              display:'flex', alignItems:'center', justifyContent:'center', gap:7, whiteSpace:'nowrap',
              flex: isMobile ? 'none' : 1,
              padding:'11px 18px', borderRadius:10, border:'none', cursor:'pointer',
              fontSize:14, fontWeight:tab===v?800:600,
              background: tab===v ? 'var(--accent)' : 'transparent',
              color:       tab===v ? '#fff'          : 'var(--ink-soft)',
              boxShadow:   tab===v ? '0 3px 10px rgba(109,93,245,.35)' : 'none',
              transition:'background .15s,color .15s,box-shadow .15s',
              flexShrink: 0,
            }}
          >{icon}{l}</button>
        ))}
      </div>}

      {/* Sections render only when their dataset exists. Research first
          ("what does verified research say?"), then Market Views ("what are
          independent participants saying?"), then the people behind both. */}
      {hasResearch && (
        <ResearchSection sectionRef={el=>sectionRefs.current.research=el} ticker={ticker} recos={recos} breakdown={researchB} monthly={researchMonthlyAgg}
          circleIds={circleIds} isMobile={isMobile} memberTagsByUser={memberTagsByUser}/>
      )}
      {hasViews && (
        <ViewsSection sectionRef={el=>sectionRefs.current.views=el} ticker={ticker}
          summary={viewSummary} views={views} stances={viewStances} monthly={viewMonthlyAgg} byContributor={byContributor} hasMore={hasMoreViews}
          loadingMore={loadingMore} onLoadMore={loadMoreViews}
          signedIn={signedIn} circleIds={circleIds} onSignIn={goHome} isMobile={isMobile}
          memberTagsByUser={memberTagsByUser}/>
      )}
      {hasAny && (
        <PeopleSection sectionRef={el=>sectionRefs.current.people=el} ticker={ticker} recos={recos}
          contributors={contributors} signedIn={signedIn} circleIds={circleIds}
          investorIcis={investorIcis} onSignIn={goHome} memberTagsByUser={memberTagsByUser}/>
      )}
    </>
  );
}
