import AsyncStorage from "@react-native-async-storage/async-storage";
import { callApi } from "./api";
import {
  primeAvatars,
  cachedAvatar,
  setCachedAvatar,
  subscribeAvatars,
  clearAvatarCache,
  _resetAvatarCache,
} from "./avatarCache";

jest.mock("./api", () => ({ callApi: jest.fn() }));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

// The whole point of this cache is that profile pictures NEVER go on the
// feed's critical path: lists paint with initials and the pictures arrive
// afterwards, once per person, and survive a restart. So the properties
// worth pinning are (a) it asks for each person at most once, (b) a person
// with no picture is remembered as such rather than re-asked forever,
// (c) subscribers are told when an answer lands, and (d) nothing here can
// throw into a render.

const ok = (avatars) => ({ ok: true, data: { avatars } });
const bodyOf = (call) => call[1].body;

beforeEach(() => {
  _resetAvatarCache();
  AsyncStorage.getItem.mockResolvedValue(null);
});

// The cache debounces its write with a timer; leaving one pending keeps the
// test process alive after the run.
afterEach(() => _resetAvatarCache());

describe("primeAvatars", () => {
  it("fetches the requested people and caches what comes back", async () => {
    callApi.mockResolvedValue(ok([{ id: "u1", avatar_url: "data:image/jpeg;base64,AAA" }]));

    await primeAvatars(["u1", "u2"]);

    expect(callApi).toHaveBeenCalledTimes(1);
    expect(bodyOf(callApi.mock.calls[0])).toEqual({ action: "avatars-batch", values: ["u1", "u2"] });
    expect(cachedAvatar("u1")).toBe("data:image/jpeg;base64,AAA");
  });

  it("remembers that someone has NO picture, and never asks again", async () => {
    // Most users have no picture. Without a negative cache, every list would
    // re-request all of them on every load — the exact cost this avoids.
    callApi.mockResolvedValue(ok([]));

    await primeAvatars(["u2"]);
    expect(cachedAvatar("u2")).toBeNull();

    await primeAvatars(["u2"]);
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it("only asks for people it does not already have", async () => {
    callApi.mockResolvedValue(ok([{ id: "u1", avatar_url: "x" }]));
    await primeAvatars(["u1"]);

    callApi.mockResolvedValue(ok([{ id: "u3", avatar_url: "y" }]));
    await primeAvatars(["u1", "u3"]);

    expect(bodyOf(callApi.mock.calls[1]).values).toEqual(["u3"]);
  });

  it("de-duplicates and drops empty ids from one call", async () => {
    callApi.mockResolvedValue(ok([]));
    await primeAvatars(["u1", "u1", null, undefined, "", "u2"]);
    expect(bodyOf(callApi.mock.calls[0]).values).toEqual(["u1", "u2"]);
  });

  it("does nothing at all when given nothing", async () => {
    await primeAvatars([]);
    await primeAvatars(null);
    expect(callApi).not.toHaveBeenCalled();
  });

  it("splits a very long list into batches the server will accept", async () => {
    // The server caps a batch at 25 (MAX_AVATAR_BATCH); asking for more in
    // one call would silently drop the tail.
    callApi.mockResolvedValue(ok([]));
    const uids = Array.from({ length: 26 }, (_, i) => `u${i}`);

    await primeAvatars(uids);

    expect(callApi).toHaveBeenCalledTimes(2);
    expect(bodyOf(callApi.mock.calls[0]).values).toHaveLength(25);
    expect(bodyOf(callApi.mock.calls[1]).values).toHaveLength(1);
  });

  it("swallows a failed request — a missing picture must never break a list", async () => {
    callApi.mockRejectedValue(new Error("offline"));
    await expect(primeAvatars(["u1"])).resolves.toBeUndefined();
    expect(cachedAvatar("u1")).toBeNull();
  });

  it("does not cache a picture when the API replies not-ok", async () => {
    // A failed response must leave the person UNKNOWN, so the next load
    // retries — caching "no picture" here would hide a real one for a week.
    callApi.mockResolvedValue({ ok: false, data: {} });
    await primeAvatars(["u1"]);
    callApi.mockResolvedValue(ok([{ id: "u1", avatar_url: "x" }]));
    await primeAvatars(["u1"]);
    expect(cachedAvatar("u1")).toBe("x");
  });
});

describe("subscribers", () => {
  it("are notified when a batch lands, which is what re-renders the list", async () => {
    const seen = jest.fn();
    subscribeAvatars(seen);
    callApi.mockResolvedValue(ok([{ id: "u1", avatar_url: "x" }]));

    await primeAvatars(["u1"]);

    expect(seen).toHaveBeenCalled();
  });

  it("stop being notified once unsubscribed", async () => {
    const seen = jest.fn();
    const off = subscribeAvatars(seen);
    off();
    callApi.mockResolvedValue(ok([{ id: "u1", avatar_url: "x" }]));

    await primeAvatars(["u1"]);

    expect(seen).not.toHaveBeenCalled();
  });

  it("one throwing subscriber does not stop the others", async () => {
    const good = jest.fn();
    subscribeAvatars(() => {
      throw new Error("bad subscriber");
    });
    subscribeAvatars(good);
    callApi.mockResolvedValue(ok([{ id: "u1", avatar_url: "x" }]));

    await primeAvatars(["u1"]);

    expect(good).toHaveBeenCalled();
  });
});

describe("persistence across launches", () => {
  it("reads a stored picture without any network call", async () => {
    AsyncStorage.getItem.mockResolvedValue(
      JSON.stringify({ u1: { url: "stored", at: Date.now() } })
    );
    callApi.mockResolvedValue(ok([]));

    await primeAvatars(["u1"]);

    expect(callApi).not.toHaveBeenCalled();
    expect(cachedAvatar("u1")).toBe("stored");
  });

  it("ignores an entry older than the TTL, so a changed picture appears", async () => {
    const eightDays = 8 * 24 * 60 * 60 * 1000;
    AsyncStorage.getItem.mockResolvedValue(
      JSON.stringify({ u1: { url: "old", at: Date.now() - eightDays } })
    );
    callApi.mockResolvedValue(ok([{ id: "u1", avatar_url: "new" }]));

    await primeAvatars(["u1"]);

    expect(cachedAvatar("u1")).toBe("new");
  });

  it("starts empty rather than throwing when the stored blob is corrupt", async () => {
    AsyncStorage.getItem.mockResolvedValue("{not json");
    callApi.mockResolvedValue(ok([]));
    await expect(primeAvatars(["u1"])).resolves.toBeUndefined();
  });
});

describe("what is written to disk", () => {
  // AsyncStorage has a modest total budget on Android and every picture is a
  // data: URI. An unbounded blob would eventually fail to write — silently,
  // since the write is fire-and-forget — so the cache is capped on the way out.
  it("caps the number of pictures, keeping the most recently seen", async () => {
    jest.useFakeTimers();
    try {
      for (let i = 0; i < 130; i++) {
        setCachedAvatar(`u${i}`, `pic${i}`);
        jest.advanceTimersByTime(1); // distinct timestamps
      }
      setCachedAvatar("nopic", null);
      jest.advanceTimersByTime(2000); // fire the debounced write

      const written = JSON.parse(AsyncStorage.setItem.mock.calls.at(-1)[1]);
      const pictures = Object.values(written).filter((e) => e.url);
      expect(pictures).toHaveLength(120);
      expect(written.u129).toBeDefined(); // newest kept
      expect(written.u0).toBeUndefined(); // oldest dropped
      // "has no picture" entries are nearly free and keep sparing the network.
      expect(written.nopic).toEqual({ url: null, at: expect.any(Number) });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("setCachedAvatar", () => {
  it("shows the user their own new picture immediately after upload", async () => {
    const seen = jest.fn();
    subscribeAvatars(seen);

    setCachedAvatar("me", "data:image/jpeg;base64,NEW");

    expect(cachedAvatar("me")).toBe("data:image/jpeg;base64,NEW");
    expect(seen).toHaveBeenCalled();
  });

  it("ignores a call with no uid", () => {
    expect(() => setCachedAvatar(null, "x")).not.toThrow();
  });
});

describe("clearAvatarCache", () => {
  it("forgets everything, on disk too — these are other people's photos", async () => {
    setCachedAvatar("u1", "x");

    await clearAvatarCache();

    expect(cachedAvatar("u1")).toBeNull();
    expect(AsyncStorage.removeItem).toHaveBeenCalled();
  });
});

describe("cachedAvatar", () => {
  it("never fetches and never throws", () => {
    expect(cachedAvatar(null)).toBeNull();
    expect(cachedAvatar("nobody")).toBeNull();
    expect(callApi).not.toHaveBeenCalled();
  });
});
