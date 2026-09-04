import { describe, it, expect, vi, beforeEach } from "vitest";

// An invite link (?ref=alice) credits the person who sent it. The attribution
// row and the auto-connection were always written here, but the two emails
// that make a referral feel like anything — the new member's welcome and the
// referrer's "someone you invited joined" — were fired by the BROWSER, from
// App.jsx. So a signup that came through the mobile app credited nobody, and
// the response had to disclose one member's email address to another purely
// so the browser could do the sending.
//
// These pin the move server-side, and the thing that makes it safe to do so:
// the fan-out fires ONCE, on the first attribution only.

const sqlCalls = [];
let referrerRows = [{ id: "ref1", full_name: "Alice Rao", username: "alice", email: "alice@example.com" }];
let claimedRows = [{ id: "me" }];
let newUserRows = [{ full_name: "Bob Shah", email: "bob@example.com" }];

const sqlTag = (strings, ...values) => {
  const text = strings.join("?");
  sqlCalls.push({ text, values });
  if (text.includes("LOWER(username)")) return Promise.resolve(referrerRows);
  if (text.includes("SET referred_by")) return Promise.resolve(claimedRows);
  if (text.includes("SELECT full_name, email FROM user_profiles")) return Promise.resolve(newUserRows);
  const p = Promise.resolve([]);
  p.catch = () => p; // the notifications insert chains .catch()
  return p;
};

vi.mock("../auth.js", async () => {
  const actual = await vi.importActual("../auth.js");
  return {
    ...actual,
    sql: (...a) => sqlTag(...a),
    parseBody: (req) => req.body || {},
    requireUid: async () => "me",
  };
});

const sendInternalEmail = vi.fn(async () => {});
vi.mock("../notifyMember.js", () => ({ sendInternalEmail: (...a) => sendInternalEmail(...a) }));

const { default: handleLookups } = await import("./lookups.js");

const mkRes = () => ({
  statusCode: 0,
  body: null,
  setHeader: vi.fn(),
  status(c) { this.statusCode = c; return this; },
  json(b) { this.body = b; return this; },
  end() { return this; },
});

const process = async (refUsername = "alice") => {
  const res = mkRes();
  await handleLookups({ method: "POST", query: {}, body: { action: "process-referral", refUsername } }, res);
  return res;
};

const emailsSent = () => sendInternalEmail.mock.calls.map((c) => c[0]);

beforeEach(() => {
  sqlCalls.length = 0;
  vi.clearAllMocks();
  referrerRows = [{ id: "ref1", full_name: "Alice Rao", username: "alice", email: "alice@example.com" }];
  claimedRows = [{ id: "me" }];
  newUserRows = [{ full_name: "Bob Shah", email: "bob@example.com" }];
});

describe("a first, genuine referral", () => {
  it("emails both sides, whichever client the new member signed up on", async () => {
    await process();
    expect(emailsSent().sort()).toEqual(["referral_converted", "welcome_referred"]);
  });

  it("sends the welcome to the new member and the conversion to the referrer", async () => {
    await process();
    const byType = Object.fromEntries(sendInternalEmail.mock.calls.map(([t, p]) => [t, p]));
    expect(byType.welcome_referred).toMatchObject({
      to_email: "bob@example.com",
      referrer_name: "Alice Rao",
      referrer_username: "alice",
    });
    expect(byType.referral_converted).toMatchObject({
      to_email: "alice@example.com",
      new_user_name: "Bob Shah",
    });
  });

  it("still records the attribution, the connection and the notification", async () => {
    await process();
    expect(sqlCalls.some((c) => c.text.includes("SET referred_by"))).toBe(true);
    expect(sqlCalls.some((c) => c.text.includes("INSERT INTO connections"))).toBe(true);
    expect(sqlCalls.some((c) => c.text.includes("INSERT INTO notifications"))).toBe(true);
  });

  it("never hands the referrer's email address back to the client", async () => {
    // The browser needed it only to send referral_converted itself. Now that
    // the server sends it, disclosing one member's address to another would
    // be gratuitous.
    const res = await process();
    expect(res.body).toEqual({ referred: true, referrerName: "Alice Rao", referrerUsername: "alice" });
    expect(JSON.stringify(res.body)).not.toContain("alice@example.com");
  });
});

describe("a replay", () => {
  // A stored code the client failed to clear, a retry, a second device.
  it("notifies nobody when the account was already attributed", async () => {
    claimedRows = []; // the UPDATE's `referred_by IS NULL` guard matched nothing
    const res = await process();
    expect(res.body.referred).toBe(true);
    expect(sendInternalEmail).not.toHaveBeenCalled();
    expect(sqlCalls.some((c) => c.text.includes("INSERT INTO notifications"))).toBe(false);
  });
});

describe("nothing to credit", () => {
  it("notifies nobody when the referral code matches no member", async () => {
    referrerRows = [];
    const res = await process();
    expect(res.body).toEqual({ referred: false });
    expect(sendInternalEmail).not.toHaveBeenCalled();
  });

  it("refuses an empty code without touching the database", async () => {
    const res = await process("   ");
    expect(res.statusCode).toBe(400);
    expect(sendInternalEmail).not.toHaveBeenCalled();
  });

  it("skips the welcome when the new member has no address on file", async () => {
    newUserRows = [{ full_name: "Bob Shah", email: null }];
    await process();
    expect(emailsSent()).toEqual(["referral_converted"]);
  });

  it("skips the conversion when the referrer has no address on file", async () => {
    referrerRows = [{ id: "ref1", full_name: "Alice Rao", username: "alice", email: null }];
    await process();
    expect(emailsSent()).toEqual(["welcome_referred"]);
  });
});
