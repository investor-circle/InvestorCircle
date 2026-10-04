// Sections of the Security Page (Stock Insights), split out of StockInsights.jsx.
//
// The page answers two SEPARATE questions and never combines them:
//   Verified Research -> "what does verified research say?"   Buy / Hold / Sell
//   Market Views      -> "what are independent participants saying?"
//                                                              Positive / Neutral / Negative
// MIC organises and presents both; it does not issue a recommendation of its
// own, so there is deliberately no combined score or "bullish strength" here.
// A section whose dataset is empty is not rendered at all (see StockInsights).
import React from "react";
import { Users, Globe, Clock, BarChart2, Zap, Lightbulb, ShieldCheck, MessageSquare } from "lucide-react";
import { ConvBadge, IdeaDisclaimer, MemberBadgeOverlay, StatusBadge2 } from "../../components/common";
import { ThesisRenderer } from "../recommendations/Recommendations";
import { fmtDate, ideaStatusSummary, initialsOf } from "../../utils/format";
import { openProfile, openReco } from "../../utils/navigation";
import { ideaTypeMeta, toneColors } from "../../utils/ideaType";
import { researchBreakdown, researchMonthly, viewMonthly, viewBreakdown, viewBreakdownFromCounts, viewThemes, researchMonthlyFromAggregate, viewMonthlyFromAggregate, circleViewBreakdown } from "../../utils/securityInsights";

const when = (v) => v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const nameOf = (r) => r.full_name || r.username || 'Anonymous';

/* One horizontal distribution bar. `segments` = [{pct, color, label}] */
export function DistBar({ segments, height = 8 }) {
  const live = segments.filter(s => s.pct > 0);
  return (
    <div role="img" aria-label={segments.map(s => `${s.label} ${s.pct}%`).join(', ')}
      style={{ display: 'flex', height, borderRadius: 6, overflow: 'hidden', background: 'var(--line)' }}>
      {live.map(s => <div key={s.label} style={{ width: `${s.pct}%`, background: s.color }} />)}
    </div>
  );
}
const researchSegs = (b) => [
  { label: 'Buy', pct: b.buyPct, color: 'var(--gain)' },
  { label: 'Hold', pct: b.holdPct, color: 'var(--muted)' },
  { label: 'Sell', pct: b.sellPct, color: 'var(--loss)' },
];
const viewSegs = (b) => [
  { label: 'Positive', pct: b.positivePct, color: 'var(--gain)' },
  { label: 'Neutral', pct: b.neutralPct, color: 'var(--muted)' },
  { label: 'Negative', pct: b.negativePct, color: 'var(--loss)' },
];

/* Header summary: the two layers side by side (stacked on a phone). */
export function LayerSummary({ research, views, isMobile }) {
  if (!research && !views) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile || !(research && views) ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
      {research && (
        <div className="card" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 6 }}>
            <ShieldCheck size={13} /> Verified Research
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
            <span style={{ color: 'var(--gain)' }}>{research.buy} Buy</span>
            <span style={{ color: 'var(--muted)' }}> · </span>
            <span style={{ color: 'var(--ink-soft)' }}>{research.hold} Hold</span>
            <span style={{ color: 'var(--muted)' }}> · </span>
            <span style={{ color: 'var(--loss)' }}>{research.sell} Sell</span>
          </div>
          <DistBar segments={researchSegs(research)} />
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
            {research.total} piece{research.total === 1 ? '' : 's'} of research{research.publishers ? ` from ${research.publishers} publisher${research.publishers === 1 ? '' : 's'}` : ''}
          </div>
        </div>
      )}
      {views && (
        <div className="card" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 6 }}>
            <MessageSquare size={13} /> Market Views
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
            <span style={{ color: 'var(--gain)' }}>{views.positive} Positive</span>
            <span style={{ color: 'var(--muted)' }}> · </span>
            <span style={{ color: 'var(--ink-soft)' }}>{views.neutral} Neutral</span>
            <span style={{ color: 'var(--muted)' }}> · </span>
            <span style={{ color: 'var(--loss)' }}>{views.negative} Negative</span>
          </div>
          <DistBar segments={viewSegs(views)} />
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
            {views.total} independent view{views.total === 1 ? '' : 's'}{views.contributors ? ` from ${views.contributors} contributor${views.contributors === 1 ? '' : 's'}` : ''}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionHead({ id, refCb, title, sub }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>{title}</h2>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3, lineHeight: 1.5 }}>{sub}</div>
    </div>
  );
}

/* Month rows: a slim proportional bar per month, one colour per kind. */
function ActivityRows({ months, kinds }) {
  const max = Math.max(...months.map(m => kinds.reduce((a, k) => a + m[k.key], 0)), 1);
  return (
    <div className="card-body" style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {months.map(m => (
        <div key={m.mo} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 72, flexShrink: 0, fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>
            {new Date(`${m.mo}-01`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
          </div>
          <div style={{ flex: 1, height: 8, borderRadius: 6, overflow: 'hidden', background: 'var(--line)', display: 'flex' }}>
            {kinds.map(k => m[k.key] > 0 && <div key={k.key} style={{ width: `${(m[k.key] / max) * 100}%`, background: k.color }} />)}
          </div>
          <div style={{ minWidth: 130, flexShrink: 0, textAlign: 'right', fontSize: 12.5 }}>
            {kinds.filter(k => m[k.key] > 0).map((k, i) => (
              <span key={k.key} style={{ color: k.color, fontWeight: 700, marginLeft: i ? 8 : 0 }}>{m[k.key]} {k.label}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const Avatar = ({ r, size, memberTags }) => (
  <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
    {r.avatar_url
      ? <img src={r.avatar_url} alt="" className="av" style={{ width: size, height: size, objectFit: 'cover', cursor: r.username ? 'pointer' : 'default' }} onClick={() => r.username && openProfile(r.username)} />
      : <div className="av" style={{ width: size, height: size, fontSize: size * 0.35, background: r.avatar_color || 'var(--grad)', cursor: r.username ? 'pointer' : 'default' }} onClick={() => r.username && openProfile(r.username)}>{initialsOf(nameOf(r))}</div>}
    <MemberBadgeOverlay tags={memberTags} size={size} />
  </div>
);

const TypePill = ({ t, size = 11 }) => {
  const m = ideaTypeMeta(t); const c = toneColors(m.tone);
  return <span style={{ fontSize: size, fontWeight: 800, padding: '3px 9px', borderRadius: 5, whiteSpace: 'nowrap', background: c.bg, color: c.fg }}>{m.label.toUpperCase()}</span>;
};
const CirclePill = () => <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'var(--accent-soft)', color: 'var(--accent-ink)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Your Circle</span>;

/* ───────────────────────── Verified Research ───────────────────────── */
export function ResearchSection({ sectionRef, ticker, recos, breakdown, monthly, circleIds, isMobile, memberTagsByUser }) {
  // `breakdown` carries the exact counts when the data source caps its list.
  const b = breakdown || researchBreakdown(recos, r => r.from);
  // Exact server aggregate when the list is capped (public path); else the full list.
  const months = monthly ? researchMonthlyFromAggregate(monthly) : researchMonthly(recos);
  const convMap = {};
  recos.forEach(r => { if (r.conviction) convMap[r.conviction] = (convMap[r.conviction] || 0) + 1; });
  const active = recos.filter(r => r.status === 'Active').length;
  const closed = recos.filter(r => r.status === 'Closed').length;
  const expired = recos.filter(r => r.status === 'Expired').length;
  return (
    <section ref={sectionRef} data-section="research" style={{ marginTop: 28, scrollMarginTop: 76 }}>
      <SectionHead title="Verified Research"
        sub={`Published by Verified Research Publishers. Buy / Hold / Sell with entry price, target and outcome on the record — immutable once posted.`} />

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div className="card-head" style={{ justifyContent: "flex-start", gap: 6 }}><BarChart2 size={15} /> Research Consensus</div>
          <div className="card-body" style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 10 }}>
              <span style={{ color: 'var(--gain)' }}>{b.buy} Buy</span> <span style={{ color: 'var(--muted)' }}>·</span>{' '}
              <span style={{ color: 'var(--ink-soft)' }}>{b.hold} Hold</span> <span style={{ color: 'var(--muted)' }}>·</span>{' '}
              <span style={{ color: 'var(--loss)' }}>{b.sell} Sell</span>
            </div>
            <DistBar segments={researchSegs(b)} height={10} />
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              Buy {b.buyPct}% · Hold {b.holdPct}% · Sell {b.sellPct}% — across {b.total} piece{b.total === 1 ? '' : 's'} of research from {b.publishers} publisher{b.publishers === 1 ? '' : 's'}.
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-head" style={{ justifyContent: "flex-start", gap: 6 }}><Clock size={15} /> Research status</div>
          <div className="card-body" style={{ padding: '16px 18px' }}>
            <div className="statgrid">
              <div className="stat"><div className="v">{b.total}</div><div className="l">Research</div></div>
              <div className="stat"><div className="v">{active}</div><div className="l">Active</div></div>
              <div className="stat"><div className="v">{closed}</div><div className="l">Closed</div></div>
              <div className="stat"><div className="v">{expired}</div><div className="l">Expired</div></div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 10 }}>{ideaStatusSummary(active, closed, expired)}</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head" style={{ justifyContent: "flex-start", gap: 6 }}><Clock size={15} /> Research History <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400, marginLeft: 4 }}>(immutable — all research is permanent)</span></div>
        {recos.length < b.total && <div style={{ padding: '8px 14px', fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--line)' }}>Showing the latest {recos.length} of {b.total} research ideas. The consensus above counts all {b.total}.</div>}
        {isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 10 }}>
            {recos.map(r => {
              const go = r.username ? () => openReco(r.username, r.id) : undefined;
              return (
                <div key={r.id} onClick={go} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', cursor: go ? 'pointer' : 'default' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Avatar r={r} size={28} memberTags={memberTagsByUser[r.from]} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{nameOf(r)}</div>
                      {circleIds.has(r.from) && <CirclePill />}
                    </div>
                    <TypePill t={r.recommendation_type} />
                  </div>
                  {r.thesis && r.thesis !== '—' && <div style={{ marginBottom: 8, fontSize: 12.5 }}><ThesisRenderer thesis={r.thesis} previewLines={2} /></div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
                    <span>{when(r.created_at)}</span>
                    {r.reco_price && <span>· Entry ₹{Number(r.reco_price).toLocaleString('en-IN')}</span>}
                    {r.return_pct != null && <span style={{ fontWeight: 700, color: Number(r.return_pct) >= 0 ? 'var(--gain)' : 'var(--loss)' }}>· {Number(r.return_pct) >= 0 ? '+' : ''}{Number(r.return_pct).toFixed(1)}%</span>}
                    <ConvBadge level={r.conviction} />
                    <StatusBadge2 status={r.status || 'Active'} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--line)' }}>
                  {['Publisher', 'Rating', 'Date', 'Entry Price', 'Return', 'Conviction', 'Status'].map((h, i) => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: i === 0 ? 'left' : 'center', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recos.map(r => {
                  const go = r.username ? () => openReco(r.username, r.id) : undefined;
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--line)', cursor: go ? 'pointer' : 'default' }} onClick={go}
                      onMouseEnter={go ? (e) => { e.currentTarget.style.background = 'var(--surface-2)'; } : undefined}
                      onMouseLeave={go ? (e) => { e.currentTarget.style.background = ''; } : undefined}>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar r={r} size={30} memberTags={memberTagsByUser[r.from]} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{nameOf(r)}</div>
                            {circleIds.has(r.from) && <CirclePill />}
                            {r.thesis && r.thesis !== '—' && <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ink-soft)', maxWidth: 320 }}><ThesisRenderer thesis={r.thesis} previewLines={2} /></div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}><TypePill t={r.recommendation_type} /></td>
                      <td style={{ padding: '12px 14px', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>{when(r.created_at)}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'center', fontSize: 13, fontWeight: 600 }}>{r.reco_price ? `₹${Number(r.reco_price).toLocaleString('en-IN')}` : '—'}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: r.return_pct != null ? (Number(r.return_pct) >= 0 ? 'var(--gain)' : 'var(--loss)') : 'var(--muted)' }}>
                        {r.return_pct != null ? `${Number(r.return_pct) >= 0 ? '+' : ''}${Number(r.return_pct).toFixed(1)}%` : '—'}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}><ConvBadge level={r.conviction} /></td>
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}><StatusBadge2 status={r.status || 'Active'} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(months.length > 0 || Object.keys(convMap).length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile || !(months.length && Object.keys(convMap).length) ? '1fr' : '2fr 1fr', gap: 16 }}>
          {months.length > 0 && (
            <div className="card">
              <div className="card-head" style={{ justifyContent: "flex-start", gap: 6 }}><BarChart2 size={15} /> Research activity by month</div>
              <ActivityRows months={months} kinds={[{ key: 'Buy', label: 'Buy', color: 'var(--gain)' }, { key: 'Hold', label: 'Hold', color: 'var(--muted)' }, { key: 'Sell', label: 'Sell', color: 'var(--loss)' }]} />
            </div>
          )}
          {Object.keys(convMap).length > 0 && (
            <div className="card">
              <div className="card-head" style={{ justifyContent: "flex-start", gap: 6 }}><Zap size={15} /> Conviction Breakdown</div>
              <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '12px 16px' }}>
                {Object.entries(convMap).sort((a, b) => b[1] - a[1]).map(([label, count]) => (
                  <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 16px', background: 'var(--surface-2)', borderRadius: 10, minWidth: 80 }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--accent-ink)' }}>{count}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, textAlign: 'center' }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ─────────────────────────── Market Views ─────────────────────────── */
function DistRow({ label, b, note }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>
          <span style={{ color: 'var(--gain)' }}>{b.positivePct}% Positive</span> · <span style={{ color: 'var(--ink-soft)' }}>{b.neutralPct}% Neutral</span> · <span style={{ color: 'var(--loss)' }}>{b.negativePct}% Negative</span>
        </span>
      </div>
      <DistBar segments={viewSegs(b)} />
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{b.total} view{b.total === 1 ? '' : 's'}{note ? ` · ${note}` : ''}</div>
    </div>
  );
}

export function ViewCard({ v, inCircle, memberTags }) {
  const go = v.username ? () => openReco(v.username, v.id) : undefined;
  return (
    <div onClick={go} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', cursor: go ? 'pointer' : 'default', background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Avatar r={v} size={34} memberTags={memberTags} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 13.5, color: v.username ? 'var(--accent-ink)' : 'var(--ink)', cursor: v.username ? 'pointer' : 'default' }}
              onClick={(e) => { if (v.username) { e.stopPropagation(); openProfile(v.username); } }}>{nameOf(v)}</span>
            {inCircle && <CirclePill />}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Independent contributor · {fmtDate(v.created_at)}</div>
        </div>
        <TypePill t={v.recommendation_type} />
      </div>
      {v.thesis && v.thesis !== '—' && <div style={{ fontSize: 13 }}><ThesisRenderer thesis={v.thesis} previewLines={3} /></div>}
      <IdeaDisclaimer compact text={v.disclosure} style={{ marginTop: 6 }} />
    </div>
  );
}

export function ViewsSection({ sectionRef, ticker, summary, views, stances, monthly, byContributor, hasMore, loadingMore, onLoadMore, signedIn, circleIds, onSignIn, isMobile, memberTagsByUser }) {
  const community = viewBreakdownFromCounts(summary);
  // Exact server aggregates over every public view; the capped stances are only a fallback.
  const circle = !signedIn ? viewBreakdownFromCounts({})
    : byContributor ? circleViewBreakdown(byContributor, id => circleIds.has(id))
    : viewBreakdown(stances.filter(s => circleIds.has(s.from)), s => s.from);
  const months = monthly ? viewMonthlyFromAggregate(monthly) : viewMonthly(stances);
  const themes = viewThemes(views, { nameOf: (r) => nameOf(r) });
  const hasThemes = themes.positive.length > 0 || themes.concerns.length > 0;
  return (
    <section ref={sectionRef} data-section="views" style={{ marginTop: 36, scrollMarginTop: 76 }}>
      <SectionHead title="Market Views"
        sub="Independent commentary from members of myInvestorCircle — personal views, not research and not a recommendation. myInvestorCircle does not endorse them." />

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div className="card-head" style={{ justifyContent: "flex-start", gap: 6 }}><MessageSquare size={15} /> Community sentiment</div>
          <div className="card-body" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 900 }}>{community.total} independent view{community.total === 1 ? '' : 's'}</div>
            <DistRow label="Community" b={community} note={community.contributors ? `${community.contributors} contributor${community.contributors === 1 ? '' : 's'}` : null} />
          </div>
        </div>
        <div className="card">
          <div className="card-head" style={{ justifyContent: "flex-start", gap: 6 }}><Globe size={15} /> Your Circle vs Community</div>
          <div className="card-body" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {signedIn ? (
              circle.total > 0
                ? <DistRow label="Your Circle" b={circle} />
                : <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>No one in Your Circle has shared a view on {ticker} yet.</div>
            ) : (
              <div style={{ padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 10, border: '1px dashed var(--line)', textAlign: 'center' }}>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 8 }}>Sign in to see how the people you're connected with see {ticker}.</div>
                <button className="btn btn-pri btn-sm" onClick={onSignIn}>Sign in</button>
              </div>
            )}
            <DistRow label="Community" b={community} />
          </div>
        </div>
      </div>

      {hasThemes && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head" style={{ justifyContent: "flex-start", gap: 6 }}><Lightbulb size={15} /> Market View Summary</div>
          <div className="card-body" style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>
              A summary of themes appearing across community views on this security. Short snippets from {themes.basis.positive} Positive and {themes.basis.concerns} Negative view{themes.basis.positive + themes.basis.concerns === 1 ? '' : 's'} with commentary.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile || !(themes.positive.length && themes.concerns.length) ? '1fr' : '1fr 1fr', gap: 16 }}>
              {[['Positive themes', themes.positive, 'var(--gain)', 'var(--gain-soft)'], ['Concerns raised', themes.concerns, 'var(--loss)', 'var(--loss-soft)']].map(([title, list, fg, bg]) => list.length > 0 && (
                <div key={title}>
                  <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: fg, marginBottom: 8 }}>{title}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {list.map(t => (
                      <div key={t.id} style={{ padding: '10px 12px', background: bg, borderRadius: 8, borderLeft: `3px solid ${fg}`, fontSize: 13, lineHeight: 1.5 }}>
                        “{t.text}”{t.by && <span style={{ color: 'var(--muted)', fontSize: 11.5 }}> — {t.by}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 12 }}>
              Snippets are contributors' own words from public Market Views, shown with attribution. myInvestorCircle draws no conclusion from them — this is community opinion, not financial advice or a recommendation.
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head" style={{ justifyContent: "flex-start", gap: 6 }}><Users size={15} /> Latest Market Views</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 10 }}>
          {views.map(v => <ViewCard key={v.id} v={v} inCircle={circleIds.has(v.from)} memberTags={memberTagsByUser[v.from]} />)}
          {hasMore && (
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'center' }} disabled={loadingMore} onClick={onLoadMore}>
              {loadingMore ? 'Loading…' : `Show more (${Math.max(community.total - views.length, 0)} more)`}
            </button>
          )}
        </div>
      </div>

      {months.length > 0 && (
        <div className="card">
          <div className="card-head" style={{ justifyContent: "flex-start", gap: 6 }}><BarChart2 size={15} /> Market View activity by month</div>
          <ActivityRows months={months} kinds={[{ key: 'Positive', label: 'Positive', color: 'var(--gain)' }, { key: 'Neutral', label: 'Neutral', color: 'var(--muted)' }, { key: 'Negative', label: 'Negative', color: 'var(--loss)' }]} />
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── People / contributors ───────────────────────── */
function PersonRow({ r, ici, last, kind, memberTags }) {
  const bandColor = ici?.band === 'Strong' ? 'var(--gain)' : ici?.band === 'Good' ? 'var(--accent)' : ici?.band === 'Building' ? '#f59e0b' : 'var(--muted)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: last ? 'none' : '1px solid var(--line)' }}>
      <Avatar r={r} size={40} memberTags={memberTags} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, cursor: r.username ? 'pointer' : 'default', color: r.username ? 'var(--accent-ink)' : 'var(--ink)', textDecoration: r.username ? 'underline' : 'none', textDecorationColor: 'rgba(109,93,245,.3)' }}
          onClick={() => r.username && openProfile(r.username)}>{nameOf(r)}</div>
        {r.username && <div style={{ fontSize: 11, color: 'var(--muted)' }}>@{r.username}</div>}
      </div>
      {/* Research publishers carry their ICI. A Market View contributor has no
          tracked research, so an ICI would be meaningless — and showing one
          would read as MIC vouching for their view. */}
      {kind === 'research' && (
        <div style={{ textAlign: 'center', flexShrink: 0, minWidth: 44 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: ici ? bandColor : 'var(--muted)', lineHeight: 1 }}>{ici ? ici.score : '—'}</div>
          <div style={{ fontSize: 9, color: ici ? bandColor : 'var(--muted)', fontWeight: 700, marginTop: 2 }}>{ici ? ici.band : 'ICI'}</div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        {kind === 'research' && <ConvBadge level={r.conviction} />}
        <TypePill t={r.recommendation_type} />
      </div>
    </div>
  );
}

export function PeopleSection({ sectionRef, ticker, recos, contributors, signedIn, circleIds, investorIcis, onSignIn, memberTagsByUser }) {
  const publishers = Object.values(recos.reduce((m, r) => { if (!m[r.from]) m[r.from] = r; return m; }, {}));
  const groups = [];
  if (publishers.length) groups.push({ key: 'research', title: 'Research publishers', list: publishers });
  if (contributors.length) groups.push({ key: 'views', title: 'Market View contributors', list: contributors });
  if (!groups.length) return null;
  return (
    <section ref={sectionRef} data-section="people" style={{ marginTop: 36, scrollMarginTop: 76 }}>
      <SectionHead title="People" sub={`Who has published research or shared a view on ${ticker}. Each person's latest rating or view is shown — it is theirs, not myInvestorCircle's.`} />
      {!signedIn && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-body" style={{ padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>See who in Your Circle has covered {ticker}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Sign in to see which of your connections and tracked investors have published research or shared a view.</div>
            <button className="btn btn-pri btn-sm" onClick={onSignIn}>Sign in</button>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {groups.map(g => [['In Your Circle', g.list.filter(r => circleIds.has(r.from)), true], ['Community', g.list.filter(r => !circleIds.has(r.from)), false]].map(([label, list, isCircle]) => list.length > 0 && (
          <div key={g.key + label} className="card">
            <div className="card-head" style={{ justifyContent: "flex-start", gap: 6 }}>{isCircle ? <Users size={15} /> : <Globe size={15} />} {g.title} — {label} ({list.length})</div>
            <div className="card-body" style={{ padding: 0 }}>
              {list.map((r, i) => <PersonRow key={r.from} r={r} kind={g.key} ici={investorIcis[r.from]} last={i === list.length - 1} memberTags={memberTagsByUser[r.from]} />)}
            </div>
          </div>
        )))}
      </div>
    </section>
  );
}
