import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SecurityLayers from "../../web-public/components/SecurityLayers.jsx";
import SecurityTabs from "../../web-public/app/(pages)/security/[symbol]/SecurityTabs.jsx";
import { securityModel } from "../../web-public/lib/securityModel.js";

// The PUBLIC (server-rendered, crawlable) Security Page. Same product rule as
// the app: Verified Research (Buy / Hold / Sell) and Market Views (Positive /
// Neutral / Negative) are two separate layers, a layer with no data is not
// rendered, and a Market View carries no recommendation framing. Rendered with
// react-dom/server — exactly what a crawler receives (no client JS).

const research = (n, type, extra = {}) => ({
  id: "r" + n, ticker: "INFY", asset_name: "Infosys", recommendation_type: type, sector: "IT",
  reco_price: 100, current_price: 110, target_price: 130, horizon: "12m", conviction: "High",
  status: "Active", return_pct: 10, thesis: "Research thesis " + n, created_at: "2025-02-0" + n + "T00:00:00Z",
  author_name: "Publisher " + n, author_username: "pub" + n, ...extra,
});
const view = (n, type, extra = {}) => ({
  id: "v" + n, ticker: "INFY", asset_name: "Infosys", recommendation_type: type,
  thesis: "Contributor " + n + " commentary on the quarter and the deal pipeline.", disclosure: "Personal view " + n,
  created_at: "2025-03-0" + n + "T00:00:00Z", author_name: "Contributor " + n, author_username: "con" + n, ...extra,
});
const dataOf = ({ r = [], v = [] }) => ({
  symbol: "INFY", name: "Infosys", sector: "IT",
  summary: { idea_count: r.length, contributor_count: new Set(r.map(i => i.author_username)).size, closed_count: 0, last_posted: r[0]?.created_at ?? null },
  ideas: r,
  view_summary: {
    total: v.length,
    positive: v.filter(x => x.recommendation_type === "Positive").length,
    neutral: v.filter(x => x.recommendation_type === "Neutral").length,
    negative: v.filter(x => x.recommendation_type === "Negative").length,
    contributor_count: new Set(v.map(x => x.author_username)).size, last_posted: v[0]?.created_at ?? null,
  },
  views: v,
  view_stances: v.map(x => ({ recommendation_type: x.recommendation_type, created_at: x.created_at, author_username: x.author_username })),
});
const html = (d) => {
  const m = securityModel(d);
  return renderToStaticMarkup(
    <>
      <SecurityLayers research={m.researchB} views={m.viewB} />
      <SecurityTabs symbol="INFY" ideas={d.ideas} summary={d.summary} views={d.views} viewSummary={d.view_summary} viewStances={d.view_stances} related={[]} />
    </>
  );
};
const FORBIDDEN = [/bullish/i, /bearish/i, /consensus strength/i, /strongly/i, /AI Investment/i, /Idea History/, /Idea activity/i];

describe("public Security Page — layers appear only for the data that exists", () => {
  it("1. research only", () => {
    const out = html(dataOf({ r: [research(1, "Buy"), research(2, "Hold"), research(3, "Sell")] }));
    expect(out).toContain("Verified Research");
    expect(out).toContain("Research History");
    expect(out).not.toContain("Market Views");
    expect(out).not.toContain("Latest Market Views");
    expect(out).not.toContain("independent view");
    expect(out).toContain("1 Buy");
    for (const re of FORBIDDEN) expect(out, String(re)).not.toMatch(re);
  });

  it("2. Market Views only", () => {
    const out = html(dataOf({ v: [view(1, "Positive"), view(2, "Negative")] }));
    expect(out).toContain("Market Views");
    expect(out).toContain("Latest Market Views");
    expect(out).toContain("Market View Summary");
    expect(out).not.toContain("Verified Research");
    expect(out).not.toContain("Research History");
    expect(out).not.toContain("Research Consensus");
    expect(out).not.toMatch(/\b(Buy|Sell|Hold)\b/);
    for (const re of FORBIDDEN) expect(out, String(re)).not.toMatch(re);
  });

  it("3. both layers, with separate counts and no combined figure", () => {
    const out = html(dataOf({ r: [research(1, "Buy"), research(2, "Buy")], v: [view(1, "Positive"), view(2, "Neutral"), view(3, "Negative")] }));
    expect(out).toContain("Verified Research");
    expect(out).toContain("Market Views");
    expect(out).toContain("2 Buy");
    expect(out).toContain("1 Positive");
    expect(out).toContain("1 Neutral");
    expect(out).toContain("1 Negative");
    expect(out).not.toMatch(/\b5 (ideas|views|pieces)/);
  });

  it("4. neither: no page (the route 404s) and nothing renders", () => {
    const d = dataOf({});
    expect(securityModel(d).hasPage).toBe(false);
    const out = html(d);
    expect(out).not.toContain("Verified Research");
    expect(out).not.toContain("Market Views");
  });

  it.each([["5. Positive only", "Positive", "100%"], ["6. Neutral only", "Neutral", "100%"], ["7. Negative only", "Negative", "100%"]])("%s", (_n, type, p) => {
    const d = dataOf({ v: [view(1, type), view(2, type)] });
    const m = securityModel(d);
    expect(m.hasPage).toBe(true);
    expect(m.researchB).toBeNull();
    const out = html(d);
    expect(out).toContain(`${type} ${p}`);
    expect(out).toContain("2 independent views");
    expect(out).not.toContain("Verified Research");
  });
});

describe("public Security Page — Market Views carry no recommendation framing", () => {
  it("a Market View shows contributor, view, date, commentary and disclosure — never entry, target, return, status, conviction or horizon", () => {
    const d = dataOf({ v: [view(1, "Positive", { reco_price: 100, target_price: 200, return_pct: 9, status: "Active", conviction: "High", horizon: "12m" })] });
    const out = renderToStaticMarkup(<SecurityTabs symbol="INFY" ideas={[]} summary={d.summary} views={d.views} viewSummary={d.view_summary} viewStances={d.view_stances} related={[]} />);
    expect(out).toContain("POSITIVE");
    expect(out).toContain("Contributor 1");
    expect(out).toContain("Independent contributor");
    expect(out).toContain("Disclosure:");
    expect(out).toContain("Personal view 1");
    for (const word of ["ENTRY", "TARGET", "CONVICTION", "ACTIVE", "Horizon", "horizon", "Closed", "+9", "9%"]) expect(out, word).not.toContain(word);
  });

  it("a Market View in the research array never reaches a research figure", () => {
    const d = dataOf({ r: [research(1, "Buy"), research(2, "Positive")] });
    const m = securityModel(d);
    expect(m.researchB.total).toBe(1);
    expect(m.researchB.buy).toBe(1);
  });

  it("research percentages come from the exact counts, not the (capped) list of ideas returned", () => {
    const d = dataOf({ r: [research(1, "Buy"), research(2, "Sell")] });
    d.summary = { ...d.summary, idea_count: 100, buy_count: 70, hold_count: 20, sell_count: 10, contributor_count: 31 };
    const m = securityModel(d);
    expect(m.researchB).toMatchObject({ total: 100, buy: 70, hold: 20, sell: 10, buyPct: 70, holdPct: 20, sellPct: 10, publishers: 31 });
    const out = html(d);
    expect(out).toContain("70 Buy");
    expect(out).toContain("20 Hold");
    expect(out).toContain("10 Sell");
  });

  it("the public page shows only a capped page of views and says so, while the counts stay exact", () => {
    const vs = [view(1, "Positive"), view(2, "Positive")];
    const d = dataOf({ v: vs });
    d.view_summary.total = 40; d.view_summary.positive = 40;
    const out = html(d);
    expect(out).toContain("40 independent views");
    expect(out).toContain("Showing the latest 2 of 40 Market Views");
  });

  it("keeps public content crawlable: commentary is in the document, not behind client JS", () => {
    const out = html(dataOf({ v: [view(1, "Positive")] }));
    expect(out).toContain("Contributor 1 commentary on the quarter and the deal pipeline.");
    expect(out).toContain('href="/idea/v1"');
  });
});
