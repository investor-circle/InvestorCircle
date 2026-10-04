import { callApi } from "../api";

/**
 * Market-consensus data: what everyone on the platform thinks about a ticker.
 *
 * consensus-public is the public subset, consensus-all includes non-public
 * ideas the caller is entitled to see. Both return flat idea rows; the
 * aggregation into per-ticker consensus happens client-side in
 * src/utils/consensus.js, which is a verbatim copy of the web's, so both
 * clients reach the same verdict from the same rows.
 */
export async function getConsensusRecosPublic() {
  const api = await callApi("/data?resource=lookups&action=consensus-public");
  return api.ok ? api.data.recos || [] : [];
}

export async function getConsensusRecosAll() {
  const api = await callApi("/data?resource=lookups&action=consensus-all");
  return api.ok ? api.data.recos || [] : [];
}

/** Every public idea for one ticker, newest first. */
export async function getTickerRecos(ticker) {
  const t = String(ticker || "").trim();
  if (!t) return [];
  const api = await callApi(
    `/data?resource=lookups&action=ticker-recos&ticker=${encodeURIComponent(t)}`
  );
  return api.ok ? api.data.recos || [] : [];
}

/**
 * Market Views for one ticker — a SEPARATE dataset from getTickerRecos
 * (Verified Research only). Commentary + disclosure, no entry price / target /
 * horizon / return. Returns { summary (exact counts), views (one page),
 * stances (lightweight who/what/when for every public view), hasMore }.
 */
export async function getTickerViews(ticker, { limit = 30, offset = 0 } = {}) {
  const empty = { summary: { total: 0, positive: 0, neutral: 0, negative: 0, contributors: 0 }, views: [], stances: [], hasMore: false };
  const t = String(ticker || "").trim();
  if (!t) return empty;
  const api = await callApi(
    `/data?resource=lookups&action=ticker-views&ticker=${encodeURIComponent(t)}&limit=${limit}&offset=${offset}`
  );
  if (!api.ok) return empty;
  return {
    summary: api.data.summary || empty.summary,
    views: api.data.views || [],
    stances: api.data.stances || [],
    hasMore: !!api.data.has_more,
  };
}

/**
 * Persisted daily closes for a set of tickers, for the price sparkline.
 * Deduped and upper-cased here exactly as the web does, so the same set of
 * tickers produces the same cache-friendly request from either client.
 */
export async function getDailyPrices(tickers) {
  const list = [
    ...new Set((tickers || []).map((t) => String(t || "").trim().toUpperCase()).filter(Boolean)),
  ];
  if (!list.length) return [];
  const api = await callApi(
    `/data?resource=pricing&action=daily&tickers=${encodeURIComponent(list.join(","))}`
  );
  return api.ok ? api.data.prices || [] : [];
}
