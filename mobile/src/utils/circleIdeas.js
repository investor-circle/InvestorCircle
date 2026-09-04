/**
 * Search, filter and sort over a Circle's ideas.
 *
 * Ported from the web's CirclePage, which has all three; the app had none, so
 * an active Circle was one unbroken column with no way to find the idea you
 * remembered or to see who is being discussed.
 *
 * Works on the MAPPED shape (mapCircleReco), not the raw server rows the web
 * reads: the screen already maps every row for RecoCard, so filtering the raw
 * rows would mean keeping two copies of each list in step. The mapped names
 * are used where they exist (assetName, byName, recType, commentCount) and the
 * server names where mapping keeps them (last_activity_at, ticker).
 */

export const IDEA_FILTERS = [
  { value: "all", label: "All" },
  { value: "Buy", label: "Buy" },
  { value: "Sell", label: "Sell" },
];

export const IDEA_SORTS = [
  { value: "activity_desc", label: "Recent", key: "activity", dir: "desc" },
  { value: "activity_asc", label: "Oldest", key: "activity", dir: "asc" },
  { value: "likes_desc", label: "Most liked", key: "likes", dir: "desc" },
  { value: "comments_desc", label: "Most discussed", key: "comments", dir: "desc" },
  { value: "ticker_asc", label: "Ticker A–Z", key: "ticker", dir: "asc" },
];

export const DEFAULT_SORT = "activity_desc";

// last_activity_at is what the server orders by, but a row that has never
// been touched can carry none — fall back to when it was posted rather than
// sorting it as the epoch, which would bury a brand new idea at the bottom.
const activityTime = (r) => {
  const t = Date.parse(r?.last_activity_at || r?.created_at || "");
  return Number.isNaN(t) ? 0 : t;
};

const COMPARATORS = {
  activity: (a, b) => activityTime(a) - activityTime(b),
  likes: (a, b) => Number(a?.likes || 0) - Number(b?.likes || 0),
  comments: (a, b) => Number(a?.commentCount || 0) - Number(b?.commentCount || 0),
  ticker: (a, b) => String(a?.ticker || "").localeCompare(String(b?.ticker || "")),
};

/**
 * @param ideas   mapped rows, or null while still loading
 * @param opts    { query, type, sort } — sort is an IDEA_SORTS value
 * @returns a new array; null in, empty array out, so callers can render
 *          without a null check (loading is the screen's own state).
 */
export function filterSortIdeas(ideas, { query = "", type = "all", sort = DEFAULT_SORT } = {}) {
  let rows = [...(ideas || [])];

  if (type !== "all") rows = rows.filter((r) => (r?.recType || "Buy") === type);

  const q = String(query || "").trim().toLowerCase();
  if (q) {
    // Ticker, name AND author: "who has been posting in here" is as much a
    // question as "what about this stock", and the web searches all three.
    rows = rows.filter(
      (r) =>
        String(r?.ticker || "").toLowerCase().includes(q) ||
        String(r?.assetName || "").toLowerCase().includes(q) ||
        String(r?.byName || "").toLowerCase().includes(q)
    );
  }

  const opt = IDEA_SORTS.find((o) => o.value === sort) || IDEA_SORTS[0];
  const cmp = COMPARATORS[opt.key];
  rows.sort((a, b) => (opt.dir === "asc" ? cmp(a, b) : -cmp(a, b)));
  return rows;
}
