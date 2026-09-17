import { money, pct, day, splitPreview } from '../lib/format';

const STATUS_CLASS = { Active: 'tag-active', Closed: 'tag-closed', Expired: 'tag-expired' };

// How much of a thesis shows before the "Read more" disclosure, on every
// page except the idea's own (where `full` shows it all at once anyway).
const PREVIEW_CHARS = 220;

// One idea, rendered the same way on the security page, the idea page and
// search results. `full` shows the complete thesis inline (the idea's own
// page); otherwise a short preview is followed by a native <details> holding
// the rest. Both halves are plain server-rendered text nodes — nothing is
// removed from the HTML and nothing is hidden behind client-side JS, so the
// full thesis stays crawlable/indexable whether or not a reader expands it.
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
        {idea.thesis && (full ? (
          <p className="thesis">{idea.thesis}</p>
        ) : (() => {
          const { preview, rest } = splitPreview(idea.thesis, PREVIEW_CHARS);
          return (
            <>
              <p className="thesis">{preview}</p>
              {rest && (
                <details className="thesis-more">
                  <summary>Read more</summary>
                  <p className="thesis">{rest}</p>
                </details>
              )}
            </>
          );
        })())}
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
