import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { ThesisRenderer, FeedCard } from "./Recommendations.jsx";

// Regression test for a rules-of-hooks violation: ThesisRenderer used to
// `return null` between its two useMemo() calls whenever parseThesis(thesis)
// returned null (an empty/placeholder thesis). If `thesis` changed from
// populated to empty/placeholder across a re-render of the SAME component
// instance, React would call fewer hooks on the second render and throw
// ("Rendered fewer hooks than during the previous render"), crashing
// everything up the tree to the nearest error boundary. This component
// renders on nearly every reco card in the app, so this was a
// wide-blast-radius latent bug.
describe("ThesisRenderer", () => {
  it("does not throw when re-rendered with thesis going from populated to empty", () => {
    const { rerender } = render(<ThesisRenderer thesis="A real thesis with enough text to matter." />);
    expect(() => rerender(<ThesisRenderer thesis="" />)).not.toThrow();
    expect(() => rerender(<ThesisRenderer thesis="—" />)).not.toThrow();
    expect(() => rerender(<ThesisRenderer thesis={null} />)).not.toThrow();
  });

  it("does not throw when re-rendered with thesis going from empty back to populated", () => {
    const { rerender } = render(<ThesisRenderer thesis="" />);
    expect(() => rerender(<ThesisRenderer thesis="A thesis appears now." />)).not.toThrow();
  });

  it("renders nothing for an empty/placeholder thesis", () => {
    const { container } = render(<ThesisRenderer thesis="—" />);
    expect(container.firstChild).toBeNull();
  });
});

// Regression coverage for the original Home Feed crash: FeedCard is used
// for recsReceived (bare "YYYY-MM-DD" date), publicFeedRecos, and
// networkEngagementRecos rows (full ISO timestamp `date`, aliased directly
// from created_at — see api/_lib/handlers/lookups.js). It must render
// cleanly for both shapes, and for closed (exited/expired) ideas.
describe("FeedCard", () => {
  const baseReco = {
    id: "reco-1", from: "user-1", byName: "Alice",
    assetName: "RELIANCE", ticker: "RELIANCE", assetClass: "Equity",
    priceAt: 2000, price: 2500, targetPrice: 2800, horizon: "6m",
    thesis: "Some thesis text", exitSignal: false,
    invested: false, reaction: "none", hidden: false,
    likes: 2, recoActed: 0, commentCount: 1, isPublic: true, recType: "Buy",
  };
  const noopProps = {
    me: { id: "me" }, contacts: [], groups: [],
    setRecsReceived: () => {}, setPublicFeedRecos: () => {}, setNetworkEngagementRecos: () => {},
    tracked: new Set(), toggleTrack: () => {},
  };

  it("renders a recsReceived-shaped row (bare date, no explicit targetDate)", () => {
    expect(() => render(<FeedCard r={{ ...baseReco, date: "2023-06-01" }} {...noopProps} />)).not.toThrow();
  });

  it("renders a public-feed/network-engagement-shaped row (full ISO timestamp date, no targetDate) — this exact shape crashed the app previously", () => {
    expect(() => render(<FeedCard r={{ ...baseReco, date: "2023-06-01T05:30:00.000Z", feedSource: "public" }} {...noopProps} />)).not.toThrow();
  });

  it("renders an exited idea", () => {
    expect(() => render(<FeedCard r={{ ...baseReco, date: "2023-06-01", exitSignal: true, exitDate: "2023-12-01", exitPrice: 2400 }} {...noopProps} />)).not.toThrow();
  });

  it("renders an expired idea with a pending (unstamped) expiry price", () => {
    expect(() => render(<FeedCard r={{ ...baseReco, date: "2023-06-01", targetDate: "2020-01-01", expiryPrice: null }} {...noopProps} />)).not.toThrow();
  });
});

// The New Idea form adapts to who is posting. A Verified Research Publisher
// (SEBI verification APPROVED) posts Buy/Hold/Sell recommendations with the
// professional research fields; everyone else posts a Market View
// (Positive/Neutral/Negative) with commentary and an editable disclosure, and
// none of the recommendation-performance fields. The server enforces the same
// split (api/_lib/ideaType.js) — these tests pin what each persona is shown.
import { screen, fireEvent } from "@testing-library/react";
import { MakeRecoModal } from "./Recommendations.jsx";
import { DEFAULT_MARKET_VIEW_DISCLOSURE } from "../../utils/ideaType";

describe("MakeRecoModal — publishing personas", () => {
  // useIsMobile reads window.matchMedia, which jsdom doesn't provide.
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
  });
  const verified   = { id: "u1", registrationStatus: "verified_research_publisher", sebiApprovalStatus: "approved" };
  const contributor = { id: "u2", registrationStatus: "independent_market_contributor", sebiApprovalStatus: "not_applied" };
  const modal = (me) => render(
    <MakeRecoModal assetClasses={["Equity"]} setAssetClasses={() => {}} contacts={[]} groups={[]}
      holdings={[]} me={me} onClose={() => {}} onCreate={() => {}} />
  );
  const btn = (name) => screen.queryByRole("button", { name });
  const text = (re) => screen.queryByText(re);

  it("offers a Verified Research Publisher Buy / Hold / Sell and the professional fields", () => {
    modal(verified);
    for (const t of ["Buy", "Hold", "Sell"]) expect(btn(t), t).toBeTruthy();
    for (const t of ["Positive", "Neutral", "Negative"]) expect(btn(t), t).toBeNull();
    expect(text(/Target price/)).toBeTruthy();
    expect(text(/Stop loss/)).toBeTruthy();
    expect(text(/Investment horizon/)).toBeTruthy();
    expect(text(/Conviction/)).toBeTruthy();
    expect(text(/Entry price/)).toBeTruthy();
    expect(text(/^Thesis/)).toBeTruthy();
    expect(screen.queryByText(/^Disclosure/)).toBeNull();
  });

  it("explains the publisher's fields", () => {
    modal(verified);
    expect(text(/professional recommendation/i)).toBeTruthy();
    expect(text(/price you expect it to reach/i)).toBeTruthy();
    expect(text(/How long you expect your view to play out/i)).toBeTruthy();
  });

  it("offers an Independent Market Contributor Positive / Neutral / Negative — never Buy, Hold or Sell", () => {
    modal(contributor);
    for (const t of ["Positive", "Neutral", "Negative"]) expect(btn(t), t).toBeTruthy();
    for (const t of ["Buy", "Hold", "Sell"]) expect(btn(t), t).toBeNull();
    expect(screen.queryByText(/bullish|bearish/i)).toBeNull();
  });

  it("hides every recommendation-performance field from a contributor", () => {
    modal(contributor);
    for (const re of [/Target price/, /Stop loss/, /Investment horizon/, /Conviction/, /Entry price/, /Target date/]) {
      expect(text(re), String(re)).toBeNull();
    }
  });

  it("asks a contributor for commentary and a disclosure pre-filled with an editable default", () => {
    modal(contributor);
    expect(text(/^Commentary/)).toBeTruthy();
    const box = screen.getByDisplayValue(DEFAULT_MARKET_VIEW_DISCLOSURE);
    expect(box.tagName).toBe("TEXTAREA");
    expect(DEFAULT_MARKET_VIEW_DISCLOSURE).toMatch(/personal, independent market view/i);
    expect(DEFAULT_MARKET_VIEW_DISCLOSURE).toMatch(/not presenting myself as a SEBI-registered Research Analyst/i);
    expect(DEFAULT_MARKET_VIEW_DISCLOSURE).toMatch(/not investment advice/i);
    expect(DEFAULT_MARKET_VIEW_DISCLOSURE).toMatch(/myInvestorCircle does not provide, verify or endorse/i);
    fireEvent.change(box, { target: { value: "I hold shares in this company." } });
    expect(screen.getByDisplayValue("I hold shares in this company.")).toBeTruthy();
  });

  it("won't let a contributor send until a view is chosen", () => {
    modal(contributor);
    expect(btn(/Send/).disabled).toBe(true);
  });

  it("treats a publisher whose verification is pending or rejected as a contributor", () => {
    for (const sebiApprovalStatus of ["pending", "rejected", "not_applied", ""]) {
      const { unmount } = modal({ id: "u3", registrationStatus: "verified_research_publisher", sebiApprovalStatus });
      expect(btn("Positive"), sebiApprovalStatus).toBeTruthy();
      expect(btn("Buy"), sebiApprovalStatus).toBeNull();
      unmount();
    }
  });
});

describe("FeedCard — Market View", () => {
  const view = {
    id: "v1", from: "user-9", byName: "Meera", assetName: "INFY", ticker: "INFY", assetClass: "Equity",
    priceAt: 0, price: 0, thesis: "Deal wins are improving and attrition has stabilised.", date: "2025-01-10",
    exitSignal: false, invested: false, reaction: "none", hidden: false, likes: 0, commentCount: 0,
    isPublic: true, recType: "Positive", disclosure: "Personal view. I own no shares.",
  };
  const props = {
    me: { id: "me" }, contacts: [], groups: [], setRecsReceived: () => {}, setPublicFeedRecos: () => {},
    setNetworkEngagementRecos: () => {}, tracked: new Set(), toggleTrack: () => {},
  };

  it("shows the view as Positive, never as Buy/Sell, with no return, entry price or invest toggle", () => {
    render(<FeedCard r={view} {...props} />);
    expect(screen.getByText("Positive")).toBeTruthy();
    expect(screen.queryByText("Buy")).toBeNull();
    expect(screen.queryByText("Sell")).toBeNull();
    expect(screen.queryByText(/Mark Invested/)).toBeNull();
    expect(screen.queryByText(/% *$/)).toBeNull();
    expect(screen.queryByText(/now$/)).toBeNull();
  });

  it("shows the author's own disclosure instead of the standard disclaimer", () => {
    render(<FeedCard r={view} {...props} />);
    fireEvent.click(screen.getByText("Disclosure"));
    expect(screen.getByText(/Personal view\. I own no shares\./)).toBeTruthy();
  });

  it("still renders a Hold recommendation as Hold (not Sell)", () => {
    render(<FeedCard r={{ ...view, recType: "Hold", priceAt: 100, price: 110, disclosure: null }} {...props} />);
    expect(screen.getByText("Hold")).toBeTruthy();
    expect(screen.queryByText("Sell")).toBeNull();
  });
});
