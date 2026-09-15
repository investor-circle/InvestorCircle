import { describe, it, expect, beforeEach, vi } from "vitest";

// Signature verification itself is duplicated in /middleware.js (edge
// runtime, no Node crypto) — see that file's own header comment for why.
// These tests only cover the Node-side minting half, plus the shape any
// verifier (this one or the edge one) needs to agree on.

beforeEach(() => {
  vi.resetModules();
  process.env.ROUTING_TOKEN_SECRET = "test-secret-do-not-use-in-prod";
});

describe("mintRoutingToken", () => {
  it("produces a payload.signature token", async () => {
    const { mintRoutingToken } = await import("./routingToken.js");
    const token = mintRoutingToken("uid123", 900);
    const parts = token.split(".");
    expect(parts).toHaveLength(2);
  });

  it("encodes the uid and an expiry timestamp in the payload", async () => {
    const { mintRoutingToken } = await import("./routingToken.js");
    const before = Math.floor(Date.now() / 1000);
    const token = mintRoutingToken("uid123", 900);
    const [payloadB64] = token.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    expect(payload.uid).toBe("uid123");
    expect(payload.exp).toBeGreaterThanOrEqual(before + 900);
    expect(payload.exp).toBeLessThan(before + 900 + 5); // sanity window, not a real clock dependency
  });

  it("signs with HMAC-SHA256 over the payload, verifiable independently", async () => {
    const { mintRoutingToken } = await import("./routingToken.js");
    const crypto = await import("crypto");
    const token = mintRoutingToken("uid123", 900);
    const [payloadB64, sig] = token.split(".");
    const expectedSig = crypto.createHmac("sha256", "test-secret-do-not-use-in-prod")
      .update(payloadB64).digest("base64url");
    expect(sig).toBe(expectedSig);
  });

  it("produces a different signature for a different secret — the whole point", async () => {
    const { mintRoutingToken } = await import("./routingToken.js");
    const token = mintRoutingToken("uid123", 900);
    const [payloadB64, sig] = token.split(".");
    const crypto = await import("crypto");
    const wrongSig = crypto.createHmac("sha256", "a-different-secret").update(payloadB64).digest("base64url");
    expect(sig).not.toBe(wrongSig);
  });

  it("throws rather than mint an unsigned token when the secret is missing", async () => {
    delete process.env.ROUTING_TOKEN_SECRET;
    const { mintRoutingToken } = await import("./routingToken.js");
    expect(() => mintRoutingToken("uid123", 900)).toThrow();
  });

  it("throws without a uid — this token must always be tied to someone", async () => {
    const { mintRoutingToken } = await import("./routingToken.js");
    expect(() => mintRoutingToken(null, 900)).toThrow();
    expect(() => mintRoutingToken(undefined, 900)).toThrow();
    expect(() => mintRoutingToken("", 900)).toThrow();
  });
});
