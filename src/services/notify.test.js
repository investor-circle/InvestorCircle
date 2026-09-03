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

// ── No second, unauthenticated sender ────────────────────────────────────────
//
// /api/email and /api/push both require a verified token now. The risk is not
// that this file forgets one — it is that somewhere ELSE grows its own little
// sender that doesn't. That is not hypothetical: LoginPage.jsx had exactly
// that, a local sendEmail for the signup welcome, and securing the endpoint
// silently 401'd it until this check was written.
//
// So: find every fetch to either endpoint anywhere in the client, and require
// that the same call carries an Authorization header.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const clientFiles = (dir, acc = []) => {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) clientFiles(p, acc);
    else if (/\.(js|jsx)$/.test(name) && !name.includes(".test.")) acc.push(p);
  }
  return acc;
};

describe("every client call to the notification endpoints is authenticated", () => {
  it.each(["src", "mobile/src", "mobile/app"])("%s", (root) => {
    const offenders = [];
    for (const file of clientFiles(root)) {
      const src = readFileSync(file, "utf8");
      // A fetch whose URL argument mentions one of the endpoints, plus the
      // rest of that call expression.
      const re = /fetch\(\s*[^)]*?(EMAIL_API|PUSH_API|\/api\/(email|push))[\s\S]{0,400}/g;
      for (const m of src.matchAll(re)) {
        if (!m[0].includes("Authorization")) {
          offenders.push(`${file}: fetch to ${m[1]} with no Authorization header`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
