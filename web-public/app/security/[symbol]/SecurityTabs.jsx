import IdeaCard from '../../../components/IdeaCard';
import { computeConsensus, consensusStrengthColor } from '../../../lib/consensus';

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
const SECTIONS = [
  { id: 'consensus', label: 'Consensus' },
  { id: 'history', label: 'Idea History' },
  { id: 'investors', label: 'Investors' },
  { id: 'stats', label: 'Stats' },
];

export default function SecurityTabs({ symbol, ideas }) {
  const community = computeConsensus(ideas);

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
  const activeCount = ideas.filter((i) => i.status === 'Active').length;
  const closedCount = ideas.filter((i) => i.status === 'Closed').length;
  const expiredCount = ideas.filter((i) => i.status === 'Expired').length;

  return (
    <div>
      <p className="lede" style={{ marginTop: 4, marginBottom: 0 }}>
        {investors.length} {investors.length === 1 ? 'person has' : 'people have'} shared their view{investors.length === 1 ? '' : 's'} on {symbol} —{' '}
        {activeInvestorCount} {activeInvestorCount === 1 ? 'is' : 'are'} still active.
      </p>

      <nav className="tabs" aria-label="Jump to section">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="tab-btn">{s.label}</a>
        ))}
      </nav>

      <section id="consensus" aria-label="Consensus">
        <div className="card">
          <div className="card-head">Community consensus</div>
          <div className="pad">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontWeight: 700 }}>{community.label}</span>
              <span style={{ fontWeight: 700, color: consensusStrengthColor(community) }}>{community.strength}/100</span>
            </div>
            <div style={{ height: 8, borderRadius: 6, overflow: 'hidden', background: 'var(--line)' }}>
              <div style={{ height: '100%', width: `${community.strength}%`, background: consensusStrengthColor(community) }} />
            </div>
            <div className="meta" style={{ marginTop: 8 }}>
              {community.bull} buy · {community.bear} sell out of {community.total} idea{community.total === 1 ? '' : 's'}
            </div>
            <p className="meta" style={{ marginTop: 14, lineHeight: 1.7 }}>
              This is the Community view — every public idea on {symbol}. &quot;Your Circle&quot; (just the people
              you&apos;re connected with or tracking) is a signed-in view — open this page in the app to see it.
            </p>
          </div>
        </div>
      </section>

      <section id="history" aria-label="Idea History">
        <h2 style={{ marginTop: 4 }}>Idea History on {symbol}</h2>
        <p className="meta" style={{ marginTop: -6, marginBottom: 14 }}>Immutable — every idea here is permanent, however it turned out.</p>
        <div className="idea-row" style={{ padding: 0 }}>
          {ideas.map((idea) => <IdeaCard key={idea.id} idea={idea} />)}
        </div>
      </section>

      <section id="investors" aria-label="Investors">
        <h2 style={{ marginTop: 4 }}>Investors covering {symbol}</h2>
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
        <div className="stats" style={{ marginTop: 4, marginBottom: 16 }}>
          <div className="stat"><div className="k">TOTAL IDEAS</div><div className="v">{ideas.length}</div></div>
          <div className="stat"><div className="k">ACTIVE</div><div className="v">{activeCount}</div></div>
          <div className="stat"><div className="k">CLOSED</div><div className="v">{closedCount}</div></div>
          <div className="stat"><div className="k">EXPIRED</div><div className="v">{expiredCount}</div></div>
        </div>
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
    </div>
  );
}
