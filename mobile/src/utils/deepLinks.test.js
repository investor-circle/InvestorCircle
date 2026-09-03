import { parseDeepLink, parseReferral } from "./deepLinks";

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

  it("routes a Circle invite link to the by-SLUG screen", () => {
    // A shared circle link carries the slug the web hands out, never a group
    // id. Routing it to /circle/:id (the app's own id-based screen) made the
    // screen look up a Circle whose id was really a slug, and find nothing.
    expect(parseDeepLink("https://myinvestorcircle.com/#/circle/value-investors")).toEqual({
      path: "/circle/s/value-investors",
    });
    expect(parseDeepLink("myinvestorcircle://circle/value-investors")).toEqual({
      path: "/circle/s/value-investors",
    });
  });

  it("does not treat the create/manage sub-routes as circle links", () => {
    // "new"/"manage" are app-internal screens, not shareable circle slugs —
    // treating them as slugs would open a Circle called "new".
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

describe("parseDeepLink — market consensus", () => {
  it("routes a ticker link and upper-cases the symbol", () => {
    // The screen and the API both key on an upper-case ticker; a lower-case
    // link would otherwise fetch nothing and look like an empty security.
    expect(parseDeepLink("https://myinvestorcircle.com/#/ticker/infy")).toEqual({ path: "/ticker/INFY" });
    expect(parseDeepLink("myinvestorcircle://ticker/TCS")).toEqual({ path: "/ticker/TCS" });
  });

  it("does not route a bare /ticker with no symbol", () => {
    expect(parseDeepLink("https://myinvestorcircle.com/#/ticker")).toBeNull();
  });
});

// An invite link puts the code in the QUERY on the site root
// (https://myinvestorcircle.com/?ref=alice) rather than in the route, which
// is why parseDeepLink cannot see it: it strips the query and needs a path.
// Getting this wrong means an invite opens the app with the invitation
// silently discarded — the referrer gets no credit and the newcomer is not
// connected to the person who invited them.

describe("parseReferral", () => {
  it("reads the code from a plain invite link", () => {
    expect(parseReferral("https://myinvestorcircle.com/?ref=alice")).toBe("alice");
  });

  it("reads it alongside other parameters, and from a fragment link", () => {
    expect(parseReferral("https://myinvestorcircle.com/?utm_source=x&ref=alice")).toBe("alice");
    expect(parseReferral("https://myinvestorcircle.com/?ref=alice#/investor/bob")).toBe("alice");
    expect(parseReferral("myinvestorcircle://open?ref=alice")).toBe("alice");
  });

  it("normalises case and whitespace, as the web does before storing it", () => {
    expect(parseReferral("https://myinvestorcircle.com/?ref=Alice")).toBe("alice");
    expect(parseReferral("https://myinvestorcircle.com/?ref=%20alice%20")).toBe("alice");
  });

  it("returns null for a link that carries no invite", () => {
    expect(parseReferral("https://myinvestorcircle.com/#/investor/alice")).toBeNull();
    expect(parseReferral("https://myinvestorcircle.com/?referrer=alice")).toBeNull();
    expect(parseReferral("")).toBeNull();
    expect(parseReferral(null)).toBeNull();
  });

  it("rejects anything that is not shaped like a username", () => {
    // Whatever comes back is sent to the server and shown on the login
    // screen ("@x invited you"), so it is checked before either happens.
    expect(parseReferral("https://myinvestorcircle.com/?ref=")).toBeNull();
    expect(parseReferral("https://myinvestorcircle.com/?ref=a")).toBeNull();
    expect(parseReferral("https://myinvestorcircle.com/?ref=" + "a".repeat(60))).toBeNull();
    expect(parseReferral("https://myinvestorcircle.com/?ref=%3Cscript%3E")).toBeNull();
    expect(parseReferral("https://myinvestorcircle.com/?ref=al%GGice")).toBeNull();
  });
});
