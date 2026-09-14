import { money, pct, day, clip } from '../lib/format';

const STATUS_CLASS = { Active: 'tag-active', Closed: 'tag-closed', Expired: 'tag-expired' };

// One idea, rendered the same way on the security page, the idea page and
// search results. `full` shows the complete thesis (the idea's own page);
// otherwise it's CSS-clamped to a two-line glimpse — the full text is still
// in the HTML (a crawler reads all of it), only the visual height is capped.
export default function IdeaCard({ idea, full = false, headingTag: Heading = 'h3' }) {
  const r = pct(idea.return_pct);
  const up = Number(idea.return_pct) >= 0;
  const author = idea.author_name || idea.author_username || 'A member';
  const statusClass = STATUS_CLASS[idea.status] || 'tag-expired';

  return (
    <div className="card">
      <div className="pad">
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <Heading>{idea.ticker}</Heading>
          {idea.asset_name && <span className="meta">{idea.asset_name}</span>}
          <span className={`tag ${idea.recommendation_type === 'Buy' ? 'tag-buy' : 'tag-sell'}`}>
            {idea.recommendation_type === 'Buy' ? 'BUY' : 'SELL'}
          </span>
          <span className={`tag ${statusClass}`}>{(idea.status || 'Active').toUpperCase()}</span>
          {r && (
            <span style={{ marginLeft: 'auto', fontWeight: 800, fontSize: 15 }} className={up ? 'gain' : 'loss'}>
              {r}
            </span>
          )}
        </div>
        <div className="meta" style={{ marginTop: 8 }}>
          {author}
          {idea.author_username && ` · @${idea.author_username}`} · {day(idea.created_at)}
          {idea.horizon && ` · ${idea.horizon} horizon`}
        </div>
        {idea.thesis && (
          <p className={`thesis${full ? '' : ' clamped'}`}>{full ? idea.thesis : clip(idea.thesis, 240)}</p>
        )}
        <div className="stats">
          <div className="stat"><div className="k">ENTRY</div><div className="v">{money(idea.reco_price)}</div></div>
          <div className="stat"><div className="k">TARGET</div><div className="v">{money(idea.target_price)}</div></div>
          {idea.status === 'Closed' ? (
            <div className="stat"><div className="k">EXIT</div><div className="v">{money(idea.exit_price)}</div></div>
          ) : (
            <div className="stat"><div className="k">LATEST</div><div className="v">{money(idea.current_price)}</div></div>
          )}
          {idea.conviction && <div className="stat"><div className="k">CONVICTION</div><div className="v">{idea.conviction}</div></div>}
        </div>
        {!full && (
          <p style={{ marginTop: 10 }}>
            <a href={`/idea/${encodeURIComponent(idea.id)}`}>Read full idea →</a>
          </p>
        )}
      </div>
    </div>
  );
}
