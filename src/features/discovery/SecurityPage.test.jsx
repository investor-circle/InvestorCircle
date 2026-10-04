import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

// The Security Page answers two separate questions — "what does verified
// research say?" (Buy / Hold / Sell) and "what are independent participants
// saying?" (Positive / Neutral / Negative) — and must never blend them. A
// section with no data is not rendered at all. These tests drive the real page
// against mocked data for every combination, signed-in and signed-out.

const api = vi.hoisted(() => ({
  getTickerRecos: vi.fn(),
  getTickerViews: vi.fn(),
  getPublicSecurity: vi.fn(),
}));
vi.mock("../../services/api/recommendationsApi", async () => {
  const actual = await vi.importActual("../../services/api/recommendationsApi");
  return { ...actual, ...api };
});
vi.mock("../../services/api/profileApi", async () => {
  const actual = await vi.importActual("../../services/api/profileApi");
  return { ...actual, getInvestorIciBatch: vi.fn(async () => []) };
});
vi.mock("../../services/api/pricingApi", async () => {
  const actual = await vi.importActual("../../services/api/pricingApi");
  return { ...actual, getDailyPrices: vi.fn(async () => []), getPublicDailyPrice: vi.fn(async () => null) };
});

import { SecurityIntelligencePage } from "./StockInsights.jsx";

const research = (id, type, extra = {}) => ({
  id, recommendation_type: type, from: "pub" + id, username: "pub" + id, full_name: "Publisher " + id,
  created_at: "2025-02-0" + id + "T10:00:00Z", reco_price: 100, return_pct: 5, status: "Active", conviction: "High",
  thesis: "Research thesis " + id, asset_name: "Infosys", sector: "IT", ...extra,
});
const view = (id, type, extra = {}) => ({
  id: "v" + id, recommendation_type: type, from: "con" + id, username: "con" + id, full_name: "Contributor " + id,
  created_at: "2025-03-0" + id + "T10:00:00Z", thesis: "Commentary from contributor " + id + " about the quarter.",
  disclosure: "Personal view " + id, asset_name: "Infosys", ...extra,
});
const summaryOf = (vs) => ({
  total: vs.length,
  positive: vs.filter(v => v.recommendation_type === "Positive").length,
  neutral: vs.filter(v => v.recommendation_type === "Neutral").length,
  negative: vs.filter(v => v.recommendation_type === "Negative").length,
  contributors: new Set(vs.map(v => v.from)).size,
});
const stancesOf = (vs) => vs.map(v => ({ from: v.from, recommendation_type: v.recommendation_type, created_at: v.created_at }));

const setData = ({ r = [], v = [] }) => {
  api.getTickerRecos.mockResolvedValue(r);
  api.getTickerViews.mockResolvedValue({ summary: summaryOf(v), views: v, stances: stancesOf(v), hasMore: false });
  api.getPublicSecurity.mockResolvedValue({ ideas: r, views: v, viewSummary: summaryOf(v), viewStances: stancesOf(v), name: "Infosys", sector: "IT" });
};

const mount = ({ signedIn = true } = {}) => render(
  <SecurityIntelligencePage
    securityTicker={{ ticker: "INFY", name: "Infosys" }}
    contacts={[]} me={{ id: "me" }} viewerUser={signedIn ? { uid: "me" } : null}
    trackedIds={new Set()} onOpenSecurity={() => {}} onBack={() => {}} onHome={() => {}} />
);
const heading = (name) => screen.queryByRole("heading", { name });
const loaded = () => waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
const FORBIDDEN = [/bullish/i, /bearish/i, /consensus strength/i, /strongly/i, /AI Investment/i, /AI Summary/i, /Idea History/i, /Idea Activity/i];

beforeEach(() => {
  vi.clearAllMocks();
  window.matchMedia = vi.fn().mockImplementation((q) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
  global.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
});

describe("Security Page — sections appear only for the data that exists", () => {
  it("1. Research only: shows Verified Research, hides every Market Views section", async () => {
    setData({ r: [research("1", "Buy"), research("2", "Hold"), research("3", "Sell")] });
    mount(); await loaded();
    await screen.findByRole("heading", { name: "Verified Research" });
    expect(heading("Market Views")).toBeNull();
    expect(screen.queryByText(/Latest Market Views/)).toBeNull();
    expect(screen.queryByText(/Market View Summary/)).toBeNull();
    expect(screen.queryByText(/Your Circle vs Community/)).toBeNull();
    expect(screen.queryByText(/independent view/)).toBeNull();
    expect(screen.getAllByText(/1 Buy/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Research Consensus/)).toBeTruthy();
    expect(screen.getByText(/Research History/)).toBeTruthy();
    for (const re of FORBIDDEN.filter(r => !/Idea History/.test(r.source))) expect(screen.queryByText(re), String(re)).toBeNull();
  });

  it("2. Market Views only: shows Market Views, hides every Research section", async () => {
    setData({ v: [view("1", "Positive"), view("2", "Negative")] });
    mount(); await loaded();
    await screen.findByRole("heading", { name: "Market Views" });
    expect(heading("Verified Research")).toBeNull();
    expect(screen.queryByText(/Research Consensus/)).toBeNull();
    expect(screen.queryByText(/Research History/)).toBeNull();
    expect(screen.queryByText(/Conviction Breakdown/)).toBeNull();
    expect(screen.queryByText(/Research activity/)).toBeNull();
    expect(screen.queryByText(/\bBuy\b|\bSell\b|\bHold\b/)).toBeNull();
    expect(screen.getByText(/Latest Market Views/)).toBeTruthy();
    expect(screen.getByText(/Market View Summary/)).toBeTruthy();
    for (const re of FORBIDDEN) expect(screen.queryByText(re), String(re)).toBeNull();
  });

  it("3. Both: shows both layers with separate counts and no combined figure", async () => {
    setData({ r: [research("1", "Buy"), research("2", "Buy"), research("3", "Sell")], v: [view("1", "Positive"), view("2", "Positive"), view("3", "Neutral"), view("4", "Negative")] });
    mount(); await loaded();
    await screen.findByRole("heading", { name: "Verified Research" });
    expect(heading("Market Views")).toBeTruthy();
    expect(screen.getAllByText("2 Buy").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 Sell").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2 Positive").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 Neutral").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 Negative").length).toBeGreaterThan(0);
    // a combined 7 (3 research + 4 views) must appear nowhere as a count
    expect(screen.queryByText(/^7\b/)).toBeNull();
    expect(screen.queryByText(/7 (ideas|views|pieces)/)).toBeNull();
    for (const re of FORBIDDEN.filter(r => !/Idea History/.test(r.source))) expect(screen.queryByText(re), String(re)).toBeNull();
  });

  it("4. Neither: shows only an empty note — no section, tab or layer card", async () => {
    setData({});
    mount(); await loaded();
    await waitFor(() => expect(screen.getAllByText(/No public research or Market Views on INFY yet/).length).toBeGreaterThan(0));
    expect(heading("Verified Research")).toBeNull();
    expect(heading("Market Views")).toBeNull();
    expect(heading("People")).toBeNull();
    expect(screen.queryByText(/Research Consensus/)).toBeNull();
  });

  it.each([
    ["5. Positive only", "Positive", /100% Positive/],
    ["6. Neutral only", "Neutral", /100% Neutral/],
    ["7. Negative only", "Negative", /100% Negative/],
  ])("%s: the distribution is a single 100%% bucket", async (_n, type, re) => {
    setData({ v: [view("1", type), view("2", type)] });
    mount(); await loaded();
    await screen.findByRole("heading", { name: "Market Views" });
    expect(screen.getAllByText(re).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2 independent view/).length).toBeGreaterThan(0);
  });
});

describe("Security Page — Market Views carry no recommendation framing", () => {
  it("a Market View card shows commentary, contributor and a Positive/Neutral/Negative badge — never entry, target, return, status or conviction", async () => {
    setData({ v: [view("1", "Positive", { reco_price: 100, target_price: 200, return_pct: 9, status: "Active", conviction: "High", horizon: "12m" })] });
    mount(); await loaded();
    await screen.findByText(/Latest Market Views/);
    // the card (not the themes quote that repeats the same commentary)
    const card = screen.getAllByText(/Commentary from contributor 1/).map(e => e.closest("div[style*='border: 1px solid']")).find(Boolean);
    expect(card).toBeTruthy();
    const c = within(card);
    expect(c.getByText("POSITIVE")).toBeTruthy();
    expect(c.getByText(/Independent contributor/)).toBeTruthy();
    for (const re of [/Entry/i, /Target/i, /Stop/i, /Horizon/i, /Conviction/i, /Active/, /Closed/, /\d+(\.\d)?%/]) {
      expect(c.queryByText(re), String(re)).toBeNull();
    }
  });

  it("the Market View's own disclosure is shown instead of the standard disclaimer", async () => {
    setData({ v: [view("1", "Neutral")] });
    mount(); await loaded();
    expect(await screen.findByText("Disclosure")).toBeTruthy();
  });

  it("research figures ignore Market Views even if one is mixed into the research array", async () => {
    setData({ r: [research("1", "Buy"), research("2", "Positive")] });
    mount(); await loaded();
    await screen.findByRole("heading", { name: "Verified Research" });
    expect(screen.getAllByText("1 Buy").length).toBeGreaterThan(0);
    expect(screen.queryByText(/2 Buy/)).toBeNull();
  });

  it("conviction statistics come from research only", async () => {
    setData({ r: [research("1", "Buy", { conviction: "High" })], v: [view("1", "Positive", { conviction: "Low" })] });
    mount(); await loaded();
    const head = await screen.findByText(/Conviction Breakdown/);
    const card = within(head.closest(".card"));
    expect(card.getByText("High")).toBeTruthy();
    expect(card.queryByText("Low")).toBeNull();
    expect(screen.queryByText("Low")).toBeNull();
  });
});

describe("Security Page — public (signed-out) vs authenticated", () => {
  it("signed-in reads the authenticated endpoints; signed-out reads the single public response", async () => {
    setData({ r: [research("1", "Buy")], v: [view("1", "Positive")] });
    mount({ signedIn: true }); await loaded();
    expect(api.getTickerRecos).toHaveBeenCalled();
    expect(api.getTickerViews).toHaveBeenCalled();
    expect(api.getPublicSecurity).not.toHaveBeenCalled();
  });

  it("signed-out sees both layers and a sign-in prompt in place of Your Circle", async () => {
    setData({ r: [research("1", "Buy")], v: [view("1", "Positive")] });
    mount({ signedIn: false }); await loaded();
    expect(api.getPublicSecurity).toHaveBeenCalledWith("INFY");
    expect(api.getTickerRecos).not.toHaveBeenCalled();
    expect(api.getTickerViews).not.toHaveBeenCalled();
    await screen.findByRole("heading", { name: "Verified Research" });
    expect(heading("Market Views")).toBeTruthy();
    expect(screen.getAllByText(/Sign in to see/).length).toBeGreaterThan(0);
  });
});

describe("Security Page — analytics come from exact aggregates, not the capped rows", () => {
  // The rendered rows/stances are a tiny capped slice; the aggregates describe a
  // far larger dataset. The page must show the aggregates.
  const bigViews = [view("1", "Positive"), view("2", "Negative")];
  const aggregates = {
    summary: { total: 4000, positive: 1000, neutral: 1000, negative: 2000, contributors: 80 },
    monthly: [{ mo: "2026-01", Positive: 600, Neutral: 400, Negative: 900 }, { mo: "2026-02", Positive: 400, Neutral: 600, Negative: 1100 }],
    byContributor: [
      { from: "circ1", positive: 100, neutral: 100, negative: 800 },   // in Your Circle
      { from: "stranger", positive: 900, neutral: 900, negative: 1200 },
    ],
  };

  it("signed-in: Your Circle and Community percentages and monthly counts use every record", async () => {
    api.getTickerRecos.mockResolvedValue([research("1", "Buy")]);
    api.getTickerViews.mockResolvedValue({ ...aggregates, views: bigViews, stances: stancesOf(bigViews), hasMore: true });
    render(
      <SecurityIntelligencePage securityTicker={{ ticker: "INFY", name: "Infosys" }} contacts={[{ id: "circ1" }]} me={{ id: "me" }}
        viewerUser={{ uid: "me" }} trackedIds={new Set()} onOpenSecurity={() => {}} onBack={() => {}} onHome={() => {}} />
    );
    await loaded();
    const card = within(await screen.findByText("Your Circle vs Community").then(n => n.closest(".card")));
    // Community: 1000 / 1000 / 2000 of 4000 → 25 / 25 / 50. Circle: 100 / 100 / 800 of 1000 → 10 / 10 / 80.
    const community = card.getByText("Community").parentElement.parentElement;
    expect(within(community).getByText("25% Positive")).toBeTruthy();
    expect(within(community).getByText("50% Negative")).toBeTruthy();
    expect(community.textContent).toContain("4000 views");
    const circle = card.getAllByText("Your Circle")[0].parentElement.parentElement;
    expect(within(circle).getByText("10% Positive")).toBeTruthy();
    expect(within(circle).getByText("80% Negative")).toBeTruthy();
    expect(circle.textContent).toContain("1000 views");

    // Monthly Market View activity: counts from the aggregate (900 / 1100), not the 2 rendered rows.
    const monthly = (await screen.findByText("Market View activity by month")).closest(".card");
    expect(within(monthly).getByText("900 Negative")).toBeTruthy();
    expect(within(monthly).getByText("1100 Negative")).toBeTruthy();
    // …and it carries no research labels.
    expect(within(monthly).queryByText(/Buy|Hold|Sell/)).toBeNull();
  });

  it("signed-out: research and Market View monthly charts use the exact public aggregates, kept separate", async () => {
    const r = [research("1", "Buy")];
    api.getPublicSecurity.mockResolvedValue({
      ideas: r, views: bigViews, viewSummary: aggregates.summary, viewStances: stancesOf(bigViews),
      researchCounts: { buy: 3000, hold: 500, sell: 500, publishers: 20 },
      researchMonthly: [{ mo: "2026-01", Buy: 1500, Hold: 250, Sell: 250 }, { mo: "2026-02", Buy: 1500, Hold: 250, Sell: 250 }],
      viewMonthly: aggregates.monthly, name: "Infosys", sector: "IT",
    });
    mount({ signedIn: false }); await loaded();
    const rm = (await screen.findByText("Research activity by month")).closest(".card");
    expect(within(rm).getAllByText("1500 Buy")).toHaveLength(2);
    expect(within(rm).queryByText(/Positive|Neutral|Negative/)).toBeNull();
    const vm = (await screen.findByText("Market View activity by month")).closest(".card");
    expect(within(vm).getByText("900 Negative")).toBeTruthy();
    expect(within(vm).queryByText(/\bBuy\b|\bHold\b|\bSell\b/)).toBeNull();
  });
});
