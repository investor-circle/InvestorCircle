import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { PortfolioIntelligencePage } from "./Portfolio.jsx";

// useIsMobile (src/hooks/index.js) reads window.matchMedia — jsdom provides
// window, but not matchMedia by default, so it must be stubbed per test.
function setViewport(isMobile) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: isMobile,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

const holdings = [
  { id: "h1", sym: "RELIANCE", name: "Reliance Industries", type: "Stock", acct: "manual", acctName: "Manual", sh: 10, cost: 2000, price: 2500, isin: "", sector: "Energy", currency: "INR", purchaseDate: "2023-01-01", source: "manual" },
  { id: "h2", sym: "NIFTYBEES", name: "Nifty 50 ETF", type: "ETF", acct: "manual", acctName: "Manual", sh: 100, cost: 200, price: 210, isin: "", sector: "", currency: "INR", purchaseDate: "2023-01-01", source: "manual" },
];
const cryptoOnlyHoldings = [
  { id: "h3", sym: "BTC", name: "Bitcoin", type: "Crypto", acct: "manual", acctName: "Manual", sh: 0.1, cost: 3000000, price: 3200000, isin: "", sector: "", currency: "INR", purchaseDate: "2023-01-01", source: "manual" },
];
const noopProps = { setHoldings: () => {}, contacts: [], me: { id: "me" }, onOpenSecurity: () => {}, setPage: () => {} };

describe("PortfolioIntelligencePage", () => {
  beforeEach(() => { setViewport(false); });

  it("renders the desktop table without throwing", () => {
    setViewport(false);
    expect(() => render(<PortfolioIntelligencePage holdings={holdings} {...noopProps} />)).not.toThrow();
  });

  it("renders the mobile card list — including the side-by-side Community/Circle layout — without throwing", () => {
    setViewport(true);
    expect(() => render(<PortfolioIntelligencePage holdings={holdings} {...noopProps} />)).not.toThrow();
  });

  it("renders the mobile empty state without throwing", () => {
    setViewport(true);
    expect(() => render(<PortfolioIntelligencePage holdings={[]} {...noopProps} />)).not.toThrow();
  });

  // Regression: classFilter defaults to 'Stock', but a portfolio can
  // legitimately hold zero Stock-type holdings (only ETF/Crypto/etc). The
  // filter dropdown itself only renders once there's more than one asset
  // class, so a stale 'Stock' default must fall back to showing everything
  // rather than silently filtering the list down to nothing with no
  // visible way to fix it.
  it("does not filter out all holdings when the portfolio has no Stock-type holdings (default filter is 'Stock')", () => {
    setViewport(false);
    const { container } = render(<PortfolioIntelligencePage holdings={cryptoOnlyHoldings} {...noopProps} />);
    expect(container.textContent).toContain("BTC");
  });

  it("mobile: does not filter out all holdings when the portfolio has no Stock-type holdings", () => {
    setViewport(true);
    const { container } = render(<PortfolioIntelligencePage holdings={cryptoOnlyHoldings} {...noopProps} />);
    expect(container.textContent).toContain("BTC");
  });

  // The holdings-card header's search/filter/sort are icon-only buttons
  // that open either an inline search box or a SmallAnchoredPopover
  // (portalled to document.body) — exercise the actual click interactions,
  // not just the initial render, since that's the new code this pass.
  it("search icon toggles a search input open", () => {
    const { getByTitle, queryByPlaceholderText } = render(<PortfolioIntelligencePage holdings={holdings} {...noopProps} />);
    expect(queryByPlaceholderText("Search symbol or name…")).toBeNull();
    fireEvent.click(getByTitle("Search holdings"));
    expect(queryByPlaceholderText("Search symbol or name…")).not.toBeNull();
  });

  it("filter icon opens a popover with the asset-class select", () => {
    const { getByTitle, queryByText } = render(<PortfolioIntelligencePage holdings={holdings} {...noopProps} />);
    expect(queryByText("Asset class")).toBeNull();
    fireEvent.click(getByTitle("Filter by asset class"));
    expect(queryByText("Asset class")).not.toBeNull();
  });

  it("sort icon opens a popover with sort options, and picking one closes it", () => {
    const { getByTitle, queryByText, getByText } = render(<PortfolioIntelligencePage holdings={holdings} {...noopProps} />);
    fireEvent.click(getByTitle("Sort holdings"));
    expect(queryByText("Gain (high→low)")).not.toBeNull();
    fireEvent.click(getByText("Gain (high→low)"));
    expect(queryByText("Symbol (A→Z)")).toBeNull(); // popover closed after picking an option
  });
});
