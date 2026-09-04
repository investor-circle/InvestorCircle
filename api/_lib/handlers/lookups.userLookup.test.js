import { describe, it, expect, vi, beforeEach } from "vitest";

// user-lookup used to hand a signed-in caller another member's EMAIL ADDRESS,
// and to let them look somebody up BY email. Both existed only to feed
// notification code that has since moved server-side — the browser no longer
// sends any mail, so it has no reason to learn an address, and probing an
// address for an account is member enumeration.
//
// These are here because the leak is invisible at the call site: both
// surviving callers ignore the field, so nothing would have failed if it had
// stayed in the SELECT.

const sqlCalls = [];
const sqlTag = (strings, ...values) => {
  sqlCalls.push({ text: strings.join("?"), values });
  return Promise.resolve([
    { id: "u1", username: "asha", full_name: "Asha Rao", first_name: "Asha", last_name: "Rao" },
  ]);
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

const { default: handleLookups } = await import("./lookups.js");

const mkRes = () => ({
  statusCode: 0,
  body: null,
  setHeader: vi.fn(),
  status(c) { this.statusCode = c; return this; },
  json(b) { this.body = b; return this; },
  end() { return this; },
});

const lookup = async (by, value) => {
  const res = mkRes();
  await handleLookups({ method: "POST", query: {}, body: { action: "user-lookup", by, value } }, res);
  return res;
};

beforeEach(() => {
  sqlCalls.length = 0;
});

describe("what it returns", () => {
  it("gives the display identity the callers actually use", async () => {
    const res = await lookup("id", "u1");
    expect(res.body.user).toMatchObject({ id: "u1", username: "asha", full_name: "Asha Rao" });
  });

  it("never selects the email column", async () => {
    // Asserted against the SQL, not the response: the fixture row decides
    // what comes back, so only the query proves the column is not read.
    await lookup("id", "u1");
    await lookup("username", "asha");
    expect(sqlCalls).toHaveLength(2);
    for (const call of sqlCalls) {
      expect(call.text).not.toMatch(/\bemail\b/);
      expect(call.text).not.toMatch(/SELECT \*/i);
    }
  });

  it("looks up by id and by username", async () => {
    await lookup("id", "u1");
    expect(sqlCalls[0].text).toContain("WHERE id =");
    sqlCalls.length = 0;
    await lookup("username", "asha");
    expect(sqlCalls[0].text).toContain("WHERE username =");
  });
});

describe("what it refuses", () => {
  it("will not look a member up by email address", async () => {
    // Otherwise any signed-in member could test whether a given address has
    // an account here.
    const res = await lookup("email", "asha@example.com");
    expect(res.statusCode).toBe(400);
    expect(sqlCalls).toHaveLength(0);
  });

  it("refuses an unknown lookup key or a missing value", async () => {
    for (const [by, value] of [["nonsense", "x"], ["id", ""], ["", "x"]]) {
      const res = await lookup(by, value);
      expect(res.statusCode).toBe(400);
    }
    expect(sqlCalls).toHaveLength(0);
  });
});
