import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { renderCommentBody } from "./RecommendationsPages.jsx";

// renderCommentBody turns a plain-text comment into clickable links (URLs)
// and clickable spans (confirmed @mentions) without ever using
// dangerouslySetInnerHTML — see its own comment for why. These are the
// regex-driven edge cases most likely to silently break on a future edit.
const renders = (text, mentions) => render(<div data-testid="body">{renderCommentBody(text, mentions)}</div>);

describe("renderCommentBody — URL linkification", () => {
  it("turns a bare https:// URL into a real, safe anchor", () => {
    const { getByRole } = renders("Check this out: https://example.com/foo", []);
    const link = getByRole("link");
    expect(link.getAttribute("href")).toBe("https://example.com/foo");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.textContent).toBe("https://example.com/foo");
  });

  it("adds https:// to a bare www. link so it doesn't resolve relative to the app", () => {
    const { getByRole } = renders("see www.example.com for details", []);
    expect(getByRole("link").getAttribute("href")).toBe("https://www.example.com");
  });

  it("strips a trailing sentence period from the link but keeps it as text", () => {
    const { getByRole, getByTestId } = renders("Read https://example.com/page.", []);
    expect(getByRole("link").getAttribute("href")).toBe("https://example.com/page");
    expect(getByTestId("body").textContent).toBe("Read https://example.com/page.");
  });

  it("strips a wrapping closing paren the same way", () => {
    const { getByRole } = renders("(see https://example.com/x)", []);
    expect(getByRole("link").getAttribute("href")).toBe("https://example.com/x");
  });

  it("linkifies more than one URL in the same comment", () => {
    const { getAllByRole } = renders("https://a.com and https://b.com", []);
    const links = getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute("href")).toBe("https://a.com");
    expect(links[1].getAttribute("href")).toBe("https://b.com");
  });

  it("does not touch plain text with no link", () => {
    const { queryByRole, getByTestId } = renders("just a normal comment", []);
    expect(queryByRole("link")).toBeNull();
    expect(getByTestId("body").textContent).toBe("just a normal comment");
  });

  it("keeps a URL intact even when it contains something mention-shaped, e.g. a profile link", () => {
    // Without splitting on URLs first, this would fragment into a broken
    // link plus a separately-clickable "@johndoe123" mention span.
    const { getAllByRole } = renders("check https://x.com/@johndoe123 out", [{ username: "johndoe123" }]);
    const links = getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("https://x.com/@johndoe123");
  });
});

describe("renderCommentBody — @mentions", () => {
  it("makes a confirmed mention clickable", () => {
    const { container } = renders("hey @ankur_g check this", [{ username: "ankur_g" }]);
    const span = container.querySelector("span");
    expect(span).not.toBeNull();
    expect(span.textContent).toBe("@ankur_g");
    expect(span.style.cursor).toBe("pointer");
  });

  it("leaves an unconfirmed @word as plain text", () => {
    const { container, getByTestId } = renders("hey @randomword here", []);
    expect(container.querySelector("span")).toBeNull();
    expect(getByTestId("body").textContent).toBe("hey @randomword here");
  });
});
