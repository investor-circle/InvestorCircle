import { describe, it, expect, vi, afterEach } from "vitest";
import { mintRoutingCookie, clearRoutingCookie } from "./AuthContext";

// The routing-token cookie (see api/_lib/handlers/session.js, middleware.js)
// only works if the request that mints/clears it is genuinely same-origin —
// a cookie set by a cross-origin response is scoped to THAT origin, never
// the page the visitor is actually on. This shipped once with the mint/clear
// calls built on API_ORIGIN (src/db.js), which on the real production
// domain resolves to a DIFFERENT origin (a holdover from the GitHub-Pages-
// hosted-frontend era) — so the cookie silently never landed on
// myinvestorcircle.com for anyone, in any browser, ever. These tests pin
// the fetch URL as a bare same-origin-relative path so that regression
// can't come back quietly.
describe("routing cookie mint/clear — same-origin only", () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it("mints via a same-origin relative URL, never an absolute/cross-origin one", () => {
    global.fetch = vi.fn(() => Promise.resolve());
    mintRoutingCookie("fake-id-token");

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/data?resource=session&action=mint");
    expect(url).not.toMatch(/^https?:\/\//);
    expect(opts).toMatchObject({ method: "POST", credentials: "same-origin" });
    expect(opts.headers.Authorization).toBe("Bearer fake-id-token");
  });

  it("does nothing without an idToken", () => {
    global.fetch = vi.fn();
    mintRoutingCookie(null);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("clears via the same same-origin relative URL", () => {
    global.fetch = vi.fn(() => Promise.resolve());
    clearRoutingCookie();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/data?resource=session&action=clear");
    expect(url).not.toMatch(/^https?:\/\//);
    expect(opts).toMatchObject({ method: "POST", credentials: "same-origin" });
  });
});
