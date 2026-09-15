import { describe, it, expect, vi, beforeEach } from "vitest";

// public-ideas is served to anyone: signed-out visitors, Google, and the
// crawlers that build WhatsApp link previews. Its whole contract is that a
// PRIVATE idea — one its author shared with named people on the platform —
// can never come back from it. These tests read the SQL the handler actually
// emits, so the guarantee holds for any action added later rather than only
// for the four that exist today.

const sqlCalls = [];
let rows = [];
const sqlTag = (strings, ...values) => {
  sqlCalls.push({ text: strings.join("?"), values });
  return Promise.resolve(rows);
};
vi.mock("../auth.js", async () => {
  const actual = await vi.importActual("../auth.js");
  return { ...actual, sql: (...a) => sqlTag(...a) };
});

const { default: handlePublicIdeas } = await import("./public-ideas.js");

const mkRes = () => ({
  statusCode: 0,
  body: null,
  setHeader: vi.fn(),
  status(c) { this.statusCode = c; return this; },
  json(b) { this.body = b; return this; },
  end() { return this; },
});

const get = async (query) => {
  const res = mkRes();
  await handlePublicIdeas({ method: "GET", query }, res);
  return res;
};

const ideaRow = {
  id: "i1", ticker: "RELIANCE", asset_name: "Reliance Industries",
  author_name: "Arjun V", author_username: "arjun_v", status: "Active", return_pct: 6.2,
};

beforeEach(() => { sqlCalls.length = 0; rows = [ideaRow]; });

describe("public-ideas — the private-idea guarantee", () => {
  const actions = [
    { action: "idea", id: "i1" },
    { action: "by-symbol", symbol: "RELIANCE" },
    { action: "search", q: "reliance" },
    { action: "symbols" },
  ];

  it("filters is_public = true in EVERY statement it runs, for every action", async () => {
    for (const query of actions) {
      sqlCalls.length = 0;
      await get(query);
      expect(sqlCalls.length, `${query.action} ran no query`).toBeGreaterThan(0);
      for (const call of sqlCalls) {
        if (!call.text.includes("ic_recommendations")) continue;
        expect(
          call.text.replace(/\s+/g, " "),
          `${query.action} emitted a statement without the is_public filter`
        ).toContain("is_public = true");
      }
    }
  });

  it("never selects a sensitive column", async () => {
    // SEBI registration, consent records, claim tokens and e-mail addresses
    // all live on user_profiles next to the fields this endpoint does want.
    const forbidden = ["sebi", "consent", "claim_token", "claim_status", "up.email", "r.email", "password"];
    for (const query of actions) {
      sqlCalls.length = 0;
      await get(query);
      for (const call of sqlCalls) {
        const text = call.text.toLowerCase();
        for (const bad of forbidden) {
          expect(text, `${query.action} selected "${bad}"`).not.toContain(bad);
        }
      }
    }
  });

  it("never uses SELECT * or RETURNING *", async () => {
    for (const query of actions) {
      sqlCalls.length = 0;
      await get(query);
      for (const call of sqlCalls) {
        expect(call.text).not.toMatch(/select\s+\*/i);
        expect(call.text).not.toMatch(/returning\s+\*/i);
      }
    }
  });

  it("keeps the three copies of the status/return expression identical", async () => {
    // The Neon driver cannot compose query fragments, so this expression is
    // written out once per query. Divergence between copies is exactly the
    // bug CLAUDE.md's incident note describes, so it is pinned here.
    const returnExprs = [];
    for (const query of [actions[0], actions[1], actions[2]]) {
      sqlCalls.length = 0;
      await get(query);
      for (const call of sqlCalls) {
        const m = call.text.match(/ROUND\(\(CASE[\s\S]*?AS return_pct/);
        if (m) returnExprs.push(m[0].replace(/\s+/g, " "));
      }
    }
    expect(returnExprs.length).toBe(3);
    expect(new Set(returnExprs).size, "the status/return expression has drifted between queries").toBe(1);
  });
});

describe("public-ideas — thesis sanitization", () => {
  // r.thesis can be a JSON-encoded rich payload written by ThesisEditor
  // (src/features/recommendations/Recommendations.jsx):
  // {"__v":"1","text":"...","images":["data:image/jpeg;base64,..."]}. None of
  // this handler's consumers (web-public, api/_lib/seo.js) can parse that
  // shape, so a raw pass-through leaks JSON syntax and base64 image data
  // straight into public HTML, WhatsApp previews and JSON-LD — this is the
  // exact bug reported against /security and /idea pages.
  const richThesis = JSON.stringify({
    __v: "1",
    text: "Strong quarter.\n\nDon't miss this.",
    images: ["data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/deadbeef"],
  });

  it("resolves a rich JSON thesis to its plain text, dropping images", async () => {
    rows = [{ ...ideaRow, thesis: richThesis }];
    const res = await get({ action: "idea", id: "i1" });
    expect(res.body.idea.thesis).toBe("Strong quarter.\n\nDon't miss this.");
    expect(JSON.stringify(res.body)).not.toContain("base64");
    expect(JSON.stringify(res.body)).not.toContain("__v");
  });

  it("passes a legacy plain-text thesis through unchanged", async () => {
    rows = [{ ...ideaRow, thesis: "Plain legacy thesis text." }];
    const res = await get({ action: "idea", id: "i1" });
    expect(res.body.idea.thesis).toBe("Plain legacy thesis text.");
  });

  it("treats the '—' placeholder as no thesis", async () => {
    rows = [{ ...ideaRow, thesis: "—" }];
    const res = await get({ action: "idea", id: "i1" });
    expect(res.body.idea.thesis).toBeNull();
  });

  it("sanitizes thesis on every idea returned by by-symbol and search", async () => {
    rows = [{ ...ideaRow, thesis: richThesis, idea_count: 1, contributor_count: 1, closed_count: 0 }];
    const bySymbolRes = await get({ action: "by-symbol", symbol: "RELIANCE" });
    expect(bySymbolRes.body.ideas[0].thesis).toBe("Strong quarter.\n\nDon't miss this.");
    expect(JSON.stringify(bySymbolRes.body)).not.toContain("base64");

    rows = [{ ...ideaRow, thesis: richThesis }];
    const searchRes = await get({ action: "search", q: "reliance" });
    expect(searchRes.body.ideas[0].thesis).toBe("Strong quarter.\n\nDon't miss this.");
    expect(JSON.stringify(searchRes.body)).not.toContain("base64");
  });
});

describe("public-ideas — input handling", () => {
  it("rejects a symbol that is not a symbol, before querying", async () => {
    for (const symbol of ["'; DROP TABLE ic_recommendations; --", "a".repeat(40), "RELI ANCE", ""]) {
      sqlCalls.length = 0;
      const res = await get({ action: "by-symbol", symbol });
      expect(res.statusCode).toBe(400);
      expect(sqlCalls.length, "a rejected symbol still hit the database").toBe(0);
    }
  });

  it("passes user input as bound parameters, never as SQL text", async () => {
    await get({ action: "search", q: "'; DROP TABLE x; --" });
    const call = sqlCalls[0];
    expect(call.text).not.toContain("DROP TABLE");
    expect(call.values.some((v) => String(v).includes("DROP TABLE"))).toBe(true);
  });

  it("caps how much one caller can pull back at once", async () => {
    await get({ action: "by-symbol", symbol: "RELIANCE", limit: "100000" });
    expect(sqlCalls[0].values).toContain(60);
  });

  it("treats a missing idea and a private idea the same way", async () => {
    rows = [];
    const res = await get({ action: "idea", id: "whatever" });
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  it("refuses anything but GET", async () => {
    const res = mkRes();
    await handlePublicIdeas({ method: "POST", query: { action: "idea", id: "i1" } }, res);
    expect(res.statusCode).toBe(405);
  });

  it("rejects an unknown action", async () => {
    const res = await get({ action: "list-everything" });
    expect(res.statusCode).toBe(400);
  });
});
