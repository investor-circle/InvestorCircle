// Discovery.jsx / MarketInsights.jsx / StockInsights.jsx — split from a single
// 2764-line Discovery.jsx (Phase: bootstrap/perf architecture) so App.jsx's
// eager import of HomeFeed doesn't also drag MarketIntelligencePage and
// SecurityIntelligencePage (~1600 lines neither the signed-out LandingPage
// nor the signed-in Home Feed need to render) into the initial JS bundle.
// Only HomeFeed and its own feed widgets live in this file now; the other
// two pages are React.lazy-loaded from App.jsx. Keep this split — don't
// re-merge "for cleanliness".
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
import { useMemberTagsFor } from "../../MemberTagsContext";
import { FeedCard, IdeaSharePopover, InvestedToggle, MakeRecoModal, ThesisRenderer } from "../recommendations/Recommendations";
import { useIsMobile } from "../../hooks/index";
import { computeConsensus, computeTrend, consensusStrengthColor, fmtDate, getThesisText, ideaStatusSummary, initialsOf, scoreFeedRec } from "../../utils/format";
import { fetchPublicProfileInfo, openProfile, openReco, goHome } from "../../utils/navigation";
import { getSeenIds, markSeen, rankWhatYouMissed } from "../../utils/whatYouMissed";
import { getSeenState as getTrendingSeenState, markSeen as markTrendingSeen, rankTrending } from "../../utils/trending";
import { trackInvestor as dbTrackInvestor, untrackInvestor as dbUntrackInvestor } from "../../services/api/trackingApi";
import { deriveTrackedActivity, getSeenCommentCounts, saveSeenCommentCounts } from "../../utils/trackedActivity";
import { getDailyPrices, getPublicDailyPrice, byTicker, priceKey } from "../../services/api/pricingApi";

// A recommendation counts as "fresh" while it's inside this window — same
// created_at ordering the rest of the feed already uses (r.date), just
// thresholded for the "New" badge. No separate unseen/last-viewed concept
// exists in the data model, so we don't invent one here.
const FRESH_WINDOW_MS = 48 * 60 * 60 * 1000;

/* ─── Compact "daily briefing" card for a single fresh idea ─────────────
   Distinct from the full FeedCard: no % return, tighter layout, and the
   whole card is a real navigable link to the recommendation's dedicated,
   shareable page (/investor/:username/idea/:id — reused, not reinvented).
   Like / Bookmark / Mark-invested / Share all call the same handlers and
   API functions FeedCard uses; Comment is a lightweight entry point that
   opens the same detail page (where the comment thread lives). ── */
function FreshIdeaCard({ r, contacts, groups, me, tracked, toggleTrack, setRecsReceived, setPublicFeedRecos, setNetworkEngagementRecos, ici }) {
  const [recommenderInfo, setRecommenderInfo] = useState(null); // { username, isSebiApproved }
  const [shareAnchor, setShareAnchor] = useState(null);
  const [showShare, setShowShare] = useState(false);

  useEffect(() => { if (r.from) fetchPublicProfileInfo(r.from).then(setRecommenderInfo); }, [r.from]);

  const authorTags = useMemberTagsFor(r.from);
  const cf = useMemo(() => {
    const found = contacts.find(x => x.id === r.from);
    if (found) return found;
    const name = r.byName || 'Someone';
    return { name, initials: initialsOf(name), color: '#8d90ad' };
  }, [r.from, contacts]);

  const username  = r.from_username || recommenderInfo?.username || null;
  const isFresh   = r.date ? (Date.now() - new Date(r.date).getTime()) < FRESH_WINDOW_MS : false;
  const isBuy     = (r.recommendation_type || r.recType || 'Buy') === 'Buy';
  const isTracked = tracked?.has(r.id);
  const sourceLabel = r.feedSource === 'public' ? 'Public'
    : r.shareType === 'group' ? 'Circle' : null;
  // Most useful 2-3 of horizon / target / sector / circle-source — horizon and
  // target win first (most decision-relevant for a fresh idea), sector and
  // the circle/public source tag fill remaining slots up to 3.
  const contextPills = useMemo(() => {
    const candidates = [
      r.horizon && { key:'horizon', label:r.horizon },
      r.targetPrice && { key:'target', label:`Target ₹${Number(r.targetPrice).toLocaleString('en-IN')}` },
      r.sector && { key:'sector', label:r.sector },
      sourceLabel && { key:'source', label:sourceLabel, accent:true },
    ].filter(Boolean);
    return candidates.slice(0, 3);
  }, [r.horizon, r.targetPrice, r.sector, sourceLabel]);

  // Same routing FeedCard/notifications already use — extended nowhere,
  // just consumed here.
  const goToDetail = async () => {
    let uname = username;
    if (!uname && r.from) uname = (await fetchPublicProfileInfo(r.from))?.username;
    if (uname) openReco(uname, r.id);
  };

  // ── Mutation helpers — mirror FeedCard's react()/patch() so Like/Track/
  // Invested go through the same underlying API calls, just routed to
  // whichever of the three feed arrays this reco actually lives in. ──
  const patch = (updates) => {
    if (r.feedSource === 'public' && setPublicFeedRecos) {
      setPublicFeedRecos(rs => rs.map(x => x.id === r.id ? { ...x, ...updates } : x));
    } else if (r.feedSource === 'network_engagement' && setNetworkEngagementRecos) {
      setNetworkEngagementRecos(rs => rs.map(x => x.id === r.id ? { ...x, ...updates } : x));
    } else if (setRecsReceived) {
      setRecsReceived(rs => rs.map(x => x.deliveryId === r.deliveryId ? { ...x, ...updates } : x));
      if (r.deliveryId) { try { dbUpdateDelivery(r.deliveryId, updates, me?.id); } catch (_) {} }
    }
  };

  const react = (val) => {
    if (!me?.id) return;
    const next = r.reaction === val ? 'none' : val;
    let likes = r.likes || 0;
    if (r.reaction === 'like') likes = Math.max(0, likes - 1);
    if (next === 'like') likes++;
    patch({ reaction: next, likes });
    dbReactToReco(r.id, next === 'like' ? 'like' : null, next === 'like' ? { likerName: me.name || 'Someone' } : null)
      .catch(e => console.error('[like] ✗ failed:', e?.message));
  };

  const handleShareClick = (e) => {
    e.stopPropagation();
    if (showShare) { setShowShare(false); setShareAnchor(null); return; }
    setShareAnchor(e.currentTarget); setShowShare(true);
  };

  return (
    <div
      onClick={goToDetail}
      style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:14,padding:'12px 14px',marginBottom:10,cursor:'pointer',transition:'.12s'}}
      onMouseEnter={e=>e.currentTarget.style.boxShadow='0 3px 14px rgba(20,20,50,.08)'}
      onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}
    >
      {/* WHO — creator, ICI, fresh badge, recency */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
        <div style={{position:'relative',width:26,height:26,flexShrink:0}}>
          {cf.avatarUrl
            ? <img src={cf.avatarUrl} alt="" className="av" style={{width:26,height:26,objectFit:'cover'}}/>
            : <div className="av" style={{width:26,height:26,background:cf.color||'var(--grad)',fontSize:10}}>
                {cf.initials||initialsOf(cf.name)}
              </div>}
          <MemberBadgeOverlay tags={authorTags} size={26}/>
        </div>
        <div style={{flex:1,minWidth:0,display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
          <span style={{fontWeight:700,fontSize:12,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:110}}>{cf.name.split(' ')[0]}</span>
          {ici && (
            <span style={{fontSize:9,fontWeight:800,padding:'1px 6px',borderRadius:999,
              background: ici.score>=70?'rgba(74,222,128,.15)':ici.score>=50?'rgba(124,92,252,.15)':'rgba(251,191,36,.15)',
              color:      ici.score>=70?'#22863a':ici.score>=50?'#6d4fc7':'#b07a00'}}>
              ICI {Math.round(ici.score)}
            </span>
          )}
          {isFresh && (
            <span style={{fontSize:9,fontWeight:800,padding:'1px 6px',borderRadius:999,background:'var(--grad)',color:'#fff',letterSpacing:'.3px',textTransform:'uppercase'}}>
              New
            </span>
          )}
        </div>
        <span style={{fontSize:10,color:'var(--muted)',flexShrink:0}}>{fmtDate(r.date)}</span>
      </div>

      {/* WHAT — instrument, action, entry price */}
      <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:6,flexWrap:'wrap'}}>
        <span style={{fontWeight:800,fontSize:13.5,letterSpacing:'-.2px'}}>{r.assetName}</span>
        <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:5,
          background:isBuy?'var(--gain-soft)':'var(--loss-soft)',color:isBuy?'var(--gain)':'var(--loss)'}}>
          {isBuy?'Buy':'Sell'}
        </span>
        {r.priceAt>0 && <span style={{fontSize:11,color:'var(--muted)'}}>Entry ₹{Number(r.priceAt).toLocaleString('en-IN')}</span>}
      </div>

      {/* WHY — truncated thesis, with a real "Read more" that expands in place
           (links render as links) rather than raw markdown text. Plain text/links
           bubble to the card's click-through; Read more/Show less stop their own
           propagation (see ThesisRenderer) so expanding never navigates away. */}
      {r.thesis && r.thesis!=='—' && (
        <div style={{fontSize:12,lineHeight:1.5,marginBottom:8}}>
          <ThesisRenderer thesis={r.thesis} previewLines={2}/>
        </div>
      )}

      {/* Useful context — pick the 2-3 most useful of horizon / target / sector / circle */}
      {contextPills.length > 0 && (
        <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:9}}>
          {contextPills.map(p => (
            <span key={p.key} className={"pill"+(p.accent?' accent':'')} style={{fontSize:10,padding:'2px 8px'}}>{p.label}</span>
          ))}
        </div>
      )}

      {/* Lightweight interactions — reuse existing handlers; never bubble to the card click */}
      <div style={{display:'flex',alignItems:'center',gap:4,paddingTop:8,borderTop:'1px solid var(--line)'}} onClick={e=>e.stopPropagation()}>
        <button className={"iconbtn"+(r.reaction==='like'?' on-like':'')} title="Like" onClick={()=>react('like')} style={{width:26,height:26}}><ThumbsUp size={12}/></button>
        <span style={{fontSize:10,fontWeight:700,color:'var(--muted)',minWidth:12}}>{r.likes||0}</span>
        <button className="iconbtn" title="Comment" onClick={goToDetail} style={{width:26,height:26}}><MessageSquare size={12}/></button>
        {(r.commentCount||0)>0 && <span style={{fontSize:10,fontWeight:700,color:'var(--muted)'}}>{r.commentCount}</span>}
        <div style={{position:'relative'}}>
          <button className="iconbtn" title="Share" onClick={handleShareClick} style={{width:26,height:26}}><Share2 size={12}/></button>
          {showShare && (
            <IdeaSharePopover
              reco={r} username={username} contacts={contacts} groups={groups}
              anchorEl={shareAnchor}
              onSend={(targets)=>dbForwardReco(r.id, me?.id, targets)}
              onClose={()=>{ setShowShare(false); setShareAnchor(null); }}
            />
          )}
        </div>
        <button className={"iconbtn"+(isTracked?' on-like':'')} title={isTracked?'Remove from tracked':'Track'}
          onClick={()=>toggleTrack?.(r.id)}
          style={isTracked?{width:26,height:26,background:'var(--accent-soft)',color:'var(--accent-ink)',borderColor:'var(--accent-line)'}:{width:26,height:26}}>
          <Bookmark size={12}/>
        </button>
        <div style={{marginLeft:'auto'}}>
          <InvestedToggle
            invested={r.invested} investedPrice={r.investedPrice||r.invested_price}
            reco={{...r,price:r.price,ticker:r.ticker,assetName:r.assetName,priceAt:r.priceAt}}
            onMark={(price)=>{
              patch({isInvested:true,investedPrice:price,invested:true});
              if(me?.id){
                dbTrackReco(r.id, true, price)
                  .then(()=>{ if(toggleTrack&&tracked&&!tracked.has(r.id)) toggleTrack(r.id); })
                  .catch(()=>{ if(toggleTrack&&tracked&&!tracked.has(r.id)) toggleTrack(r.id); });
              } else if(toggleTrack&&tracked&&!tracked.has(r.id)) toggleTrack(r.id);
            }}
            onUnmark={()=>{
              patch({isInvested:false,investedPrice:null,invested:false});
              if(me?.id) dbTrackReco(r.id, false).catch(console.warn);
            }}
            stopProp={true}
          />
        </div>
      </div>
      <IdeaDisclaimer style={{marginTop:8}}/>
    </div>
  );
}

/* ─── Shared empty state for Pulse widgets ───────────────────────────────
   New users hit this on every widget before their circle has any history.
   Kept short, upbeat and action-oriented — the point is to make growing
   your circle feel like the unlock, not to apologize for having no data. ── */
function WidgetEmptyState({ icon, title, sub, setPage }) {
  return (
    <div style={{padding:'16px 16px 20px',textAlign:'center'}}>
      <div style={{fontSize:26,marginBottom:8}}>{icon}</div>
      <div style={{fontWeight:800,fontSize:12.5,marginBottom:4}}>{title}</div>
      <div className="muted small" style={{lineHeight:1.55,marginBottom:12,maxWidth:230,margin:'0 auto 12px'}}>{sub}</div>
      <button className="btn btn-soft btn-sm" onClick={()=>setPage?.('discover')}><Users size={13}/> Discover investors to follow</button>
    </div>
  );
}

export function FreshIdeasWidget({ recsReceived, contacts, groups, me, tracked, toggleTrack, setRecsReceived, setPublicFeedRecos, setNetworkEngagementRecos, onViewAll, setPage }) {
  const fresh = useMemo(() => [...recsReceived].filter(r=>!r.hidden)
    .sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5), [recsReceived]);

  // Batch-fetch real ICI scores for the creators shown, same pattern already
  // used for Stock Insights (SecurityIntelligencePage) — no new scoring logic.
  const [iciScores, setIciScores] = useState({});
  useEffect(() => {
    const uids = [...new Set(fresh.map(r=>r.from).filter(Boolean))];
    if (!uids.length) { setIciScores({}); return; }
    dbGetInvestorIciBatch(uids).then(rows => {
      const scores = {};
      rows.forEach(row => {
        const hitPct  = row.closed > 0 ? (row.wins / row.closed * 100) : 0;
        const riskAdj = Number(row.ret_stddev) > 0 ? Math.max(Number(row.median_ret) / Number(row.ret_stddev), 0) : 0;
        scores[row.uid] = computeIci({
          years_history: Number(row.years_history) || 0, total: row.total, hit_rate_pct: hitPct,
          median_return: Number(row.median_ret) || 0, risk_adjusted_return: riskAdj, deleted_count: 0,
        });
      });
      setIciScores(scores);
    }).catch(()=>{});
  }, [fresh]);

  return (
    <div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:16,boxShadow:'var(--shadow)',overflow:'hidden',marginBottom:12}}>
      <WidgetHeader icon={Sparkles} label="Fresh Ideas from your Circle"/>
      <div style={{padding:'10px 12px 4px'}}>
        {fresh.length===0 ? (
          <WidgetEmptyState icon="🌱" setPage={setPage}
            title="Fresh ideas start with your Circle"
            sub="Follow investors you trust and their next call lands here first — before anyone else sees it."
          />
        ) : (<>
          {fresh.map(r => (
            <FreshIdeaCard key={r.id} r={r} contacts={contacts} groups={groups} me={me} tracked={tracked} toggleTrack={toggleTrack}
              setRecsReceived={setRecsReceived} setPublicFeedRecos={setPublicFeedRecos} setNetworkEngagementRecos={setNetworkEngagementRecos}
              ici={iciScores[r.from]}/>
          ))}
          {fresh.length < 3 && (
            <div className="muted small" style={{padding:'0 2px 10px',lineHeight:1.5}}>
              More ideas will show up here as your circle keeps posting.
            </div>
          )}
        </>)}
      </div>
      <div style={{padding:'2px 12px 12px'}}>
        <button onClick={onViewAll} className="btn"
          style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:6,
            background:'var(--surface)',border:'1px solid var(--accent-line)',color:'var(--accent-ink)'}}>
          View all fresh ideas <ChevronRight size={14}/>
        </button>
      </div>
    </div>
  );
}

/* ─── Sidebar Widget: Tracked Summary Donut (#6) ─────────────────────────
   Enhanced with a compact "what's happened lately" activity section below
   the existing donut. Activity itself is derived entirely in
   src/utils/trackedActivity.js — see that file's header for exactly which
   categories are implemented, which were deliberately skipped because the
   data model can't honestly support them, and how the "Since yesterday" /
   "Since tracking" toggle works given there's no daily price-history
   table to diff against. This component only renders that module's
   output. ── */

const TRACKED_ACTIVITY_ICON = { exit: Target, mover: TrendingUp, comment: MessageSquare, reinforced: Users };

function TrackedActivityRow({ item, contacts }) {
  const { idea: r } = item;
  const [recommenderInfo, setRecommenderInfo] = useState(null);
  useEffect(() => { if (r.from) fetchPublicProfileInfo(r.from).then(setRecommenderInfo); }, [r.from]);

  const goToDetail = async () => {
    let uname = r.from_username || recommenderInfo?.username;
    if (!uname && r.from) uname = (await fetchPublicProfileInfo(r.from))?.username;
    if (uname) openReco(uname, r.id);
  };

  const Icon = TRACKED_ACTIVITY_ICON[item.type] || Activity;
  const isDownMover = item.type === 'mover' && item.direction === 'down';
  const iconColor = item.type === 'exit' ? 'var(--loss)' : isDownMover ? 'var(--loss)' : item.type === 'mover' ? 'var(--gain)' : 'var(--accent-ink)';
  const iconBg = item.type === 'exit' ? 'var(--loss-soft)' : isDownMover ? 'var(--loss-soft)' : item.type === 'mover' ? 'var(--gain-soft)' : 'var(--accent-soft)';

  return (
    <div onClick={goToDetail} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'8px 14px',borderTop:'1px solid var(--line)',cursor:'pointer',transition:'.12s'}}
      onMouseEnter={e=>e.currentTarget.style.background='var(--surface-2)'}
      onMouseLeave={e=>e.currentTarget.style.background=''}>
      <div style={{width:22,height:22,borderRadius:'50%',background:iconBg,color:iconColor,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:1}}>
        <Icon size={11}/>
      </div>
      <div style={{minWidth:0,flex:1}}>
        <div style={{fontSize:11.5,fontWeight:600,lineHeight:1.35,color:'var(--ink)'}}>{item.headline}</div>
        {item.date && <div style={{fontSize:9.5,color:'var(--muted)',marginTop:1}}>{fmtDate(item.date)}</div>}
      </div>
    </div>
  );
}

export function TrackedSummaryWidget({ recsReceived, tracked, setPage, setRecoInit, me, contacts }) {
  const [mode, setMode] = useState('yesterday'); // 'yesterday' | 'tracking' — default "Since yesterday" per spec

  // Authoritative tracked-ideas list, fetched from recommendation_tracking
  // directly (same source the "View all tracked" page uses via
  // dbGetMyTrackedRecos) — NOT derived by filtering recsReceived/
  // allFeedRecos against `tracked`. That in-memory pool is bounded to
  // direct deliveries plus a paginated slice of the public feed, so an
  // idea tracked from elsewhere (a connection's profile, a group, or one
  // that's aged out of the feed window) was silently missing from the
  // widget's count even though it's genuinely tracked.
  const [trackedRows, setTrackedRows] = useState([]);
  useEffect(() => {
    if (!me?.id) { setTrackedRows([]); return; }
    let cancelled = false;
    dbGetMyTrackedRecos()
      .then(rows => { if (!cancelled) setTrackedRows(rows || []); })
      .catch(() => { if (!cancelled) setTrackedRows([]); });
    return () => { cancelled = true; };
  }, [me?.id, tracked.size]);

  // Reshaped to the camelCase idea shape the rest of this widget (and
  // src/utils/trackedActivity.js) already expects — the API route itself
  // keeps its original snake_case field names since TrackedSection.jsx
  // (the full "View all tracked" page) consumes those rows as-is.
  const trackedList = useMemo(() => trackedRows.map(r => ({
    id:            r.id,
    assetName:     r.asset_name,
    ticker:        r.ticker,
    assetClass:    r.asset_class,
    priceAt:       Number(r.reco_price || 0),
    price:         Number(r.current_price || 0),
    date:          r.created_at ? String(r.created_at).slice(0, 10) : null,
    exitSignal:    r.exit_signal,
    exitDate:      r.exit_date,
    exitPrice:     r.exit_price ? Number(r.exit_price) : null,
    targetDate:    r.target_date ? String(r.target_date).slice(0, 10) : null,
    expiryPrice:   r.expiry_price ? Number(r.expiry_price) : null,
    commentCount:  Number(r.comment_count || 0),
    from:          r.recommender_id,
    from_username: r.recommender_username,
    invested:      r.is_invested,
    investedPrice: r.invested_price ? Number(r.invested_price) : null,
  })), [trackedRows]);

  // Phase 9: real "since yesterday" price deltas, read from the persisted
  // instrument daily-price snapshots (never from a market-data provider).
  //
  // Deliberately fetched HERE, inside the widget, and not added to
  // App.jsx's post-login load: the Home Feed's critical path is untouched,
  // the widget renders immediately from data already in memory, and this
  // one small request resolves alongside (not before) that first paint.
  // It only fires in 'yesterday' mode — 'tracking' mode has no use for it
  // — and asks only for the DISTINCT tickers the user actually tracks, so
  // ten tracked ideas on one ticker are one entry in the request, not ten.
  const trackedTickerKey = useMemo(
    () => [...new Set(trackedList.map(r=>(r.ticker||'').trim().toUpperCase()).filter(Boolean))].sort().join(','),
    [trackedList]
  );
  const [dailyPrices, setDailyPrices] = useState(null);
  useEffect(() => {
    if (mode !== 'yesterday' || !trackedTickerKey) return;
    let cancelled = false;
    getDailyPrices(trackedTickerKey.split(','))
      .then(rows => { if (!cancelled) setDailyPrices(byTicker(rows)); })
      .catch(() => {}); // pricing unavailable degrades to the old activity-only view
    return () => { cancelled = true; };
  }, [mode, trackedTickerKey]);
  const total = trackedList.length;
  const inM = trackedList.filter(r=>r.priceAt&&r.price>r.priceAt).length;
  const outM = total - inM;

  // "Since yesterday" — deliberately a DIFFERENT question from "Since
  // tracking", not the same one with an annotation. An earlier version of
  // this computed an in/out-of-money DELTA here (did a stock cross the
  // entry-price line since yesterday) — but "in the money" is inherently a
  // cumulative measure anchored to entry price, so that delta was almost
  // always zero and the two tabs looked identical. What "since yesterday"
  // actually means for a daily-habit surface is simpler and more useful:
  // did each tracked stock go UP or DOWN since the previous trading day's
  // close — independent of entry price entirely. Computed only over tracked
  // ideas the daily-price snapshot covers; the rest count as `noData`
  // (shown as a neutral segment) rather than being guessed at.
  const dailyMoveSplit = useMemo(() => {
    if (!dailyPrices) return null;
    let up = 0, down = 0, noData = 0;
    trackedList.forEach(r => {
      const snap = dailyPrices[priceKey(r.ticker, r.assetClass)];
      const pct = snap?.changePct;
      if (pct == null)   noData++;
      else if (pct > 0)  up++;
      else if (pct < 0)  down++;
      else               noData++; // flat — neither a gainer nor a loser
    });
    return { up, down, noData };
  }, [trackedList, dailyPrices]);

  // Snapshot current commentCount for every tracked idea once per mount/
  // refresh (one write, not per-card) so next visit's newCommentItems can
  // diff against it — same "seen state" pattern whatYouMissed.js uses.
  useEffect(() => {
    if (trackedList.length) saveSeenCommentCounts(me?.id, trackedList);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedList.map(r=>`${r.id}:${r.commentCount}`).join(','), me?.id]);

  const activity = useMemo(() => deriveTrackedActivity(trackedList, recsReceived, {
    mode,
    seenCommentCounts: getSeenCommentCounts(me?.id),
    dailyPrices,
  }), [trackedList, recsReceived, mode, me?.id, dailyPrices]);

  if (tracked.size===0) return (
    <div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:16,boxShadow:'var(--shadow)',overflow:'hidden',marginBottom:12}}>
      <WidgetHeader icon={TrendingUp} label="My Tracked"/>
      <WidgetEmptyState icon="🎯" setPage={setPage}
        title="Track ideas, watch them move"
        sub="Tap the bookmark on any idea to track it — its daily moves show up right here, every time you visit."
      />
    </div>
  );

  // SVG donut — 'tracking' mode is a 2-segment ring (in/out of money vs
  // entry price); 'yesterday' mode is a 3-segment ring (up/down since the
  // previous close, plus a neutral segment for stocks with no snapshot yet)
  // over the SAME total, so the center count never changes between tabs.
  const R=32, cx=40, cy=40, stroke=9, circum=2*Math.PI*R;
  const inDash=circum*(inM/total), outDash=circum*(outM/total);
  const upDash   = dailyMoveSplit ? circum*(dailyMoveSplit.up/total)     : 0;
  const downDash = dailyMoveSplit ? circum*(dailyMoveSplit.down/total)   : 0;
  const navTo=(filter)=>{ setRecoInit({tab:'tracked',moneyFilter:filter}); setPage('recs'); };
  const viewAll=()=>{ setRecoInit({tab:'tracked'}); setPage('recs'); };

  return (
    <div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:16,boxShadow:'var(--shadow)',overflow:'hidden',marginBottom:12}}>
      <WidgetHeader icon={TrendingUp} label="My Tracked"/>
      <div style={{padding:'8px 14px 2px',fontSize:10.5,color:'var(--muted)',lineHeight:1.4}}>
        See what's happening with the ideas you're tracking
      </div>
      <div style={{padding:'10px 14px 12px'}}>
      {/* Since yesterday / Since tracking toggle */}
      <div style={{display:'flex',gap:4,marginBottom:10,background:'var(--surface-2)',borderRadius:8,padding:3}}>
        {[{k:'yesterday',label:'Since yesterday'},{k:'tracking',label:'Since tracking'}].map(o=>(
          <button key={o.k} onClick={()=>setMode(o.k)}
            style={{flex:1,border:'none',borderRadius:6,padding:'5px 4px',fontFamily:'var(--font)',fontSize:10,fontWeight:700,
              cursor:'pointer',transition:'.12s',
              background:mode===o.k?'var(--surface)':'transparent',
              color:mode===o.k?'var(--accent-ink)':'var(--muted)',
              boxShadow:mode===o.k?'0 1px 3px rgba(20,20,50,.1)':'none'}}>
            {o.label}
          </button>
        ))}
      </div>

      <div style={{display:'flex',alignItems:'center',gap:14}}>
        <svg width={80} height={80} style={{flexShrink:0}}>
          {/* background */}
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--line-2)" strokeWidth={stroke}/>
          {mode==='tracking' ? (<>
            {/* out of money — red */}
            {outM>0&&<circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--loss)" strokeWidth={stroke}
              strokeDasharray={`${outDash} ${circum-outDash}`}
              strokeDashoffset={-(circum*(inM/total))}
              strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}/>}
            {/* in the money — green */}
            {inM>0&&<circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--gain)" strokeWidth={stroke}
              strokeDasharray={`${inDash} ${circum-inDash}`}
              strokeDashoffset={0}
              strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}/>}
          </>) : dailyMoveSplit && (<>
            {/* down since yesterday's close — red */}
            {dailyMoveSplit.down>0&&<circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--loss)" strokeWidth={stroke}
              strokeDasharray={`${downDash} ${circum-downDash}`}
              strokeDashoffset={-upDash}
              strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}/>}
            {/* up since yesterday's close — green */}
            {dailyMoveSplit.up>0&&<circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--gain)" strokeWidth={stroke}
              strokeDasharray={`${upDash} ${circum-upDash}`}
              strokeDashoffset={0}
              strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}/>}
          </>)}
          <text x={cx} y={cy+1} textAnchor="middle" dominantBaseline="middle" style={{fontSize:16,fontWeight:800,fill:'var(--ink)'}}>{total}</text>
          <text x={cx} y={cy+14} textAnchor="middle" dominantBaseline="middle" style={{fontSize:8,fill:'var(--muted)'}}>tracked</text>
        </svg>
        <div style={{flex:1}}>
          {mode==='tracking' ? (<>
            <div onClick={()=>navTo('in')} style={{cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 10px',borderRadius:8,marginBottom:5,background:'var(--gain-soft)',transition:'.12s'}}
              onMouseEnter={e=>e.currentTarget.style.opacity='.8'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
              <span style={{fontSize:12,fontWeight:600,color:'var(--gain)'}}>In the money</span>
              <span style={{fontSize:15,fontWeight:800,color:'var(--gain)'}}>{inM}</span>
            </div>
            <div onClick={()=>navTo('out')} style={{cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 10px',borderRadius:8,background:'var(--loss-soft)',transition:'.12s'}}
              onMouseEnter={e=>e.currentTarget.style.opacity='.8'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
              <span style={{fontSize:12,fontWeight:600,color:'var(--loss)'}}>Out of money</span>
              <span style={{fontSize:15,fontWeight:800,color:'var(--loss)'}}>{outM}</span>
            </div>
          </>) : dailyMoveSplit ? (<>
            <div onClick={viewAll} style={{cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 10px',borderRadius:8,marginBottom:5,background:'var(--gain-soft)',transition:'.12s'}}
              onMouseEnter={e=>e.currentTarget.style.opacity='.8'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
              <span style={{fontSize:12,fontWeight:600,color:'var(--gain)'}}>Up today</span>
              <span style={{fontSize:15,fontWeight:800,color:'var(--gain)'}}>{dailyMoveSplit.up}</span>
            </div>
            <div onClick={viewAll} style={{cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 10px',borderRadius:8,background:'var(--loss-soft)',transition:'.12s'}}
              onMouseEnter={e=>e.currentTarget.style.opacity='.8'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
              <span style={{fontSize:12,fontWeight:600,color:'var(--loss)'}}>Down today</span>
              <span style={{fontSize:15,fontWeight:800,color:'var(--loss)'}}>{dailyMoveSplit.down}</span>
            </div>
            {dailyMoveSplit.noData>0 && (
              <div style={{fontSize:9.5,color:'var(--muted)',marginTop:3,paddingLeft:2}}>
                {dailyMoveSplit.noData} more without price history yet
              </div>
            )}
          </>) : (
            <div style={{fontSize:9.5,color:'var(--muted)',marginTop:3,paddingLeft:2}}>
              {dailyPrices===null ? 'Loading price history…' : 'No price history yet for your tracked stocks'}
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Compact activity section — capped list, no empty/padded rows */}
      {activity.length > 0 && activity.map(item => (
        <TrackedActivityRow key={`${item.type}:${item.idea.id}`} item={item} contacts={contacts}/>
      ))}

      <div style={{padding:'10px 14px 12px'}}>
        <button onClick={viewAll} className="btn"
          style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:6,
            background:'var(--surface)',border:'1px solid var(--accent-line)',color:'var(--accent-ink)'}}>
          View all tracked <ChevronRight size={14}/>
        </button>
      </div>
    </div>
  );
}

/* ─── Sidebar Widget: What You Missed (#5) ───────────────────────────────
   Formerly "Missed Opportunities" — a plain return-sorted leaderboard.
   Ranking now lives entirely in src/utils/whatYouMissed.js (candidate
   generation -> scoring -> ranked output); this component only renders
   the {idea, creator, movement, relevance, reason}-shaped results it gets
   back. Deliberately NOT phrased as a stock-gainer leaderboard: framing is
   "an idea from your Circle moved, here's what happened," never "you
   should have bought this." ── */

function WhatYouMissedCard({ item, tracked, toggleTrack }) {
  const { idea: r, creator, movement, reason } = item;
  const [recommenderInfo, setRecommenderInfo] = useState(null);
  useEffect(() => { if (r.from) fetchPublicProfileInfo(r.from).then(setRecommenderInfo); }, [r.from]);

  // Same /investor/:username/idea/:id deep link FreshIdeaCard already uses.
  const goToDetail = async () => {
    let uname = r.from_username || recommenderInfo?.username;
    if (!uname && r.from) uname = (await fetchPublicProfileInfo(r.from))?.username;
    if (uname) openReco(uname, r.id);
  };

  const isGain = movement.direction === 'up';
  const isTracked = tracked?.has(r.id);
  return (
    <div onClick={goToDetail} style={{padding:'10px 14px',borderTop:'1px solid var(--line)',cursor:'pointer',transition:'.12s'}}
      onMouseEnter={e=>e.currentTarget.style.background='var(--surface-2)'}
      onMouseLeave={e=>e.currentTarget.style.background=''}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
        <div style={{minWidth:0}}>
          <div style={{fontWeight:700,fontSize:12,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.assetName}</div>
          <div style={{fontSize:10,color:'var(--muted)',marginTop:1}}>{creator.name.split(' ')[0]} · {fmtDate(r.date)}</div>
        </div>
        <div style={{textAlign:'right',flexShrink:0}}>
          <div style={{fontSize:13,fontWeight:800,color:isGain?'var(--gain)':'var(--loss)'}}>
            {isGain?'+':''}{(movement.pct*100).toFixed(1)}%
          </div>
          <div style={{fontSize:9,color:'var(--muted)'}}>since shared</div>
        </div>
      </div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginTop:4}}>
        <div style={{fontSize:10,color:'var(--muted)'}}>{reason}</div>
        {/* Same bookmark/track CTA the Trending widget's cards use */}
        <button className={"iconbtn"+(isTracked?' on-like':'')} title={isTracked?'Remove from tracked':'Track this idea'}
          onClick={e=>{e.stopPropagation();toggleTrack?.(r.id);}}
          style={isTracked?{width:24,height:24,flexShrink:0,background:'var(--accent-soft)',color:'var(--accent-ink)',borderColor:'var(--accent-line)'}:{width:24,height:24,flexShrink:0}}>
          <Bookmark size={11}/>
        </button>
      </div>
    </div>
  );
}

export function WhatYouMissedWidget({ recsReceived, tracked, toggleTrack, contacts, me, trackedCreatorIds, setPage }) {
  const contactIds = useMemo(() => new Set((contacts||[]).map(c=>c.id)), [contacts]);
  const resolveCreatorName = (r) => contacts.find(x=>x.id===r.from)?.name;

  const results = useMemo(() => rankWhatYouMissed(recsReceived, {
    tracked,
    contactIds,
    trackedCreatorIds,
    seenIds: getSeenIds(me?.id),
    resolveCreatorName,
  }), [recsReceived, tracked, contactIds, trackedCreatorIds, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mark whatever we actually surfaced as seen — one write per widget
  // mount/refresh, not per card. Next visit these decay substantially
  // instead of dominating the widget again.
  useEffect(() => {
    if (results.length) markSeen(me?.id, results.map(x=>x.idea.id));
  }, [results, me?.id]);

  if (!results.length) return (
    <div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:16,boxShadow:'var(--shadow)',overflow:'hidden',marginBottom:12}}>
      <WidgetHeader icon={Zap} label="What You Missed"/>
      <WidgetEmptyState icon="⚡" setPage={setPage}
        title="Never miss a big move"
        sub="Once your Circle's ideas start moving, the biggest swings will surface here first."
      />
    </div>
  );

  return (
    <div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:16,boxShadow:'var(--shadow)',overflow:'hidden',marginBottom:12}}>
      <WidgetHeader icon={Zap} label="What You Missed"/>
      <div style={{padding:'8px 14px 2px',fontSize:10.5,color:'var(--muted)',lineHeight:1.4}}>
        Ideas from your Circle that moved recently
      </div>
      {results.map(item => <WhatYouMissedCard key={item.idea.id} item={item} tracked={tracked} toggleTrack={toggleTrack}/>)}
    </div>
  );
}

/* ─── Sidebar Widget: Trending on MIC (#4) ────────────────────────────────
   A discovery surface, not a leaderboard. All ranking, decay, diversity
   and "why is this trending" reasoning lives in src/utils/trending.js —
   see that module's header for the signals, the weights and the reasoning
   behind them. This component only renders what rankTrending() returns.

   Two things it deliberately does differently from the widget it replaces:
   the pool is the platform-wide public feed rather than the viewer's own
   Pulse pool (that widget called itself "Trending on Platform" while
   ranking the viewer's own circle), and there is no cumulative "% return
   since recommendation" anywhere on the card — that metric belongs on the
   idea's detail/track-record page, not on a discovery card. ── */

function TrendingCard({ item, contacts, me, tracked, toggleTrack, setPublicFeedRecos, ici, isTrackingCreator, onToggleTrackCreator }) {
  const r = item.idea;
  const [recommenderInfo, setRecommenderInfo] = useState(null);
  const [busyCreator, setBusyCreator] = useState(false);

  useEffect(() => { if (r.from) fetchPublicProfileInfo(r.from).then(setRecommenderInfo); }, [r.from]);

  const authorTags = useMemberTagsFor(r.from);
  const cf = useMemo(() => {
    const found = contacts.find(x => x.id === r.from);
    if (found) return found;
    return { name: item.creator.name, initials: initialsOf(item.creator.name), color: '#8d90ad' };
  }, [r.from, contacts, item.creator.name]);

  const username = r.from_username || recommenderInfo?.username || null;
  const isBuy = (r.recommendation_type || r.recType || 'Buy') === 'Buy';
  const isTracked = tracked?.has(r.id);

  // Same deep link every other Pulse card uses — /investor/:username/idea/:id.
  const goToDetail = async () => {
    let uname = username;
    if (!uname && r.from) uname = (await fetchPublicProfileInfo(r.from))?.username;
    if (uname) openReco(uname, r.id);
  };

  // Trending items come from the platform-wide public pool, so their local
  // state lives in publicFeedRecos. Mirrors FreshIdeaCard's patch()/react()
  // rather than duplicating the like logic.
  const patch = (updates) => {
    setPublicFeedRecos?.(rs => rs.map(x => x.id === r.id ? { ...x, ...updates } : x));
  };

  const react = (e) => {
    e.stopPropagation();
    if (!me?.id) return;
    const next = r.reaction === 'like' ? 'none' : 'like';
    let likes = r.likes || 0;
    if (r.reaction === 'like') likes = Math.max(0, likes - 1);
    if (next === 'like') likes++;
    patch({ reaction: next, likes });
    dbReactToReco(r.id, next === 'like' ? 'like' : null, next === 'like' ? { likerName: me.name || 'Someone' } : null)
      .catch(err => console.error('[like] ✗ failed:', err?.message));
  };

  const trackCreator = async (e) => {
    e.stopPropagation();
    if (!r.from || busyCreator) return;
    setBusyCreator(true);
    try { await onToggleTrackCreator?.(r.from, !isTrackingCreator); }
    finally { setBusyCreator(false); }
  };

  return (
    <div
      onClick={goToDetail}
      style={{padding:'10px 14px',borderTop:'1px solid var(--line)',cursor:'pointer',transition:'.12s'}}
      onMouseEnter={e=>e.currentTarget.style.background='var(--surface-2)'}
      onMouseLeave={e=>e.currentTarget.style.background=''}
    >
      {/* WHO — creator first, since noticing the creator is half the point */}
      <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:6}}>
        <div style={{position:'relative',width:22,height:22,flexShrink:0}}>
          {cf.avatarUrl
            ? <img src={cf.avatarUrl} alt="" className="av" style={{width:22,height:22,objectFit:'cover'}}/>
            : <div className="av" style={{width:22,height:22,background:cf.color||'var(--grad)',fontSize:9}}>
                {cf.initials||initialsOf(cf.name)}
              </div>}
          <MemberBadgeOverlay tags={authorTags} size={22}/>
        </div>
        <div style={{flex:1,minWidth:0,display:'flex',alignItems:'center',gap:5,flexWrap:'wrap'}}>
          <span style={{fontWeight:700,fontSize:11.5,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:96}}>
            {cf.name.split(' ')[0]}
          </span>
          {ici && (
            <span style={{fontSize:9,fontWeight:800,padding:'1px 5px',borderRadius:999,
              background: ici.score>=70?'rgba(74,222,128,.15)':ici.score>=50?'rgba(124,92,252,.15)':'rgba(251,191,36,.15)',
              color:      ici.score>=70?'#22863a':ici.score>=50?'#6d4fc7':'#b07a00'}}>
              ICI {Math.round(ici.score)}
            </span>
          )}
          {item.affiliated && (
            <span style={{fontSize:9,fontWeight:700,color:'var(--muted)'}}>in your circle</span>
          )}
        </div>
        {r.from && r.from !== me?.id && (
          <button
            onClick={trackCreator}
            disabled={busyCreator}
            title={isTrackingCreator ? 'Stop tracking this investor' : 'Track this investor'}
            style={{flexShrink:0,fontSize:9.5,fontWeight:800,padding:'2px 8px',borderRadius:999,cursor:'pointer',
              fontFamily:'var(--font)',transition:'.12s',opacity: busyCreator ? 0.6 : 1,
              background: isTrackingCreator ? 'var(--accent-soft)' : 'transparent',
              color:      isTrackingCreator ? 'var(--accent-ink)' : 'var(--accent-ink)',
              border:     `1px solid var(--accent-line)`}}
          >
            {isTrackingCreator ? 'Tracking' : '+ Track'}
          </button>
        )}
      </div>

      {/* WHAT — instrument + direction. No cumulative % return, by design. */}
      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4,flexWrap:'wrap'}}>
        <span style={{fontWeight:800,fontSize:12.5,letterSpacing:'-.2px'}}>{r.assetName}</span>
        <span style={{fontSize:9.5,fontWeight:700,padding:'1px 6px',borderRadius:5,
          background:isBuy?'var(--gain-soft)':'var(--loss-soft)',color:isBuy?'var(--gain)':'var(--loss)'}}>
          {isBuy?'Buy':'Sell'}
        </span>
      </div>

      {/* WHY the idea — thesis, with a real "Read more" (links render as links).
           Plain text/links bubble to the card's click-through; Read more/Show
           less stop their own propagation (see ThesisRenderer). */}
      {r.thesis && r.thesis!=='—' && (
        <div style={{fontSize:11,lineHeight:1.45,marginBottom:5}}>
          <ThesisRenderer thesis={r.thesis} previewLines={2}/>
        </div>
      )}

      {/* WHY it's trending — always a real, sourced signal */}
      <div style={{fontSize:10,fontWeight:700,color:'var(--accent-ink)',marginBottom:6,display:'flex',alignItems:'center',gap:4}}>
        <span>{item.reason.icon}</span>{item.reason.text}
      </div>

      {/* Interactions — existing handlers, never bubbling into navigation */}
      <div style={{display:'flex',alignItems:'center',gap:4}} onClick={e=>e.stopPropagation()}>
        <button className={"iconbtn"+(r.reaction==='like'?' on-like':'')} title="Like" onClick={react} style={{width:24,height:24}}>
          <ThumbsUp size={11}/>
        </button>
        <span style={{fontSize:10,fontWeight:700,color:'var(--muted)',minWidth:10}}>{r.likes||0}</span>
        <button className="iconbtn" title="Comment" onClick={goToDetail} style={{width:24,height:24}}><MessageSquare size={11}/></button>
        {(r.commentCount||0)>0 && <span style={{fontSize:10,fontWeight:700,color:'var(--muted)'}}>{r.commentCount}</span>}
        <button className={"iconbtn"+(isTracked?' on-like':'')} title={isTracked?'Remove from tracked':'Track this idea'}
          onClick={()=>toggleTrack?.(r.id)}
          style={isTracked?{width:24,height:24,marginLeft:'auto',background:'var(--accent-soft)',color:'var(--accent-ink)',borderColor:'var(--accent-line)'}:{width:24,height:24,marginLeft:'auto'}}>
          <Bookmark size={11}/>
        </button>
      </div>
      <IdeaDisclaimer compact divider/>
    </div>
  );
}

export function TrendingWidget({ publicFeedRecos = [], setPublicFeedRecos, contacts = [], me, tracked, toggleTrack, trackedCreatorIds, setTrackedCreatorIds, onSeeAll, setPage }) {
  const contactIds = useMemo(() => new Set((contacts||[]).map(c=>c.id)), [contacts]);
  const resolveCreatorName = (r) => contacts.find(x=>x.id===r.from)?.name;

  // The pool is publicFeedRecos — every public recommendation on the
  // platform — NOT the viewer's merged Pulse pool. That is the point of
  // this widget; see src/utils/trending.js's header.
  const results = useMemo(() => rankTrending(publicFeedRecos, {
    contactIds,
    trackedCreatorIds,
    seenState: getTrendingSeenState(me?.id),
    resolveCreatorName,
  }), [publicFeedRecos, contactIds, trackedCreatorIds, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Record what we surfaced (and its engagement level at the time) so next
  // visit shows something different unless these kept accelerating. One
  // write per render, not per card.
  useEffect(() => {
    if (results.length) markTrendingSeen(me?.id, results);
  }, [results, me?.id]);

  // Real ICI for the (at most three) creators shown — one batched call,
  // same pattern as FreshIdeasWidget. Never per-card.
  const [iciScores, setIciScores] = useState({});
  useEffect(() => {
    const uids = [...new Set(results.map(x=>x.creator.id).filter(Boolean))];
    if (!uids.length) { setIciScores({}); return; }
    dbGetInvestorIciBatch(uids).then(rows => {
      const scores = {};
      rows.forEach(row => {
        const hitPct  = row.closed > 0 ? (row.wins / row.closed * 100) : 0;
        const riskAdj = Number(row.ret_stddev) > 0 ? Math.max(Number(row.median_ret) / Number(row.ret_stddev), 0) : 0;
        scores[row.uid] = computeIci({
          years_history: Number(row.years_history) || 0, total: row.total, hit_rate_pct: hitPct,
          median_return: Number(row.median_ret) || 0, risk_adjusted_return: riskAdj, deleted_count: 0,
        });
      });
      setIciScores(scores);
    }).catch(()=>{});
  }, [results]);

  // Track/untrack the creator, reusing the existing tracking API and the
  // creator-id Set App.jsx already maintains — no new tracking logic.
  const toggleTrackCreator = async (creatorId, next) => {
    setTrackedCreatorIds?.(prev => {
      const s = new Set(prev); if (next) s.add(creatorId); else s.delete(creatorId); return s;
    });
    try {
      if (next) await dbTrackInvestor(creatorId); else await dbUntrackInvestor(creatorId);
    } catch (e) {
      console.warn('[track creator] ✗ failed:', e?.message);
      setTrackedCreatorIds?.(prev => {
        const s = new Set(prev); if (next) s.delete(creatorId); else s.add(creatorId); return s;
      });
    }
  };

  // No candidates = nothing genuinely trending yet.
  if (!results.length) return (
    <div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:16,boxShadow:'var(--shadow)',overflow:'hidden',marginBottom:12}}>
      <WidgetHeader icon={Flame} label="Trending on MIC"/>
      <WidgetEmptyState icon="🔥" setPage={setPage}
        title="The buzz is just getting started"
        sub="As more investors join in and engage, the most talked-about calls on MIC will show up here."
      />
    </div>
  );

  return (
    <div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:16,boxShadow:'var(--shadow)',overflow:'hidden',marginBottom:12}}>
      <WidgetHeader icon={Flame} label="Trending on MIC"/>
      <div style={{padding:'8px 14px 2px',fontSize:10.5,color:'var(--muted)',lineHeight:1.4}}>
        What the whole platform is engaging with right now
      </div>
      {results.map(item => (
        <TrendingCard key={item.idea.id} item={item} contacts={contacts} me={me}
          tracked={tracked} toggleTrack={toggleTrack} setPublicFeedRecos={setPublicFeedRecos}
          ici={iciScores[item.creator.id]}
          isTrackingCreator={!!trackedCreatorIds?.has(item.creator.id)}
          onToggleTrackCreator={toggleTrackCreator}/>
      ))}
      <div style={{padding:'10px 14px 12px'}}>
        <button onClick={onSeeAll} className="btn"
          style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:6,
            background:'var(--surface)',border:'1px solid var(--accent-line)',color:'var(--accent-ink)'}}>
          See all trending <ChevronRight size={14}/>
        </button>
      </div>
    </div>
  );
}

/* ─── FeedBrewingState — initial-load state, distinct from a genuinely empty feed ── */
function FeedBrewingState() {
  return (
    <div className="feed-brewing" role="status" aria-live="polite">
      <div className="feed-brewing-art" aria-hidden="true">
        <span className="feed-brewing-badge feed-brewing-badge-1"><Lightbulb size={15}/></span>
        <span className="feed-brewing-badge feed-brewing-badge-2"><TrendingUp size={15}/></span>
        <span className="feed-brewing-badge feed-brewing-badge-3"><Sparkles size={13}/></span>
        <svg className="feed-brewing-cup" viewBox="0 0 160 100" width="128" height="80">
          <defs>
            <linearGradient id="feed-brewing-cup-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#8676ff"/>
              <stop offset="100%" stopColor="#5a49e6"/>
            </linearGradient>
          </defs>
          <path className="feed-brewing-steam feed-brewing-steam-1" d="M52 24 Q46 16 52 8 Q58 0 52 -8" fill="none" strokeLinecap="round"/>
          <path className="feed-brewing-steam feed-brewing-steam-2" d="M66 24 Q60 16 66 8 Q72 0 66 -8" fill="none" strokeLinecap="round"/>
          <path className="feed-brewing-steam feed-brewing-steam-3" d="M80 24 Q74 16 80 8 Q86 0 80 -8" fill="none" strokeLinecap="round"/>
          {/* Modeled on a real cup reference photo: the body is a rounded
              barrel (not a flat-sided trapezoid) with a light-to-dark
              gradient standing in for the photo's curved, glazed ceramic,
              and the handle is a proper closed ring rather than a bare
              stroke. Recolored into the app's own accent + cream/coffee
              palette rather than the photo's literal sage-green. No
              saucer and no foam art — just the cup and the coffee. */}
          {/* Handle: a closed ring (outer + inner cutout via evenodd), not
              a bare thick stroke, so it reads as an actual loop you could
              put a finger through. */}
          <path className="feed-brewing-handle" fillRule="evenodd" d="
            M105 52
            C 138 48, 142 82, 108 86
            C 130 78, 128 58, 105 62
            Z"/>
          {/* Tapered foot (narrower base than rim, rounded corners) — with
              the saucer removed the cup needs its own grounded silhouette
              rather than a flat-cut slab bottom. */}
          <path className="feed-brewing-cupbody" d="
            M33 46
            C 30 64, 31 80, 39 89
            Q 44 96 52 96
            L 90 96
            Q 98 96 103 89
            C 111 80 112 64 109 46
            Z"/>
          <ellipse className="feed-brewing-rim-outer" cx="71" cy="46" rx="38" ry="12"/>
          <ellipse className="feed-brewing-liquid" cx="71" cy="45" rx="32" ry="9"/>
          {/* Gloss highlight tracing the cup's near edge, like the photo's
              light catching the left side of the glaze. */}
          <path className="feed-brewing-gloss" d="M42 54 C 39 68, 39 80, 44 89" fill="none" strokeLinecap="round"/>
        </svg>
      </div>
      <div className="feed-brewing-title">Great ideas from your circle are brewing</div>
      <div className="feed-brewing-bar"><div className="feed-brewing-bar-fill"/></div>
      <div className="feed-brewing-caption muted small">Preparing your feed…</div>
    </div>
  );
}

/* ─── HomeFeed — redesigned hero page ──────────────────────────────────────────── */

export function HomeFeed({ isMobile, setPage, setRecoInit, recsReceived, setRecsReceived, configs, holdings, contacts, me, assetClasses, setAssetClasses, groups, recsMade=[], setRecsMade, tracked, toggleTrack, effectiveFeedConfig, networkEngagementRecos, setNetworkEngagementRecos, publicFeedRecos=[], setPublicFeedRecos, feedConfigOptions, userFeedPrefs, setUserFeedPrefs, globalSearch, connections=[], onPeopleConnect, onShowInvite, onOpenSecurity, feedLoading=false, trackedCreatorIds, setTrackedCreatorIds, initTab, onInitTabConsumed }) {
  const firstName = me?.firstName || me?.name?.split(' ')[0] || 'there';
  const [showNewReco,    setShowNewReco]    = useState(false);
  // 'feed' | 'pulse' — Pulse is the default home experience. Drives which
  // section is visible on BOTH mobile and desktop now: a permanent
  // side-by-side Pulse+Feed layout on desktop looked cramped and imbalanced
  // (a narrow widget column squeezed against a full feed) — one focused
  // section at a time, switched via tabs, is the same fix mobile already
  // had. Both sections stay mounted regardless of which is visible (see the
  // display:none toggle below, not conditional rendering) so a widget's own
  // data fetch / scroll position isn't lost when switching tabs back and forth.
  const [feedTab,  setFeedTab]  = useState(initTab || 'pulse');
  // One-shot: which tab to land on next, driven by how the user navigated here —
  // the top Home icon always requests 'pulse'; DISCOVER > Ideas in the sidebar
  // requests 'feed' on mobile (see App.jsx's homeInitTab).
  useEffect(() => {
    if (initTab) { setFeedTab(initTab); onInitTabConsumed && onInitTabConsumed(); }
  }, [initTab]); // eslint-disable-line react-hooks/exhaustive-deps
  // Merged pool for Pulse widgets: direct deliveries + public platform recommendations
  // Deduped so items already in recsReceived don't appear twice.
  const allFeedRecos = useMemo(() => {
    const seenIds = new Set(recsReceived.map(r => r.id));
    return [
      ...recsReceived,
      ...publicFeedRecos.filter(r => !seenIds.has(r.id)),
    ];
  }, [recsReceived, publicFeedRecos]);

  // Pulse badge count: missed opportunities (untracked, risen >3%) + tracked movers (±7%)
  // Capped at 5; badge disappears when user is already on Pulse tab.
  const pulseCountRaw = allFeedRecos.filter(r =>
    !r.hidden && r.priceAt > 0 && (
      (!tracked.has(r.id) && (r.price - r.priceAt) / r.priceAt > 0.03) ||
      (tracked.has(r.id) && Math.abs((r.price - r.priceAt) / r.priceAt) > 0.07)
    )
  ).length;
  const pulseCount    = Math.min(pulseCountRaw, 5);
  const pulseBadgeText = pulseCount >= 5 ? '5+' : pulseCount > 0 ? String(pulseCount) : null;
  const showPulseBadge = !!pulseBadgeText && feedTab !== 'pulse';
  const [loadedCount,  setLoadedCount]  = useState(20);
  const sentinelObsRef = useRef(null);
  // Callback ref (not useRef+useEffect) — the sentinel div is conditionally
  // rendered (only while there's more to load), so it mounts/unmounts
  // repeatedly as loadedCount and feedRecs.length change. A plain useEffect
  // keyed on a static dep array only attaches the IntersectionObserver once
  // and never re-attaches to the new DOM node after a remount, which is what
  // was causing "Loading more…" to spin forever once the sentinel node was
  // replaced. A callback ref runs on every mount/unmount of the node itself,
  // so the observer is always watching the currently-rendered sentinel.
  const sentinelRef = useCallback((node) => {
    if (sentinelObsRef.current) { sentinelObsRef.current.disconnect(); sentinelObsRef.current = null; }
    if (node) {
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setLoadedCount(n => n + 20); },
        { rootMargin: '300px' }
      );
      obs.observe(node);
      sentinelObsRef.current = obs;
    }
  }, []);

  const feedRecs = useMemo(() => {
    const cfg = effectiveFeedConfig;
    const directIds = new Set(recsReceived.map(r=>r.id));
    let items = recsReceived.filter(r=>!r.hidden).map(r=>({...r, feedSource: r.feedSource||'direct'}));

    // Source 2: recommendations liked/commented on by connections
    if (cfg.src_network_engagement) {
      const extra = networkEngagementRecos.filter(r=>!directIds.has(r.id));
      items = [...items, ...extra];
    }

    // Source 3: public recommendations from all users across the platform
    // cfg.src_public defaults to true (undefined = enabled)
    if (cfg.src_public !== false) {
      const seenIds = new Set(items.map(r=>r.id));
      const pubExtra = publicFeedRecos.filter(r => !seenIds.has(r.id));
      items = [...items, ...pubExtra];
    }

    if (cfg.filter_hide_invested) items = items.filter(r=>!r.invested);
    const contactIds = new Set((contacts||[]).map(c=>c.id));
    return items
      .map(r=>({...r, _score: scoreFeedRec(r, tracked, cfg, contactIds)}))
      .sort((a,b)=>b._score-a._score);
  }, [recsReceived, networkEngagementRecos, publicFeedRecos, tracked, effectiveFeedConfig, contacts]);

  // Search filter applied to all currently loaded items
  const visibleFeed = useMemo(() => {
    const q = (globalSearch||'').trim().toLowerCase();
    const base = feedRecs.slice(0, loadedCount);
    if (!q) return base;
    return base.filter(r =>
      r.assetName?.toLowerCase().includes(q) ||
      r.ticker?.toLowerCase().includes(q) ||
      r.byName?.toLowerCase().includes(q) ||
      contacts.find(c=>c.id===r.from)?.name?.toLowerCase().includes(q) ||
      contacts.find(c=>c.id===r.from)?.username?.toLowerCase().includes(q)
    );
  }, [feedRecs, loadedCount, globalSearch, contacts]);

  // Reset page when search changes
  useEffect(() => { setLoadedCount(20); }, [globalSearch]);

  return (
    <>
    {/* ── Mobile: header + tabs merged into one fixed block ──────────────
         Keeps Welcome, Recommend an idea, and Feed/Pulse tabs pinned
         below the topbar at ALL scroll depths. Nothing overlaps content
         because the 112px spacer below reserves the exact same height
         in the flow.                                                 ── */}
    {isMobile && !showNewReco && (
      <div style={{
        position:'fixed', top:64, left:0, right:0, zIndex:185,
        background:'var(--surface)',
        borderBottom:'2px solid var(--line)',
        boxShadow:'0 2px 8px rgba(0,0,0,.07)',
      }}>
        {/* Row 1 — Welcome greeting + Recommend button */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'10px 16px 0', gap:10,
        }}>
          <div style={{minWidth:0}}>
            <div style={{fontSize:17,fontWeight:800,letterSpacing:'-.3px',lineHeight:1.2}}>
              Welcome back, {firstName}! 👋
            </div>
            <div style={{fontSize:11,color:'var(--muted)',marginTop:1}}>Your daily investment dose</div>
          </div>
          <button
            className="btn btn-pri btn-sm"
            onClick={()=>setShowNewReco(true)}
            style={{flexShrink:0}}
          >
            <Lightbulb size={14}/> New idea
          </button>
        </div>
        {/* Row 2 — Pulse / Feed tab switcher — Pulse first/left, the default home experience */}
        <div role="tablist" style={{display:'flex', gap:8, padding:'8px 16px 8px'}}>
          {[
            { id:'pulse', label:'Pulse', sub:'Your daily investment dose' },
            { id:'feed',  label:'Feed',  sub:'Ideas from your network' },
          ].map(({id, label, sub})=>{
            const isActive = feedTab === id;
            return (
              <button key={id} role="tab" aria-selected={isActive}
                onClick={()=>setFeedTab(id)}
                style={{
                  flex:1, height:48, border:'none', borderRadius:10,
                  fontFamily:'var(--font)', cursor:'pointer', transition:'.15s',
                  display:'flex', flexDirection:'column',
                  alignItems:'center', justifyContent:'center', gap:2,
                  background: isActive ? 'var(--accent)' : 'transparent',
                  color:      isActive ? '#fff' : 'var(--muted)',
                  padding:0,
                }}
              >
                <div style={{display:'flex', alignItems:'center', gap:5}}>
                  <span style={{fontSize:13, fontWeight:800, lineHeight:1}}>{label}</span>
                  {id==='pulse' && showPulseBadge && (
                    <span style={{
                      background: isActive ? 'rgba(255,255,255,.28)' : 'var(--grad)',
                      color:'#fff', fontSize:10, fontWeight:800,
                      borderRadius:999, padding:'1px 5px', lineHeight:1.4,
                      flexShrink:0,
                    }}>{pulseBadgeText}</span>
                  )}
                </div>
                <span style={{
                  fontSize:9, fontWeight:400, lineHeight:1,
                  color: isActive ? 'rgba(255,255,255,.72)' : 'var(--muted)',
                  letterSpacing:'.01em',
                }}>{sub}</span>
              </button>
            );
          })}
        </div>
      </div>
    )}
    {/* Spacer = fixed header height. Grew by ~18px vs. the old single-line
        greeting once the "Your daily investment dose" subtitle was added
        below it — bumped to 130px (was 112px) so it still reserves the
        exact height in the flow and nothing hides underneath. */}
    {isMobile && !showNewReco && <div aria-hidden="true" style={{height:130,flexShrink:0}}/>}

    {/* ── Desktop: normal in-flow header + tab switcher ──
         The small .seg pill row this started as went unnoticed — new users
         landing on Home never realized Feed was one click away. Now two
         large, card-style buttons (with the same label+subtitle mobile's
         tab bar already has) instead of a compact pill, so the tab
         switcher itself reads as a primary piece of the page, not a minor
         control easy to skim past. ── */}
    {!isMobile && (<>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:10}}>
        <div>
          <div style={{fontSize:22,fontWeight:800,letterSpacing:'-.4px'}}>Welcome back, {firstName}! 👋</div>
          <div style={{fontSize:13,color:'var(--muted)',marginTop:2}}>Your daily investment dose</div>
        </div>
        <button className="btn btn-pri btn-sm" onClick={()=>setShowNewReco(true)} style={{marginLeft:'auto'}}>
          <Lightbulb size={14}/> New idea
        </button>
      </div>
      <div role="tablist" style={{display:'flex',gap:14,marginBottom:22}}>
        {[
          { id:'pulse', label:'Pulse', sub:'Your daily investment dose' },
          { id:'feed',  label:'Feed',  sub:'Ideas from your network' },
        ].map(({id,label,sub})=>{
          const isActive = feedTab===id;
          return (
            <button key={id} role="tab" aria-selected={isActive} onClick={()=>setFeedTab(id)}
              style={{
                flex:'0 1 280px', textAlign:'left', cursor:'pointer', fontFamily:'var(--font)',
                borderRadius:14, padding:'14px 20px', transition:'.15s',
                border: isActive ? '2px solid var(--accent)' : '1px solid var(--line)',
                background: isActive ? 'var(--accent-soft)' : 'var(--surface)',
                boxShadow: isActive ? '0 3px 14px rgba(109,93,245,.15)' : 'none',
              }}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:16,fontWeight:800,color:isActive?'var(--accent-ink)':'var(--ink)'}}>{label}</span>
                {id==='pulse' && showPulseBadge && (
                  <span className="nav-badge" style={{position:'static'}}>{pulseBadgeText}</span>
                )}
              </div>
              <div style={{fontSize:12,color:isActive?'var(--accent-ink)':'var(--muted)',marginTop:2,opacity:isActive?.8:1}}>{sub}</div>
            </button>
          );
        })}
      </div>
    </>)}
    <div>

      {/* ── Pulse section: shown only on the Pulse tab. Mobile = single
           vertical stack (unchanged); desktop = a 2-column grid now that it
           has the full page width to itself instead of a squeezed 252px
           aside, capped at a sensible max-width so it doesn't stretch thin
           across a very wide monitor. Widget order: Fresh Ideas, Trending,
           What You Missed, My Tracked. Stays mounted when the Feed tab is
           active (display:none, not unmounted) so its data fetches and any
           local state survive switching tabs back and forth. ── */}
      <div style={{ display: feedTab==='feed' ? 'none' : undefined }}>
        {/* Same "brewing" filler the Feed section shows while the initial
            post-login data load is in flight — shown here too now that
            Pulse is the default tab, so whichever tab the user lands on
            (or quickly switches to before data arrives) sees it rather
            than a blank widget column. */}
        {feedLoading ? <FeedBrewingState/> : (<>
        {/* Widget #1 — Fresh Ideas (network + public platform).
            Each Pulse widget gets its own error boundary so one widget's
            bug shows a small inline "failed to load" card instead of
            blanking the whole Pulse section (or, without any boundary
            above HomeFeed at all, the whole app). Single vertical stack,
            same as mobile, just spanning the full page width now instead
            of a narrow 252px aside — a 2-column arrangement (grid or
            masonry) read as busier and harder to scan than one wide,
            unhurried column of full-width cards. */}
        <SectionErrorBoundary label="Fresh Ideas">
          <FreshIdeasWidget recsReceived={allFeedRecos} contacts={contacts} groups={groups} me={me} tracked={tracked} toggleTrack={toggleTrack}
            setRecsReceived={setRecsReceived} setPublicFeedRecos={setPublicFeedRecos} setNetworkEngagementRecos={setNetworkEngagementRecos}
            setPage={setPage}
            onViewAll={()=>setFeedTab('feed')}/>
        </SectionErrorBoundary>

        {/* Widget #2 — Trending on MIC.
            Fed publicFeedRecos (the platform-wide public pool), not
            allFeedRecos: this is a discovery surface and must be able to
            show creators the viewer has never encountered. "See all"
            switches to the Feed tab, where public platform ideas live. */}
        <SectionErrorBoundary label="Trending on MIC">
          <TrendingWidget publicFeedRecos={publicFeedRecos} setPublicFeedRecos={setPublicFeedRecos}
            contacts={contacts} me={me} tracked={tracked} toggleTrack={toggleTrack}
            trackedCreatorIds={trackedCreatorIds} setTrackedCreatorIds={setTrackedCreatorIds}
            setPage={setPage}
            onSeeAll={()=>setFeedTab('feed')}/>
        </SectionErrorBoundary>

        {/* Widget #3 — What You Missed */}
        <SectionErrorBoundary label="What You Missed">
          <WhatYouMissedWidget recsReceived={allFeedRecos} tracked={tracked} toggleTrack={toggleTrack} contacts={contacts} me={me} trackedCreatorIds={trackedCreatorIds} setPage={setPage}/>
        </SectionErrorBoundary>

        {/* Widget #4 — Tracked Summary Donut (My Tracked) */}
        <SectionErrorBoundary label="My Tracked">
          <TrackedSummaryWidget recsReceived={allFeedRecos} tracked={tracked} setPage={setPage} setRecoInit={setRecoInit} me={me} contacts={contacts}/>
        </SectionErrorBoundary>
        </>)}

        {/* ── Market Insights + Invite Friends — compact, side-by-side clickable
             cards, bottom of Pulse, both mobile + desktop. "Market Insights"
             matches the page's actual current name (App.jsx's nav already
             calls it that — "Market Intelligence" was the old name, stale
             only here). ── */}
        <div style={{display:'flex',gap:10,flexWrap:'nowrap',marginTop:isMobile?0:16,marginBottom:12}}>
          <div onClick={()=>setFeedTab('feed')}
            style={{flex:'1 1 140px',cursor:'pointer',background:'var(--surface)',border:'1px solid var(--line)',borderRadius:14,padding:'12px 14px',transition:'.12s'}}
            onMouseEnter={e=>e.currentTarget.style.boxShadow='0 3px 14px rgba(20,20,50,.08)'}
            onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}>
            <Lightbulb size={15} color="var(--accent-ink)"/>
            <div style={{fontWeight:800,fontSize:12,marginTop:6}}>Feed</div>
            <div style={{fontSize:10.5,color:'var(--muted)',marginTop:2,lineHeight:1.4}}>Ideas from your network</div>
          </div>
          <div onClick={()=>setPage('market_intel')}
            style={{flex:'1 1 140px',cursor:'pointer',background:'var(--surface)',border:'1px solid var(--line)',borderRadius:14,padding:'12px 14px',transition:'.12s'}}
            onMouseEnter={e=>e.currentTarget.style.boxShadow='0 3px 14px rgba(20,20,50,.08)'}
            onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}>
            <TrendingUp size={15} color="var(--accent-ink)"/>
            <div style={{fontWeight:800,fontSize:12,marginTop:6}}>Market Insights</div>
            <div style={{fontSize:10.5,color:'var(--muted)',marginTop:2,lineHeight:1.4}}>Consensus, trends &amp; sentiment</div>
          </div>
          <div onClick={onShowInvite}
            style={{flex:'1 1 140px',cursor:'pointer',background:'var(--surface)',border:'1px solid var(--line)',borderRadius:14,padding:'12px 14px',transition:'.12s'}}
            onMouseEnter={e=>e.currentTarget.style.boxShadow='0 3px 14px rgba(20,20,50,.08)'}
            onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}>
            <UserPlus size={15} color="var(--accent-ink)"/>
            <div style={{fontWeight:800,fontSize:12,marginTop:6}}>Invite Friends</div>
            <div style={{fontSize:10.5,color:'var(--muted)',marginTop:2,lineHeight:1.4}}>Share your invite link</div>
          </div>
        </div>
      </div>

      {/* ── Feed section: shown only on the Feed tab, full page width. ── */}
      <div style={{ display: feedTab==='pulse' ? 'none' : undefined }}>

        {/* Feed cards — searched via top nav bar */}
        {feedLoading && !globalSearch
          ? <FeedBrewingState/>
          : visibleFeed.length===0
          ? <div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:18,padding:'48px 32px',textAlign:'center',boxShadow:'var(--shadow)'}}>
              <div style={{fontSize:40,marginBottom:14}}>{globalSearch?'🔍':'🌱'}</div>
              <div style={{fontWeight:700,fontSize:17,marginBottom:8}}>
                {globalSearch?`No results for "${globalSearch}"`:'Your feed is empty'}
              </div>
              <div className="muted small" style={{marginBottom:22,maxWidth:340,margin:'0 auto 22px',lineHeight:1.6}}>
                {globalSearch?'Try a different search term.':'Add people to your network — their ideas will appear here.'}
              </div>
              {!globalSearch&&<div style={{display:'flex',gap:10,justifyContent:'center'}}>
                <button className="btn btn-pri btn-sm" onClick={()=>setPage('network')}><Users size={14}/> Add connections</button>
                <button className="btn btn-ghost btn-sm" onClick={()=>setShowNewReco(true)}><Lightbulb size={14}/> New idea</button>
              </div>}
            </div>
          : (<>
              {visibleFeed.map(r=>(
                <SectionErrorBoundary key={r.id} label="This idea">
                  <FeedCard r={r} me={me} contacts={contacts} groups={groups}
                    setRecsReceived={setRecsReceived} setPublicFeedRecos={setPublicFeedRecos} setNetworkEngagementRecos={setNetworkEngagementRecos} tracked={tracked} toggleTrack={toggleTrack} onOpenSecurity={onOpenSecurity}/>
                </SectionErrorBoundary>
              ))}
              {!globalSearch && loadedCount < feedRecs.length && (
                <div ref={sentinelRef} style={{height:8,textAlign:'center',padding:'12px 0',color:'var(--muted)',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                  <Loader size={13} className="spin"/> Loading more…
                </div>
              )}
              {(globalSearch || loadedCount >= feedRecs.length) && feedRecs.length > 0 && (
                <div style={{textAlign:'center',padding:'14px 0',color:'var(--muted)',fontSize:12}}>
                  {globalSearch
                    ? `${visibleFeed.length} result${visibleFeed.length!==1?'s':''} in feed`
                    : `✓ All ${feedRecs.length} idea${feedRecs.length!==1?'s':''} loaded`}
                </div>
              )}
            </>)}
      </div>
    </div>

    {showNewReco && (
      <MakeRecoModal
        assetClasses={assetClasses} setAssetClasses={setAssetClasses}
        contacts={contacts} groups={groups} holdings={holdings} me={me}
        recsMade={recsMade}
        onClose={()=>setShowNewReco(false)}
        onCreate={(rec)=>{ setRecsMade(rs=>[rec,...rs]); }}
      />
    )}
  </>
  );
}
/* =================================================================== INSTRUMENTS */
// Module-level cache — loaded once per browser session from Neon

