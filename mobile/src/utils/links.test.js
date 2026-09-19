import { recoUrl, profileUrl, circleUrl, inviteUrl, securityUrl, WEB_ORIGIN } from "./links";
import { API_ORIGIN } from "../services/api";
import { parseReferral } from "./deepLinks";

jest.mock("../services/api", () => ({ API_ORIGIN: "https://investor-circle.vercel.app" }));

// The site and the API are two different deployments — the frontend on the
// custom domain, the functions on Vercel. The share sheet built its links from
// API_ORIGIN, which produced a perfectly well-formed URL that simply did not
// open the idea. Nothing failed, nothing logged; the recipient just got a page
// that wasn't there.
//
// That is exactly the kind of mistake a test catches and a reviewer doesn't,
// so the host is asserted explicitly rather than by rebuilding the string.

describe("recoUrl", () => {
  it("points at the website, never the API host", () => {
    const url = recoUrl("123");
    expect(url.startsWith("https://myinvestorcircle.com/")).toBe(true);
    expect(url).not.toContain(API_ORIGIN);
  });

  it("builds the bare, id-only URL — the one the web-public SSR app actually serves", () => {
    // NOT /investor/:username/idea/:id — that nested shape is the web app's
    // own in-app navigational URL, not its public share link (see the web
    // app's own RecoPostPage, which builds this exact bare form for its
    // "Share this idea" button). The nested shape gets no server-rendered
    // content — no title, description, or preview image — for anyone
    // without the app installed.
    expect(recoUrl("123")).toBe("https://myinvestorcircle.com/idea/123");
  });

  it("returns nothing without an id", () => {
    for (const missing of [null, undefined, ""]) {
      expect(recoUrl(missing)).toBeNull();
    }
  });

  it("escapes values rather than interpolating them raw", () => {
    expect(recoUrl("1/2")).toBe("https://myinvestorcircle.com/idea/1%2F2");
  });
});

describe("profileUrl", () => {
  it("points at the website and matches the web's profile route", () => {
    expect(profileUrl("asha")).toBe("https://myinvestorcircle.com/investor/asha");
  });
});

describe("securityUrl", () => {
  it("points at the website and matches the web's /security/:ticker route", () => {
    expect(securityUrl("INFY")).toBe("https://myinvestorcircle.com/security/INFY");
  });

  it("returns nothing when there is no ticker", () => {
    for (const missing of [null, undefined, ""]) {
      expect(securityUrl(missing)).toBeNull();
    }
  });

  it("escapes values rather than interpolating them raw", () => {
    expect(securityUrl("a/b")).toBe("https://myinvestorcircle.com/security/a%2Fb");
  });
});

describe("circleUrl", () => {
  it("builds the invite link by SLUG, as the web's gotoCircle does", () => {
    // Not the group id: the app's own Circle route takes an id, the shared
    // link takes a slug, and following one built from an id finds nothing.
    expect(circleUrl("value-investors")).toBe("https://myinvestorcircle.com/circle/value-investors");
  });
});

describe("inviteUrl", () => {
  it("puts the code in a query on the ROOT, which is what the app reads back", () => {
    // parseReferral() looks for ?ref= and the server matches a username; a
    // route-shaped link would be captured by neither.
    expect(inviteUrl("asha")).toBe("https://myinvestorcircle.com/?ref=asha");
  });

  it("round-trips through the app's own referral parser", () => {
    expect(parseReferral(inviteUrl("asha"))).toBe("asha");
  });

  it("is nothing without a username, because the link IS the username", () => {
    for (const missing of [null, undefined, ""]) {
      expect(inviteUrl(missing)).toBeNull();
    }
  });
});

describe("WEB_ORIGIN", () => {
  it("is not the API origin", () => {
    // The whole point of naming them separately.
    expect(WEB_ORIGIN).not.toBe(API_ORIGIN);
  });

  it("carries no trailing slash, so the built paths have exactly one", () => {
    expect(WEB_ORIGIN.endsWith("/")).toBe(false);
    expect(recoUrl("1")).not.toContain("//idea/");
  });
});
