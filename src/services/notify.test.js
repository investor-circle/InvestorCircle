import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/push used to be unauthenticated and to take the notification's
// title/body/url straight from the caller, so anyone could push arbitrary
// text to any user's lock screen under this app's name. The server now
// enforces the fix; these pin the CLIENT half of it, because a client that
// quietly went back to sending text would not fail loudly — it would just
// get its text ignored, and the next person to touch this file might
// "helpfully" restore the old shape on the server to match.

const getIdToken = vi.fn(async () => "id-token");
let currentUser = { getIdToken };
vi.mock("../firebase", () => ({ auth: { get currentUser() { return currentUser; } } }));

const { sendPush } = await import("./notify");

const bodyOf = (call) => JSON.parse(call[1].body);

beforeEach(() => {
  vi.clearAllMocks();
  currentUser = { getIdToken };
  global.fetch = vi.fn(async () => ({ ok: true }));
});

describe("sendPush", () => {
  it("sends a verified token", async () => {
    await sendPush("u1", { type: "connection_accepted" });
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer id-token");
  });

  it("sends only the recipient, the type and an optional in-app path", async () => {
    await sendPush("u1", { type: "contact_recommendation", deepLink: "/investor/asha/reco/9" });
    expect(bodyOf(global.fetch.mock.calls[0])).toEqual({
      userId: "u1",
      type: "contact_recommendation",
      deepLink: "/investor/asha/reco/9",
    });
  });

  it("carries no message text of any kind", async () => {
    await sendPush("u1", { type: "connection_request" });
    const body = bodyOf(global.fetch.mock.calls[0]);
    for (const k of ["title", "body", "url", "tag"]) expect(body[k]).toBeUndefined();
  });

  it("does nothing without a recipient or a type", async () => {
    await sendPush(null, { type: "connection_request" });
    await sendPush("u1", {});
    await sendPush("u1");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not call out at all when nobody is signed in", async () => {
    currentUser = null;
    await sendPush("u1", { type: "connection_request" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("never throws — a failed notification is not a failed action", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(sendPush("u1", { type: "connection_request" })).resolves.toBeUndefined();

    getIdToken.mockRejectedValueOnce(new Error("token refresh failed"));
    await expect(sendPush("u1", { type: "connection_request" })).resolves.toBeUndefined();
  });
});
