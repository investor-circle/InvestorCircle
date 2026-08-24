import { describe, it, expect } from "vitest";
import { calcTargetDate, getTargetDate, getClosedInfo } from "./format.js";

// Regression coverage for the "Invalid time value" crash that blanked the
// whole app: calcTargetDate() built a Date via `date + "T00:00:00"`, which
// only works for a bare "YYYY-MM-DD" string. Public-feed / network-
// engagement API rows hand over a full ISO timestamp instead (see
// api/_lib/handlers/lookups.js's `created_at AS date`), which produced an
// Invalid Date whose .toISOString() call THROWS rather than degrading.
describe("calcTargetDate", () => {
  it("computes a target date from a bare YYYY-MM-DD date", () => {
    expect(calcTargetDate("2024-01-01", "6m")).toBe("2024-07-01");
  });

  it("does not throw when given a full ISO timestamp (the actual production shape from public-feed/network-engagement rows)", () => {
    expect(() => calcTargetDate("2024-01-01T05:30:00.000Z", "6m")).not.toThrow();
    expect(calcTargetDate("2024-01-01T05:30:00.000Z", "6m")).toBe("2024-07-01");
  });

  it("returns null instead of throwing for a genuinely invalid date string", () => {
    expect(() => calcTargetDate("not-a-date", "6m")).not.toThrow();
    expect(calcTargetDate("not-a-date", "6m")).toBeNull();
  });

  it("returns null when date or horizon is missing", () => {
    expect(calcTargetDate(null, "6m")).toBeNull();
    expect(calcTargetDate("2024-01-01", null)).toBeNull();
  });

  it("returns null for an unrecognized horizon", () => {
    expect(calcTargetDate("2024-01-01", "9999y")).toBeNull();
  });
});

describe("getTargetDate", () => {
  it("prefers an explicit targetDate over computing one", () => {
    expect(getTargetDate({ targetDate: "2030-01-01", date: "2024-01-01", horizon: "6m" })).toBe("2030-01-01");
  });

  it("falls back to calcTargetDate without throwing when date is a full ISO timestamp", () => {
    expect(() => getTargetDate({ date: "2024-01-01T05:30:00.000Z", horizon: "6m" })).not.toThrow();
  });

  it("returns null when nothing is computable", () => {
    expect(getTargetDate({})).toBeNull();
  });
});

describe("getClosedInfo", () => {
  it("returns null for a still-open idea", () => {
    expect(getClosedInfo({ exitSignal: false, targetDate: "2099-01-01", priceAt: 80, price: 90 })).toBeNull();
  });

  it("reports an exited idea with its exit price and return", () => {
    const info = getClosedInfo({ exitSignal: true, exitDate: "2024-01-01", exitPrice: 100, priceAt: 80 });
    expect(info).toMatchObject({ kind: "exited", date: "2024-01-01", price: 100, pending: false });
    expect(info.retPct).toBeCloseTo(0.25);
  });

  it("marks an exited idea pending when no exit price is stamped yet", () => {
    const info = getClosedInfo({ exitSignal: true, exitDate: "2024-01-01", exitPrice: null, priceAt: 80 });
    expect(info).toMatchObject({ kind: "exited", pending: true, price: null, retPct: null });
  });

  it("reports an expired (not exited) idea using expiryPrice, not current price", () => {
    const info = getClosedInfo({ exitSignal: false, targetDate: "2020-01-01", expiryPrice: 90, priceAt: 80, price: 999 });
    expect(info).toMatchObject({ kind: "expired", date: "2020-01-01", price: 90, pending: false });
    expect(info.retPct).toBeCloseTo(0.125);
  });

  it("exited wins over expired when an idea is both", () => {
    const info = getClosedInfo({
      exitSignal: true, exitDate: "2023-06-01", exitPrice: 50,
      targetDate: "2020-01-01", expiryPrice: 999, priceAt: 40,
    });
    expect(info.kind).toBe("exited");
  });

  it("handles the raw snake_case DB-row shape (public-profile / tracked-recos rows)", () => {
    const info = getClosedInfo({ exit_signal: true, exit_date: "2024-01-01T00:00:00.000Z", exit_price: "100.50", reco_price: "80.00" });
    expect(info.kind).toBe("exited");
    expect(info.price).toBeCloseTo(100.5);
  });

  it("handles getMade's alternate `exit` field name (not exitSignal/exit_signal)", () => {
    const info = getClosedInfo({ exit: true, exitDate: "2024-01-01", exitPrice: 50, priceAt: 40 });
    expect(info.kind).toBe("exited");
  });

  it("does not throw when a row has no target date field at all and date is a full ISO timestamp (public-feed shape)", () => {
    expect(() => getClosedInfo({
      exitSignal: false, priceAt: 80, price: 90, horizon: "6m",
      date: "2023-06-01T05:30:00.000Z",
    })).not.toThrow();
  });

  it("does not throw on an empty object", () => {
    expect(() => getClosedInfo({})).not.toThrow();
    expect(getClosedInfo({})).toBeNull();
  });

  it("does not throw when entry price is zero", () => {
    expect(() => getClosedInfo({ exitSignal: true, exitDate: "2024-01-01", exitPrice: 10, priceAt: 0 })).not.toThrow();
  });
});
