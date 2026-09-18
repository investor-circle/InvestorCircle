import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { SocialLinks, SiteFooter } from "./Marketing.jsx";
import { ContactPage } from "./MarketingPages.jsx";
import { SOCIAL_LINKS } from "../../constants/app";

// ContactPage uses useIsMobile (src/hooks/index.js), which reads
// window.matchMedia — jsdom has window but not matchMedia.
function setViewport(isMobile) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: isMobile,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

const hrefs = (c) => [...c.querySelectorAll('a[target="_blank"]')].map((a) => a.getAttribute("href"));

describe("SocialLinks", () => {
  beforeEach(() => { setViewport(false); });

  it("renders every configured account exactly once", () => {
    const { container } = render(<SocialLinks />);
    expect(hrefs(container)).toEqual(SOCIAL_LINKS.map((s) => s.url));
  });

  it("opens external tabs safely and labels each icon for screen readers", () => {
    const { container } = render(<SocialLinks />);
    const links = [...container.querySelectorAll("a")];
    expect(links).toHaveLength(SOCIAL_LINKS.length);
    for (const a of links) {
      // An icon-only link has no text, so the accessible name must come from
      // aria-label; target=_blank without noopener leaves the opener exposed.
      expect(a.getAttribute("rel")).toContain("noopener");
      expect(a.getAttribute("aria-label")).toBeTruthy();
    }
  });

  // Both surfaces that embed SocialLinks are exercised below, per CLAUDE.md:
  // a shared component gets tested against each caller, not just in isolation.
  it("renders the same accounts from inside the site footer", () => {
    const { container } = render(<SiteFooter page="about" setPage={() => {}} />);
    expect(hrefs(container)).toEqual(SOCIAL_LINKS.map((s) => s.url));
  });

  it("renders the same accounts from inside the Contact page", () => {
    const { container } = render(<ContactPage setPage={() => {}} />);
    expect(hrefs(container)).toEqual(SOCIAL_LINKS.map((s) => s.url));
  });
});

describe("SOCIAL_LINKS", () => {
  it("holds absolute https URLs — they are copied verbatim into index.html's JSON-LD sameAs", () => {
    for (const { key, label, url } of SOCIAL_LINKS) {
      expect(key).toBeTruthy();
      expect(label).toBeTruthy();
      expect(url).toMatch(/^https:\/\//);
    }
  });

  it("carries no share or session tokens", () => {
    // An Instagram share link arrives with ?stkn=…, and a Facebook one as
    // /share/<id>/. Neither belongs in a page served to everyone.
    for (const { url } of SOCIAL_LINKS) {
      expect(url).not.toMatch(/[?&]stkn=/);
      expect(url).not.toMatch(/facebook\.com\/share\//);
    }
  });
});
