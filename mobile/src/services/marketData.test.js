import { getTodayClose, sourceName } from "./marketData";

jest.mock("./api", () => ({ API_ORIGIN: "https://api.test" }));

// The exit price is an idea's FINAL result — the number the track record and
// the ICI score are computed from. Mobile used to signal an exit without one,
// so exit_price landed as NULL and the displayed return fell back to the
// CURRENT price: a closed idea whose result kept drifting with the market.
//
// The rule that matters most here is the failure behaviour. A price lookup
// must never block an exit: the author decided to close the position, and a
// flaky quote provider is not a reason to refuse them. So every failure path
// returns null, and the caller stamps nothing rather than stamping a guess.

beforeEach(() => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ price: 1450.5, currency: "INR", date: "2026-09-03", source: "nse_bhavcopy" }),
  }));
});

describe("getTodayClose", () => {
  it("returns the quote for a symbol", async () => {
    await expect(getTodayClose("INFY")).resolves.toMatchObject({ price: 1450.5, source: "nse_bhavcopy" });
  });

  it("asks the same proxy the web app uses, never a provider directly", async () => {
    // Provider keys live server-side; a client calling Yahoo would leak them.
    await getTodayClose("INFY", "BSE");
    const url = global.fetch.mock.calls[0][0];
    expect(url).toContain("https://api.test/api/price");
    expect(url).toContain("symbol=INFY");
    expect(url).toContain("exchange=BSE");
  });

  it("defaults to NSE, as the web does", async () => {
    await getTodayClose("INFY");
    expect(global.fetch.mock.calls[0][0]).toContain("exchange=NSE");
  });

  it("encodes the symbol rather than interpolating it raw", async () => {
    await getTodayClose("M&M");
    expect(global.fetch.mock.calls[0][0]).toContain("symbol=M%26M");
  });

  it("returns null without asking when there is no symbol", async () => {
    for (const s of ["", null, undefined, "   "]) {
      await expect(getTodayClose(s)).resolves.toBeNull();
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });

  describe("never blocks an exit — every failure is null, not a throw", () => {
    it("on a non-OK response", async () => {
      global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }));
      await expect(getTodayClose("INFY")).resolves.toBeNull();
    });

    it("on an error payload", async () => {
      global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ error: "no data" }) }));
      await expect(getTodayClose("INFY")).resolves.toBeNull();
    });

    it("on a response with no price", async () => {
      global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ date: "2026-09-03" }) }));
      await expect(getTodayClose("INFY")).resolves.toBeNull();
    });

    it("on a network failure", async () => {
      global.fetch = jest.fn(async () => {
        throw new Error("offline");
      });
      await expect(getTodayClose("INFY")).resolves.toBeNull();
    });

    it("on unparseable JSON", async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => {
          throw new Error("not json");
        },
      }));
      await expect(getTodayClose("INFY")).resolves.toBeNull();
    });
  });

  it("accepts a price of zero as a real quote, not a missing one", async () => {
    // `price == null` is the miss; 0 is a value. A truthiness check here would
    // discard a legitimate zero.
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ price: 0, date: "x" }) }));
    await expect(getTodayClose("INFY")).resolves.toMatchObject({ price: 0 });
  });
});

describe("sourceName", () => {
  it("labels the sources the server can return", () => {
    expect(sourceName("nse_bhavcopy")).toBe("NSE Official (Bhavcopy)");
    expect(sourceName("yahoo_finance")).toBe("Yahoo Finance");
  });

  it("falls back to the raw value, then to a dash", () => {
    expect(sourceName("something_new")).toBe("something_new");
    expect(sourceName(null)).toBe("—");
  });
});
