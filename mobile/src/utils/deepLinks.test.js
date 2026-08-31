import { parseDeepLink } from "./deepLinks";

// The web app's shareable URLs are HashRouter URLs, so the route lives in the
// fragment. Android intent filters only match scheme/host/path — if this
// parsing is wrong, an incoming link silently lands on the feed instead of
// the thing the sender shared.

describe("parseDeepLink — web hash URLs (what people actually share)", () => {
  it("routes a shared idea link to the idea, keeping the author", () => {
    expect(parseDeepLink("https://myinvestorcircle.com/#/investor/alice/reco/123")).toEqual({
      path: "/reco/123",
      username: "alice",
    });
  });

  it("routes a profile link to that profile", () => {
    expect(parseDeepLink("https://myinvestorcircle.com/#/investor/alice")).toEqual({ path: "/investor/alice" });
  });

  it("ignores a query string and a trailing slash", () => {
    expect(parseDeepLink("https://myinvestorcircle.com/#/investor/alice/?ref=x")).toEqual({
      path: "/investor/alice",
    });
  });
});

describe("parseDeepLink — custom scheme and bare paths", () => {
  it("handles the app's own scheme with no host", () => {
    expect(parseDeepLink("myinvestorcircle://investor/bob/reco/9")).toEqual({ path: "/reco/9", username: "bob" });
    expect(parseDeepLink("myinvestorcircle://reco/9")).toEqual({ path: "/reco/9" });
  });

  it("handles a bare https path (no fragment)", () => {
    expect(parseDeepLink("https://myinvestorcircle.com/investor/carol")).toEqual({ path: "/investor/carol" });
  });

  it("routes a Circle link, but not the create/manage sub-routes", () => {
    expect(parseDeepLink("https://myinvestorcircle.com/#/circle/77")).toEqual({ path: "/circle/77" });
    // "new"/"manage" are app-internal screens, not shareable circle ids —
    // treating them as ids would open a Circle called "new".
    expect(parseDeepLink("https://myinvestorcircle.com/#/circle/new")).toBeNull();
    expect(parseDeepLink("https://myinvestorcircle.com/#/circle/manage")).toBeNull();
  });

  it("routes known top-level screens", () => {
    expect(parseDeepLink("myinvestorcircle://notifications")).toEqual({ path: "/notifications" });
  });
});

describe("parseDeepLink — things it must NOT route", () => {
  it("returns null for the bare site, unknown routes and junk", () => {
    for (const url of [
      "https://myinvestorcircle.com/",
      "https://myinvestorcircle.com/#/",
      "https://myinvestorcircle.com/#/unknown-page",
      "https://myinvestorcircle.com/#/investor",
      "",
      null,
      undefined,
      12345,
    ]) {
      expect(parseDeepLink(url)).toBeNull();
    }
  });

  it("percent-encodes path segments rather than interpolating raw input", () => {
    // A username is user-controlled; it must not be able to inject extra
    // path segments into the route it is spliced into.
    expect(parseDeepLink("https://myinvestorcircle.com/#/investor/a%2Fb")).toEqual({
      path: "/investor/a%252Fb",
    });
  });
});
