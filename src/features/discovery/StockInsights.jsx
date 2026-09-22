// Split out of Discovery.jsx (see that file's header comment) — Stock
// Insights is a nav-only page (App.jsx renders it behind page==="sec_intel"
// and the standalone /security/:ticker route, lazy-loaded), not needed for
// the signed-in Home Feed's initial render.
import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Users,
  Lightbulb,
  Search,
  TrendingUp,
  TrendingDown,
  X,
  MessageSquare,
  Bookmark,
  ChevronRight,
  ChevronDown,
  Sparkles,
  UserPlus,
  ThumbsUp,
  Loader,
  RefreshCw,
  Globe,
  Flame,
  BarChart2,
  Activity,
  Zap,
  Target,
  Clock,
  Share2,
  ArrowLeft,
  Home
} from "lucide-react";
import {
  getInvestorIciBatch as dbGetInvestorIciBatch
} from "../../services/api/profileApi";
import {
  computeIci,
  forwardRecommendation as dbForwardReco,
  getConsensusRecosPublic as dbGetConsensusRecosPublic,
  getTickerRecos as dbGetTickerRecos,
  getPublicTickerIdeas as dbGetPublicTickerIdeas,
  updateDelivery as dbUpdateDelivery
} from "../../services/api/recommendationsApi";
import {
  reactToReco as dbReactToReco,
  trackReco as dbTrackReco,
  getMyTrackedRecos as dbGetMyTrackedRecos
} from "../../services/api/engagementApi";
import { ConsensusBar, ConvBadge, IdeaDisclaimer, InstrumentSearch, LinkSharePopover, MemberBadgeOverlay, SectionErrorBoundary, SparkLine, StatusBadge2, WidgetHeader } from "../../components/common";
import { useMemberTagsMap } from "../../MemberTagsContext";
import { FeedCard, IdeaSharePopover, InvestedToggle, MakeRecoModal, ThesisRenderer } from "../recommendations/Recommendations";
import { useIsMobile } from "../../hooks/index";
import { computeConsensus, computeTrend, consensusStrengthColor, fmtDate, getThesisText, ideaStatusSummary, initialsOf, scoreFeedRec } from "../../utils/format";
import { fetchPublicProfileInfo, openProfile, openReco, goHome } from "../../utils/navigation";
import { getSeenIds, markSeen, rankWhatYouMissed } from "../../utils/whatYouMissed";
import { getSeenState as getTrendingSeenState, markSeen as markTrendingSeen, rankTrending } from "../../utils/trending";
import { trackInvestor as dbTrackInvestor, untrackInvestor as dbUntrackInvestor } from "../../services/api/trackingApi";
import { deriveTrackedActivity, getSeenCommentCounts, saveSeenCommentCounts } from "../../utils/trackedActivity";
import { getDailyPrices, getPublicDailyPrice, byTicker, priceKey } from "../../services/api/pricingApi";

// Shared by the tab bar, each section's own heading, and the scroll-spy
// IntersectionObserver below — one list instead of the same five ids typed
// out three times. Mirrors the public /security/:symbol page's own section
// set (web-public/app/(pages)/security/[symbol]/SecurityTabs.jsx) — that
// page never hid inactive panels either (see its own header comment: a
// hide/show tab switcher excludes the hidden panels from a real browser's
// text layout, which is the wrong trade-off for content built to be
// indexed). Applying the same "always rendered, tabs just scroll you to a
// section" approach here too, for the signed-in view.
/* eslint-disable react/jsx-key -- lookup-table tuples destructured by
   .map() calls below, never rendered as an array themselves; the actual
   rendered elements (tab <button>s) already have their own key. */
const SECTIONS = [
  ['consensus', 'Consensus',    <Activity size={15}/> ],
  ['timeline',  'Idea History', <Clock size={15}/>    ],
  ['investors', 'Investors',    <Users size={15}/>    ],
  ['stats',     'Statistics',   <BarChart2 size={15}/>],
  ['ai',        'AI Summary',   <Sparkles size={15}/>],
];
/* eslint-enable react/jsx-key */

export function SecurityIntelligencePage({ securityTicker, contacts, me, viewerUser, trackedIds, onOpenSecurity, onBack, onHome }) {
  const isMobile = useIsMobile();
  const memberTagsByUser = useMemberTagsMap();
  const { ticker, name } = securityTicker || {};
  const [recos, setRecos]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab]         = useState(securityTicker?.tab || 'consensus'); // consensus | timeline | investors | stats | ai
  const [aiSummary, setAiSummary] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
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
    if (v === 'ai') buildAiSummary();
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
    setTab(securityTicker.tab);
    sectionRefs.current[securityTicker.tab]?.scrollIntoView({ block: 'start' });
  }, [ticker, securityTicker?.tab]);

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
  }, [ticker, recos.length]);

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

  useEffect(()=>{
    if (!ticker) return;
    setLoading(true); setRecos([]);
    const fetchRecos = signedIn ? dbGetTickerRecos(ticker) : dbGetPublicTickerIdeas(ticker);
    fetchRecos
      .then(rows=>{ setRecos(rows); setLoading(false); })
      .catch(()=>setLoading(false));
  },[ticker, signedIn]);

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

  // stats useMemo hoisted above early return to comply with React Rules of Hooks.
  // (hooks must be called in the same order on every render; early returns violate this)
  const stats = useMemo(()=>{
    if (!recos.length) return null;
    const byMonth = {};
    // Neon returns timestamp columns as Date objects — must stringify before .slice()
    const toIso = v => v instanceof Date ? v.toISOString() : String(v||'');
    recos.forEach(r=>{
      const mo = toIso(r.created_at).slice(0,7);
      if (!mo) return;
      if (!byMonth[mo]) byMonth[mo]={mo,buy:0,sell:0};
      if (r.recommendation_type==='Buy') byMonth[mo].buy++; else byMonth[mo].sell++;
    });
    const months = Object.values(byMonth).sort((a,b)=>a.mo.localeCompare(b.mo));
    const convMap = {};
    recos.forEach(r=>{ if(r.conviction) convMap[r.conviction]=(convMap[r.conviction]||0)+1; });
    const firstDate = recos[recos.length-1]?.created_at;
    const activeR  = recos.filter(r=>r.status==='Active');
    const exitedR  = recos.filter(r=>r.status==='Closed' || r.status==='Expired');
    return { months, convMap, firstDate, total:recos.length, active:activeR.length, exited:exitedR.length };
  },[recos]);

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
          <div style={{fontSize:15,fontWeight:700,marginBottom:10,color:'var(--ink)'}}>Discover any security's community intelligence</div>
          <div style={{fontSize:13,color:'var(--muted)',lineHeight:1.7}}>
            Type any stock name or ticker above to instantly explore community consensus,
            investor conviction trends, and who on myInvestorCircle is tracking it —
            and whether they're bullish or bearish.
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

  // Consensus strength/AI summary deliberately keep considering every idea on
  // the ticker, not just ones currently flagged Active — that matching the
  // pre-existing behavior here (unlike the Idea History badges and Statistics
  // tab below, which now show the real per-idea status) is intentional: it's
  // a business calculation CLAUDE.md marks sensitive, so its input set is
  // left unchanged by this pass rather than narrowed as a side effect.
  const activeRecos  = recos;
  const circleRecos  = recos.filter(r=>circleIds.has(r.from));
  const community    = computeConsensus(activeRecos);
  const circle       = computeConsensus(circleRecos);

  // Stats computation
  // AI summary — deterministic analysis from recommendation data
  const buildAiSummary = () => {
    if (aiSummary || aiLoading || !recos.length) return;
    setAiLoading(true);
    const activeR = recos;
    const bullR   = activeR.filter(r=>r.recommendation_type==='Buy');
    const bearR   = activeR.filter(r=>r.recommendation_type==='Sell');
    const theses  = activeR.filter(r=>r.thesis).map(r=>getThesisText(r.thesis));
    // Simulate a brief async "analysis" then show structured summary
    setTimeout(()=>{
      const bullThemes = bullR.slice(0,3).map(r=>getThesisText(r.thesis)||null).filter(Boolean);
      const bearThemes = bearR.slice(0,3).map(r=>getThesisText(r.thesis)||null).filter(Boolean);
      const community  = computeConsensus(activeR);
      const sentiment  = community.label==='Strong Bullish'?'strongly bullish':community.label==='Bullish'?'moderately bullish':community.label==='Strong Bearish'?'strongly bearish':community.label==='Bearish'?'cautious':'divided';
      setAiSummary({
        sentiment, community,
        bullThemes: bullThemes.length ? bullThemes : (bullR.length ? [`${bullR.length} investor${bullR.length>1?'s':''} tracking as a Buy opportunity`] : []),
        bearThemes: bearThemes.length ? bearThemes : (bearR.length ? [`${bearR.length} investor${bearR.length>1?'s':''} flagging caution`] : ['No bearish recommendations on record']),
        highConv:  activeR.filter(r=>r.conviction==='High Conviction'||r.conviction==='Very High').length,
        uniqueInv: new Set(activeR.map(r=>r.from)).size,
      });
      setAiLoading(false);
    }, 800);
  };
  const investorMap = {};  // keyed by recommender uid (or username, signed-out) — populated below
  recos.forEach(r=>{
    if (!investorMap[r.from]) investorMap[r.from] = {...r};
  });
  const investors = Object.values(investorMap);
  const inCircle  = investors.filter(r=>circleIds.has(r.from));
  const notCircle = investors.filter(r=>!circleIds.has(r.from));
  // investorMap keeps each investor's most recent idea on this ticker (recos
  // arrives newest-first), so "still active" here means their latest call on
  // {ticker} is currently open — the same per-idea status now available from
  // both data paths.
  const activeInvestorCount = investors.filter(r=>r.status==='Active').length;

  // Idea-level status mix (distinct from activeInvestorCount above, which is
  // per-investor: each person's most recent call). This counts every idea on
  // {ticker}, for the summary strip below — the signed-in equivalent of the
  // one already shown on the public /security/:symbol page.
  const ideaActiveCount  = recos.filter(r=>r.status==='Active').length;
  const ideaClosedCount  = recos.filter(r=>r.status==='Closed').length;
  const ideaExpiredCount = recos.filter(r=>r.status==='Expired').length;
  const securitySector   = recos[0]?.sector || '';

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
          <div style={{fontSize:16,color:'var(--muted)',fontWeight:400}}>{name || recos[0]?.asset_name || ''}</div>
        </div>
        <div className="page-sub">
          {loading ? 'Loading…' : investors.length===0 ? `No public ideas on ${ticker} yet.` :
            `${investors.length} ${investors.length===1?'person has':'people have'} shared ${investors.length===1?'a view':'their views'} on ${ticker} — ${activeInvestorCount} ${activeInvestorCount===1?'is':'are'} still active`}
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

      {/* ── Compact summary strip — sector/Buy-Sell/idea-status at a glance,
           before the tabs. The signed-out /security/:symbol page (web-public)
           already has this; the signed-in view only had the single page-sub
           line above with nothing quantifying idea/investor counts or the
           active/closed mix before a reader hits the tab content. ── */}
      {!loading && recos.length > 0 && (
        <div style={{marginTop:16}}>
          {/* Nightly-batch EOD snapshot, never live/intraday — the visible
              "as of" date is deliberate, not just a hover title, so this
              can't read as a real-time quote it isn't. Distinct from each
              idea's own return% below (anchored to that idea's own entry
              price, not yesterday's close). */}
          {dailyPrice && (
            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:10}}>
              <span className="pill" style={dailyPrice.changePct!=null?{color:dailyPrice.changePct>0?'var(--gain)':dailyPrice.changePct<0?'var(--loss)':undefined}:undefined}>
                ₹{Number(dailyPrice.close).toLocaleString('en-IN')}
                {dailyPrice.changePct!=null && ` ${dailyPrice.changePct>=0?'+':''}${Number(dailyPrice.changePct).toFixed(1)}%`}
              </span>
              <span style={{fontSize:12,color:'var(--muted)'}}>
                as of {dailyPrice.date?new Date(dailyPrice.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—'}
              </span>
            </div>
          )}
          <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:10}}>
            {securitySector && <span className="pill">{securitySector}</span>}
            <span className="pill gain">{community.bull} Buy</span>
            {community.bear > 0 && <span className="pill loss">{community.bear} Sell</span>}
          </div>
          <div className="statgrid">
            <div className="stat"><div className="v">{recos.length}</div><div className="l">Ideas</div></div>
            <div className="stat"><div className="v">{investors.length}</div><div className="l">Investors</div></div>
            <div className="stat"><div className="v">{ideaActiveCount}</div><div className="l">Active</div></div>
            <div className="stat"><div className="v">{ideaClosedCount}</div><div className="l">Closed</div></div>
          </div>
          <div style={{fontSize:13,color:'var(--ink-soft)',marginTop:10}}>
            {ideaStatusSummary(ideaActiveCount, ideaClosedCount, ideaExpiredCount)}
          </div>
        </div>
      )}

      {/* ── Tabs — segmented control, sticky so they stay reachable while
           scrolling through what's now one long page instead of five swapped
           panels. Clicking one scrolls to its section (scrollToSection,
           smooth); the highlight also updates on its own while scrolling,
           via the IntersectionObserver set up above. ── */}
      <div style={{
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
      </div>

      {/* ── Consensus ──
           scrollMarginTop on every section below matches the sticky tab
           bar's own rendered height (~64px) plus a little breathing room —
           without it, scrollIntoView({block:'start'}) lands a section's top
           edge exactly where the sticky bar sits, which then covers it. */}
      <section ref={el=>sectionRefs.current.consensus=el} data-section="consensus" style={{scrollMarginTop:76}}>
        <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:16}}>
          {/* Strength gauge */}
          <div className="card">
            <div className="card-head"><Target size={15}/> Consensus Strength</div>
            <div className="card-body" style={{textAlign:'center',padding:'24px'}}>
              <div style={{fontSize:64,fontWeight:900,color:consensusStrengthColor(community),lineHeight:1,marginBottom:8}}>
                {community.strength}
              </div>
              <div style={{fontSize:14,fontWeight:700,color:'var(--ink)',marginBottom:4}}>{community.label}</div>
              <div style={{fontSize:12,color:'var(--muted)',marginBottom:20}}>out of 100 — based on {community.total} active ideas</div>
              <div style={{height:8,borderRadius:6,overflow:'hidden',background:'var(--line)',position:'relative'}}>
                <div style={{position:'absolute',left:0,top:0,height:'100%',width:`${community.strength}%`,
                  background:consensusStrengthColor(community),transition:'width .6s'}}/>
              </div>
            </div>
          </div>
          {/* Your Circle vs Community */}
          <div className="card">
            <div className="card-head"><Globe size={15}/> Your Circle vs Community</div>
            <div className="card-body" style={{display:'flex',flexDirection:'column',gap:16,padding:'16px 18px'}}>
              <div style={{fontSize:11.5,color:'var(--muted)',lineHeight:1.6,paddingBottom:2}}>
                <strong style={{color:'var(--ink-soft)'}}>Community</strong> is every public idea shared on myInvestorCircle. <strong style={{color:'var(--ink-soft)'}}>Your Circle</strong> is just the people you're connected with or tracking.
              </div>
              {signedIn ? (
                [['Your Circle',circle],['Community',community]].map(([l,c])=>(
                  <div key={l}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                      <span style={{fontSize:13,fontWeight:600}}>{l}</span>
                      <span style={{fontSize:13,fontWeight:700,color:consensusStrengthColor(c)}}>{c.label}</span>
                    </div>
                    <ConsensusBar cons={c} width={'100%'}/>
                    <div style={{fontSize:12,color:'var(--muted)',marginTop:6}}>{c.total} investor{c.total!==1?'s':''}</div>
                  </div>
                ))
              ) : (
                <>
                  {/* Soft conversion prompt in place of Your Circle — there is
                      no signed-in viewer, so there is no circle to compute. */}
                  <div style={{padding:'14px 16px',background:'var(--surface-2)',borderRadius:10,border:'1px dashed var(--line)',textAlign:'center'}}>
                    <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>See how Your Circle is positioned</div>
                    <div style={{fontSize:12,color:'var(--muted)',marginBottom:10}}>Sign in to see what the people you're connected with and tracking think of {ticker}.</div>
                    <button className="btn btn-pri btn-sm" onClick={goHome}>Sign in</button>
                  </div>
                  <div>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                      <span style={{fontSize:13,fontWeight:600}}>Community</span>
                      <span style={{fontSize:13,fontWeight:700,color:consensusStrengthColor(community)}}>{community.label}</span>
                    </div>
                    <ConsensusBar cons={community} width={'100%'}/>
                    <div style={{fontSize:12,color:'var(--muted)',marginTop:6}}>{community.total} investor{community.total!==1?'s':''}</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Idea History ── */}
      <section ref={el=>sectionRefs.current.timeline=el} data-section="timeline" style={{marginTop:32,scrollMarginTop:76}}>
        <div className="card">
          <div className="card-head"><Clock size={15}/> Idea History <span style={{fontSize:11,color:'var(--muted)',fontWeight:400,marginLeft:4}}>(immutable — all calls are permanent)</span></div>
          {recos.length===0&&!loading?(
            <div style={{padding:'32px',textAlign:'center',color:'var(--muted)',fontSize:14}}>No ideas for {ticker} yet.</div>
          ):isMobile?(
            /* ── Mobile: cards, not the table below — a 6-column table forced
                 to scroll sideways was the thing worth fixing here; this also
                 has room for a thesis glimpse the table never had. ── */
            <div style={{display:'flex',flexDirection:'column',gap:10,padding:'10px'}}>
              {recos.map(r=>{
                const inYourCircle = circleIds.has(r.from);
                const goToReco = r.username ? ()=>openReco(r.username, r.id) : undefined;
                return (
                  <div key={r.id} onClick={goToReco} style={{border:'1px solid var(--line)',borderRadius:12,padding:'12px 14px',cursor:goToReco?'pointer':'default'}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                      <div style={{position:'relative',width:28,height:28,flexShrink:0}}>
                        <div className="av" style={{width:28,height:28,fontSize:10,background:'var(--grad)'}}>{initialsOf(r.full_name||r.username||'?')}</div>
                        <MemberBadgeOverlay tags={memberTagsByUser[r.from]} size={28}/>
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:13}}>{r.full_name||r.username||'Anonymous'}</div>
                        {inYourCircle&&<span style={{fontSize:9,fontWeight:800,padding:'2px 6px',borderRadius:4,background:'var(--accent-soft)',color:'var(--accent-ink)',textTransform:'uppercase',letterSpacing:'.05em'}}>Your Circle</span>}
                      </div>
                      <span style={{fontSize:11,fontWeight:800,padding:'3px 9px',borderRadius:5,flexShrink:0,
                        background:r.recommendation_type==='Buy'?'var(--gain-soft)':'var(--loss-soft)',
                        color:r.recommendation_type==='Buy'?'var(--gain)':'var(--loss)'}}>
                        {r.recommendation_type==='Buy'?'BUY':'SELL'}
                      </span>
                    </div>
                    {r.thesis&&r.thesis!=='—'&&(
                      <div style={{marginBottom:8,fontSize:12.5}}><ThesisRenderer thesis={r.thesis} previewLines={2}/></div>
                    )}
                    <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',fontSize:12,color:'var(--muted)'}}>
                      <span>{r.created_at?new Date(r.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—'}</span>
                      {r.reco_price&&<span>· Entry ₹{Number(r.reco_price).toLocaleString('en-IN')}</span>}
                      {r.return_pct!=null&&(
                        <span style={{fontWeight:700,color:Number(r.return_pct)>=0?'var(--gain)':'var(--loss)'}}>
                          · {Number(r.return_pct)>=0?'+':''}{Number(r.return_pct).toFixed(1)}%
                        </span>
                      )}
                      <ConvBadge level={r.conviction}/>
                      <StatusBadge2 status={r.status||'Active'}/>
                    </div>
                  </div>
                );
              })}
            </div>
          ):(
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{borderBottom:'2px solid var(--line)'}}>
                    {['Investor','Type','Date','Entry Price','Return','Conviction','Status'].map((h,i)=>(
                      <th key={i} style={{padding:'10px 14px',textAlign:i===0?'left':'center',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',color:'var(--muted)'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recos.map(r=>{
                    const inYourCircle = circleIds.has(r.from);
                    const goToReco = r.username ? ()=>openReco(r.username, r.id) : undefined;
                    return (
                      <tr key={r.id} style={{borderBottom:'1px solid var(--line)',cursor:goToReco?'pointer':'default'}} onClick={goToReco}
                        onMouseEnter={goToReco?(e)=>{e.currentTarget.style.background='var(--surface-2)';}:undefined}
                        onMouseLeave={goToReco?(e)=>{e.currentTarget.style.background='';}:undefined}>
                        <td style={{padding:'12px 14px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <div style={{position:'relative',width:30,height:30,flexShrink:0}}>
                              <div className="av" style={{width:30,height:30,fontSize:11,background:'var(--grad)'}}>{initialsOf(r.full_name||r.username||'?')}</div>
                              <MemberBadgeOverlay tags={memberTagsByUser[r.from]} size={30}/>
                            </div>
                            <div style={{minWidth:0}}>
                              <div style={{fontWeight:700,fontSize:13}}>{r.full_name||r.username||'Anonymous'}</div>
                              {inYourCircle&&<span style={{fontSize:9,fontWeight:800,padding:'2px 6px',borderRadius:4,background:'var(--accent-soft)',color:'var(--accent-ink)',textTransform:'uppercase',letterSpacing:'.05em'}}>Your Circle</span>}
                              {r.thesis&&r.thesis!=='—'&&(
                                <div style={{marginTop:4,fontSize:12,color:'var(--ink-soft)',maxWidth:320}}><ThesisRenderer thesis={r.thesis} previewLines={2}/></div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{padding:'12px 14px',textAlign:'center'}}>
                          <span style={{fontSize:11,fontWeight:800,padding:'3px 9px',borderRadius:5,
                            background:r.recommendation_type==='Buy'?'var(--gain-soft)':'var(--loss-soft)',
                            color:r.recommendation_type==='Buy'?'var(--gain)':'var(--loss)'}}>
                            {r.recommendation_type==='Buy'?'BUY':'SELL'}
                          </span>
                        </td>
                        <td style={{padding:'12px 14px',textAlign:'center',fontSize:13,color:'var(--muted)'}}>
                          {r.created_at?new Date(r.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—'}
                        </td>
                        <td style={{padding:'12px 14px',textAlign:'center',fontSize:13,fontWeight:600}}>
                          {r.reco_price?`₹${Number(r.reco_price).toLocaleString('en-IN')}`:'—'}
                        </td>
                        <td style={{padding:'12px 14px',textAlign:'center',fontSize:13,fontWeight:700,
                          color:r.return_pct!=null?(Number(r.return_pct)>=0?'var(--gain)':'var(--loss)'):'var(--muted)'}}>
                          {r.return_pct!=null?`${Number(r.return_pct)>=0?'+':''}${Number(r.return_pct).toFixed(1)}%`:'—'}
                        </td>
                        <td style={{padding:'12px 14px',textAlign:'center'}}><ConvBadge level={r.conviction}/></td>
                        <td style={{padding:'12px 14px',textAlign:'center'}}>
                          <StatusBadge2 status={r.status||'Active'}/>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ── Investors ── */}
      <section ref={el=>sectionRefs.current.investors=el} data-section="investors" style={{marginTop:32,scrollMarginTop:76}}>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {/* Soft conversion prompt in place of "In Your Circle" — with no
              signed-in viewer, circleIds is empty and inCircle would just be
              [], silently omitting the section below rather than explaining
              why. */}
          {!signedIn && (
            <div className="card">
              <div className="card-body" style={{padding:'14px 16px',textAlign:'center'}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>See who in Your Circle is invested in {ticker}</div>
                <div style={{fontSize:12,color:'var(--muted)',marginBottom:10}}>Sign in to see which of your connections and tracked investors have shared a view on {ticker}.</div>
                <button className="btn btn-pri btn-sm" onClick={goHome}>Sign in</button>
              </div>
            </div>
          )}
          {[['In Your Circle', inCircle, true], ['Community', notCircle, false]].map(([label, list, isCircle])=>(
            list.length > 0 && (
              <div key={label} className="card">
                <div className="card-head">
                  {isCircle ? <Users size={15}/> : <Globe size={15}/>} {label} ({list.length})
                </div>
                <div className="card-body" style={{display:'flex',flexDirection:'column',gap:0,padding:0}}>
                  {list.map((r,i)=>{
                    const ici = investorIcis[r.from];
                    const iciScore = ici?.score;
                    const iciBand  = ici?.band;
                    const bandColor = iciBand==='Strong'?'var(--gain)':iciBand==='Good'?'var(--accent)':iciBand==='Building'?'#f59e0b':'var(--muted)';
                    const profileUrl = r.username ? `/investor/${r.username}` : null;
                    return (
                      <div key={r.from} style={{
                        display:'flex', alignItems:'center', gap:12, padding:'12px 18px',
                        borderBottom: i < list.length-1 ? '1px solid var(--line)' : 'none',
                      }}>
                        {/* Avatar */}
                        <div style={{position:'relative',width:40,height:40,flexShrink:0}}>
                          <div className="av" style={{width:40,height:40,fontSize:14,background:'var(--grad)',cursor:profileUrl?'pointer':'default'}}
                            onClick={()=>r.username&&openProfile(r.username)}>
                            {initialsOf(r.full_name||r.username||'?')}
                          </div>
                          <MemberBadgeOverlay tags={memberTagsByUser[r.from]} size={40}/>
                        </div>

                        {/* Name + handle */}
                        <div style={{flex:1,minWidth:0}}>
                          <div
                            style={{fontWeight:700,fontSize:14,cursor:profileUrl?'pointer':'default',
                              color:profileUrl?'var(--accent-ink)':'var(--ink)',
                              textDecoration:profileUrl?'underline':'none',textDecorationColor:'rgba(109,93,245,.3)'}}
                            onClick={()=>r.username&&openProfile(r.username)}
                            title={profileUrl?`View ${r.full_name||r.username}'s profile`:undefined}
                          >
                            {r.full_name||r.username||'Anonymous'}
                          </div>
                          {r.username&&<div style={{fontSize:11,color:'var(--muted)'}}>@{r.username}</div>}
                        </div>

                        {/* ICI Score */}
                        <div style={{textAlign:'center',flexShrink:0,minWidth:44}}>
                          {iciScore !== undefined ? (
                            <>
                              <div style={{fontSize:18,fontWeight:900,color:bandColor,lineHeight:1}}>{iciScore}</div>
                              <div style={{fontSize:9,color:bandColor,fontWeight:700,marginTop:2}}>{iciBand}</div>
                            </>
                          ) : (
                            <>
                              <div style={{fontSize:18,fontWeight:900,color:'var(--muted)',lineHeight:1}}>—</div>
                              <div style={{fontSize:9,color:'var(--muted)',marginTop:2}}>ICI</div>
                            </>
                          )}
                        </div>

                        {/* Conviction + direction */}
                        <div style={{display:'flex',gap:6,alignItems:'center',flexShrink:0}}>
                          <ConvBadge level={r.conviction}/>
                          <span style={{fontSize:11,fontWeight:800,padding:'3px 9px',borderRadius:5,whiteSpace:'nowrap',
                            background:r.recommendation_type==='Buy'?'var(--gain-soft)':'var(--loss-soft)',
                            color:r.recommendation_type==='Buy'?'var(--gain)':'var(--loss)'}}>
                            {r.recommendation_type==='Buy'?'BUY':'SELL'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          ))}
          {investors.length===0&&!loading&&(
            <div className="card"><div style={{padding:'32px',textAlign:'center',color:'var(--muted)',fontSize:14}}>
              No investor ideas for {ticker} yet.
            </div></div>
          )}
        </div>
      </section>

      {/* ── Statistics ── */}
      <section ref={el=>sectionRefs.current.stats=el} data-section="stats" style={{marginTop:32,scrollMarginTop:76}}>
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          {!stats?(
            <div className="card"><div style={{padding:'32px',textAlign:'center',color:'var(--muted)'}}>No idea history for {ticker} yet.</div></div>
          ):(
            <>
              {/* Overview stat cards */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:12}}>
                {[
                  {label:'Total Ideas', val:stats.total, icon:<Activity size={16}/>},
                  {label:'Currently Active',       val:stats.active, icon:<TrendingUp size={16}/>, color:'var(--gain)'},
                  {label:'Exited / Closed',        val:stats.exited, icon:<TrendingDown size={16}/>, color:'var(--muted)'},
                  {label:'Unique Investors',        val:new Set(recos.map(r=>r.from)).size, icon:<Users size={16}/>},
                ].map((s,i)=>(
                  <div key={i} className="card" style={{padding:'16px 18px'}}>
                    <div style={{color:s.color||'var(--accent-ink)',opacity:.7,marginBottom:8}}>{s.icon}</div>
                    <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--muted)',marginBottom:4}}>{s.label}</div>
                    <div style={{fontSize:24,fontWeight:900,color:s.color||'var(--ink)'}}>{s.val}</div>
                  </div>
                ))}
              </div>

              {/* Idea activity by month — a plain row per month (same pattern
                  as the public /security/:symbol page's month list) rather
                  than the SVG bar chart this replaces: fixed-width tick
                  labels and stacked bars kept overlapping/illegible once a
                  ticker had more than a handful of months, or a month with a
                  small count next to one with a large one. A row list has no
                  such failure mode at any data shape. This SPA has more
                  horizontal room than that mobile-first page, though, so
                  each row adds a slim proportional bar (green=buy/red=sell,
                  scaled to the busiest month) rather than being text-only —
                  a quick visual comparison across months without the SVG's
                  label-collision problem. */}
              {stats.months.length>0&&(
                <div className="card">
                  <div className="card-head"><Target size={15}/> Idea Activity by Month</div>
                  <div className="card-body" style={{padding:'14px 20px',display:'flex',flexDirection:'column',gap:10}}>
                    {(()=>{
                      const maxTotal = Math.max(...stats.months.map(m=>m.buy+m.sell), 1);
                      return stats.months.map(m=>{
                        const buyPct  = (m.buy/maxTotal)*100;
                        const sellPct = (m.sell/maxTotal)*100;
                        const label = new Date(`${m.mo}-01`).toLocaleDateString('en-IN',{month:'short',year:'numeric'});
                        return (
                          <div key={m.mo} style={{display:'flex',alignItems:'center',gap:14}}>
                            <div style={{width:72,flexShrink:0,fontSize:12.5,color:'var(--muted)',fontWeight:600}}>{label}</div>
                            <div style={{flex:1,height:8,borderRadius:6,overflow:'hidden',background:'var(--line)',display:'flex'}}>
                              {buyPct>0 && <div style={{width:`${buyPct}%`,background:'var(--gain)'}}/>}
                              {sellPct>0 && <div style={{width:`${sellPct}%`,background:'var(--loss)'}}/>}
                            </div>
                            <div style={{width:120,flexShrink:0,textAlign:'right',fontSize:12.5}}>
                              <span style={{color:'var(--gain)',fontWeight:700}}>{m.buy} buy</span>
                              {m.sell>0 && <span style={{color:'var(--loss)',fontWeight:700,marginLeft:6}}>{m.sell} sell</span>}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {/* Conviction breakdown */}
              {Object.keys(stats.convMap).length>0&&(
                <div className="card">
                  <div className="card-head"><Zap size={15}/> Conviction Breakdown</div>
                  <div className="card-body" style={{display:'flex',flexWrap:'wrap',gap:10,padding:'12px 16px'}}>
                    {Object.entries(stats.convMap).sort((a,b)=>b[1]-a[1]).map(([label,count])=>(
                      <div key={label} style={{display:'flex',flexDirection:'column',alignItems:'center',
                        padding:'10px 16px',background:'var(--surface-2)',borderRadius:10,minWidth:80}}>
                        <div style={{fontSize:22,fontWeight:900,color:'var(--accent-ink)'}}>{count}</div>
                        <div style={{fontSize:11,color:'var(--muted)',marginTop:3,textAlign:'center'}}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* ── AI Summary ── */}
      <section ref={el=>sectionRefs.current.ai=el} data-section="ai" style={{marginTop:32,scrollMarginTop:76}}>
        <div>
          {aiLoading&&(
            <div className="card" style={{padding:'48px',textAlign:'center'}}>
              <Loader size={28} className="spin" style={{color:'var(--accent-ink)',marginBottom:12}}/>
              <div style={{fontWeight:700,marginBottom:4}}>Analysing ideas…</div>
              <div style={{fontSize:13,color:'var(--muted)'}}>Reading {recos.length} ideas for {ticker}</div>
            </div>
          )}
          {!aiLoading&&!aiSummary&&(
            <div className="card" style={{padding:'48px',textAlign:'center'}}>
              <Lightbulb size={32} style={{color:'var(--accent-ink)',marginBottom:12,opacity:.6}}/>
              <div style={{fontWeight:700,marginBottom:8}}>AI Investment Summary</div>
              <div style={{fontSize:13,color:'var(--muted)',marginBottom:20}}>
                Synthesise bullish and bearish themes from {activeRecos.length} active idea{activeRecos.length!==1?'s':''} on {ticker}
              </div>
              <button className="btn btn-pri" onClick={buildAiSummary} disabled={!activeRecos.length}>
                <Lightbulb size={14}/> Generate Summary
              </button>
            </div>
          )}
          {!aiLoading&&aiSummary&&(
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              {/* Sentiment header */}
              <div className="card" style={{padding:'20px 24px'}}>
                <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
                  <Lightbulb size={20} style={{color:'var(--accent-ink)'}}/>
                  <div>
                    <div style={{fontWeight:900,fontSize:16}}>AI Insight Summary</div>
                    <div style={{fontSize:12,color:'var(--muted)'}}>Based on {aiSummary.uniqueInv} investor{aiSummary.uniqueInv!==1?'s':''} · {aiSummary.highConv} high conviction call{aiSummary.highConv!==1?'s':''}</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{marginLeft:'auto'}} onClick={()=>{setAiSummary(null);buildAiSummary();}}>
                    <RefreshCw size={12}/> Refresh
                  </button>
                </div>
                <div style={{padding:'12px 16px',background: aiSummary.community.bullPct>aiSummary.community.bearPct?'var(--gain-soft)':aiSummary.community.bearPct>aiSummary.community.bullPct?'var(--loss-soft)':'var(--surface-2)',
                  borderRadius:10,borderLeft:`3px solid ${consensusStrengthColor(aiSummary.community)}`}}>
                  <div style={{fontWeight:700,fontSize:15,textTransform:'capitalize',marginBottom:4}}>
                    {aiSummary.sentiment}
                  </div>
                  <div style={{fontSize:13,color:'var(--ink-soft)'}}>
                    {aiSummary.community.bullPct}% of investors bullish · {aiSummary.community.bearPct}% bearish · {aiSummary.community.total} total active ideas
                  </div>
                </div>
              </div>

              {/* Bullish themes */}
              {aiSummary.bullThemes.length>0&&(
                <div className="card">
                  <div className="card-head" style={{color:'var(--gain)'}}><TrendingUp size={15}/> Bullish Themes</div>
                  <div className="card-body" style={{display:'flex',flexDirection:'column',gap:10,padding:'12px 16px'}}>
                    {aiSummary.bullThemes.map((t,i)=>(
                      <div key={i} style={{display:'flex',gap:10,padding:'10px 12px',background:'var(--gain-soft)',borderRadius:8}}>
                        <div style={{color:'var(--gain)',marginTop:1,flexShrink:0}}>↑</div>
                        <div style={{fontSize:13,lineHeight:1.5}}>{t}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bearish / risk themes */}
              <div className="card">
                <div className="card-head" style={{color:'var(--loss)'}}><TrendingDown size={15}/> Risks &amp; Bearish Views</div>
                <div className="card-body" style={{display:'flex',flexDirection:'column',gap:10,padding:'12px 16px'}}>
                  {aiSummary.bearThemes.map((t,i)=>(
                    <div key={i} style={{display:'flex',gap:10,padding:'10px 12px',background:'var(--loss-soft)',borderRadius:8}}>
                      <div style={{color:'var(--loss)',marginTop:1,flexShrink:0}}>↓</div>
                      <div style={{fontSize:13,lineHeight:1.5}}>{t}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{fontSize:11,color:'var(--muted)',textAlign:'center',padding:'4px 0'}}>
                Summary is generated from investor ideas on myInvestorCircle and reflects community opinion, not financial advice.
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
