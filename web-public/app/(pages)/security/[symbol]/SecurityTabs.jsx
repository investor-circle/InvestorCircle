import IdeaCard from '../../../../components/IdeaCard';
import ViewCard from '../../../../components/ViewCard';
import { researchBreakdownOf } from '../../../../lib/securityModel';
import { ideaTypeMeta } from '../../../../lib/ideaType';
import { money, day } from '../../../../lib/format';
import {
  researchRows, researchMonthly, viewBreakdownFromCounts, viewMonthly, currentViews, viewThemes,
} from '../../../../lib/securityInsights';

// Deliberately NOT a tab switcher that hides inactive panels: an earlier
// version of this component used client-side state to show only one
// section at a time (the other three carrying the `hidden` attribute).
// Verified against a real (JS-disabled) browser render — `hidden` sections
// are excluded from what a browser's own text layout considers visible
// content, and Google's own guidance on hide/show UI patterns is that such
// content, while crawled, does not carry full ranking weight. For a page
// that exists specifically to be indexed, that is exactly the wrong
// trade-off — so instead every section is always in the document, always
// visible, and the "tabs" below are plain in-page anchor links (`<a
// href="#history">`) that jump to a section. That works with zero
// JavaScript at all: no client component, no hydration dependency for the
// one thing that matters most here.
// Sections are offered (and rendered) only when their dataset exists:
// Verified Research and Market Views are separate layers, and a layer with no
// data is hidden rather than shown as an empty card.

const CONVICTION_ORDER = ['Low', 'Medium', 'High'];
const HORIZON_ORDER = ['<3m', '6m', '12m', '>2Y'];

// Counts idea[field] by its existing value only — no bucketing/inference,
// since conviction and horizon are both small fixed enums the poster picked
// from (see src/constants/app.js HORIZONS, and the Conviction <select> in
// Recommendations.jsx), not free text this would have to guess at.
function countByField(ideas, field) {
  const counts = {};
  for (const idea of ideas) {
    const v = idea[field];
    if (!v) continue;
    counts[v] = (counts[v] || 0) + 1;
  }
  return counts;
}

// Min–max across ideas that actually have this price field set. Returns
// null (renders nothing) rather than a range built from a partial subset
// presented as if it covered every idea — the caller shows the coverage
// count alongside so a range from 2 of 5 ideas never reads as "the" range.
function priceRange(ideas, field) {
  const vals = ideas
    .map((i) => Number(i[field]))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (!vals.length) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  return { min, max, count: vals.length };
}

function formatRange(range) {
  if (!range) return null;
  return range.min === range.max ? money(range.min) : `${money(range.min)}–${money(range.max)}`;
}

export default function SecurityTabs({ symbol, ideas, summary, views = [], viewSummary = {}, viewStances = [], related = [] }) {
  const research = researchRows(ideas);
  const rb = researchBreakdownOf({ summary }, research);
  const vb = viewBreakdownFromCounts({ ...viewSummary, contributors: viewSummary.contributor_count });
  const hasResearch = research.length > 0;
  const hasViews = vb.total > 0;

  const convictionCounts = countByField(research, 'conviction');
  const horizonCounts = countByField(research, 'horizon');
  const entryRange = priceRange(research, 'reco_price');
  const targetRange = priceRange(research, 'target_price');

  const publisherMap = {};
  for (const idea of research) {
    const key = idea.author_username || idea.author_name;
    if (!publisherMap[key]) publisherMap[key] = idea;
  }
  const publishers = Object.values(publisherMap);
  const contributors = currentViews(views, (v) => v.author_username || v.author_name);

  const researchMonths = researchMonthly(research);
  const viewMonths = viewMonthly(viewStances);
  const themes = viewThemes(views, { nameOf: (v) => v.author_name || v.author_username || null });
  const hasThemes = themes.positive.length > 0 || themes.concerns.length > 0;
  const expiredCount = research.filter((i) => i.status === 'Expired').length;

  const sections = [
    hasResearch && { id: 'research', label: 'Verified Research' },
    hasViews && { id: 'views', label: 'Market Views' },
    (publishers.length > 0 || contributors.length > 0) && { id: 'people', label: 'People' },
    related.length > 0 && { id: 'related', label: 'Related' },
  ].filter(Boolean);

  return (
    <div>
      <nav className="tabs" aria-label="Jump to section">
        {sections.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="tab-btn">{s.label}</a>
        ))}
      </nav>

      {hasResearch && (
        <section id="research" aria-label="Verified Research">
          <h2 style={{ marginTop: 4 }}>Verified Research on {symbol}</h2>
          <p className="meta" style={{ marginTop: -6, marginBottom: 14 }}>
            Published by Verified Research Publishers: Buy / Hold / Sell with entry price, target and outcome on the record. Immutable — every piece is permanent, however it turned out.
          </p>

          <div className="card">
            <div className="card-head">Research Consensus</div>
            <div className="pad">
              <div className="layer-counts">
                <span className="gain">{rb.buy} Buy</span> · <span>{rb.hold} Hold</span> · <span className="loss">{rb.sell} Sell</span>
              </div>
              <div className="dist-bar">
                {rb.buyPct > 0 && <div className="seg-buy" style={{ width: `${rb.buyPct}%` }} />}
                {rb.holdPct > 0 && <div className="seg-neutral" style={{ width: `${rb.holdPct}%` }} />}
                {rb.sellPct > 0 && <div className="seg-sell" style={{ width: `${rb.sellPct}%` }} />}
              </div>
              <div className="meta" style={{ marginTop: 6 }}>Buy {rb.buyPct}% · Hold {rb.holdPct}% · Sell {rb.sellPct}%</div>

              {(CONVICTION_ORDER.some((k) => convictionCounts[k]) || HORIZON_ORDER.some((k) => horizonCounts[k])) && (
                <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
                  {CONVICTION_ORDER.some((k) => convictionCounts[k]) && (
                    <div>
                      <div className="meta">Conviction</div>
                      <div className="badge-row">
                        {CONVICTION_ORDER.filter((k) => convictionCounts[k]).map((k) => (
                          <span className="tag" key={k}>{k} · {convictionCounts[k]}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {HORIZON_ORDER.some((k) => horizonCounts[k]) && (
                    <div>
                      <div className="meta">Horizon</div>
                      <div className="badge-row">
                        {HORIZON_ORDER.filter((k) => horizonCounts[k]).map((k) => (
                          <span className="tag" key={k}>{k} · {horizonCounts[k]}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <h3 style={{ margin: '22px 0 6px' }}>Research History</h3>
          <p className="meta" style={{ marginTop: 0, marginBottom: 14 }}>
            {entryRange && `Entry ${formatRange(entryRange)} (${entryRange.count} of ${research.length})`}
            {entryRange && targetRange && ' · '}
            {targetRange && `Target ${formatRange(targetRange)} (${targetRange.count} of ${research.length})`}
            {expiredCount > 0 && `${entryRange || targetRange ? ' · ' : ''}${expiredCount} expired`}
            {summary?.last_posted && `${entryRange || targetRange || expiredCount ? ' · ' : ''}Latest ${day(summary.last_posted)}`}
          </p>
          <div className="idea-row" style={{ padding: 0 }}>
            {research.map((idea) => <IdeaCard key={idea.id} idea={idea} />)}
          </div>
          {research.length < rb.total && (
            <p className="meta" style={{ marginTop: 10 }}>
              Showing the latest {research.length} of {rb.total} research ideas. The consensus above counts all {rb.total}.
            </p>
          )}

          {researchMonths.length > 0 && (
            <div className="card" style={{ marginTop: 14 }}>
              <div className="card-head">Research activity by month</div>
              <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {researchMonths.map((m) => (
                  <div key={m.mo} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, flexWrap: 'wrap' }}>
                    <span className="meta" style={{ width: 64, flexShrink: 0 }}>{m.mo}</span>
                    {m.Buy > 0 && <span className="gain" style={{ fontWeight: 700 }}>{m.Buy} Buy</span>}
                    {m.Hold > 0 && <span style={{ fontWeight: 700 }}>{m.Hold} Hold</span>}
                    {m.Sell > 0 && <span className="loss" style={{ fontWeight: 700 }}>{m.Sell} Sell</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {hasViews && (
        <section id="views" aria-label="Market Views">
          <h2 style={{ marginTop: 4 }}>Market Views on {symbol}</h2>
          <p className="meta" style={{ marginTop: -6, marginBottom: 14 }}>
            Independent commentary from members of myInvestorCircle — personal views, not research and not a recommendation. myInvestorCircle does not endorse them.
          </p>

          <div className="card">
            <div className="card-head">Community sentiment</div>
            <div className="pad">
              <div className="layer-counts">{vb.total} independent view{vb.total === 1 ? '' : 's'}</div>
              <div className="dist-bar">
                {vb.positivePct > 0 && <div className="seg-buy" style={{ width: `${vb.positivePct}%` }} />}
                {vb.neutralPct > 0 && <div className="seg-neutral" style={{ width: `${vb.neutralPct}%` }} />}
                {vb.negativePct > 0 && <div className="seg-sell" style={{ width: `${vb.negativePct}%` }} />}
              </div>
              <div className="meta" style={{ marginTop: 6 }}>
                <span className="gain">Positive {vb.positivePct}%</span> · Neutral {vb.neutralPct}% · <span className="loss">Negative {vb.negativePct}%</span>
                {vb.contributors ? ` · ${vb.contributors} contributor${vb.contributors === 1 ? '' : 's'}` : ''}
              </div>
            </div>
          </div>

          {hasThemes && (
            <div className="card" style={{ marginTop: 14 }}>
              <div className="card-head">Market View Summary</div>
              <div className="pad">
                <p className="meta" style={{ marginTop: 0 }}>
                  A summary of themes appearing across community views on this security. Short snippets from {themes.basis.positive} Positive and {themes.basis.concerns} Negative view{themes.basis.positive + themes.basis.concerns === 1 ? '' : 's'} with commentary.
                </p>
                {themes.positive.length > 0 && (
                  <>
                    <div className="layer-label" style={{ marginTop: 10 }}>Positive themes</div>
                    {themes.positive.map((t) => (
                      <div key={t.id} className="quote pos">“{t.text}”{t.by && <span className="meta"> — {t.by}</span>}</div>
                    ))}
                  </>
                )}
                {themes.concerns.length > 0 && (
                  <>
                    <div className="layer-label" style={{ marginTop: 14 }}>Concerns raised</div>
                    {themes.concerns.map((t) => (
                      <div key={t.id} className="quote neg">“{t.text}”{t.by && <span className="meta"> — {t.by}</span>}</div>
                    ))}
                  </>
                )}
                <p className="meta" style={{ marginTop: 12 }}>
                  Snippets are contributors’ own words from public Market Views, shown with attribution. myInvestorCircle draws no conclusion from them — this is community opinion, not financial advice or a recommendation.
                </p>
              </div>
            </div>
          )}

          <h3 style={{ margin: '22px 0 6px' }}>Latest Market Views</h3>
          <div className="idea-row" style={{ padding: 0 }}>
            {views.map((v) => <ViewCard key={v.id} view={v} />)}
          </div>
          {vb.total > views.length && (
            <p className="meta" style={{ marginTop: 10 }}>
              Showing the latest {views.length} of {vb.total} Market Views. Sign in to myInvestorCircle to see them all.
            </p>
          )}

          {viewMonths.length > 0 && (
            <div className="card" style={{ marginTop: 14 }}>
              <div className="card-head">Market View activity by month</div>
              <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {viewMonths.map((m) => (
                  <div key={m.mo} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, flexWrap: 'wrap' }}>
                    <span className="meta" style={{ width: 64, flexShrink: 0 }}>{m.mo}</span>
                    {m.Positive > 0 && <span className="gain" style={{ fontWeight: 700 }}>{m.Positive} Positive</span>}
                    {m.Neutral > 0 && <span style={{ fontWeight: 700 }}>{m.Neutral} Neutral</span>}
                    {m.Negative > 0 && <span className="loss" style={{ fontWeight: 700 }}>{m.Negative} Negative</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {(publishers.length > 0 || contributors.length > 0) && (
        <section id="people" aria-label="People">
          <h2 style={{ marginTop: 4 }}>People covering {symbol}</h2>
          <p className="meta" style={{ marginTop: -10, marginBottom: 10 }}>
            Each person’s latest rating or view is shown — it is theirs, not myInvestorCircle’s.
          </p>
          {[
            ['Research publishers', publishers, (p) => p.recommendation_type],
            ['Market View contributors', contributors, (c) => c.recommendation_type],
          ].map(([title, list, typeOf]) => list.length > 0 && (
            <div className="card" key={title} style={{ marginBottom: 12 }}>
              <div className="card-head">{title} ({list.length})</div>
              <div className="card-body" style={{ padding: 0 }}>
                {list.map((p, i) => (
                  <div key={p.author_username || p.author_name}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: i < list.length - 1 ? '1px solid var(--line)' : 'none' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {p.author_username ? (
                        <a href={`https://myinvestorcircle.com/investor/${encodeURIComponent(p.author_username)}`} style={{ fontWeight: 700 }}>
                          {p.author_name || p.author_username}
                        </a>
                      ) : (
                        <span style={{ fontWeight: 700 }}>{p.author_name || 'Anonymous'}</span>
                      )}
                      {p.author_username && <div className="meta">@{p.author_username}</div>}
                    </div>
                    <span className={`tag ${ideaTypeMeta(typeOf(p)).tag}`}>{ideaTypeMeta(typeOf(p)).label.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {related.length > 0 && (
        <section id="related" aria-label="Related Securities">
          <h2 style={{ marginTop: 4 }}>Related Securities</h2>
          <p className="meta" style={{ marginTop: -10, marginBottom: 10 }}>
            Other stocks in the same sector with public ideas.
          </p>
          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              {related.map((r, i) => (
                <a
                  key={r.symbol}
                  href={`/security/${encodeURIComponent(r.symbol)}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', color: 'inherit',
                    borderBottom: i < related.length - 1 ? '1px solid var(--line)' : 'none',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{r.name || r.symbol}</div>
                    <div className="meta">{r.symbol}</div>
                  </div>
                  <span className="tag">{r.idea_count} idea{Number(r.idea_count) === 1 ? '' : 's'}</span>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
