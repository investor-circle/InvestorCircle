import { render } from "@testing-library/react-native";
import { LayerSummary, ResearchSection, ViewsSection } from "./SecuritySections";
import { researchBreakdown, viewBreakdownFromCounts } from "../utils/securityInsights";

// The mobile Security Page: Verified Research (Buy / Hold / Sell) and Market
// Views (Positive / Neutral / Negative) are separate layers, a layer with no
// data renders nothing, and a Market View carries no recommendation framing.

jest.mock("./Avatar", () => {
  const { Text } = require("react-native");
  return function MockAvatar() {
    return <Text>avatar</Text>;
  };
});
jest.mock("../services/avatarCache", () => ({
  subscribeAvatars: () => () => {},
  cachedAvatar: () => null,
  requestAvatar: () => {},
  primeAvatars: () => {},
}));

const research = (n, type, extra = {}) => ({
  id: "r" + n, recommendation_type: type, from: "p" + n, username: "pub" + n, full_name: "Publisher " + n,
  created_at: "2025-02-0" + n + "T10:00:00Z", reco_price: 100, return_pct: 5, status: "Active", conviction: "High",
  thesis: "Research thesis " + n, ...extra,
});
const view = (n, type, extra = {}) => ({
  id: "v" + n, recommendation_type: type, from: "c" + n, username: "con" + n, full_name: "Contributor " + n,
  created_at: "2025-03-0" + n + "T10:00:00Z", thesis: "Commentary from contributor " + n + " about the quarter.",
  disclosure: "Personal view " + n, ...extra,
});
const summaryOf = (vs) => ({
  total: vs.length,
  positive: vs.filter((v) => v.recommendation_type === "Positive").length,
  neutral: vs.filter((v) => v.recommendation_type === "Neutral").length,
  negative: vs.filter((v) => v.recommendation_type === "Negative").length,
  contributors: new Set(vs.map((v) => v.from)).size,
});
const stancesOf = (vs) => vs.map((v) => ({ from: v.from, recommendation_type: v.recommendation_type, created_at: v.created_at }));

const page = ({ r = [], v = [], signedIn = true, circle = new Set() } = {}) =>
  render(
    <>
      <LayerSummary
        research={r.length ? researchBreakdown(r, (x) => x.from) : null}
        views={v.length ? viewBreakdownFromCounts(summaryOf(v)) : null}
      />
      {r.length ? <ResearchSection ticker="INFY" recos={r} /> : null}
      {v.length ? (
        <ViewsSection ticker="INFY" summary={summaryOf(v)} views={v} stances={stancesOf(v)} circleIds={circle} signedIn={signedIn} hasMore={false} />
      ) : null}
    </>
  );
const FORBIDDEN = [/bullish/i, /bearish/i, /consensus strength/i, /strongly/i, /AI /, /bull case/i, /bear case/i];

describe("mobile Security Page — layers appear only for the data that exists", () => {
  it("1. research only", () => {
    const t = page({ r: [research(1, "Buy"), research(2, "Hold"), research(3, "Sell")] });
    expect(t.getAllByText("Verified Research").length).toBeGreaterThan(0);
    expect(t.getByText("Research History")).toBeTruthy();
    expect(t.queryByText("Market Views")).toBeNull();
    expect(t.queryByText("Latest Market Views")).toBeNull();
    expect(t.queryByText(/independent view/)).toBeNull();
    for (const re of FORBIDDEN) expect(t.queryByText(re)).toBeNull();
  });

  it("2. Market Views only", () => {
    const t = page({ v: [view(1, "Positive"), view(2, "Negative")] });
    expect(t.getAllByText("Market Views").length).toBeGreaterThan(0);
    expect(t.getByText("Latest Market Views")).toBeTruthy();
    expect(t.getByText("Market View Summary")).toBeTruthy();
    expect(t.queryByText("Verified Research")).toBeNull();
    expect(t.queryByText("Research History")).toBeNull();
    expect(t.queryByText("Research Consensus")).toBeNull();
    expect(t.queryByText(/\b(Buy|Sell|Hold)\b/)).toBeNull();
    for (const re of FORBIDDEN) expect(t.queryByText(re)).toBeNull();
  });

  it("3. both layers, separate counts, nothing combined", () => {
    const t = page({ r: [research(1, "Buy"), research(2, "Buy"), research(3, "Sell")], v: [view(1, "Positive"), view(2, "Neutral"), view(3, "Negative"), view(4, "Positive")] });
    expect(t.getAllByText("Verified Research").length).toBeGreaterThan(0);
    expect(t.getAllByText("Market Views").length).toBeGreaterThan(0);
    expect(t.queryByText(/7 (ideas|views|pieces)/)).toBeNull();
    expect(t.getByText(/3 pieces of research/)).toBeTruthy();
    expect(t.getAllByText(/4 independent views/).length).toBeGreaterThan(0);
  });

  it("4. neither: nothing renders", () => {
    const t = page({});
    expect(t.toJSON()).toBeNull();
  });

  it.each([
    ["5. Positive only", "Positive", /100% Positive/],
    ["6. Neutral only", "Neutral", /100% Neutral/],
    ["7. Negative only", "Negative", /100% Negative/],
  ])("%s is one 100%% bucket", (_n, type, re) => {
    const t = page({ v: [view(1, type), view(2, type)] });
    expect(t.getAllByText(re).length).toBeGreaterThan(0);
    expect(t.queryByText("Verified Research")).toBeNull();
  });
});

describe("mobile Security Page — Market Views carry no recommendation framing", () => {
  it("a Market View shows contributor, view, date, commentary and disclosure — nothing recommendation-like", () => {
    const t = page({ v: [view(1, "Positive", { reco_price: 100, target_price: 200, return_pct: 9, status: "Active", conviction: "High", horizon: "12m" })] });
    expect(t.getByText("Positive")).toBeTruthy();
    expect(t.getByText(/Independent contributor/)).toBeTruthy();
    expect(t.getAllByText(/Commentary from contributor 1/).length).toBeGreaterThan(0);
    for (const re of [/Entry/i, /Target/i, /Stop/i, /Horizon/i, /Conviction/i, /Active/, /Closed/]) {
      expect(t.queryByText(re)).toBeNull();
    }
  });

  it("Your Circle compares only people in the viewer's Circle; signed-out gets a sign-in hint", () => {
    const vs = [view(1, "Positive"), view(2, "Negative"), view(3, "Negative")];
    const inCircle = page({ v: vs, circle: new Set(["c1"]) });
    expect(inCircle.getByText("Your Circle")).toBeTruthy();
    expect(inCircle.getAllByText(/100% Positive/).length).toBeGreaterThan(0);
    const none = page({ v: vs, circle: new Set() });
    expect(none.getByText(/No one in Your Circle has shared a view/)).toBeTruthy();
    const out = page({ v: vs, signedIn: false });
    expect(out.getByText(/Sign in to see how the people you're connected with/)).toBeTruthy();
    expect(out.queryByText("Your Circle")).toBeNull();
  });

  it("research ignores a Market View mixed into its input", () => {
    const t = page({ r: [research(1, "Buy"), research(2, "Positive")] });
    expect(t.getAllByText(/1 Buy/).length).toBeGreaterThan(0);
    expect(t.queryByText(/2 Buy/)).toBeNull();
  });

  it("conviction statistics come from research only", () => {
    const t = page({ r: [research(1, "Buy", { conviction: "High" })], v: [view(1, "Positive", { conviction: "Low" })] });
    expect(t.getAllByText(/High/).length).toBeGreaterThan(0);
    expect(t.queryByText("Low")).toBeNull();
  });
});

describe("mobile Security Page — analytics come from exact aggregates, not the capped rows", () => {
  it("Your Circle split and monthly Market View activity use every record", () => {
    const v = [view(1, "Positive"), view(2, "Negative")]; // the capped page
    const t = render(
      <ViewsSection
        ticker="INFY"
        summary={{ total: 4000, positive: 1000, neutral: 1000, negative: 2000, contributors: 80 }}
        views={v}
        stances={stancesOf(v)}
        monthly={[
          { mo: "2026-01", Positive: 600, Neutral: 400, Negative: 900 },
          { mo: "2026-02", Positive: 400, Neutral: 600, Negative: 1100 },
        ]}
        byContributor={[
          { from: "circ1", positive: 100, neutral: 100, negative: 800 },
          { from: "stranger", positive: 900, neutral: 900, negative: 1200 },
        ]}
        circleIds={new Set(["circ1"])}
        signedIn
        hasMore
      />
    );
    expect(t.getAllByText(/10% Positive/).length).toBeGreaterThan(0); // Circle: 100 / 1000
    expect(t.getAllByText(/80% Negative/).length).toBeGreaterThan(0);
    expect(t.getAllByText(/25% Positive/).length).toBeGreaterThan(0); // Community: 1000 / 4000
    expect(t.getAllByText(/50% Negative/).length).toBeGreaterThan(0);
    expect(t.queryAllByText(/\b(Buy|Hold|Sell)\b/)).toHaveLength(0);
  });
});
