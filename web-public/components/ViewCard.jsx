import { day, splitPreview } from '../lib/format';
import { ideaTypeMeta } from '../lib/ideaType';

const PREVIEW_CHARS = 220;

// One Market View: contributor, Positive / Neutral / Negative, date, and their
// commentary (a short preview, the rest inside a native <details> so the whole
// text stays in the document for indexing) plus the contributor's own
// disclosure. Deliberately NO entry price, target, stop loss, horizon,
// conviction, return or active/closed status — a Market View is commentary,
// not a recommendation.
export default function ViewCard({ view }) {
  const meta = ideaTypeMeta(view.recommendation_type);
  const author = view.author_name || view.author_username || 'A member';
  const { preview, rest } = view.thesis ? splitPreview(view.thesis, PREVIEW_CHARS) : { preview: '', rest: '' };
  return (
    <div className="card">
      <div className="pad">
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          {view.author_username ? (
            <a href={`https://myinvestorcircle.com/investor/${encodeURIComponent(view.author_username)}`} style={{ fontWeight: 700 }}>{author}</a>
          ) : <span style={{ fontWeight: 700 }}>{author}</span>}
          <span className={`tag ${meta.tag}`}>{meta.label.toUpperCase()}</span>
        </div>
        <div className="meta" style={{ marginTop: 4 }}>
          Independent contributor{view.author_username && ` · @${view.author_username}`} · {day(view.created_at)}
        </div>
        {preview && (
          <>
            <p className="thesis">{preview}</p>
            {rest && (
              <details className="thesis-more">
                <summary><span className="when-closed">Read more</span><span className="when-open">Show less</span></summary>
                <p className="thesis">{rest}</p>
              </details>
            )}
          </>
        )}
        {view.disclosure && <p className="meta" style={{ marginTop: 10 }}><strong>Disclosure:</strong> {view.disclosure}</p>}
        <p style={{ marginTop: 10 }}><a href={`/idea/${encodeURIComponent(view.id)}`}>Read full view →</a></p>
      </div>
    </div>
  );
}
