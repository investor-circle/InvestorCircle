import { describe, it, expect, vi, beforeEach } from "vitest";

// api/seo.js is the one place in this codebase that pastes member-written
// text into markup by hand — everywhere else React escapes it. A thesis, a
// company name and an author name are all attacker-controlled as far as this
// file is concerned, so the escaping is the thing worth testing hardest.

// by-symbol runs two statements concurrently — the idea list and the
// aggregate — so the fake has to tell them apart the way the real database
// would, or the summary comes back as a list of ideas and the page 404s.
const SUMMARY = {
  idea_count: 3, contributor_count: 2, closed_count: 1,
  asset_name: "Reliance Industries", sector: "Energy",
  first_posted: "2025-08-04T00:00:00.000Z", last_posted: "2026-03-12T00:00:00.000Z",
};
const NO_VIEWS = { total: 0, positive: 0, neutral: 0, negative: 0, contributor_count: 0 };
let rows = [];
let summaryRows = [SUMMARY];
let viewRows = [];
let viewSummaryRows = [NO_VIEWS];
const sqlTag = (strings) => {
  const text = strings.join("?");
  // Market View statements (select ONLY views) vs research statements.
  if (text.includes("= ANY(")) {
    if (text.includes("COUNT(DISTINCT r.recommender_id)")) return Promise.resolve(viewSummaryRows);
    return Promise.resolve(text.includes("r.thesis") ? viewRows : []);
  }
  if (text.includes("COUNT(DISTINCT r.recommender_id)")) return Promise.resolve(summaryRows);
  return Promise.resolve(rows);
};
vi.mock("./auth.js", async () => {
  const actual = await vi.importActual("./auth.js");
  return { ...actual, sql: (...a) => sqlTag(...a) };
});

const { default: seo } = await import("./seo.js");

const mkRes = () => ({
  statusCode: 0,
  body: "",
  headers: {},
  setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
  status(c) { this.statusCode = c; return this; },
  send(b) { this.body = b; return this; },
  json(b) { this.body = b; return this; },
  end() { return this; },
});

const get = async (query) => {
  const res = mkRes();
  await seo({ method: "GET", query }, res);
  return res;
};

const idea = (over = {}) => ({
  id: "i1", ticker: "RELIANCE", asset_name: "Reliance Industries", sector: "Energy",
  recommendation_type: "Buy", conviction: "High", reco_price: 2412, current_price: 2560,
  target_price: 2850, horizon: "12m", thesis: "Refining margins have bottomed.",
  exit_signal: false, created_at: "2026-03-12T00:00:00.000Z",
  author_name: "Arjun V", author_username: "arjun_v", status: "Active", return_pct: 6.2,
  ...over,
});

beforeEach(() => { rows = [idea()]; summaryRows = [SUMMARY]; viewRows = []; viewSummaryRows = [NO_VIEWS]; });

describe("seo — escaping member-written text", () => {
  const payload = `</script><script>alert("xss")</script>`;

  it("escapes a hostile thesis in the page body", async () => {
    rows = [idea({ thesis: payload })];
    const res = await get({ page: "idea", id: "i1" });
    expect(res.body).not.toContain("<script>alert");
    expect(res.body).toContain("&lt;script&gt;");
  });

  it("escapes a hostile company name, author name and ticker", async () => {
    rows = [idea({ asset_name: payload, author_name: payload, ticker: payload })];
    const res = await get({ page: "idea", id: "i1" });
    expect(res.body).not.toContain("<script>alert");
  });

  it("cannot break out of the JSON-LD block", async () => {
    rows = [idea({ thesis: payload })];
    const res = await get({ page: "idea", id: "i1" });
    const ld = res.body.slice(
      res.body.indexOf('application/ld+json'),
      res.body.indexOf("</script>", res.body.indexOf('application/ld+json'))
    );
    expect(ld).not.toContain("</script");
    expect(ld).toContain("\\u003c");
  });

  it("escapes the search term echoed back to the page", async () => {
    rows = [];
    const res = await get({ page: "search", q: `"><script>alert(1)</script>` });
    expect(res.body).not.toContain("<script>alert");
    expect(res.body).toContain("&lt;script&gt;");
  });
});

describe("seo — the share card", () => {
  it("gives an idea its own title and description, not the site's", async () => {
    const res = await get({ page: "idea", id: "i1" });
    expect(res.body).toMatch(/<meta property="og:title" content="RELIANCE — Arjun V&#39;s investment idea/);
    expect(res.body).toMatch(/<meta property="og:description" content="Arjun V on RELIANCE: Refining margins/);
    expect(res.body).toContain('<meta name="twitter:card" content="summary_large_image">');
  });

  it("gives a stock page its own title and description", async () => {
    const res = await get({ page: "stock", symbol: "RELIANCE" });
    expect(res.body).toMatch(/<meta property="og:title" content="RELIANCE — verified research \| My Investor Circle/);
    expect(res.body).toMatch(/<meta property="og:description" content="3 pieces of verified research/);
    expect(res.body).toContain("Reliance Industries — verified research");
  });

  // The stock page now carries two separate layers and only the ones with data.
  describe("research and Market Views as separate layers", () => {
    const view = (over = {}) => ({
      id: "v1", ticker: "RELIANCE", asset_name: "Reliance Industries", recommendation_type: "Positive",
      thesis: "Retail arm is compounding.", disclosure: "Personal view. No position.",
      created_at: "2026-03-14T00:00:00.000Z", author_name: "Meera K", author_username: "meera_k", ...over,
    });

    it("renders research only when there are no Market Views (no Market Views section)", async () => {
      const res = await get({ page: "stock", symbol: "RELIANCE" });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain("Verified research on RELIANCE");
      expect(res.body).not.toContain("Market Views on RELIANCE");
    });

    it("renders a Market-View-only stock (it is a real page now), with no research section", async () => {
      rows = []; summaryRows = [{ ...SUMMARY, idea_count: 0, contributor_count: 0, closed_count: 0 }];
      viewRows = [view(), view({ id: "v2", recommendation_type: "Negative", thesis: "Margins under pressure." })];
      viewSummaryRows = [{ total: 2, positive: 1, neutral: 0, negative: 1, contributor_count: 1 }];
      const res = await get({ page: "stock", symbol: "RELIANCE" });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain("Market Views on RELIANCE");
      expect(res.body).not.toContain("Verified research on RELIANCE");
      expect(res.body).toMatch(/1 Positive, 0 Neutral, 1 Negative/);
      expect(res.body).toContain("Personal view. No position.");
      expect(res.body).toContain("POSITIVE");
    });

    it("shows both layers, and a Market View never carries entry / target / status / return", async () => {
      viewRows = [view()];
      viewSummaryRows = [{ total: 1, positive: 1, neutral: 0, negative: 0, contributor_count: 1 }];
      const res = await get({ page: "stock", symbol: "RELIANCE" });
      expect(res.body).toContain("Verified research on RELIANCE");
      expect(res.body).toContain("Market Views on RELIANCE");
      const views = res.body.slice(res.body.indexOf("Market Views on RELIANCE"));
      for (const word of ["ENTRY", "TARGET", "CONVICTION", "ACTIVE", "CLOSED", "horizon"]) expect(views).not.toContain(word);
    });

    it("404s only when there is neither research nor a Market View", async () => {
      rows = []; summaryRows = [{ ...SUMMARY, idea_count: 0 }];
      const res = await get({ page: "stock", symbol: "RELIANCE" });
      expect(res.statusCode).toBe(404);
    });

    it("escapes member-written commentary and disclosure in a Market View", async () => {
      const bad = `</script><script>alert("xss")</script>`;
      viewRows = [view({ thesis: bad, disclosure: bad, author_name: bad })];
      viewSummaryRows = [{ total: 1, positive: 1, neutral: 0, negative: 0, contributor_count: 1 }];
      const res = await get({ page: "stock", symbol: "RELIANCE" });
      expect(res.body).not.toContain(bad);
      expect(res.body).not.toContain("<script>alert");
    });
  });

  it("points the stock page's canonical at /security/:symbol, not its own URL", async () => {
    // /security/:symbol (a separate SSR app, web-public/) now covers the same
    // ground with the real Stock Insights experience; this page stays live
    // (not retired) but defers to it as the authoritative URL, so the two
    // are never independently indexed as duplicate content.
    const res = await get({ page: "stock", symbol: "RELIANCE" });
    expect(res.body).toContain('<link rel="canonical" href="https://myinvestorcircle.com/security/RELIANCE">');
    expect(res.body).toContain('<meta property="og:url" content="https://myinvestorcircle.com/security/RELIANCE">');
  });

  it("points the canonical at the clean URL", async () => {
    const res = await get({ page: "idea", id: "i1" });
    expect(res.body).toContain('<link rel="canonical" href="https://myinvestorcircle.com/idea/i1">');
  });
});

describe("seo — what is and is not indexable", () => {
  it("marks the search results page noindex", async () => {
    rows = [];
    const res = await get({ page: "search", q: "reliance" });
    expect(res.body).toContain('<meta name="robots" content="noindex,follow">');
  });

  it("leaves an idea page indexable", async () => {
    const res = await get({ page: "idea", id: "i1" });
    expect(res.body).not.toContain('name="robots"');
  });

  it("404s a missing or private idea, and does not index the 404", async () => {
    rows = [];
    const res = await get({ page: "idea", id: "nope" });
    expect(res.statusCode).toBe(404);
    expect(res.body).toContain('content="noindex');
    expect(res.body).toContain("Idea not found");
  });

  it("404s a stock with no public ideas", async () => {
    rows = [];
    summaryRows = [{ idea_count: 0 }];
    const res = await get({ page: "stock", symbol: "NOSUCH" });
    expect(res.statusCode).toBe(404);
  });
});

describe("seo — serving", () => {
  it("caches successful pages at the edge so crawlers do not hit the origin each time", async () => {
    const res = await get({ page: "idea", id: "i1" });
    expect(res.headers["cache-control"]).toContain("s-maxage=300");
    expect(res.headers["cache-control"]).toContain("stale-while-revalidate");
    expect(res.headers["content-type"]).toContain("text/html");
  });

  it("refuses anything but GET, and an unknown page", async () => {
    const res1 = mkRes();
    await seo({ method: "POST", query: { page: "idea", id: "i1" } }, res1);
    expect(res1.statusCode).toBe(405);
    const res2 = await get({ page: "profile", username: "arjun_v" });
    expect(res2.statusCode).toBe(400);
  });

  it("has no route that serves a member profile", async () => {
    // Profiles staying out of the index is a decision, not an accident: there
    // is no page value that renders one.
    for (const page of ["profile", "investor", "member", "user"]) {
      const res = await get({ page, username: "arjun_v" });
      expect(res.statusCode).toBe(400);
    }
  });
});
