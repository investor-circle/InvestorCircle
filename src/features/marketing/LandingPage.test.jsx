import React from "react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import LandingPage from "./LandingPage.jsx";
import { SOCIAL_LINKS } from "../../constants/app";

// The in-page nav scrolls to a section; jsdom implements no layout, so it has
// no scrollIntoView at all (same reason Portfolio.test.jsx stubs matchMedia).
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

const noop = { onSignIn: () => {}, onCreateAccount: () => {} };

describe("LandingPage", () => {
  it("renders without throwing", () => {
    expect(() => render(<LandingPage {...noop} />)).not.toThrow();
  });

  it("gives the page exactly one h1 and uses real headings below it", () => {
    const { container } = render(<LandingPage {...noop} />);
    // This page is what a crawler sees at "/" for a signed-out visitor, so the
    // heading outline is the SEO payload, not decoration.
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelectorAll("h2").length).toBeGreaterThan(3);
  });

  it("routes both calls to action back to the caller", () => {
    const onSignIn = vi.fn();
    const onCreateAccount = vi.fn();
    const { getAllByRole } = render(
      <LandingPage onSignIn={onSignIn} onCreateAccount={onCreateAccount} />
    );
    const buttons = getAllByRole("button");
    for (const b of buttons) fireEvent.click(b);
    expect(onSignIn).toHaveBeenCalled();
    expect(onCreateAccount).toHaveBeenCalled();
  });

  it("says idea, never call", () => {
    // Product vocabulary: an investment "call" is always an "idea" here.
    const { container } = render(<LandingPage {...noop} />);
    expect(container.textContent).not.toMatch(/\bcalls?\b/i);
  });

  it("links the same social accounts as the rest of the site", () => {
    const { container } = render(<LandingPage {...noop} />);
    const hrefs = [...container.querySelectorAll('a[target="_blank"]')].map(a => a.getAttribute("href"));
    expect(hrefs).toEqual(SOCIAL_LINKS.map(s => s.url));
  });

  it("carries the not-investment-advice disclaimer", () => {
    const { container } = render(<LandingPage {...noop} />);
    expect(container.textContent).toMatch(/do not provide/i);
  });

  it("links to /search as a real <a href>, not an onClick handler", () => {
    // getByRole('link', ...) only matches a real <a href> exposed with the
    // link ARIA role — a <div onClick> or <button onClick> (like every other
    // interactive element on this page) would not satisfy this query, so
    // this also proves it isn't one of those.
    const { getByRole } = render(<LandingPage {...noop} />);
    const link = getByRole("link", { name: /explore stock insights/i });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/search");
  });
});
