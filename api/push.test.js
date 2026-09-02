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
let connectionRows;
let profileRows;
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
  if (text.includes("FROM connections")) {
    if (typeof connectionRows === "function") return connectionRows();
    return Promise.resolve(connectionRows);
  }
  if (text.includes("user_profiles")) return Promise.resolve(profileRows);
  return Promise.resolve([]);
};
vi.mock("@neondatabase/serverless", () => ({ neon: () => sqlTag }));

// Identity comes from a verified Firebase token. Tests set `callerUid` to
// stand in for that verification; `null` means an unauthenticated caller.
let callerUid = "sender";
vi.mock("./_lib/auth.js", async () => {
  const actual = await vi.importActual("./_lib/auth.js");
  return {
    ...actual,
    requireUid: vi.fn(async () => {
      if (!callerUid) throw { status: 401, error: "Missing or malformed Authorization header" };
      return callerUid;
    }),
  };
});

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
  await handler({ method: "POST", body, headers: { authorization: "Bearer t" } }, res);
  return res;
};

const WEB_SUB = { endpoint: "https://fcm.googleapis.com/x", p256dh: "p", auth_key: "a" };
const PAYLOAD = { userId: "u1", type: "contact_recommendation" };

beforeEach(() => {
  vi.clearAllMocks();
  sqlCalls.length = 0;
  webRows = [];
  expoRows = [];
  callerUid = "sender";
  connectionRows = [{ "?column?": 1 }]; // sender and recipient are connected
  profileRows = [{ full_name: "Alice Kumar", username: "alice" }];
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

  it("sends a VAPID payload composed from the type", async () => {
    webRows = [WEB_SUB];
    await call(PAYLOAD);

    const [sub, payload] = sendNotification.mock.calls[0];
    expect(sub).toEqual({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "p", auth: "a" } });
    expect(JSON.parse(payload)).toEqual({
      title: "💡 New idea in your circle",
      body: "Alice Kumar posted a new idea",
      url: "https://myinvestorcircle.com/#/investor/alice",
      tag: "contact_recommendation",
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

    const res = await call({ ...PAYLOAD, deepLink: "/investor/alice/reco/9" });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(sent[0].to).toBe("ExponentPushToken[a]");
    // The deep link the client asked for, resolved against our own origin.
    expect(sent[0].data.url).toBe("https://myinvestorcircle.com/#/investor/alice/reco/9");
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

// ── The security fix ────────────────────────────────────────────────────────
//
// This endpoint used to take a recipient plus arbitrary title/body/url from
// an UNAUTHENTICATED request. Anyone could push any text — including text
// impersonating another member — to any user's lock screen under this app's
// name. Three controls now stand in the way, and each is worth a test because
// removing any one of them silently reopens the hole.

describe("only a signed-in caller may send", () => {
  it("rejects an unauthenticated request", async () => {
    callerUid = null;
    webRows = [WEB_SUB];
    const res = await call(PAYLOAD);
    expect(res.statusCode).toBe(401);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

describe("only to someone you are connected to", () => {
  it("rejects a push to a stranger", async () => {
    connectionRows = [];
    webRows = [WEB_SUB];
    const res = await call(PAYLOAD);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe("not_connected");
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("checks the connection in BOTH directions", async () => {
    // Whoever sent the original request is the requester; either party must
    // be able to notify the other.
    await call(PAYLOAD);
    const q = sqlCalls.find((c) => c.includes("FROM connections"));
    expect(q).toMatch(/requester_id = \?.*addressee_id = \?/s);
    expect(q).toMatch(/OR/);
  });

  it("does not even look up subscriptions for an unauthorized send", async () => {
    connectionRows = [];
    await call(PAYLOAD);
    expect(sqlCalls.some((c) => c.includes("push_subscriptions"))).toBe(false);
  });

  it("fails closed when the authorization lookup errors", async () => {
    // A database problem must not be read as "allowed".
    connectionRows = () => Promise.reject(new Error("connection terminated"));
    webRows = [WEB_SUB];
    const res = await call(PAYLOAD);
    expect(res.statusCode).toBe(500);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

describe("the caller cannot choose what the notification says", () => {
  it("ignores title/body/url supplied in the request", async () => {
    webRows = [WEB_SUB];
    await call({
      ...PAYLOAD,
      title: "Your account is suspended",
      body: "Enter your password at evil.example",
      url: "https://evil.example",
      tag: "spoof",
    });
    const payload = JSON.parse(sendNotification.mock.calls[0][1]);
    expect(payload.title).toBe("💡 New idea in your circle");
    expect(payload.body).toBe("Alice Kumar posted a new idea");
    expect(payload.url).toBe("https://myinvestorcircle.com/#/investor/alice");
  });

  it("names the sender from the database, not from the request", async () => {
    // This is what stops one member sending a notification that appears to
    // come from another.
    profileRows = [{ full_name: "Alice Kumar", username: "alice" }];
    webRows = [WEB_SUB];
    await call({ ...PAYLOAD, from_name: "Support Team" });
    expect(JSON.parse(sendNotification.mock.calls[0][1]).body).toContain("Alice Kumar");
  });

  it("rejects an unknown notification type instead of inventing one", async () => {
    const res = await call({ userId: "u1", type: "password_reset" });
    expect(res.statusCode).toBe(400);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("refuses to point a notification at another site", async () => {
    webRows = [WEB_SUB];
    for (const bad of ["https://evil.example", "//evil.example", "javascript:alert(1)", "/\t/evil"]) {
      sendNotification.mockClear();
      await call({ ...PAYLOAD, deepLink: bad });
      const url = JSON.parse(sendNotification.mock.calls[0][1]).url;
      expect(url.startsWith("https://myinvestorcircle.com/")).toBe(true);
      expect(url).not.toContain("evil");
    }
  });

  it("still allows a legitimate in-app deep link", async () => {
    webRows = [WEB_SUB];
    await call({ ...PAYLOAD, deepLink: "/investor/alice/reco/12" });
    expect(JSON.parse(sendNotification.mock.calls[0][1]).url).toBe(
      "https://myinvestorcircle.com/#/investor/alice/reco/12"
    );
  });

  it("falls back to a safe name when the sender has no profile row", async () => {
    profileRows = [];
    webRows = [WEB_SUB];
    await call(PAYLOAD);
    expect(JSON.parse(sendNotification.mock.calls[0][1]).body).toBe("Someone posted a new idea");
  });
});

describe("server-only notification types are not client-reachable", () => {
  // contact_like and contact_comment are raised by the server when it records
  // a like or a comment (handlers/engagement.js), from the row it just wrote.
  // If a client could ask for one, anyone could tell a user their idea had
  // been liked. engagement.js reaches the delivery code directly instead of
  // coming back through this endpoint, so it loses nothing by their absence.
  it.each(["contact_like", "contact_comment"])("refuses %s from a client", async (type) => {
    webRows = [WEB_SUB];
    const res = await call({ userId: "u1", type });
    expect(res.statusCode).toBe(400);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
