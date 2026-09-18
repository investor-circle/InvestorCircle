import IdeaCard from '../../../../components/IdeaCard';
import { computeConsensus, consensusStrengthColor } from '../../../../lib/consensus';
import { money, day } from '../../../../lib/format';

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
const BASE_SECTIONS = [
  { id: 'consensus', label: 'Consensus' },
  { id: 'history', label: 'Idea History' },
  { id: 'investors', label: 'Investors' },
  { id: 'stats', label: 'Stats' },
];

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

export default function SecurityTabs({ symbol, ideas, summary, related = [] }) {
  const community = computeConsensus(ideas);
  const convictionCounts = countByField(ideas, 'conviction');
  const horizonCounts = countByField(ideas, 'horizon');
  const entryRange = priceRange(ideas, 'reco_price');
  const targetRange = priceRange(ideas, 'target_price');

  const investorMap = {};
  for (const idea of ideas) {
    const key = idea.author_username || idea.author_name;
    if (!investorMap[key]) investorMap[key] = idea;
  }
  const investors = Object.values(investorMap);
  const activeInvestorCount = investors.filter((i) => i.status === 'Active').length;

  const byMonth = {};
  for (const idea of ideas) {
    const mo = (idea.created_at ? String(idea.created_at) : '').slice(0, 7);
    if (!mo) continue;
    if (!byMonth[mo]) byMonth[mo] = { mo, buy: 0, sell: 0 };
    if (idea.recommendation_type === 'Buy') byMonth[mo].buy++;
    else byMonth[mo].sell++;
  }
  const months = Object.values(byMonth).sort((a, b) => a.mo.localeCompare(b.mo));
  // Active/closed already shown above the fold (page.jsx's stat strip) —
  // only expired isn't broken out there, so that's the one count still
  // computed here (see the Statistics section below).
  const expiredCount = ideas.filter((i) => i.status === 'Expired').length;

  const sections = related.length ? [...BASE_SECTIONS, { id: 'related', label: 'Related' }] : BASE_SECTIONS;

  return (
    <div>
      <nav className="tabs" aria-label="Jump to section">
        {sections.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="tab-btn">{s.label}</a>
        ))}
      </nav>

      <section id="consensus" aria-label="Consensus">
        <h2 style={{ marginTop: 4 }}>Community Consensus</h2>
        <div className="card">
          <div className="pad">
            {/* Raw Buy/Sell counts already shown above the fold (the badge
                row under the H1) — not repeated here, just the label and
                the same distribution as a bar. */}
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontWeight: 700 }}>{community.label}</span>
            </div>
            <div className="dist-bar">
              {community.bullPct > 0 && <div className="seg-buy" style={{ width: `${community.bullPct}%` }} />}
              {community.bearPct > 0 && <div className="seg-sell" style={{ width: `${community.bearPct}%` }} />}
            </div>

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
      </section>

      <section id="history" aria-label="Idea History">
        <h2 style={{ marginTop: 4 }}>Idea History on {symbol}</h2>
        <p className="meta" style={{ marginTop: -6, marginBottom: 14 }}>
          Immutable — every idea here is permanent, however it turned out.
          {(entryRange || targetRange) && ' '}
          {entryRange && `Entry ${formatRange(entryRange)} (${entryRange.count} of ${ideas.length} ideas)`}
          {entryRange && targetRange && ' · '}
          {targetRange && `Target ${formatRange(targetRange)} (${targetRange.count} of ${ideas.length} ideas)`}
        </p>
        <div className="idea-row" style={{ padding: 0 }}>
          {ideas.map((idea) => <IdeaCard key={idea.id} idea={idea} />)}
        </div>
      </section>

      <section id="investors" aria-label="Investors">
        <h2 style={{ marginTop: 4 }}>Investors covering {symbol}</h2>
        {/* "Currently active on their latest call" is deliberately spelled
            out — this counts INVESTORS (each one's most recent idea on
            {symbol}), not ideas, so it won't generally match the idea-level
            active/closed count already stated above the fold. Leaving that
            unstated read like the same number repeated, when it's actually
            a different measure. */}
        <p className="meta" style={{ marginTop: -10, marginBottom: 10 }}>
          {investors.length} investor{investors.length === 1 ? '' : 's'} {investors.length === 1 ? 'has' : 'have'} posted on {symbol} — {activeInvestorCount} {activeInvestorCount === 1 ? 'is' : 'are'} currently active on their latest call.
        </p>
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {investors.map((inv, i) => (
              <div
                key={inv.author_username || inv.author_name}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px',
                  borderBottom: i < investors.length - 1 ? '1px solid var(--line)' : 'none',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  {inv.author_username ? (
                    <a href={`https://myinvestorcircle.com/investor/${encodeURIComponent(inv.author_username)}`} style={{ fontWeight: 700 }}>
                      {inv.author_name || inv.author_username}
                    </a>
                  ) : (
                    <span style={{ fontWeight: 700 }}>{inv.author_name || 'Anonymous'}</span>
                  )}
                  {inv.author_username && <div className="meta">@{inv.author_username}</div>}
                </div>
                <span className={`tag ${inv.recommendation_type === 'Buy' ? 'tag-buy' : 'tag-sell'}`}>
                  {inv.recommendation_type === 'Buy' ? 'BUY' : 'SELL'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="stats" aria-label="Statistics">
        <h2 style={{ marginTop: 4 }}>Statistics</h2>
        {/* Total/active/closed already shown above the fold — this section
            only adds what isn't stated anywhere else: expired ideas (a
            third status the top strip doesn't break out) and the monthly
            activity below. */}
        {(summary?.last_posted || expiredCount > 0) && (
          <p className="meta" style={{ marginTop: -10, marginBottom: 16 }}>
            {summary?.last_posted && `Latest activity ${day(summary.last_posted)}`}
            {summary?.last_posted && expiredCount > 0 && ' · '}
            {expiredCount > 0 && `${expiredCount} expired`}
          </p>
        )}
        {months.length > 0 && (
          <div className="card">
            <div className="card-head">Idea activity by month</div>
            <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {months.map((m) => (
                <div key={m.mo} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span className="meta" style={{ width: 64, flexShrink: 0 }}>{m.mo}</span>
                  <span className="gain" style={{ fontWeight: 700 }}>{m.buy} buy</span>
                  <span className="loss" style={{ fontWeight: 700 }}>{m.sell} sell</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

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
