import AsyncStorage from "@react-native-async-storage/async-storage";
import { rememberDeepLink, pendingDeepLink, clearPendingDeepLink } from "./pendingDeepLink";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

// A shared idea/security/profile link tapped while signed out — the same
// "arrives before there is anywhere to land" gap referral.js solves for
// invite links, but last-wins instead of first-wins (see this module's own
// header comment for why the two differ).

beforeEach(() => {
  jest.clearAllMocks();
  AsyncStorage.getItem.mockResolvedValue(null);
});

describe("rememberDeepLink", () => {
  it("stores the URL from a tapped link", async () => {
    await rememberDeepLink("https://myinvestorcircle.com/idea/123");
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("mic_pending_link", "https://myinvestorcircle.com/idea/123");
  });

  it("keeps the MOST RECENT link, not the first — unlike a referral code", async () => {
    AsyncStorage.getItem.mockResolvedValue("https://myinvestorcircle.com/idea/1");
    await rememberDeepLink("https://myinvestorcircle.com/idea/2");
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("mic_pending_link", "https://myinvestorcircle.com/idea/2");
  });

  it("ignores an empty URL", async () => {
    await rememberDeepLink(null);
    await rememberDeepLink("");
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it("never throws when storage is unavailable", async () => {
    AsyncStorage.setItem.mockRejectedValue(new Error("no storage"));
    await expect(rememberDeepLink("https://myinvestorcircle.com/idea/123")).resolves.toBeUndefined();
  });
});

describe("pendingDeepLink", () => {
  it("returns the waiting URL", async () => {
    AsyncStorage.getItem.mockResolvedValue("https://myinvestorcircle.com/idea/123");
    await expect(pendingDeepLink()).resolves.toBe("https://myinvestorcircle.com/idea/123");
  });

  it("returns null when there is none, and when storage fails", async () => {
    await expect(pendingDeepLink()).resolves.toBeNull();
    AsyncStorage.getItem.mockRejectedValue(new Error("no storage"));
    await expect(pendingDeepLink()).resolves.toBeNull();
  });
});

describe("clearPendingDeepLink", () => {
  it("removes the URL and survives a storage failure", async () => {
    await clearPendingDeepLink();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("mic_pending_link");
    AsyncStorage.removeItem.mockRejectedValue(new Error("no storage"));
    await expect(clearPendingDeepLink()).resolves.toBeUndefined();
  });
});
