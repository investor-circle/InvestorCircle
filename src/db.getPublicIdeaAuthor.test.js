import { describe, it, expect, vi, afterEach } from "vitest";
import { getPublicIdeaAuthor } from "./db";

// getPublicIdeaAuthor resolves a bare /idea/:id share link to its author's
// username, which is what lets App.jsx's standalone route render the exact
// same RecoPostPage the /investor/:username/idea/:id shape already uses —
// see App.jsx's bareIdeaMatch/bareIdeaResolved state.

describe("getPublicIdeaAuthor", () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it("returns the author's username for a public idea", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ idea: { id: "42", author_username: "asha" } }),
    }));
    expect(await getPublicIdeaAuthor("42")).toBe("asha");
  });

  it("returns null for a private idea or one that doesn't exist (404)", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 404 }));
    expect(await getPublicIdeaAuthor("private-id")).toBeNull();
  });

  it("returns null rather than throwing on a network failure", async () => {
    global.fetch = vi.fn(async () => { throw new Error("network down"); });
    expect(await getPublicIdeaAuthor("42")).toBeNull();
  });

  it("returns null for a missing id without fetching", async () => {
    global.fetch = vi.fn();
    expect(await getPublicIdeaAuthor("")).toBeNull();
    expect(await getPublicIdeaAuthor(null)).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
