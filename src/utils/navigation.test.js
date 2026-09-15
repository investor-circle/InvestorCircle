import { describe, it, expect } from "vitest";
import { isSameSitePath } from "./navigation";

// isSameSitePath is the only thing standing between web-public's Gate
// (?next=<path> on the sign-in link) and an open redirect — see its own
// comment in navigation.js for the exact attack this guards against.
describe("isSameSitePath", () => {
  it("accepts a plain in-app path", () => {
    expect(isSameSitePath("/security/RELIANCE")).toBe(true);
    expect(isSameSitePath("/idea/42")).toBe(true);
  });

  it("accepts a path with a query string", () => {
    expect(isSameSitePath("/idea/42?highlightComment=9")).toBe(true);
    expect(isSameSitePath("/search?q=reliance")).toBe(true);
  });

  it("rejects a protocol-relative URL — a bare path to the eye, a different origin to the browser", () => {
    expect(isSameSitePath("//evil.example")).toBe(false);
    expect(isSameSitePath("//evil.example/security/RELIANCE")).toBe(false);
  });

  it("rejects an absolute URL to another origin", () => {
    expect(isSameSitePath("https://evil.example")).toBe(false);
    expect(isSameSitePath("http://evil.example/phish")).toBe(false);
  });

  it("rejects a javascript: or other non-http scheme", () => {
    expect(isSameSitePath("javascript:alert(1)")).toBe(false);
  });

  it("rejects anything not starting with a slash", () => {
    expect(isSameSitePath("security/RELIANCE")).toBe(false);
    expect(isSameSitePath("")).toBe(false);
  });

  it("rejects non-string input without throwing", () => {
    for (const bad of [null, undefined, 42, {}, []]) {
      expect(isSameSitePath(bad)).toBe(false);
    }
  });
});
