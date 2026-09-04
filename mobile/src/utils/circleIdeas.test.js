import { filterSortIdeas, IDEA_SORTS, IDEA_FILTERS, DEFAULT_SORT } from "./circleIdeas";

// These run over the MAPPED rows the screen already builds for RecoCard, not
// the raw server rows the web filters. The names differ between the two
// shapes (commentCount vs comments_count, recType vs recommendation_type),
// which is exactly the kind of mismatch that fails silently — a filter that
// reads the wrong field just never matches anything.

const idea = (o = {}) => ({
  id: o.id ?? "1",
  ticker: "INFY",
  assetName: "Infosys",
  byName: "Asha",
  recType: "Buy",
  likes: 0,
  commentCount: 0,
  last_activity_at: "2026-09-01T00:00:00Z",
  ...o,
});

describe("filtering by side", () => {
  const rows = [idea({ id: "b", recType: "Buy" }), idea({ id: "s", recType: "Sell" })];

  it("keeps everything by default", () => {
    expect(filterSortIdeas(rows, {})).toHaveLength(2);
  });

  it("narrows to one side", () => {
    expect(filterSortIdeas(rows, { type: "Sell" }).map((r) => r.id)).toEqual(["s"]);
  });

  it("treats a row with no side as a Buy, the way the card renders it", () => {
    const rest = filterSortIdeas([idea({ id: "x", recType: undefined })], { type: "Buy" });
    expect(rest.map((r) => r.id)).toEqual(["x"]);
  });
});

describe("search", () => {
  const rows = [
    idea({ id: "1", ticker: "INFY", assetName: "Infosys", byName: "Asha" }),
    idea({ id: "2", ticker: "TCS", assetName: "Tata Consultancy", byName: "Ravi" }),
  ];

  it("matches a ticker, case-insensitively", () => {
    expect(filterSortIdeas(rows, { query: "tcs" }).map((r) => r.id)).toEqual(["2"]);
  });

  it("matches the company name", () => {
    expect(filterSortIdeas(rows, { query: "consult" }).map((r) => r.id)).toEqual(["2"]);
  });

  it("matches the investor — 'who has been posting here' is a real question", () => {
    expect(filterSortIdeas(rows, { query: "asha" }).map((r) => r.id)).toEqual(["1"]);
  });

  it("ignores surrounding whitespace rather than matching nothing", () => {
    expect(filterSortIdeas(rows, { query: "  INFY " }).map((r) => r.id)).toEqual(["1"]);
  });
});

describe("sorting", () => {
  const rows = [
    idea({ id: "old", last_activity_at: "2026-01-01T00:00:00Z", likes: 9, commentCount: 1, ticker: "ZZZ" }),
    idea({ id: "new", last_activity_at: "2026-09-01T00:00:00Z", likes: 1, commentCount: 7, ticker: "AAA" }),
  ];
  const ids = (sort) => filterSortIdeas(rows, { sort }).map((r) => r.id);

  it("defaults to most recent activity", () => {
    expect(ids(undefined)).toEqual(["new", "old"]);
    expect(DEFAULT_SORT).toBe("activity_desc");
  });

  it("can run oldest first", () => {
    expect(ids("activity_asc")).toEqual(["old", "new"]);
  });

  it("sorts by likes and by discussion separately", () => {
    expect(ids("likes_desc")).toEqual(["old", "new"]);
    expect(ids("comments_desc")).toEqual(["new", "old"]);
  });

  it("sorts tickers alphabetically", () => {
    expect(ids("ticker_asc")).toEqual(["new", "old"]);
  });

  it("falls back to an unknown sort rather than crashing on it", () => {
    expect(ids("nonsense")).toEqual(["new", "old"]);
  });

  it("dates an untouched idea from when it was posted", () => {
    // last_activity_at can be absent; treating that as the epoch would bury a
    // brand new idea at the bottom of the default sort.
    const fresh = idea({ id: "fresh", last_activity_at: null, created_at: "2026-09-02T00:00:00Z" });
    const stale = idea({ id: "stale", last_activity_at: "2026-02-01T00:00:00Z" });
    expect(filterSortIdeas([stale, fresh], {}).map((r) => r.id)).toEqual(["fresh", "stale"]);
  });

  it("does not mutate the list it was given", () => {
    const original = [...rows];
    filterSortIdeas(rows, { sort: "ticker_asc" });
    expect(rows).toEqual(original);
  });
});

describe("edges", () => {
  it("survives no ideas at all", () => {
    expect(filterSortIdeas(null, {})).toEqual([]);
    expect(filterSortIdeas([], undefined)).toEqual([]);
  });

  it("offers the same options the web does", () => {
    expect(IDEA_FILTERS.map((f) => f.value)).toEqual(["all", "Buy", "Sell"]);
    expect(IDEA_SORTS.map((s) => s.value)).toEqual([
      "activity_desc",
      "activity_asc",
      "likes_desc",
      "comments_desc",
      "ticker_asc",
    ]);
  });
});
