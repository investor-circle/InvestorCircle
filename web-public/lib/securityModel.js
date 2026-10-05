import { researchRows, researchBreakdown, researchBreakdownFromCounts, viewBreakdownFromCounts } from './securityInsights';

// What a public security page has, from the single by-symbol response: Verified
// Research (Buy / Hold / Sell) and/or Market Views (Positive / Neutral /
// Negative). Two separate layers, never merged; a layer with no data is null
// (so it renders nothing), and a page with neither is a 404.
export function researchBreakdownOf(data, research) {
  const sm = data?.summary || {};
  if (sm.buy_count != null && sm.hold_count != null && sm.sell_count != null) {
    return researchBreakdownFromCounts({ buy: sm.buy_count, hold: sm.hold_count, sell: sm.sell_count, publishers: sm.contributor_count });
  }
  return researchBreakdown(research, (i) => i.author_username || i.author_name);
}

export function securityModel(data) {
  const researchCount = Number(data?.summary?.idea_count) || 0;
  const viewCount = Number(data?.view_summary?.total) || 0;
  const research = researchRows(data?.ideas || []);
  const viewSummary = data?.view_summary || {};
  return {
    researchCount,
    viewCount,
    hasPage: researchCount > 0 || viewCount > 0,
    // Exact counts from the server aggregate when present: the `ideas` list is
    // capped, so a distribution derived from it would be wrong for a busy ticker.
    researchB: researchCount ? researchBreakdownOf(data, research) : null,
    viewB: viewCount ? viewBreakdownFromCounts({ ...viewSummary, contributors: viewSummary.contributor_count }) : null,
  };
}
