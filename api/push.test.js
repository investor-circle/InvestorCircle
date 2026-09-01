import { describe, it, expect, vi, beforeEach } from "vitest";

// api/push.js is live infrastructure: every existing web notification goes
// through it. Adding the mobile transport must not change ANY of its
// behaviour for browsers. These tests drive the real handler with the DB and
// web-push libraries stubbed, and assert the web path specifically.
//
// The scenario that matters most is the first one: this code can be deployed
// before supabase/phase10_expo_push_tokens.sql has been run, so the
// expo_push_tokens query will throw on a live database. Web push must be
// completely unaffected by that.

const sendNotification = vi.fn(async () => ({}));
vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: (...a) => sendNotification(...a) },
}));

// The handler builds queries with a tagged template; route each call by the
// table it names so a test can make one succeed and the other fail.
let webRows;
let expoRows;
const sqlCalls = [];
const sqlTag = (strings) => {
  const text = strings.join("?");
  sqlCalls.push(text);
  if (text.includes("push_subscriptions")) {
    if (typeof webRows === "function") return webRows();
    return Promise.resolve(webRows);
  }
  if (text.includes("expo_push_tokens")) {
    if (typeof expoRows === "function") return expoRows();
    return Promise.resolve(expoRows);
  }
  return Promise.resolve([]);
};
vi.mock("@neondatabase/serverless", () => ({ neon: () => sqlTag }));

process.env.VAPID_PUBLIC_KEY = "pub";
process.env.VAPID_PRIVATE_KEY = "priv";
process.env.VAPID_EMAIL = "mailto:x@y.z";
process.env.DATABASE_URL = "postgres://test";

const { default: handler } = await import("./push.js");

const mkRes = () => {
  const res = {
    statusCode: 0,
    body: null,
    setHeader: vi.fn(),
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
    end() {
      return this;
    },
  };
  return res;
};

const call = async (body) => {
  const res = mkRes();
  await handler({ method: "POST", body }, res);
  return res;
};

const WEB_SUB = { endpoint: "https://fcm.googleapis.com/x", p256dh: "p", auth_key: "a" };
const PAYLOAD = { userId: "u1", title: "New idea", body: "Alice shared an idea", url: "https://x/#/reco/1", tag: "reco" };

beforeEach(() => {
  vi.clearAllMocks();
  sqlCalls.length = 0;
  webRows = [];
  expoRows = [];
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ status: "ok" }] }) }));
});

describe("web push is unaffected by the mobile transport", () => {
  it("still delivers when expo_push_tokens does not exist yet", async () => {
    // The deploy-before-migration window. The Expo query throws exactly as a
    // real Postgres would for a missing relation.
    webRows = [WEB_SUB];
    expoRows = () => Promise.reject(new Error('relation "expo_push_tokens" does not exist'));

    const res = await call(PAYLOAD);

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.body.sent).toBe(1);
    expect(res.body.web).toEqual({ sent: 1, total: 1 });
  });

  it("still delivers when Expo itself is unreachable", async () => {
    webRows = [WEB_SUB];
    expoRows = [{ token: "ExponentPushToken[a]" }];
    global.fetch = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });

    const res = await call(PAYLOAD);

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.body.web).toEqual({ sent: 1, total: 1 });
  });

  it("sends the same VAPID payload as before", async () => {
    webRows = [WEB_SUB];
    await call(PAYLOAD);

    const [sub, payload] = sendNotification.mock.calls[0];
    expect(sub).toEqual({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "p", auth: "a" } });
    expect(JSON.parse(payload)).toEqual({
      title: "New idea",
      body: "Alice shared an idea",
      url: "https://x/#/reco/1",
      tag: "reco",
    });
  });

  it("still reports no_subscriptions when the user has neither", async () => {
    const res = await call(PAYLOAD);
    expect(res.statusCode).toBe(200);
    expect(res.body.reason).toBe("no_subscriptions");
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("still returns 500 when the subscription lookup genuinely fails", async () => {
    webRows = () => Promise.reject(new Error("connection terminated"));
    const res = await call(PAYLOAD);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe("DB error");
  });

  it("still rejects a request with no userId", async () => {
    const res = await call({ title: "x" });
    expect(res.statusCode).toBe(400);
  });
});

describe("mobile delivery", () => {
  it("reaches a mobile-only user, who previously got nothing", async () => {
    // Before this change the handler returned early on zero web
    // subscriptions, so a user with only the app installed was unreachable.
    expoRows = [{ token: "ExponentPushToken[a]" }];

    const res = await call(PAYLOAD);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(sent[0].to).toBe("ExponentPushToken[a]");
    expect(sent[0].data.url).toBe("https://x/#/reco/1");
    expect(res.statusCode).toBe(200);
    expect(res.body.expo).toEqual({ sent: 1, total: 1 });
  });

  it("delivers to browser and device for a user with both", async () => {
    webRows = [WEB_SUB];
    expoRows = [{ token: "ExponentPushToken[a]" }];

    const res = await call(PAYLOAD);

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(res.body.sent).toBe(2);
  });

  it("deletes a token for an uninstalled app", async () => {
    expoRows = [{ token: "ExponentPushToken[a]" }];
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ status: "error", details: { error: "DeviceNotRegistered" } }] }),
    }));

    await call(PAYLOAD);

    expect(sqlCalls.some((q) => q.includes("DELETE FROM expo_push_tokens"))).toBe(true);
  });

  it("keeps the token for a transient Expo error", async () => {
    expoRows = [{ token: "ExponentPushToken[a]" }];
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ status: "error", details: { error: "MessageRateExceeded" } }] }),
    }));

    await call(PAYLOAD);

    expect(sqlCalls.some((q) => q.includes("DELETE FROM expo_push_tokens"))).toBe(false);
  });

  it("does not call Expo at all when the user has no device tokens", async () => {
    webRows = [WEB_SUB];
    await call(PAYLOAD);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
