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
let rows = [];
let summaryRows = [SUMMARY];
const sqlTag = (strings) => {
  const text = strings.join("?");
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

beforeEach(() => { rows = [idea()]; summaryRows = [SUMMARY]; });

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
    expect(res.body).toMatch(/<meta property="og:title" content="RELIANCE — 3 investor ideas/);
    expect(res.body).toMatch(/<meta property="og:description" content="3 published ideas on Reliance Industries/);
    expect(res.body).toContain("Investor ideas on Reliance Industries");
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
