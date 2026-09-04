import { describe, it, expect, vi } from "vitest";
import {
  isExpoPushToken,
  buildExpoMessages,
  chunk,
  readExpoReceipts,
  sendExpoPush,
  EXPO_CHUNK_SIZE,
} from "./expoPush.js";

// This runs alongside the existing Web Push send in api/push.js. The property
// that matters most is not "mobile push works" — it is that NOTHING here can
// break a browser notification that would otherwise have been delivered. So
// several of these tests are about failure behaviour, not success.

describe("isExpoPushToken", () => {
  it("accepts both token spellings Expo has issued", () => {
    expect(isExpoPushToken("ExponentPushToken[abc123]")).toBe(true);
    expect(isExpoPushToken("ExpoPushToken[abc123]")).toBe(true);
  });

  it("rejects anything else, including a Web Push endpoint", () => {
    for (const bad of [
      "",
      null,
      undefined,
      42,
      "abc123",
      "https://fcm.googleapis.com/fcm/send/abc", // a web push endpoint
      "ExponentPushToken[]",
      "ExponentPushToken abc",
    ]) {
      expect(isExpoPushToken(bad)).toBe(false);
    }
  });
});

describe("buildExpoMessages", () => {
  const payload = { title: "New idea", body: "Someone shared an idea", url: "https://x/#/reco/9", tag: "reco" };

  it("carries the deep-link url in data, where the app reads it", () => {
    const [msg] = buildExpoMessages(["ExponentPushToken[a]"], payload);
    expect(msg.to).toBe("ExponentPushToken[a]");
    expect(msg.title).toBe("New idea");
    expect(msg.data.url).toBe("https://x/#/reco/9");
  });

  it("applies the same defaults the web payload uses", () => {
    const [msg] = buildExpoMessages(["ExponentPushToken[a]"], {});
    expect(msg.title).toBe("myInvestorCircle");
    expect(msg.body).toBe("You have a new notification");
    expect(msg.data.url).toBe("https://myinvestorcircle.com");
    expect(msg.data.tag).toBe("mic-general");
  });

  it("silently drops malformed tokens rather than failing the whole chunk", () => {
    const msgs = buildExpoMessages(["ExponentPushToken[a]", "garbage", null], payload);
    expect(msgs).toHaveLength(1);
  });

  it("handles no tokens at all", () => {
    for (const t of [[], null, undefined]) expect(buildExpoMessages(t, payload)).toEqual([]);
  });
});

describe("chunk", () => {
  it("splits at Expo's 100-message request limit", () => {
    const groups = chunk(Array.from({ length: 250 }, (_, i) => i));
    expect(groups).toHaveLength(3);
    expect(groups[0]).toHaveLength(EXPO_CHUNK_SIZE);
    expect(groups[2]).toHaveLength(50);
  });

  it("returns nothing for an empty or absent list", () => {
    for (const v of [[], null, undefined]) expect(chunk(v)).toEqual([]);
  });
});

describe("readExpoReceipts", () => {
  const messages = [
    { to: "ExponentPushToken[a]" },
    { to: "ExponentPushToken[b]" },
    { to: "ExponentPushToken[c]" },
  ];

  it("counts successes and flags uninstalled devices for cleanup", () => {
    const body = {
      data: [
        { status: "ok" },
        { status: "error", details: { error: "DeviceNotRegistered" } },
        { status: "ok" },
      ],
    };
    expect(readExpoReceipts(body, messages)).toEqual({
      sent: 2,
      failed: 1,
      unregistered: ["ExponentPushToken[b]"],
    });
  });

  it("does not delete a token for a transient error", () => {
    // MessageRateExceeded is temporary; deleting the token would stop that
    // device receiving anything ever again.
    const body = { data: [{ status: "error", details: { error: "MessageRateExceeded" } }] };
    const { unregistered, failed } = readExpoReceipts(body, [messages[0]]);
    expect(unregistered).toEqual([]);
    expect(failed).toBe(1);
  });

  it("counts a truncated response as failures, not successes", () => {
    // Expo returned fewer tickets than messages — the missing ones must not
    // be silently assumed delivered.
    const body = { data: [{ status: "ok" }] };
    expect(readExpoReceipts(body, messages)).toEqual({ sent: 1, failed: 2, unregistered: [] });
  });

  it("treats a malformed body as a total failure", () => {
    for (const body of [null, undefined, {}, { data: "nope" }]) {
      expect(readExpoReceipts(body, messages)).toEqual({ sent: 0, failed: 3, unregistered: [] });
    }
  });
});

describe("sendExpoPush — must never throw", () => {
  const tokens = ["ExponentPushToken[a]"];
  const payload = { title: "t", body: "b" };

  it("reports what was delivered", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ status: "ok" }] }) }));
    await expect(sendExpoPush(tokens, payload, { fetchImpl })).resolves.toEqual({
      sent: 1,
      failed: 0,
      unregistered: [],
    });
  });

  it("resolves rather than throwing when the network fails", async () => {
    // THE important one: api/push.js awaits this after already sending the
    // browser notifications. A throw here would turn a delivered web push
    // into a 500.
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    await expect(sendExpoPush(tokens, payload, { fetchImpl })).resolves.toEqual({
      sent: 0,
      failed: 1,
      unregistered: [],
    });
  });

  it("resolves when Expo answers with an HTTP error", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    await expect(sendExpoPush(tokens, payload, { fetchImpl })).resolves.toEqual({
      sent: 0,
      failed: 1,
      unregistered: [],
    });
  });

  it("resolves when the response is not JSON", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => {
        throw new Error("Unexpected token <");
      },
    }));
    await expect(sendExpoPush(tokens, payload, { fetchImpl })).resolves.toEqual({
      sent: 0,
      failed: 1,
      unregistered: [],
    });
  });

  it("makes no network call at all when there are no valid tokens", async () => {
    const fetchImpl = vi.fn();
    await expect(sendExpoPush(["garbage"], payload, { fetchImpl })).resolves.toEqual({
      sent: 0,
      failed: 0,
      unregistered: [],
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("splits more than 100 tokens across requests and totals them", async () => {
    const many = Array.from({ length: 150 }, (_, i) => `ExponentPushToken[${i}]`);
    const fetchImpl = vi.fn(async (_url, opts) => {
      const sentCount = JSON.parse(opts.body).length;
      return { ok: true, json: async () => ({ data: Array.from({ length: sentCount }, () => ({ status: "ok" })) }) };
    });
    const result = await sendExpoPush(many, payload, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.sent).toBe(150);
  });

  it("keeps going to the second chunk when the first one fails", async () => {
    const many = Array.from({ length: 150 }, (_, i) => `ExponentPushToken[${i}]`);
    let call = 0;
    const fetchImpl = vi.fn(async (_url, opts) => {
      call += 1;
      if (call === 1) throw new Error("boom");
      const sentCount = JSON.parse(opts.body).length;
      return { ok: true, json: async () => ({ data: Array.from({ length: sentCount }, () => ({ status: "ok" })) }) };
    });
    const result = await sendExpoPush(many, payload, { fetchImpl });
    expect(result.sent).toBe(50);
    expect(result.failed).toBe(100);
  });
});
