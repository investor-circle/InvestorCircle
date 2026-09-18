import { describe, it, expect, beforeEach } from "vitest";

// This is the single most important test in this feature: the edge-side
// verifier (this file) is a deliberate duplicate of the Node-side minter
// (api/_lib/routingToken.js) rather than a shared import, because the two
// run in genuinely different runtimes (Edge Runtime here, Node there — see
// middleware.js's own header comment for why). If the two schemes drift
// apart, every routing token silently fails verification and every
// signed-in visitor falls back to the (still correct, just slower)
// web-public path — a availability/perf regression, not a security one,
// but worth locking in that they agree today.

const SECRET = "test-secret-do-not-use-in-prod";

beforeEach(() => {
  process.env.ROUTING_TOKEN_SECRET = SECRET;
});

describe("isValidRoutingToken — interop with the real minter", () => {
  it("accepts a token freshly minted by api/_lib/routingToken.js", async () => {
    const { mintRoutingToken } = await import("./api/_lib/routingToken.js");
    const { isValidRoutingToken } = await import("./middleware.js");
    const token = mintRoutingToken("uid123", 900);
    expect(await isValidRoutingToken(token, SECRET)).toBe(true);
  });

  it("rejects a token signed with a different secret", async () => {
    const { mintRoutingToken } = await import("./api/_lib/routingToken.js");
    const { isValidRoutingToken } = await import("./middleware.js");
    const token = mintRoutingToken("uid123", 900);
    expect(await isValidRoutingToken(token, "wrong-secret")).toBe(false);
  });

  it("rejects an expired token even with the correct secret", async () => {
    const { mintRoutingToken } = await import("./api/_lib/routingToken.js");
    const { isValidRoutingToken } = await import("./middleware.js");
    const token = mintRoutingToken("uid123", -1); // already expired
    expect(await isValidRoutingToken(token, SECRET)).toBe(false);
  });

  it("rejects a tampered payload (uid swapped) even though the original signature is reused", async () => {
    const { mintRoutingToken } = await import("./api/_lib/routingToken.js");
    const { isValidRoutingToken } = await import("./middleware.js");
    const token = mintRoutingToken("uid123", 900);
    const [payloadB64, sig] = token.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ uid: "someone-else", exp: 9999999999 })).toString("base64url");
    expect(await isValidRoutingToken(`${forgedPayload}.${sig}`, SECRET)).toBe(false);
  });

  it("rejects garbage / malformed input without throwing", async () => {
    const { isValidRoutingToken } = await import("./middleware.js");
    for (const bad of [null, undefined, "", "not-a-token", "a.b.c", "a.", ".b"]) {
      expect(await isValidRoutingToken(bad, SECRET)).toBe(false);
    }
  });

  it("rejects when no secret is configured, even for an otherwise well-formed token", async () => {
    const { mintRoutingToken } = await import("./api/_lib/routingToken.js");
    const { isValidRoutingToken } = await import("./middleware.js");
    const token = mintRoutingToken("uid123", 900);
    expect(await isValidRoutingToken(token, undefined)).toBe(false);
    expect(await isValidRoutingToken(token, "")).toBe(false);
  });
});

describe("middleware — the actual exported request handler", () => {
  const mkRequest = (path, cookieHeader) =>
    new Request(`https://myinvestorcircle.com${path}`, {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
    });

  it("rewrites to /index.html when a valid routing cookie is present", async () => {
    const { mintRoutingToken } = await import("./api/_lib/routingToken.js");
    const middleware = (await import("./middleware.js")).default;
    const token = mintRoutingToken("uid123", 900);
    const res = await middleware(mkRequest("/security/RELIANCE", `mic_route=${token}`));
    // @vercel/edge's rewrite() signals via a special response header rather
    // than a redirect status — assert on the one thing that matters for
    // this feature: the destination path it rewrites to.
    expect(res.headers.get("x-middleware-rewrite")).toContain("/index.html");
  });

  it("does not rewrite (falls through to web-public) with no cookie at all", async () => {
    const middleware = (await import("./middleware.js")).default;
    const res = await middleware(mkRequest("/security/RELIANCE", undefined));
    expect(res.headers.get("x-middleware-rewrite")).toBeFalsy();
  });

  it("does not rewrite with a garbage cookie value", async () => {
    const middleware = (await import("./middleware.js")).default;
    const res = await middleware(mkRequest("/idea/42", "mic_route=garbage-not-a-real-token"));
    expect(res.headers.get("x-middleware-rewrite")).toBeFalsy();
  });

  it("does not rewrite with an expired token", async () => {
    const { mintRoutingToken } = await import("./api/_lib/routingToken.js");
    const middleware = (await import("./middleware.js")).default;
    const token = mintRoutingToken("uid123", -60);
    const res = await middleware(mkRequest("/idea/42", `mic_route=${token}`));
    expect(res.headers.get("x-middleware-rewrite")).toBeFalsy();
  });

  it("preserves the exact requested path/symbol when rewriting", async () => {
    const { mintRoutingToken } = await import("./api/_lib/routingToken.js");
    const middleware = (await import("./middleware.js")).default;
    const token = mintRoutingToken("uid123", 900);
    // The rewrite destination is always /index.html regardless of which of
    // the two matched paths was requested — the ACTUAL page shown is then
    // decided client-side by App.jsx's pagePath mechanism reading the
    // untouched, still-/security/RELIANCE-or-/idea/42 address bar. This
    // test locks in that the middleware itself never rewrites the visible
    // URL, only which document is served at it.
    for (const path of ["/security/RELIANCE", "/idea/42"]) {
      const res = await middleware(mkRequest(path, `mic_route=${token}`));
      expect(res.headers.get("x-middleware-rewrite")).toMatch(/\/index\.html$/);
    }
  });
});

// Stage 3: "/" joins /security/:symbol and /idea/:id in the matcher. Same
// cookie-gated decision, plus one new wrinkle — bypass query params — that
// those two routes don't need (a shared /security or /idea link never
// carries a signup/reset/referral flow the way a raw homepage hit does).
describe("middleware — homepage (\"/\") routing", () => {
  const mkRequest = (path, cookieHeader) =>
    new Request(`https://myinvestorcircle.com${path}`, {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
    });

  it("does not rewrite bare \"/\" with no cookie (falls through to web-public's SSR homepage)", async () => {
    const middleware = (await import("./middleware.js")).default;
    const res = await middleware(mkRequest("/", undefined));
    expect(res.headers.get("x-middleware-rewrite")).toBeFalsy();
  });

  it("rewrites \"/\" to /index.html when a valid routing cookie is present", async () => {
    const { mintRoutingToken } = await import("./api/_lib/routingToken.js");
    const middleware = (await import("./middleware.js")).default;
    const token = mintRoutingToken("uid123", 900);
    const res = await middleware(mkRequest("/", `mic_route=${token}`));
    expect(res.headers.get("x-middleware-rewrite")).toMatch(/\/index\.html$/);
  });

  it("does not rewrite \"/\" with an expired or tampered cookie", async () => {
    const { mintRoutingToken } = await import("./api/_lib/routingToken.js");
    const middleware = (await import("./middleware.js")).default;
    const expired = mintRoutingToken("uid123", -60);
    expect((await middleware(mkRequest("/", `mic_route=${expired}`))).headers.get("x-middleware-rewrite")).toBeFalsy();
    expect((await middleware(mkRequest("/", "mic_route=garbage-not-a-real-token"))).headers.get("x-middleware-rewrite")).toBeFalsy();
  });

  it.each(["ref", "next", "signup", "claim_token", "oobCode", "mode"])(
    "always rewrites \"/\" to /index.html when ?%s= is present, even with no cookie at all",
    async (param) => {
      const middleware = (await import("./middleware.js")).default;
      const res = await middleware(mkRequest(`/?${param}=anything`, undefined));
      expect(res.headers.get("x-middleware-rewrite")).toMatch(/\/index\.html$/);
    }
  );

  it("bypass params win even over an expired/invalid cookie", async () => {
    const middleware = (await import("./middleware.js")).default;
    const res = await middleware(mkRequest("/?mode=resetPassword&oobCode=abc123", "mic_route=garbage"));
    expect(res.headers.get("x-middleware-rewrite")).toMatch(/\/index\.html$/);
  });

  it("does not apply the bypass-param check to /security or /idea (only \"/\" needs it)", async () => {
    const middleware = (await import("./middleware.js")).default;
    // A stray ?next= on a security page (not a real link this app generates)
    // must not accidentally force it to the SPA — only "/" gets that check.
    const res = await middleware(mkRequest("/security/RELIANCE?next=/somewhere", undefined));
    expect(res.headers.get("x-middleware-rewrite")).toBeFalsy();
  });
});
