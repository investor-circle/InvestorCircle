// Idea types for the public pages. Mirrors src/utils/ideaType.js in the main
// app (a separate, independently-deployed project — copied, not shared).
//
// recommendation_type is either a RECOMMENDATION (Buy / Hold / Sell, from a
// Verified Research Publisher) or a MARKET VIEW (Positive / Neutral / Negative,
// commentary from an Independent Market Contributor). Market Views carry no
// entry price, target or horizon and are never part of consensus or
// performance.
export const MARKET_VIEW_TYPES = ['Positive', 'Neutral', 'Negative'];

export const isMarketView = (t) => MARKET_VIEW_TYPES.includes(t);

const META = {
  Buy:      { label: 'Buy',      tag: 'tag-buy' },
  Hold:     { label: 'Hold',     tag: 'tag-expired' },
  Sell:     { label: 'Sell',     tag: 'tag-sell' },
  Positive: { label: 'Positive', tag: 'tag-buy' },
  Neutral:  { label: 'Neutral',  tag: 'tag-expired' },
  Negative: { label: 'Negative', tag: 'tag-sell' },
};

/** { label, tag } for a type; unknown / missing falls back to Buy (legacy default). */
export const ideaTypeMeta = (t) => META[t] || META.Buy;
