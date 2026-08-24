import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
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
const noopProps = { setHoldings: () => {}, contacts: [], me: { id: "me" }, refreshPrices: () => {}, priceRefresh: null, onOpenSecurity: () => {}, setPage: () => {} };

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
});
