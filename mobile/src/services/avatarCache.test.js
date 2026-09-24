import AsyncStorage from "@react-native-async-storage/async-storage";
import { callApi } from "./api";
import {
  primeAvatars,
  requestAvatar,
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

  it("remembers that someone has NO picture, and does not re-ask right away", async () => {
    // Most users have no picture. Without a negative cache, every list would
    // re-request all of them on every render — the exact cost this avoids.
    callApi.mockResolvedValue(ok([]));

    await primeAvatars(["u2"]);
    expect(cachedAvatar("u2")).toBeNull();

    await primeAvatars(["u2"]);
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it("re-checks a 'no picture' answer after a few minutes, so a new upload appears", async () => {
    // The bug this pins: "has no picture" used to be trusted for a WEEK, so
    // someone who uploaded a photo stayed on initials on every phone that had
    // looked them up before.
    const realNow = Date.now;
    try {
      let now = realNow();
      Date.now = () => now;
      callApi.mockResolvedValue(ok([]));
      await primeAvatars(["u2"]);
      expect(cachedAvatar("u2")).toBeNull();

      now += 6 * 60 * 1000; // past the re-check window
      callApi.mockResolvedValue(ok([{ id: "u2", avatar_url: "data:image/jpeg;base64,NEW", avatar_hash: "a".repeat(32) }]));
      await primeAvatars(["u2"]);

      expect(callApi).toHaveBeenCalledTimes(2);
      expect(cachedAvatar("u2")).toBe("data:image/jpeg;base64,NEW");
    } finally {
      Date.now = realNow;
    }
  });

  it("re-checks a picture it holds by hash, without downloading it again", async () => {
    const realNow = Date.now;
    const hash = "b".repeat(32);
    try {
      let now = realNow();
      Date.now = () => now;
      callApi.mockResolvedValue(ok([{ id: "u1", avatar_url: "pic", avatar_hash: hash }]));
      await primeAvatars(["u1"]);

      now += 6 * 60 * 1000;
      // Server: hash still matches, so no data: URI comes back.
      callApi.mockResolvedValue(ok([{ id: "u1", avatar_url: null, avatar_hash: hash }]));
      await primeAvatars(["u1"]);

      expect(bodyOf(callApi.mock.calls[1]).known).toEqual({ u1: hash });
      expect(cachedAvatar("u1")).toBe("pic");
      // …and it now counts as fresh again, so no third request.
      await primeAvatars(["u1"]);
      expect(callApi).toHaveBeenCalledTimes(2);
    } finally {
      Date.now = realNow;
    }
  });

  it("swaps in a changed picture when the hash no longer matches", async () => {
    const realNow = Date.now;
    try {
      let now = realNow();
      Date.now = () => now;
      callApi.mockResolvedValue(ok([{ id: "u1", avatar_url: "old", avatar_hash: "c".repeat(32) }]));
      await primeAvatars(["u1"]);

      now += 6 * 60 * 1000;
      callApi.mockResolvedValue(ok([{ id: "u1", avatar_url: "new", avatar_hash: "d".repeat(32) }]));
      await primeAvatars(["u1"]);

      expect(cachedAvatar("u1")).toBe("new");
    } finally {
      Date.now = realNow;
    }
  });

  it("does not let an in-flight answer overwrite the user's own newer upload", async () => {
    const realNow = Date.now;
    try {
      let now = realNow();
      Date.now = () => now;
      // While the batch is out, the user uploads; the server then answers
      // "no picture" to the question asked BEFORE the upload.
      callApi.mockImplementation(async () => {
        now += 10;
        setCachedAvatar("me", "data:image/jpeg;base64,JUST_UPLOADED");
        return ok([]);
      });

      await primeAvatars(["me"]);

      expect(cachedAvatar("me")).toBe("data:image/jpeg;base64,JUST_UPLOADED");
    } finally {
      Date.now = realNow;
      callApi.mockReset();
    }
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

describe("requestAvatar", () => {
  // What every <Avatar> calls on mount — so no screen has to remember to
  // prime the cache for its people.
  it("collects the avatars mounted in one render into a single batch", async () => {
    jest.useFakeTimers();
    try {
      callApi.mockResolvedValue(ok([]));
      requestAvatar("u1");
      requestAvatar("u2");
      requestAvatar("u1");
      expect(callApi).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);
      await jest.runOnlyPendingTimersAsync();

      expect(callApi).toHaveBeenCalledTimes(1);
      expect(bodyOf(callApi.mock.calls[0]).values).toEqual(["u1", "u2"]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("ignores an empty id", () => {
    expect(() => requestAvatar(null)).not.toThrow();
    expect(() => requestAvatar("")).not.toThrow();
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

  it("never lets the disk copy replace a newer answer already in memory", async () => {
    // The signed-in user's own picture is seeded from their profile, often
    // before this read finishes; an older stored "no picture" must not win.
    AsyncStorage.getItem.mockResolvedValue(
      JSON.stringify({ me: { url: null, at: Date.now() - 60 * 1000 } })
    );
    setCachedAvatar("me", "data:image/jpeg;base64,MINE");
    callApi.mockResolvedValue(ok([]));

    await primeAvatars(["me"]);

    expect(cachedAvatar("me")).toBe("data:image/jpeg;base64,MINE");
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
