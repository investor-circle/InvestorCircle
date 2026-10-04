// The two layers a security page presents — kept visibly separate:
//   Verified Research  -> Buy / Hold / Sell          (professional research)
//   Market Views       -> Positive / Neutral / Negative (independent commentary)
// A layer with no data is simply not rendered (no empty placeholder card). The
// numbers come from lib/securityInsights.js — never combined into one score.
export default function SecurityLayers({ research, views }) {
  if (!research && !views) return null;
  return (
    <div className={`layers${research && views ? ' two' : ''}`}>
      {research && (
        <div className="card">
          <div className="pad">
            <div className="layer-label">Verified Research</div>
            <div className="layer-counts">
              <span className="gain">{research.buy} Buy</span> · <span>{research.hold} Hold</span> · <span className="loss">{research.sell} Sell</span>
            </div>
            <div className="dist-bar" role="img" aria-label={`Buy ${research.buyPct}%, Hold ${research.holdPct}%, Sell ${research.sellPct}%`}>
              {research.buyPct > 0 && <div className="seg-buy" style={{ width: `${research.buyPct}%` }} />}
              {research.holdPct > 0 && <div className="seg-neutral" style={{ width: `${research.holdPct}%` }} />}
              {research.sellPct > 0 && <div className="seg-sell" style={{ width: `${research.sellPct}%` }} />}
            </div>
            <div className="meta" style={{ marginTop: 6 }}>
              {research.total} piece{research.total === 1 ? '' : 's'} of research{research.publishers ? ` from ${research.publishers} publisher${research.publishers === 1 ? '' : 's'}` : ''}
            </div>
          </div>
        </div>
      )}
      {views && (
        <div className="card">
          <div className="pad">
            <div className="layer-label">Market Views</div>
            <div className="layer-counts">
              <span className="gain">{views.positive} Positive</span> · <span>{views.neutral} Neutral</span> · <span className="loss">{views.negative} Negative</span>
            </div>
            <div className="dist-bar" role="img" aria-label={`Positive ${views.positivePct}%, Neutral ${views.neutralPct}%, Negative ${views.negativePct}%`}>
              {views.positivePct > 0 && <div className="seg-buy" style={{ width: `${views.positivePct}%` }} />}
              {views.neutralPct > 0 && <div className="seg-neutral" style={{ width: `${views.neutralPct}%` }} />}
              {views.negativePct > 0 && <div className="seg-sell" style={{ width: `${views.negativePct}%` }} />}
            </div>
            <div className="meta" style={{ marginTop: 6 }}>
              {views.total} independent view{views.total === 1 ? '' : 's'}{views.contributors ? ` from ${views.contributors} contributor${views.contributors === 1 ? '' : 's'}` : ''}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
