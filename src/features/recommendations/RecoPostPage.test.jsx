import React from "react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { RecoPostPage } from "./Recommendations.jsx";
import { registerGoToPath } from "../../utils/navigation";

vi.mock("../../services/api/profileApi", () => ({
  getPublicProfile: vi.fn().mockResolvedValue({
    profile: { first_name: "Ankur", last_name: "Gupta", username: "ankurg", avatar_color: "#6d5df5" },
    ici: { score: 72, band: "Strong" },
    recos: [{
      id: "reco1", ticker: "BSE", asset_name: "BSE Ltd", return_pct: 12.5,
      recommendation_type: "buy", status: "active", conviction: "high",
      reco_price: 100, current_price: 112, target_price: 150, stop_loss: 90,
      horizon: "1y", holding_days: 30, sector: "Financials",
      created_at: "2026-01-01", thesis: "Strong fundamentals.",
    }],
  }),
  lookupUser: vi.fn(),
}));

vi.mock("../../services/api/engagementApi", () => ({
  getEngagement: vi.fn().mockResolvedValue({
    likes: 2, commentsCount: 1, myReaction: null, tracking: null,
    comments: [{ id: "c1", userId: "u1", userName: "Info Kid", comment: "Nice pick!", createdAt: "2026-01-02T00:00:00Z", mentions: [] }],
  }),
  commentOnReco: vi.fn(),
  getMyTrackedRecos: vi.fn(),
  reactToReco: vi.fn(),
  trackReco: vi.fn(),
  untrackReco: vi.fn(),
}));

vi.mock("../../services/api/recommendationsApi", () => ({
  cancelExitSignal: vi.fn(), createRecommendation: vi.fn(), deleteDelivery: vi.fn(),
  forwardRecommendation: vi.fn(), getRecommenderUsername: vi.fn(),
  notifyPublicContacts: vi.fn(), setExitSignal: vi.fn(), updateDelivery: vi.fn(),
}));

vi.mock("../../firebase", () => ({ track: vi.fn() }));

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.matchMedia = window.matchMedia || vi.fn().mockImplementation(query => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
});

describe("RecoPostPage — Stock Insights CTA and comment avatars", () => {
  it("shows a CTA to the security's Stock Insights page, and it navigates via goToPath", async () => {
    const goToPath = vi.fn();
    registerGoToPath(goToPath);
    render(<RecoPostPage username="ankurg" recoId="reco1" viewerUser={{ uid: "viewer1" }} ME={{ name: "Viewer" }} onBack={()=>{}} onNavigateProfile={()=>{}} />);
    const cta = await screen.findByText(/What others think about BSE/i);
    fireEvent.click(cta);
    expect(goToPath).toHaveBeenCalledWith("/security/BSE");
  });

  it("shows the commenter's real initials, not a literal question mark", async () => {
    render(<RecoPostPage username="ankurg" recoId="reco1" viewerUser={{ uid: "viewer1" }} ME={{ name: "Viewer" }} onBack={()=>{}} onNavigateProfile={()=>{}} />);
    await waitFor(() => expect(screen.getByText("Info Kid")).toBeTruthy());
    expect(screen.getByText("IK")).toBeTruthy();
    expect(screen.queryByText("?")).toBeNull();
  });
});
