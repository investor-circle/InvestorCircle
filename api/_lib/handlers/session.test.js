import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

// routingToken.js reads its secret from process.env at module-load time
// (same convention api/_lib/auth.js already uses for its own env vars), so
// this must be set before that module is first imported below.
process.env.ROUTING_TOKEN_SECRET = "test-secret";

let uidToReturn = null;
vi.mock("../auth.js", async () => {
  const actual = await vi.importActual("../auth.js");
  return { ...actual, optionalUid: vi.fn(async () => uidToReturn) };
});

const { default: handleSession, ROUTING_COOKIE_NAME, ROUTING_TOKEN_TTL_SECONDS } = await import("./session.js");
const { mintRoutingToken } = await import("../routingToken.js");

const mkRes = () => ({
  statusCode: 0,
  body: null,
  headers: {},
  setHeader(k, v) { this.headers[k] = v; },
  status(c) { this.statusCode = c; return this; },
  json(b) { this.body = b; return this; },
  end() { return this; },
});

beforeEach(() => {
  uidToReturn = null;
  process.env.ROUTING_TOKEN_SECRET = "test-secret";
});

describe("handleSession — mint", () => {
  it("refuses to mint without a valid Firebase token", async () => {
    uidToReturn = null;
    const res = mkRes();
    await handleSession({ query: { action: "mint" } }, res);
    expect(res.statusCode).toBe(401);
    expect(res.headers["Set-Cookie"]).toBeUndefined();
  });

  it("mints a cookie for a genuinely authenticated caller", async () => {
    uidToReturn = "uid123";
    const res = mkRes();
    await handleSession({ query: { action: "mint" } }, res);
    expect(res.statusCode).toBe(200);
    const cookie = res.headers["Set-Cookie"];
    expect(cookie).toContain(`${ROUTING_COOKIE_NAME}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("mints with the 7-day TTL, not the old 15-minute one", async () => {
    // Locks in the deliberate change (see session.js's own comment for why):
    // "/" is now homepage-routed too, and 15 minutes only covered a
    // continuously-open tab, not "back after being away for a day or two."
    expect(ROUTING_TOKEN_TTL_SECONDS).toBe(7 * 24 * 60 * 60);
    uidToReturn = "uid123";
    const res = mkRes();
    await handleSession({ query: { action: "mint" } }, res);
    expect(res.body.expiresIn).toBe(7 * 24 * 60 * 60);
    expect(res.headers["Set-Cookie"]).toContain(`Max-Age=${7 * 24 * 60 * 60}`);
  });

  it("ties the minted token to the caller's own uid, not a client-supplied one", async () => {
    uidToReturn = "the-real-uid";
    const res = mkRes();
    // Even if a request body tried to smuggle a different uid, mint only
    // ever reads the server-verified one from optionalUid.
    await handleSession({ query: { action: "mint" }, body: { uid: "attacker-supplied-uid" } }, res);
    const cookie = res.headers["Set-Cookie"];
    const token = cookie.split(";")[0].split("=")[1];
    const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
    expect(payload.uid).toBe("the-real-uid");
  });
});

describe("handleSession — clear", () => {
  it("clears the cookie regardless of auth state", async () => {
    uidToReturn = null; // simulates an already-expired/invalid Firebase session
    const res = mkRes();
    await handleSession({ query: { action: "clear" } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers["Set-Cookie"]).toContain("Max-Age=0");
  });
});

describe("handleSession — unknown action", () => {
  it("rejects anything else", async () => {
    const res = mkRes();
    await handleSession({ query: {} }, res);
    expect(res.statusCode).toBe(400);
  });
});

describe("the routing token is never accepted as an authentication credential", () => {
  // requireUid/requireAdmin verify a Bearer value by calling Firebase Admin's
  // verifyIdToken, which needs real Firebase project credentials this test
  // environment doesn't have (same reason every other test in this repo
  // mocks requireUid wholesale rather than exercising it live). What's
  // actually testable, cheaply and robustly, without live Firebase: the
  // source of truth for identity (auth.js) has zero knowledge of this
  // token's existence at all — no import, no cookie name, nothing to
  // accidentally wire together later. Same static-shape-guard pattern this
  // repo already uses for the "no delete-reco on web" rule (see
  // mobile/src/services/api/recommendationsApi.test.js).
  it("auth.js — the sole source of identity — never references the routing token or its cookie", () => {
    const authSrc = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "auth.js"),
      "utf8"
    );
    expect(authSrc).not.toMatch(/routingToken/i);
    expect(authSrc).not.toMatch(/mic_route/);
    expect(authSrc).not.toMatch(/req\.cookies|req\.headers\.cookie/);
  });

  it("a routing token cannot even be mistaken for a Firebase ID token — wrong shape", async () => {
    // A real Firebase ID token is a 3-segment JWT (header.payload.signature).
    // This token is 2 segments (payload.signature) — structurally rejected
    // before any cryptographic check would even run.
    const token = mintRoutingToken("uid123", 900);
    expect(token.split(".")).toHaveLength(2);
  });
});
