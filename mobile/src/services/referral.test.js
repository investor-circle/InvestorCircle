import AsyncStorage from "@react-native-async-storage/async-storage";
import { rememberReferral, pendingReferral, clearReferral, redeemPendingReferral } from "./referral";
import { processReferral } from "./api/profileApi";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));
jest.mock("./api/profileApi", () => ({ processReferral: jest.fn(async () => ({ referred: true })) }));

// An invite link is the one flow where the important state arrives BEFORE
// there is an account to attach it to. Everything here is about surviving
// that gap: hold the code across a sign-up, spend it exactly once, and never
// let a storage or network failure take the app down with it.

beforeEach(() => {
  jest.clearAllMocks();
  AsyncStorage.getItem.mockResolvedValue(null);
});

describe("rememberReferral", () => {
  it("stores a code seen in a link", async () => {
    await rememberReferral("alice");
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("mic_ref", "alice");
  });

  it("keeps the FIRST invite, not the most recent", async () => {
    // A newcomer taps Alice's invite, then opens a link someone else shared
    // before finishing sign-up. Credit belongs to Alice.
    AsyncStorage.getItem.mockResolvedValue("alice");
    await rememberReferral("bob");
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it("ignores an empty code", async () => {
    await rememberReferral(null);
    await rememberReferral("");
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it("never throws when storage is unavailable", async () => {
    AsyncStorage.getItem.mockRejectedValue(new Error("no storage"));
    await expect(rememberReferral("alice")).resolves.toBeUndefined();
  });
});

describe("pendingReferral", () => {
  it("returns the waiting code", async () => {
    AsyncStorage.getItem.mockResolvedValue("alice");
    await expect(pendingReferral()).resolves.toBe("alice");
  });

  it("returns null when there is none, and when storage fails", async () => {
    await expect(pendingReferral()).resolves.toBeNull();
    AsyncStorage.getItem.mockRejectedValue(new Error("no storage"));
    await expect(pendingReferral()).resolves.toBeNull();
  });
});

describe("redeemPendingReferral", () => {
  it("does nothing at all when no invite is waiting", async () => {
    await expect(redeemPendingReferral()).resolves.toBeNull();
    expect(processReferral).not.toHaveBeenCalled();
  });

  it("redeems the waiting code and clears it", async () => {
    AsyncStorage.getItem.mockResolvedValue("alice");
    await expect(redeemPendingReferral()).resolves.toEqual({ referred: true });
    expect(processReferral).toHaveBeenCalledWith("alice");
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("mic_ref");
  });

  it("clears a code that matched nobody, so it is not retried forever", async () => {
    AsyncStorage.getItem.mockResolvedValue("ghost");
    processReferral.mockResolvedValue({ referred: false });
    await redeemPendingReferral();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("mic_ref");
  });

  it("KEEPS the code when the call fails outright", async () => {
    // Offline at the moment of signup is the likeliest way to lose a
    // referral, and it is the one failure genuinely worth retrying.
    AsyncStorage.getItem.mockResolvedValue("alice");
    processReferral.mockRejectedValue(new Error("offline"));
    await expect(redeemPendingReferral()).resolves.toBeNull();
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  });
});

describe("clearReferral", () => {
  it("removes the code and survives a storage failure", async () => {
    await clearReferral();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("mic_ref");
    AsyncStorage.removeItem.mockRejectedValue(new Error("no storage"));
    await expect(clearReferral()).resolves.toBeUndefined();
  });
});
