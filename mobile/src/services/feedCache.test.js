import AsyncStorage from "@react-native-async-storage/async-storage";
import { readFeedCache, writeFeedCache, clearFeedCache } from "./feedCache";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

// This cache exists to kill the blank-screen wait on a cold start. It is only
// ever the FIRST paint — the live load is already running and replaces it —
// so the properties that matter are: it comes back fast and correct, it can
// never surface another account's feed, it expires, and it can never throw
// into the load path.

const stored = (payload) => AsyncStorage.getItem.mockResolvedValue(JSON.stringify(payload));

describe("readFeedCache", () => {
  it("returns the items written for that user", async () => {
    stored({ at: Date.now(), items: [{ id: 1 }] });
    expect(await readFeedCache("me")).toEqual([{ id: 1 }]);
  });

  it("is keyed per user, so signing in as someone else shows nothing stale", async () => {
    await writeFeedCache("userA", [{ id: 1 }]);
    const keyA = AsyncStorage.setItem.mock.calls[0][0];
    await writeFeedCache("userB", [{ id: 2 }]);
    const keyB = AsyncStorage.setItem.mock.calls[1][0];
    expect(keyA).not.toBe(keyB);
  });

  it("expires, so a long-dormant app does not open on last month's ideas", async () => {
    const twoDays = 2 * 24 * 60 * 60 * 1000;
    stored({ at: Date.now() - twoDays, items: [{ id: 1 }] });
    expect(await readFeedCache("me")).toBeNull();
  });

  it("returns null rather than throwing for corrupt or missing data", async () => {
    AsyncStorage.getItem.mockResolvedValue("{not json");
    expect(await readFeedCache("me")).toBeNull();

    AsyncStorage.getItem.mockResolvedValue(null);
    expect(await readFeedCache("me")).toBeNull();

    stored({ at: Date.now(), items: "not an array" });
    expect(await readFeedCache("me")).toBeNull();

    AsyncStorage.getItem.mockRejectedValue(new Error("storage unavailable"));
    expect(await readFeedCache("me")).toBeNull();
  });

  it("reads nothing when there is no signed-in user", async () => {
    expect(await readFeedCache(null)).toBeNull();
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
  });
});

describe("writeFeedCache", () => {
  it("keeps only the first screenful — storing every idea would slow the read", async () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ id: i }));
    await writeFeedCache("me", items);
    const written = JSON.parse(AsyncStorage.setItem.mock.calls[0][1]);
    expect(written.items).toHaveLength(30);
    expect(written.items[0]).toEqual({ id: 0 });
  });

  it("never throws when storage is full or unavailable", async () => {
    AsyncStorage.setItem.mockRejectedValue(new Error("quota exceeded"));
    await expect(writeFeedCache("me", [{ id: 1 }])).resolves.toBeUndefined();
  });

  it("ignores a call with no user or no list", async () => {
    await writeFeedCache(null, [{ id: 1 }]);
    await writeFeedCache("me", null);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});

describe("clearFeedCache", () => {
  it("removes this user's entry on sign-out and never throws", async () => {
    await clearFeedCache("me");
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(expect.stringContaining("me"));

    AsyncStorage.removeItem.mockRejectedValue(new Error("nope"));
    await expect(clearFeedCache("me")).resolves.toBeUndefined();
  });
});
