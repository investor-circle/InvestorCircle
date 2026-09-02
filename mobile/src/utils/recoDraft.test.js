import { buildRecoPayload, validateRecoDraft } from "./recoDraft";
import { calcTargetDate, today, HORIZONS, CONVICTIONS } from "./format";

// The create payload is where mobile and web most easily drift apart: the
// server accepts a field, the web form sets it, and mobile just never sends
// it — silently, because a missing optional field is not an error anywhere.
// That is what happened with conviction, stop loss and target date. Mobile
// DISPLAYED all three on its cards while being unable to set any of them, and
// an idea created on the phone carried no target date at all, so it could
// never become Expired.

const full = {
  assetName: "  Infosys  ",
  ticker: " infy ",
  assetClass: "equity",
  sector: "IT",
  exchange: "NSE",
  recType: "Sell",
  priceAt: "1450",
  targetPrice: "1700",
  stopLoss: "1300",
  horizon: "12m",
  conviction: "High",
  thesis: "  Cheap on FCF.  ",
  isPublic: false,
};

describe("buildRecoPayload", () => {
  it("carries every field the server's create action stores", () => {
    // Each of these was, at some point, one mobile forgot to send.
    expect(buildRecoPayload(full)).toEqual({
      assetName: "Infosys",
      ticker: "INFY",
      assetClass: "equity",
      sector: "IT",
      exchange: "NSE",
      recType: "Sell",
      priceAt: 1450,
      price: 1450,
      targetPrice: 1700,
      stopLoss: 1300,
      horizon: "12m",
      targetDate: calcTargetDate(today(), "12m"),
      conviction: "High",
      thesis: "Cheap on FCF.",
      isPublic: false,
    });
  });

  it("computes a real target date for every horizon the form offers", () => {
    for (const h of HORIZONS) {
      expect(buildRecoPayload({ ticker: "X", horizon: h }).targetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("leaves targetDate null when no horizon was chosen", () => {
    expect(buildRecoPayload({ ticker: "X" }).targetDate).toBeNull();
  });

  it("omits exchange entirely rather than sending a null the server would store", () => {
    expect("exchange" in buildRecoPayload({ ticker: "X" })).toBe(false);
    expect(buildRecoPayload({ ticker: "X", exchange: "BSE" }).exchange).toBe("BSE");
  });

  it("defaults the way the server does", () => {
    const p = buildRecoPayload({ ticker: "X" });
    expect(p.recType).toBe("Buy");
    expect(p.isPublic).toBe(true);
  });

  it("falls back to the ticker when no name was typed", () => {
    expect(buildRecoPayload({ ticker: "infy" }).assetName).toBe("INFY");
  });

  it("sends null, not NaN or an empty string, for blank numbers", () => {
    const p = buildRecoPayload({ ticker: "X", priceAt: "", targetPrice: null, stopLoss: undefined });
    expect(p.priceAt).toBeNull();
    expect(p.price).toBeNull();
    expect(p.targetPrice).toBeNull();
    expect(p.stopLoss).toBeNull();
  });

  it("never lets a non-numeric price through as NaN", () => {
    // NaN would reach the database as a null anyway, but via a value that
    // compares false to everything on the way there.
    expect(buildRecoPayload({ ticker: "X", priceAt: "abc" }).priceAt).toBeNull();
  });

  it("stamps the current price equal to the entry price at creation", () => {
    const p = buildRecoPayload({ ticker: "X", priceAt: "100" });
    expect(p.price).toBe(p.priceAt);
  });

  it("accepts every conviction the form offers", () => {
    for (const c of CONVICTIONS) {
      expect(buildRecoPayload({ ticker: "X", conviction: c }).conviction).toBe(c);
    }
    expect(buildRecoPayload({ ticker: "X", conviction: "" }).conviction).toBeNull();
  });
});

describe("validateRecoDraft", () => {
  it("accepts a complete draft", () => {
    // `full` is a private idea, so it needs a recipient to be valid.
    expect(validateRecoDraft({ ...full, recipientCount: 2 })).toBeNull();
  });

  it("needs something to identify the instrument", () => {
    expect(validateRecoDraft({})).toMatch(/name or ticker/);
    expect(validateRecoDraft({ ticker: "INFY" })).toBeNull();
  });

  it("rejects a non-numeric price, naming which one", () => {
    expect(validateRecoDraft({ ticker: "X", priceAt: "abc" })).toMatch(/Reco price/);
    expect(validateRecoDraft({ ticker: "X", targetPrice: "1,700" })).toMatch(/Target price/);
    expect(validateRecoDraft({ ticker: "X", stopLoss: "n/a" })).toMatch(/Stop loss/);
  });

  it("allows blank optional prices", () => {
    expect(validateRecoDraft({ ticker: "X", priceAt: "", targetPrice: null, stopLoss: undefined })).toBeNull();
  });

  it("stops a private idea going nowhere", () => {
    // Not public and nobody selected means the idea would be visible to
    // literally no one, including on the author's own feed.
    expect(validateRecoDraft({ ticker: "X", isPublic: false, recipientCount: 0 })).toMatch(/at least one/);
    expect(validateRecoDraft({ ticker: "X", isPublic: false, recipientCount: 1 })).toBeNull();
  });
});
