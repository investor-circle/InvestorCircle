import React from "react";
import { describe, it, expect } from "vitest";
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
