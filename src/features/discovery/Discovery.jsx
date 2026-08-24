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
  updateDelivery as dbUpdateDelivery
} from "../../services/api/recommendationsApi";
import {
  reactToReco as dbReactToReco,
  trackReco as dbTrackReco,
  getMyTrackedRecos as dbGetMyTrackedRecos
} from "../../services/api/engagementApi";
import { ConsensusBar, ConvBadge, InstrumentSearch, SectionErrorBoundary, SparkLine, WidgetHeader } from "../../components/common";
import { FeedCard, IdeaSharePopover, InvestedToggle, MakeRecoModal, ThesisRenderer } from "../recommendations/Recommendations";
import { useDerivedHoldings, useIsMobile } from "../../hooks/index";
import { computeConsensus, computeTrend, consensusStrengthColor, fmtDate, getThesisText, initialsOf, scoreFeedRec } from "../../utils/format";
import { fetchPublicProfileInfo, openProfile } from "../../utils/navigation";
import { getSeenIds, markSeen, rankWhatYouMissed } from "../../utils/whatYouMissed";
import { getSeenState as getTrendingSeenState, markSeen as markTrendingSeen, rankTrending } from "../../utils/trending";
import { trackInvestor as dbTrackInvestor, untrackInvestor as dbUntrackInvestor } from "../../services/api/trackingApi";
import { deriveTrackedActivity, getSeenCommentCounts, saveSeenCommentCounts } from "../../utils/trackedActivity";
import { getDailyPrices, byTicker, priceKey } from "../../services/api/pricingApi";

// A recommendation counts as "fresh" while it's inside this window — same
// created_at ordering the rest of the feed already uses (r.date), just
// thresholded for the "New" badge. No separate unseen/last-viewed concept
// exists in the data model, so we don't invent one here.
const FRESH_WINDOW_MS = 48 * 60 * 60 * 1000;

/* ─── Compact "daily briefing" card for a single fresh idea ─────────────
   Distinct from the full FeedCard: no % return, tighter layout, and the
   whole card is a real navigable link to the recommendation's dedicated,
   shareable page (#/investor/:username/reco/:id — reused, not reinvented).
   Like / Bookmark / Mark-invested / Share all call the same handlers and
   API functions FeedCard uses; Comment is a lightweight entry point that
   opens the same detail page (where the comment thread lives). ── */
function FreshIdeaCard({ r, contacts, groups, me, tracked, toggleTrack, setRecsReceived, setPublicFeedRecos, setNetworkEngagementRecos, ici }) {
  const [recommenderInfo, setRecommenderInfo] = useState(null); // { username, isSebiApproved }
  const [shareAnchor, setShareAnchor] = useState(null);
  const [showShare, setShowShare] = useState(false);

  useEffect(() => { if (r.from) fetchPublicProfileInfo(r.from).then(setRecommenderInfo); }, [r.from]);

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
    if (uname) window.location.hash = `#/investor/${uname}/reco/${r.id}`;
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
        <div className="av" style={{width:26,height:26,background:cf.color||'var(--grad)',fontSize:10,flexShrink:0}}>
          {cf.initials||initialsOf(cf.name)}
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
    if (uname) window.location.hash = `#/investor/${uname}/reco/${r.id}`;
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

  // Same #/investor/:username/reco/:id deep link FreshIdeaCard already uses.
  const goToDetail = async () => {
    let uname = r.from_username || recommenderInfo?.username;
    if (!uname && r.from) uname = (await fetchPublicProfileInfo(r.from))?.username;
    if (uname) window.location.hash = `#/investor/${uname}/reco/${r.id}`;
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

  const cf = useMemo(() => {
    const found = contacts.find(x => x.id === r.from);
    if (found) return found;
    return { name: item.creator.name, initials: initialsOf(item.creator.name), color: '#8d90ad' };
  }, [r.from, contacts, item.creator.name]);

  const username = r.from_username || recommenderInfo?.username || null;
  const isBuy = (r.recommendation_type || r.recType || 'Buy') === 'Buy';
  const isTracked = tracked?.has(r.id);

  // Same deep link every other Pulse card uses — #/investor/:username/reco/:id.
  const goToDetail = async () => {
    let uname = username;
    if (!uname && r.from) uname = (await fetchPublicProfileInfo(r.from))?.username;
    if (uname) window.location.hash = `#/investor/${uname}/reco/${r.id}`;
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
        <div className="av" style={{width:22,height:22,background:cf.color||'var(--grad)',fontSize:9,flexShrink:0}}>
          {cf.initials||initialsOf(cf.name)}
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
        <svg className="feed-brewing-cup" viewBox="0 0 120 96" width="88" height="70">
          <path className="feed-brewing-steam feed-brewing-steam-1" d="M46 34 Q40 26 46 18 Q52 10 46 2" fill="none" strokeLinecap="round"/>
          <path className="feed-brewing-steam feed-brewing-steam-2" d="M60 34 Q54 26 60 18 Q66 10 60 2" fill="none" strokeLinecap="round"/>
          <path className="feed-brewing-steam feed-brewing-steam-3" d="M74 34 Q68 26 74 18 Q80 10 74 2" fill="none" strokeLinecap="round"/>
          <ellipse className="feed-brewing-saucer" cx="60" cy="86" rx="38" ry="6"/>
          <path className="feed-brewing-handle" d="M92 46 Q112 46 112 60 Q112 74 92 74" fill="none" strokeLinecap="round"/>
          <rect className="feed-brewing-cupbody" x="28" y="40" width="64" height="38" rx="10"/>
          <ellipse className="feed-brewing-liquid" cx="60" cy="42" rx="29" ry="6"/>
        </svg>
      </div>
      <div className="feed-brewing-title">Great ideas from your circle are brewing</div>
      <div className="feed-brewing-sub muted">We're gathering the latest calls, moves and insights from your network.</div>
      <div className="feed-brewing-bar"><div className="feed-brewing-bar-fill"/></div>
      <div className="feed-brewing-caption muted small">Preparing your feed…</div>
    </div>
  );
}

/* ─── HomeFeed — redesigned hero page ──────────────────────────────────────────── */

export function HomeFeed({ isMobile, setPage, setRecoInit, recsReceived, setRecsReceived, configs, holdings, contacts, me, assetClasses, setAssetClasses, groups, setRecsMade, tracked, toggleTrack, effectiveFeedConfig, networkEngagementRecos, setNetworkEngagementRecos, publicFeedRecos=[], setPublicFeedRecos, feedConfigOptions, userFeedPrefs, setUserFeedPrefs, globalSearch, connections=[], onPeopleConnect, onShowInvite, onOpenSecurity, feedLoading=false, trackedCreatorIds, setTrackedCreatorIds, initTab, onInitTabConsumed }) {
  const { total, pnl, pnlPct } = useDerivedHoldings(holdings, configs.allowCryptoAccounts);
  const firstName = me?.firstName || me?.name?.split(' ')[0] || 'there';
  const [showNewReco,    setShowNewReco]    = useState(false);
  const [mobileFeedTab,  setMobileFeedTab]  = useState(initTab || 'pulse'); // 'feed' | 'pulse' — Pulse is the default home experience
  // One-shot: which tab to land on next, driven by how the user navigated here —
  // the top Home icon always requests 'pulse'; DISCOVER > Ideas in the sidebar
  // requests 'feed' on mobile (see App.jsx's homeInitTab).
  useEffect(() => {
    if (initTab) { setMobileFeedTab(initTab); onInitTabConsumed && onInitTabConsumed(); }
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
  const showPulseBadge = !!pulseBadgeText && mobileFeedTab !== 'pulse';
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
            const isActive = mobileFeedTab === id;
            return (
              <button key={id} role="tab" aria-selected={isActive}
                onClick={()=>setMobileFeedTab(id)}
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

    {/* ── Desktop: normal in-flow header ── */}
    {!isMobile && (
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:10}}>
        <div>
          <div style={{fontSize:22,fontWeight:800,letterSpacing:'-.4px'}}>Welcome back, {firstName}! 👋</div>
          <div style={{fontSize:13,color:'var(--muted)',marginTop:2}}>Your daily investment dose</div>
        </div>
        <button className="btn btn-pri btn-sm" onClick={()=>setShowNewReco(true)} style={{marginLeft:'auto'}}>
          <Lightbulb size={14}/> New idea
        </button>
      </div>
    )}
    <div style={{display:'flex',gap:22,alignItems:'flex-start'}}>

      {/* ── Pulse column (left, the default home experience): desktop = fixed
           252px aside; mobile = full-width, shown only on the Pulse tab.
           Rendered first so it's the left column on desktop. Widget order:
           Fresh Ideas, Trending, What You Missed, My Tracked. ── */}
      <div style={{
        width: isMobile ? '100%' : 252,
        flexShrink: isMobile ? 1 : 0,
        display: isMobile && mobileFeedTab==='feed' ? 'none' : undefined,
      }}>
        {/* Same "brewing" filler the Feed column shows while the initial
            post-login data load is in flight — shown here too now that
            Pulse is the default tab, so whichever tab the user lands on
            (or quickly switches to before data arrives) sees it rather
            than a blank widget column. */}
        {feedLoading ? <FeedBrewingState/> : (<>
        {/* Widget #1 — Fresh Ideas (network + public platform).
            Each Pulse widget gets its own error boundary so one widget's
            bug shows a small inline "failed to load" card instead of
            blanking the whole Pulse column (or, without any boundary
            above HomeFeed at all, the whole app). */}
        <SectionErrorBoundary label="Fresh Ideas">
          <FreshIdeasWidget recsReceived={allFeedRecos} contacts={contacts} groups={groups} me={me} tracked={tracked} toggleTrack={toggleTrack}
            setRecsReceived={setRecsReceived} setPublicFeedRecos={setPublicFeedRecos} setNetworkEngagementRecos={setNetworkEngagementRecos}
            setPage={setPage}
            onViewAll={()=>{ if (isMobile) setMobileFeedTab('feed'); }}/>
        </SectionErrorBoundary>

        {/* Widget #2 — Trending on MIC.
            Fed publicFeedRecos (the platform-wide public pool), not
            allFeedRecos: this is a discovery surface and must be able to
            show creators the viewer has never encountered. "See all" goes
            to the Feed, which is where public platform ideas live — on
            mobile that means switching tabs, on desktop the feed column
            is now on the right, so we scroll it back to the top. */}
        <SectionErrorBoundary label="Trending on MIC">
          <TrendingWidget publicFeedRecos={publicFeedRecos} setPublicFeedRecos={setPublicFeedRecos}
            contacts={contacts} me={me} tracked={tracked} toggleTrack={toggleTrack}
            trackedCreatorIds={trackedCreatorIds} setTrackedCreatorIds={setTrackedCreatorIds}
            setPage={setPage}
            onSeeAll={()=>{
              if (isMobile) setMobileFeedTab('feed');
              else window.scrollTo({ top: 0, behavior: 'smooth' });
            }}/>
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
        <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:12}}>
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

      {/* ── Feed column (right): JS-controlled visibility on mobile ── */}
      <div style={{
        flex:1, minWidth:0,
        display: isMobile && mobileFeedTab==='pulse' ? 'none' : undefined,
      }}>

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
        onClose={()=>setShowNewReco(false)}
        onCreate={(rec)=>{ setRecsMade(rs=>[rec,...rs]); setShowNewReco(false); }}
      />
    )}
  </>
  );
}
/* =================================================================== INSTRUMENTS */
// Module-level cache — loaded once per browser session from Neon

export function SecurityQuickPanel({ticker,name,allRecos=[],circleRecos=[],onOpenFull,onViewAllInvestors,onClose,modal=false}) {
  const community  = computeConsensus(allRecos);
  const circle     = computeConsensus(circleRecos);
  const trend      = computeTrend(circleRecos.length>=2 ? circleRecos : allRecos);
  // "Recommended by" must show ALL investors, not just circle ones — this
  // panel is platform-wide discovery (the 4 cards it opens from already
  // deliberately surface tickers from across MIC, not just the viewer's
  // circle). It previously showed only circleRecos whenever the viewer had
  // ANY circle overlap for that ticker, silently hiding every community
  // investor from the list and from the "View All N" count below — e.g. a
  // ticker with 5 total investors would show "2" with no indication 3 were
  // hidden. circleIds (via circleMemberIds) is used only to badge which
  // rows are circle members, never to filter the list.
  const circleMemberIds = new Set(circleRecos.map(r=>r.from));
  const recent     = allRecos.slice(0,3);
  const latestPrice= allRecos.find(r=>r.current_price||r.reco_price)?.current_price || allRecos.find(r=>r.reco_price)?.reco_price;

  const content = (
    <div style={{background:'var(--surface)',overflow:'hidden'}}>

      {/* Header */}
      <div style={{padding:'14px 18px',borderBottom:'1px solid var(--line)',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div>
          <div style={{fontWeight:900,fontSize:17,lineHeight:1.2}}>{ticker}</div>
          <div style={{fontSize:12,color:'var(--muted)',marginTop:3}}>{name}</div>
          {latestPrice&&<div style={{fontSize:13,fontWeight:700,marginTop:4}}>₹{Number(latestPrice).toLocaleString('en-IN')}</div>}
        </div>
        <div style={{display:'flex',gap:6,alignItems:'flex-start'}}>
          <button className="btn btn-ghost btn-sm" style={{fontSize:11,whiteSpace:'nowrap'}} onClick={onOpenFull}>Full Page →</button>
          <button className="iconbtn" onClick={onClose}><X size={15}/></button>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{maxHeight:modal?'72vh':'calc(100vh - 180px)',overflowY:'auto',padding:'14px 18px',display:'flex',flexDirection:'column',gap:14}}>

        {/* Consensus bar */}
        {community.total>0&&(
          <div>
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--muted)',marginBottom:8}}>
              Consensus Overview <span style={{fontWeight:400}}>(All Investors)</span>
            </div>
            <div style={{display:'flex',height:10,borderRadius:6,overflow:'hidden',marginBottom:8}}>
              <div style={{width:`${community.bullPct}%`,background:'var(--gain)',transition:'width .4s'}}/>
              <div style={{width:`${community.neutralPct}%`,background:'rgba(141,144,173,.3)'}}/>
              <div style={{width:`${community.bearPct}%`,background:'var(--loss)',transition:'width .4s'}}/>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:11}}>
              <span style={{color:'var(--gain)',fontWeight:700}}>{community.bullPct}% Bullish</span>
              <span style={{color:'var(--muted)'}}>{community.neutralPct}% Neutral</span>
              <span style={{color:'var(--loss)',fontWeight:700}}>{community.bearPct}% Bearish</span>
            </div>
          </div>
        )}

        {/* My Circle vs Community comparison */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          {[['My Circle',circle,circleRecos.length],['Community',community,allRecos.length]].map(([label,c,count])=>(
            <div key={label} style={{background:'var(--surface-2)',borderRadius:10,padding:'12px 14px'}}>
              <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--muted)',marginBottom:6}}>{label}</div>
              {c.total>0?(
                <>
                  <div style={{fontSize:24,fontWeight:900,lineHeight:1,color:consensusStrengthColor(c)}}>{c.bullPct}%</div>
                  <div style={{fontSize:11,fontWeight:700,color:consensusStrengthColor(c),marginTop:2}}>{c.label}</div>
                  <div style={{fontSize:10,color:'var(--muted)',marginTop:2}}>{count} investor{count!==1?'s':''}</div>
                </>
              ):<div style={{fontSize:12,color:'var(--muted)',paddingTop:4}}>No data</div>}
            </div>
          ))}
        </div>

        {/* Recommended by */}
        {recent.length>0&&(
          <div>
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--muted)',marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span>Posted by</span>
              {allRecos.length>3&&(
                <button className="btn btn-ghost btn-sm" style={{fontSize:10,padding:'2px 8px'}} onClick={onViewAllInvestors||onOpenFull}>
                  View All {allRecos.length}
                </button>
              )}
            </div>
            {recent.map((r,i)=>{
              const isBuy=r.recommendation_type==='Buy';
              const inCircle=circleMemberIds.has(r.from);
              const clickable=!!r.username;
              return (
                <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 0',borderBottom:i<recent.length-1?'1px solid var(--line)':'none'}}>
                  <div className="av" style={{width:30,height:30,fontSize:11,flexShrink:0,background:'var(--grad)',cursor:clickable?'pointer':'default'}} onClick={clickable?()=>openProfile(r.username):undefined}>{initialsOf(r.full_name||r.username||'?')}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:5}}>
                      <span
                        style={{fontSize:12,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',cursor:clickable?'pointer':'default',textDecoration:clickable?'underline':'none',textDecorationColor:'var(--line)'}}
                        onClick={clickable?()=>openProfile(r.username):undefined}
                      >{r.full_name||r.username||'Investor'}</span>
                      {inCircle&&<span style={{fontSize:8.5,fontWeight:800,padding:'1px 5px',borderRadius:4,background:'var(--accent-soft)',color:'var(--accent-ink)',textTransform:'uppercase',letterSpacing:'.03em',flexShrink:0}}>Circle</span>}
                    </div>
                    {r.conviction&&<div style={{fontSize:10,color:'var(--muted)'}}>{r.conviction}</div>}
                  </div>
                  <span style={{fontSize:10,color:'var(--muted)',flexShrink:0}}>
                    {r.created_at?new Date(r.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'}):''}
                  </span>
                  <span style={{fontSize:10,fontWeight:800,padding:'2px 8px',borderRadius:4,flexShrink:0,
                    background:isBuy?'var(--gain-soft)':'var(--loss-soft)',color:isBuy?'var(--gain)':'var(--loss)'}}>
                    {isBuy?'BUY':'SELL'}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Consensus trend chart */}
        {trend.length>=2&&(
          <div>
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--muted)',marginBottom:4,display:'flex',justifyContent:'space-between'}}>
              <span>Consensus Trend {circleRecos.length>=2?'(My Circle)':'(Community)'}</span>
              <span style={{fontWeight:900,color:consensusStrengthColor(circle)}}>{trend[trend.length-1]}%</span>
            </div>
            <SparkLine data={trend} color={consensusStrengthColor(circle)} height={55}/>
          </div>
        )}

        {/* AI Insight summary */}
        {allRecos.length>=2&&(
          <div style={{padding:'12px 14px',background:'var(--accent-soft)',borderRadius:10,borderLeft:'3px solid var(--accent-ink)'}}>
            <div style={{fontSize:11,fontWeight:800,color:'var(--accent-ink)',marginBottom:5,display:'flex',alignItems:'center',gap:6}}>
              <Lightbulb size={13}/> AI Insight Summary
            </div>
            <div style={{fontSize:12,color:'var(--ink-soft)',lineHeight:1.55}}>
              {ticker} is seeing <strong>{community.label.toLowerCase()}</strong> sentiment from {community.total} investor{community.total!==1?'s':''}.
              {community.bullPct>=60?' Strong buy conviction from the community.' :
               community.bearPct>=60?' Investors are flagging caution on this stock.' :
               ' Community opinion is mixed — review individual theses below.'}
            </div>
          </div>
        )}

        <button className="btn btn-pri" style={{width:'100%',justifyContent:'center'}} onClick={onOpenFull}>
          View Stock Insights →
        </button>

        {allRecos.length===0&&(
          <div style={{textAlign:'center',padding:'8px 0',color:'var(--muted)',fontSize:13}}>No ideas for {ticker} yet.</div>
        )}
      </div>
    </div>
  );

  if (modal) return (
    <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',flexDirection:'column',justifyContent:'flex-end'}} onClick={onClose}>
      <div style={{background:'var(--surface)',borderRadius:'20px 20px 0 0',boxShadow:'0 -8px 40px rgba(0,0,0,.35)',overflow:'hidden'}} onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,background:'var(--line-2)',borderRadius:2,margin:'12px auto 4px'}}/>
        {content}
      </div>
    </div>
  );

  return (
    <div style={{position:'sticky',top:80,background:'var(--surface)',borderRadius:12,border:'1px solid var(--line-2)',overflow:'hidden',boxShadow:'0 4px 24px rgba(0,0,0,.08)'}}>
      {content}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PORTFOLIO INTELLIGENCE
   ═══════════════════════════════════════════════════════════════════ */

export function MarketIntelligencePage({ contacts, me, onOpenSecurity }) {
  const isMobile = useIsMobile();
  const [recos, setRecos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all'); // all | circle | community | verified
  const [sector, setSector] = useState('all');
  const [period, setPeriod] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [expandedTicker, setExpandedTicker] = useState(null); // inline row expansion
  const [sortBy, setSortBy] = useState('strength'); // strength | recent | investors | alpha
  const [visibleCount, setVisibleCount] = useState(15); // "Load more" pagination for the full list

  const circleIds = useMemo(()=>contacts.map(c=>c.id),[contacts]);

  useEffect(()=>{
    // Only public recommendations contribute to community-wide market intelligence.
    dbGetConsensusRecosPublic()
      .then(rows=>{ setRecos(rows); setLoading(false); })
      .catch(e=>{ console.warn('Market Intel SQL error:',e?.message||e); setLoading(false); });
  },[]);

  // Group by ticker
  const tickerMap = useMemo(()=>{
    const byT={};
    recos.forEach(r=>{
      if (!byT[r.ticker]) byT[r.ticker]={ticker:r.ticker,name:r.asset_name||r.ticker,sector:r.sector||'',recos:[]};
      byT[r.ticker].recos.push(r);
    });
    return byT;
  },[recos]);

  const allTickers = useMemo(()=>Object.values(tickerMap).map(t=>{
    const filtered = tab==='circle'    ? t.recos.filter(r=>circleIds.includes(r.from))
                   : tab==='community' ? t.recos
                   : t.recos; // 'all'
    const community  = computeConsensus(t.recos);
    const circle     = computeConsensus(t.recos.filter(r=>circleIds.includes(r.from)));
    const tabCons    = computeConsensus(filtered);
    const lastActive = filtered.length ? Math.max(...filtered.map(r=>new Date(r.created_at).getTime())) : 0;
    return {...t, community, circle, tabCons, filteredRecos:filtered, lastActive};
  }).filter(t=>t.filteredRecos.length>0
    && (sector==='all'||t.sector===sector)
    && (!search||t.ticker.includes(search.toUpperCase())||t.name.toLowerCase().includes(search.toLowerCase()))
  ).sort((a,b)=>{
    if (sortBy==='recent')    return b.lastActive-a.lastActive;
    if (sortBy==='investors') return b.filteredRecos.length-a.filteredRecos.length;
    if (sortBy==='alpha')     return a.ticker.localeCompare(b.ticker);
    // 'strength' (default) — this page's stated purpose is sentiment/conviction,
    // so lead with how strongly one-sided each stock's consensus is; investor
    // count breaks ties between equally one-sided stocks.
    return (b.tabCons.strength-a.tabCons.strength) || (b.filteredRecos.length-a.filteredRecos.length);
  }),[tickerMap,tab,circleIds,sector,search,sortBy]);

  // Reset pagination whenever the result set changes shape
  useEffect(()=>{ setVisibleCount(15); },[tab,sector,search,sortBy]);

  // Discovery cards — each one highlights a DIFFERENT signal. Already-
  // featured tickers are excluded from later cards (`pick`) so all four
  // don't collapse onto a single dominant stock just because the platform
  // is early-stage and one ticker happens to lead on several axes at once;
  // a card that genuinely has no other qualifying ticker simply doesn't
  // render (see the `item?(...):null` guard below) rather than repeating.
  const usedTickers = new Set();
  const pick = (candidates) => {
    const hit = candidates.find(t => !usedTickers.has(t.ticker));
    if (hit) usedTickers.add(hit.ticker);
    return hit || null;
  };

  // RECENCY — a gentle multiplier, not a hard filter or a heavy decay like
  // Pulse's Trending/What You Missed widgets. This page answers "what does
  // the platform generally think," not "what just happened" — a stock the
  // whole community has debated for weeks is still meaningfully "strongest
  // consensus" even if today happened to be quiet. A 30-day half-life lets
  // genuinely fresh activity float a ticker up without blanking out
  // legitimate historical consensus, which matters at today's low traffic:
  // a handful of recos a month apart is still the entire dataset for a
  // ticker, and an aggressive decay would empty most of these cards rather
  // than reorder them.
  const RECENCY_HALFLIFE_DAYS = 30;
  const daysSinceLastActivity = (recos) => {
    if (!recos.length) return Infinity;
    const latest = Math.max(...recos.map(r=>new Date(r.created_at).getTime()));
    return (Date.now() - latest) / 86400000;
  };
  const recencyFactor = (recos) => Math.pow(0.5, daysSinceLastActivity(recos) / RECENCY_HALFLIFE_DAYS);
  const lastActiveLabel = (recos) => {
    if (!recos.length) return null;
    const latest = new Date(Math.max(...recos.map(r=>new Date(r.created_at).getTime())));
    return fmtDate(latest);
  };

  // Directional AGREEMENT (bull% vs bear%) — how one-sided the community is,
  // nudged by recency so a ticker with the same split but more current
  // discussion edges out a dormant one.
  const strongest = pick(
    [...allTickers].sort((a,b)=>
      (b.tabCons.strength*recencyFactor(b.filteredRecos)) - (a.tabCons.strength*recencyFactor(a.filteredRecos)))
  );

  // Investor CONVICTION — a distinct signal from agreement direction: how
  // strongly the recommenders themselves rated their confidence (the
  // conviction field each recommendation already carries), not how many
  // agree with each other. Was previously "Biggest Conviction Increase"
  // sorted by bullPct — the same signal as Strongest Consensus over a
  // narrower slice, and no time-based "increase" was ever actually
  // computed, so it near-always picked the same ticker. Renamed to match
  // what it honestly measures.
  const CONVICTION_SCORE = { High:3, Medium:2, Low:1 };
  const avgConviction = (recos) => {
    const scored = recos.map(r=>CONVICTION_SCORE[r.conviction]).filter(Boolean);
    return scored.length ? scored.reduce((a,b)=>a+b,0)/scored.length : 0;
  };
  const highConviction = pick(
    [...allTickers]
      .map(t=>({...t, avgConv:avgConviction(t.filteredRecos)}))
      .filter(t=>t.avgConv>0)
      .sort((a,b)=>
        (b.avgConv*recencyFactor(b.filteredRecos)) - (a.avgConv*recencyFactor(a.filteredRecos))
        || b.filteredRecos.length-a.filteredRecos.length)
  );

  // Raw DISCUSSION VOLUME — most recommendations, regardless of direction,
  // recency-weighted so a ticker that was chatty once but has gone quiet
  // for months doesn't permanently outrank one people are discussing now.
  const mostDiscussed = pick(
    [...allTickers].sort((a,b)=>
      (b.filteredRecos.length*recencyFactor(b.filteredRecos)) - (a.filteredRecos.length*recencyFactor(a.filteredRecos)))
  );

  // Most DIVIDED — closest to a 50/50 bull/bear split among tickers with a
  // meaningful sample. `closeness` is 50 minus the distance from 50%, so
  // higher = more balanced/divided; ascending distance (the original fix)
  // is equivalent to descending closeness, just expressed so it can be
  // recency-weighted the same way as the other three cards. The previous
  // descending-distance sort put the LEAST divided ticker first instead, so
  // a unanimous 100%-bullish stock was winning "Most Divided" — the exact
  // inverse of the label's meaning.
  const mostDivided = pick(
    [...allTickers].filter(t=>t.tabCons.total>=3)
      .map(t=>({...t, closeness: 50-Math.abs(50-t.tabCons.bullPct)}))
      .sort((a,b)=>
        (b.closeness*recencyFactor(b.filteredRecos)) - (a.closeness*recencyFactor(a.filteredRecos)))
  );

  const sectors = ['all',...[...new Set(recos.map(r=>r.sector).filter(Boolean))]];
  const selData  = selectedTicker ? tickerMap[selectedTicker] : null;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Intelligence</div>
          <div className="page-title">Market Insights</div>
          <div className="page-sub">Track market sentiment and investor conviction across stocks and sectors</div>
        </div>
        {loading&&<Loader size={16} className="spin" style={{color:'var(--muted)'}}/>}
      </div>

      {/* Discovery cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:10,marginBottom:20}}>
        {[
          {label:'Strongest Consensus',   icon:<Target size={14}/>,      item:strongest},
          {label:'Highest Conviction',    icon:<Zap size={14}/>,         item:highConviction},
          {label:'Most Discussed',        icon:<MessageSquare size={14}/>,item:mostDiscussed},
          {label:'Most Divided',          icon:<Activity size={14}/>,    item:mostDivided},
        ].map(({label,icon,item},i)=>item?(
          <div key={i} className="card" style={{padding:'11px 13px',cursor:'pointer',minWidth:0}} onClick={()=>setSelectedTicker(item.ticker)}>
            <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:5}}>
              <span style={{color:'var(--accent-ink)',opacity:.7}}>{icon}</span>
              <span style={{fontSize:9.5,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--muted)'}}>{label}</span>
            </div>
            <div style={{fontWeight:900,fontSize:16,marginBottom:2}}>{item.ticker}</div>
            <div style={{fontSize:11.5,color:consensusStrengthColor(item.tabCons),fontWeight:700,marginBottom:5}}>
              {item.tabCons.bullPct>item.tabCons.bearPct?'+':''}{item.tabCons.bullPct}% {item.tabCons.label}
            </div>
            <SparkLine
              data={computeTrend(item.filteredRecos)}
              color={consensusStrengthColor(item.tabCons)}
              height={26}
            />
            <div style={{fontSize:10.5,color:'var(--muted)',marginTop:3}}>
              {item.filteredRecos.length} investor{item.filteredRecos.length!==1?'s':''}
              {lastActiveLabel(item.filteredRecos) && ` · ${lastActiveLabel(item.filteredRecos)}`}
            </div>
          </div>
        ):null)}
      </div>

      {/* Filters + tabs */}
      <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap',marginBottom:16}}>
        <div className="seg">
          {[['all','All Stocks'],['circle','My Circle'],['community','Community']].map(([v,l])=>(
            <button key={v} className={tab===v?'active':''} onClick={()=>setTab(v)}>{l}</button>
          ))}
        </div>
        <select className="rte-select" value={sector} onChange={e=>setSector(e.target.value)} style={{height:32}}>
          {sectors.map(s=><option key={s} value={s}>{s==='all'?'All Sectors':s}</option>)}
        </select>
        <select className="rte-select" value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{height:32}} title="Sort by">
          <option value="strength">Sort: Consensus Strength</option>
          <option value="recent">Sort: Most Recent</option>
          <option value="investors">Sort: Most Investors</option>
          <option value="alpha">Sort: Alphabetical</option>
        </select>
        <div style={{position:'relative',flex:1,maxWidth:220}}>
          <Search size={14} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--muted)'}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search stocks…"
            style={{width:'100%',paddingLeft:30,height:32,border:'1px solid var(--line-2)',borderRadius:8,fontSize:13,outline:'none',background:'var(--surface)',color:'var(--ink)'}}/>
        </div>
      </div>

      {!loading&&allTickers.length>0&&(
        <div style={{fontSize:12,color:'var(--muted)',marginBottom:8}}>
          Showing {Math.min(visibleCount,allTickers.length)} of {allTickers.length} stock{allTickers.length!==1?'s':''}
        </div>
      )}

      <div style={{display:'grid',gridTemplateColumns:selData&&!isMobile?'1fr 340px':'1fr',gap:16,alignItems:'start'}}>
        <div className="card">
          {isMobile ? (
            /* ── Mobile: asset card list ── */
            <div style={{display:'flex',flexDirection:'column',gap:0}}>
              {allTickers.slice(0,visibleCount).map(t=>(
                <div key={t.ticker} onClick={()=>setSelectedTicker(prev=>prev===t.ticker?null:t.ticker)}
                  style={{padding:'13px 16px',borderBottom:'1px solid var(--line)',cursor:'pointer',background:selectedTicker===t.ticker?'var(--accent-soft)':'transparent',transition:'background .12s'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                    <div style={{minWidth:0,flex:1}}>
                      <div style={{fontWeight:800,fontSize:14}}>{t.ticker}</div>
                      <div style={{fontSize:11,color:'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.name}</div>
                      {t.sector&&<div style={{fontSize:10,color:'var(--muted)'}}>{t.sector}</div>}
                    </div>
                    <div style={{textAlign:'right',flexShrink:0,marginLeft:10}}>
                      <span style={{fontSize:12,color:consensusStrengthColor(t.community),fontWeight:700}}>
                        {t.community.bullPct>t.community.bearPct?'↑ ':t.community.bearPct>t.community.bullPct?'↓ ':'→ '}{t.community.label}
                      </span>
                      <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{t.filteredRecos.length} investor{t.filteredRecos.length!==1?'s':''}</div>
                      <div style={{display:'flex',alignItems:'center',gap:4,marginTop:4,justifyContent:'flex-end'}} title={`Consensus strength: ${t.tabCons.strength}/100`}>
                        <div style={{width:38,height:5,borderRadius:3,background:'var(--line)',overflow:'hidden'}}>
                          <div style={{height:'100%',width:`${t.tabCons.strength}%`,background:consensusStrengthColor(t.tabCons)}}/>
                        </div>
                        <span style={{fontSize:9.5,fontWeight:700,color:'var(--muted)'}}>{t.tabCons.strength}</span>
                      </div>
                    </div>
                  </div>
                  {(t.community.total>0||t.circle.total>0)&&(
                    <div style={{display:'flex',gap:10,marginBottom:4}}>
                      {t.community.total>0&&(
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:9.5,color:'var(--muted)',marginBottom:3,textTransform:'uppercase',letterSpacing:'.03em'}}>Community</div>
                          <ConsensusBar cons={t.community} width={'100%'} mini/>
                        </div>
                      )}
                      {t.circle.total>0&&(
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:9.5,color:'var(--muted)',marginBottom:3,textTransform:'uppercase',letterSpacing:'.03em'}}>My Circle</div>
                          <ConsensusBar cons={t.circle} width={'100%'} mini/>
                        </div>
                      )}
                    </div>
                  )}
                  {t.community.total===0&&t.circle.total===0&&(<div style={{fontSize:11,color:'var(--muted)',fontStyle:'italic',marginBottom:4}}>No ideas yet</div>)}
                  <div style={{display:'flex',justifyContent:'flex-end',marginTop:6}}>
                    <button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={e=>{e.stopPropagation();onOpenSecurity(t.ticker,t.name);}}>
                      <ChevronRight size={13}/> Stock Insights
                    </button>
                  </div>
                </div>
              ))}
              {allTickers.length===0&&(<div style={{padding:'32px 16px',textAlign:'center',color:'var(--muted)',fontSize:13}}>No stocks match current filters.</div>)}
              {allTickers.length>visibleCount&&(
                <div style={{padding:'14px 16px',textAlign:'center'}}>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setVisibleCount(v=>v+15)}>
                    Load more ({allTickers.length-visibleCount} remaining)
                  </button>
                </div>
              )}
            </div>
          ) : (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{borderBottom:'2px solid var(--line)'}}>
                  {['Stock','My Circle Consensus','Community Consensus','Trend (7d)','Investors','Avg Credibility','Action'].map((h,i)=>(
                    <th key={i} style={{padding:'10px 14px',textAlign:i===0?'left':'center',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',color:'var(--muted)',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allTickers.slice(0,visibleCount).map(t=>{
                  const sel      = t.ticker===selectedTicker;
                  const expanded = t.ticker===expandedTicker;
                  const avgIci   = null; // ici_score not a confirmed DB column — show '—'
                  const toggleExpand = e => { e.stopPropagation(); setExpandedTicker(expanded?null:t.ticker); };
                  return (
                    <React.Fragment key={t.ticker}>
                      <tr onClick={()=>setSelectedTicker(sel?null:t.ticker)}
                        style={{borderBottom:expanded?'none':'1px solid var(--line)',cursor:'pointer',background:sel?'var(--accent-soft)':'transparent',transition:'background .12s'}}>
                        <td style={{padding:'12px 14px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:10}}>
                            <div className="av" style={{width:32,height:32,fontSize:11,flexShrink:0,background:'var(--grad)'}}>{t.ticker.slice(0,2)}</div>
                            <div>
                              <div style={{fontWeight:800,fontSize:14}}>{t.ticker}</div>
                              <div style={{fontSize:11,color:'var(--muted)',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.name}</div>
                              {t.sector&&<div style={{fontSize:10,color:'var(--muted)'}}>{t.sector}</div>}
                            </div>
                          </div>
                        </td>
                        <td style={{padding:'12px 14px',textAlign:'center',minWidth:130}}><ConsensusBar cons={t.circle} width={110}/></td>
                        <td style={{padding:'12px 14px',textAlign:'center',minWidth:130}}><ConsensusBar cons={t.community} width={110}/></td>
                        <td style={{padding:'12px 14px',textAlign:'center'}}>
                          <span style={{fontSize:12,color:consensusStrengthColor(t.community),fontWeight:700}}>
                            {t.community.bullPct>t.community.bearPct?'↑':t.community.bearPct>t.community.bullPct?'↓':'→'}
                            {' '}{t.community.label}
                          </span>
                        </td>
                        <td style={{padding:'12px 14px',textAlign:'center'}}>
                          <div style={{fontWeight:700,fontSize:16}}>{t.filteredRecos.length}</div>
                          <div style={{fontSize:10,color:'var(--muted)'}}>investors</div>
                        </td>
                        <td style={{padding:'12px 14px',textAlign:'center'}}>
                          <div style={{fontWeight:700,fontSize:16,color:'var(--accent-ink)'}}>{avgIci||'—'}</div>
                          <div style={{fontSize:10,color:'var(--muted)'}}>ICI avg</div>
                        </td>
                        <td style={{padding:'12px 14px',textAlign:'center'}}>
                          <div style={{display:'flex',gap:4,justifyContent:'center'}}>
                            <button className="iconbtn" title={expanded?'Collapse':'Who posted'} onClick={toggleExpand}
                              style={{color:expanded?'var(--accent-ink)':'var(--muted)'}}>
                              <ChevronDown size={15} style={{transform:expanded?'rotate(180deg)':'none',transition:'transform .2s'}}/>
                            </button>
                            <button className="iconbtn" title="Stock Insights" onClick={e=>{e.stopPropagation();onOpenSecurity(t.ticker,t.name);}}><ChevronRight size={16}/></button>
                          </div>
                        </td>
                      </tr>
                      {expanded&&(
                        <tr style={{borderBottom:'1px solid var(--line)',background:'var(--surface-2)'}}>
                          <td colSpan={7} style={{padding:'0 14px 14px 60px'}}>
                            <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--muted)',margin:'10px 0 8px'}}>
                              Who posted — {t.filteredRecos.length} investor{t.filteredRecos.length!==1?'s':''}
                            </div>
                            <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                              {t.filteredRecos.map((r,i)=>{
                                const inCircle = circleIds.includes(r.from);
                                const isBuy    = r.recommendation_type==='Buy';
                                return (
                                  <div key={i} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px',
                                    background:'var(--surface)',borderRadius:8,border:'1px solid var(--line-2)',fontSize:12}}>
                                    <div className="av" style={{width:22,height:22,fontSize:9,flexShrink:0,background:'var(--grad)'}}>
                                      {initialsOf(r.full_name||r.username||'?')}
                                    </div>
                                    <span style={{fontWeight:600,maxWidth:110,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                      {r.full_name||r.username||'Investor'}
                                    </span>
                                    {inCircle&&<span style={{fontSize:9,background:'var(--accent-soft)',color:'var(--accent-ink)',borderRadius:3,padding:'1px 4px',fontWeight:700}}>Circle</span>}
                                    <span style={{fontSize:10,fontWeight:800,padding:'2px 6px',borderRadius:4,
                                      background:isBuy?'var(--gain-soft)':'var(--loss-soft)',color:isBuy?'var(--gain)':'var(--loss)'}}>
                                      {isBuy?'BUY':'SELL'}
                                    </span>
                                    {r.conviction&&<span style={{fontSize:10,color:'var(--muted)'}}>{r.conviction}</span>}
                                    <span style={{fontSize:10,color:'var(--muted)'}}>
                                      {r.created_at?new Date(r.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'}):''}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {allTickers.length===0&&!loading&&<tr><td colSpan={7} style={{padding:'32px',textAlign:'center',color:'var(--muted)',fontSize:14}}>{recos.length===0?'No ideas on the platform yet.':'No results match your filters.'}</td></tr>}
              </tbody>
            </table>
            {allTickers.length>visibleCount&&(
              <div style={{padding:'14px',textAlign:'center'}}>
                <button className="btn btn-ghost btn-sm" onClick={()=>setVisibleCount(v=>v+15)}>
                  Load more ({allTickers.length-visibleCount} remaining)
                </button>
              </div>
            )}
          </div>
          ) /* end isMobile ternary */}
        </div>

        {selData&&(
          isMobile
            ? <SecurityQuickPanel ticker={selData.ticker} name={selData.name} allRecos={selData.recos} circleRecos={selData.recos.filter(r=>circleIds.includes(r.from))} onOpenFull={()=>onOpenSecurity(selData.ticker,selData.name)} onViewAllInvestors={()=>onOpenSecurity(selData.ticker,selData.name,'investors')} onClose={()=>setSelectedTicker(null)} modal/>
            : <SecurityQuickPanel ticker={selData.ticker} name={selData.name} allRecos={selData.recos} circleRecos={selData.recos.filter(r=>circleIds.includes(r.from))} onOpenFull={()=>onOpenSecurity(selData.ticker,selData.name)} onViewAllInvestors={()=>onOpenSecurity(selData.ticker,selData.name,'investors')} onClose={()=>setSelectedTicker(null)}/>
        )}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECURITY INTELLIGENCE
   ═══════════════════════════════════════════════════════════════════ */

export function SecurityIntelligencePage({ securityTicker, contacts, me, onOpenSecurity, onBack, onHome }) {
  const isMobile = useIsMobile();
  const { ticker, name } = securityTicker || {};
  const [recos, setRecos]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab]         = useState(securityTicker?.tab || 'consensus'); // consensus | timeline | investors | stats | ai
  const [aiSummary, setAiSummary] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [investorIcis, setInvestorIcis] = useState({}); // uid → {score,band}
  const [searchOpen, setSearchOpen] = useState(false); // mobile: search starts collapsed to an icon

  const circleIds = useMemo(()=>contacts.map(c=>c.id),[contacts]);

  // The page can stay mounted across multiple onOpenSecurity() calls (e.g.
  // navigating from one security's modal straight to another's insights
  // page), so re-sync the tab whenever the caller requests a specific one.
  useEffect(()=>{
    if (securityTicker?.tab) setTab(securityTicker.tab);
  }, [ticker, securityTicker?.tab]);

  // Fetch real ICI scores for all investors when recos loads
  useEffect(()=>{
    if (!recos.length) return;
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
  },[recos]);

  useEffect(()=>{
    if (!ticker) return;
    setLoading(true); setRecos([]);
    dbGetTickerRecos(ticker)
      .then(rows=>{ setRecos(rows); setLoading(false); })
      .catch(()=>setLoading(false));
  },[ticker]);


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
    const activeR  = recos;
    const exitedR  = [];  // status column not in schema
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
        {/* Search box — large and prominent */}
        <div style={{background:'var(--surface)',border:'2px solid var(--accent)',borderRadius:16,padding:'4px 8px 4px 16px',display:'flex',alignItems:'center',gap:10,marginBottom:24,boxShadow:'0 4px 24px rgba(109,93,245,.12)'}}>
          <Search size={20} color="var(--accent)" style={{flexShrink:0}}/>
          <div style={{flex:1}}>
            <InstrumentSearch
              onSelect={inst=>{ if(inst&&onOpenSecurity) onOpenSecurity(inst.symbol,inst.name); }}
              placeholder="Search any stock or ETF — e.g. RELIANCE, HDFC Bank…"
            />
          </div>
        </div>

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

  // No status filter - column not confirmed in schema; show all recommendations
  const activeRecos  = recos;  // all fetched recos are current (no status column)
  const circleRecos  = recos.filter(r=>circleIds.includes(r.from));
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
  const investorMap = {};  // keyed by recommender uid — populated below
  recos.forEach(r=>{
    if (!investorMap[r.from]) investorMap[r.from] = {...r};
  });
  const investors = Object.values(investorMap);
  const inCircle  = investors.filter(r=>circleIds.includes(r.from));
  const notCircle = investors.filter(r=>!circleIds.includes(r.from));

  return (
    <>
      <div className="page-head" style={{alignItems:'flex-start',flexWrap:'wrap',gap:16}}>
        <div style={{flex:1,minWidth:200}}>
          <div className="eyebrow">Stock Insights</div>
          <div style={{display:'flex',alignItems:'baseline',gap:14,flexWrap:'wrap'}}>
            <div className="page-title">{ticker}</div>
            <div style={{fontSize:16,color:'var(--muted)',fontWeight:400}}>{name}</div>
          </div>
          <div className="page-sub">{activeRecos.length} active idea{activeRecos.length!==1?'s':''} · {investors.length} investor{investors.length!==1?'s':''} tracking</div>
        </div>

        {backHomeButtons}

        {/* ── Switch-security search — compact, tucked into the header's empty space.
             On mobile there's no spare width, so it starts collapsed to an icon. ── */}
        {isMobile ? (
          !searchOpen ? (
            <button className="iconbtn" style={{width:36,height:36,flexShrink:0}} onClick={()=>setSearchOpen(true)}>
              <Search size={15}/>
            </button>
          ) : (
            <div style={{display:'flex',alignItems:'center',gap:8,width:'100%'}}>
              <div style={{flex:1,fontSize:13}}>
                <InstrumentSearch
                  onSelect={inst=>{ setSearchOpen(false); if(inst&&onOpenSecurity) onOpenSecurity(inst.symbol,inst.name); }}
                  placeholder={`Switch security…`}
                />
              </div>
              <button className="iconbtn" style={{flexShrink:0}} onClick={()=>setSearchOpen(false)}><X size={15}/></button>
            </div>
          )
        ) : (
          <div style={{width:220,flexShrink:0,fontSize:12}}>
            <InstrumentSearch
              onSelect={inst=>{ if(inst&&onOpenSecurity) onOpenSecurity(inst.symbol,inst.name); }}
              placeholder={`Switch security…`}
            />
          </div>
        )}

        {loading&&<Loader size={16} className="spin" style={{color:'var(--muted)'}}/>}
      </div>

      {/* ── Tabs — segmented control, styled to be unmistakably a multi-tab bar ── */}
      <div style={{
        display:'flex', gap:4, marginTop:20, marginBottom:20, overflowX:'auto', WebkitOverflowScrolling:'touch',
        background:'var(--surface-2)', border:'1px solid var(--line)', borderRadius:14, padding:5,
      }}>
        {[
          /* eslint-disable react/jsx-key -- lookup-table tuples destructured
             by the .map() below, never rendered as an array themselves; the
             actual rendered element (the <button> below) already has a key. */
          ['consensus', 'Consensus',    <Activity size={15}/> ],
          ['timeline',  'Idea History', <Clock size={15}/>    ],
          ['investors', 'Investors',    <Users size={15}/>    ],
          ['stats',     'Statistics',   <BarChart2 size={15}/>],
          ['ai',        'AI Summary',   <Sparkles size={15}/>],
          /* eslint-enable react/jsx-key */
        ].map(([v,l,icon])=>(
          <button key={v}
            onClick={()=>{ setTab(v); if(v==='ai') buildAiSummary(); }}
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

      {/* Tab: Consensus */}
      {tab==='consensus'&&(
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
          {/* Circle vs Community */}
          <div className="card">
            <div className="card-head"><Globe size={15}/> Circle vs Community</div>
            <div className="card-body" style={{display:'flex',flexDirection:'column',gap:16,padding:'16px 18px'}}>
              {[['My Circle',circle],['Community',community]].map(([l,c])=>(
                <div key={l}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                    <span style={{fontSize:13,fontWeight:600}}>{l}</span>
                    <span style={{fontSize:13,fontWeight:700,color:consensusStrengthColor(c)}}>{c.label}</span>
                  </div>
                  <ConsensusBar cons={c} width={'100%'}/>
                  <div style={{fontSize:12,color:'var(--muted)',marginTop:6}}>{c.total} investor{c.total!==1?'s':''}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Recommendation History */}
      {tab==='timeline'&&(
        <div className="card">
          <div className="card-head"><Clock size={15}/> Idea History <span style={{fontSize:11,color:'var(--muted)',fontWeight:400,marginLeft:4}}>(immutable — all calls are permanent)</span></div>
          {recos.length===0&&!loading?(
            <div style={{padding:'32px',textAlign:'center',color:'var(--muted)',fontSize:14}}>No ideas for {ticker} yet.</div>
          ):(
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{borderBottom:'2px solid var(--line)'}}>
                    {['Investor','Type','Date','Entry Price','Conviction','Status'].map((h,i)=>(
                      <th key={i} style={{padding:'10px 14px',textAlign:i===0?'left':'center',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',color:'var(--muted)'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recos.map(r=>{
                    const inMyCircle = circleIds.includes(r.from);
                    const goToReco = r.username ? ()=>{ window.location.hash = `#/investor/${r.username}/reco/${r.id}`; } : undefined;
                    return (
                      <tr key={r.id} style={{borderBottom:'1px solid var(--line)',cursor:goToReco?'pointer':'default'}} onClick={goToReco}
                        onMouseEnter={goToReco?(e)=>{e.currentTarget.style.background='var(--surface-2)';}:undefined}
                        onMouseLeave={goToReco?(e)=>{e.currentTarget.style.background='';}:undefined}>
                        <td style={{padding:'12px 14px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <div className="av" style={{width:30,height:30,fontSize:11,flexShrink:0,background:'var(--grad)'}}>{initialsOf(r.full_name||r.username||'?')}</div>
                            <div>
                              <div style={{fontWeight:700,fontSize:13}}>{r.full_name||r.username||'Anonymous'}</div>
                              {inMyCircle&&<span style={{fontSize:9,fontWeight:800,padding:'2px 6px',borderRadius:4,background:'var(--accent-soft)',color:'var(--accent-ink)',textTransform:'uppercase',letterSpacing:'.05em'}}>My Circle</span>}
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
                        <td style={{padding:'12px 14px',textAlign:'center'}}><ConvBadge level={r.conviction}/></td>
                        <td style={{padding:'12px 14px',textAlign:'center'}}>
                          <span style={{fontSize:11,fontWeight:700,padding:'3px 9px',borderRadius:5,
                            background:'var(--gain-soft)',color:'var(--gain)'}}>
                            Active
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Investors */}
      {tab==='investors'&&(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {[['In My Circle', inCircle, true], ['Community', notCircle, false]].map(([label, list, isCircle])=>(
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
                    const profileUrl = r.username ? `/#/investor/${r.username}` : null;
                    return (
                      <div key={r.from} style={{
                        display:'flex', alignItems:'center', gap:12, padding:'12px 18px',
                        borderBottom: i < list.length-1 ? '1px solid var(--line)' : 'none',
                      }}>
                        {/* Avatar */}
                        <div className="av" style={{width:40,height:40,fontSize:14,flexShrink:0,background:'var(--grad)',cursor:profileUrl?'pointer':'default'}}
                          onClick={()=>profileUrl&&(window.location.hash=profileUrl)}>
                          {initialsOf(r.full_name||r.username||'?')}
                        </div>

                        {/* Name + handle */}
                        <div style={{flex:1,minWidth:0}}>
                          <div
                            style={{fontWeight:700,fontSize:14,cursor:profileUrl?'pointer':'default',
                              color:profileUrl?'var(--accent-ink)':'var(--ink)',
                              textDecoration:profileUrl?'underline':'none',textDecorationColor:'rgba(109,93,245,.3)'}}
                            onClick={()=>profileUrl&&(window.location.hash=profileUrl)}
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
      )}

      {/* ── Statistics Tab ─────────────────────────────────────────── */}
      {tab==='stats'&&(
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

              {/* Monthly recommendation trend — SVG sparkline */}
              {stats.months.length>0&&(
                <div className="card">
                  <div className="card-head"><Target size={15}/> Idea Activity by Month</div>
                  <div className="card-body" style={{padding:'16px 20px'}}>
                    {(()=>{
                      const maxVal = Math.max(...stats.months.map(m=>m.buy+m.sell), 1);
                      const W = 560, H = 90, pad = 32, barW = Math.min(28, (W-2*pad)/Math.max(stats.months.length,1)-4);
                      const xStep = (W-2*pad) / Math.max(stats.months.length, 1);
                      return (
                        <svg viewBox={`0 0 ${W} ${H+40}`} style={{width:'100%',maxWidth:W,display:'block'}}>
                          {stats.months.map((m,i)=>{
                            const x  = pad + i*xStep;
                            const bH = (m.buy/maxVal)*(H-10);
                            const sH = (m.sell/maxVal)*(H-10);
                            return (
                              <g key={m.mo}>
                                <rect x={x} y={H-bH} width={barW} height={bH} rx={3} fill="var(--gain)" opacity={.8}/>
                                <rect x={x} y={H-bH-sH} width={barW} height={sH} rx={3} fill="var(--loss)" opacity={.8}/>
                                <text x={x+barW/2} y={H+14} textAnchor="middle" fontSize={8} fill="var(--muted)">
                                  {m.mo.slice(5)}
                                </text>
                                {(m.buy+m.sell)>0&&<text x={x+barW/2} y={H-bH-sH-4} textAnchor="middle" fontSize={9} fill="var(--ink)" fontWeight={700}>{m.buy+m.sell}</text>}
                              </g>
                            );
                          })}
                          {/* Legend */}
                          <rect x={W-90} y={2} width={10} height={10} rx={2} fill="var(--gain)" opacity={.8}/>
                          <text x={W-76} y={11} fontSize={9} fill="var(--muted)">Buy</text>
                          <rect x={W-50} y={2} width={10} height={10} rx={2} fill="var(--loss)" opacity={.8}/>
                          <text x={W-36} y={11} fontSize={9} fill="var(--muted)">Sell</text>
                        </svg>
                      );
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
      )}

      {/* ── AI Summary Tab ─────────────────────────────────────────── */}
      {tab==='ai'&&(
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
      )}
    </>
  );
}


// ── ResetPasswordPage ─────────────────────────────────────────────────────────
// Shown when the app loads with ?mode=resetPassword&oobCode=... in the URL.
// The oobCode was generated by Firebase Admin SDK in api/reset.py and is valid
// for 1 hour. confirmPasswordReset() validates and consumes it.
