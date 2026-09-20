import { describe, it, expect, vi, beforeEach } from "vitest";

// update-delivery carries four independent bits of a recipient's own state:
// invested, invested price, hidden, and their like/dislike. Three collapse
// safely through COALESCE because "absent" and "no value" mean the same
// thing for them. Reaction does not: null MEANS "clear my like". It used to
// be written on every call regardless, so marking an idea invested — or
// hiding it — silently wiped the like the user had left on it.

const sqlCalls = [];
let updateRow = { id: "d1", recommendation_id: "r1", reaction: null };
// authorizedCircleRecipientIds' membership/role check for the poster, and the
// circle's OTHER active members (excluding the poster) — configurable per
// test below.
let groupAuthRows = [];
let groupMemberRows = [];
const sqlTag = (strings, ...values) => {
  const text = strings.join("?");
  sqlCalls.push({ text, values });
  if (text.includes("UPDATE recommendation_deliveries")) return Promise.resolve([updateRow]);
  if (text.includes("INSERT INTO ic_recommendations")) return Promise.resolve([{ id: "rec1" }]);
  if (text.includes("gm.role, gm.status")) return Promise.resolve(groupAuthRows);
  if (text.includes("SELECT name, slug FROM ic_groups")) return Promise.resolve([{ name: "Test Circle", slug: "test-circle" }]);
  if (text.includes("FROM group_members") && text.includes("user_id !=")) return Promise.resolve(groupMemberRows);
  return Promise.resolve([]);
};
vi.mock("../auth.js", async () => {
  const actual = await vi.importActual("../auth.js");
  return {
    ...actual,
    sql: (...a) => sqlTag(...a),
    requireUid: vi.fn(async () => "me"),
    parseBody: (req) => req.body || {},
  };
});

const { default: handleRecommendations } = await import("./recommendations.js");

const mkRes = () => ({
  statusCode: 0,
  body: null,
  setHeader: vi.fn(),
  status(c) { this.statusCode = c; return this; },
  json(b) { this.body = b; return this; },
  end() { return this; },
});

const patchDelivery = async (patch) => {
  const res = mkRes();
  // userId is supplied by the router (api/data.js) after verifying the token,
  // never derived inside the handler — that is the contract this file relies on.
  await handleRecommendations(
    { method: "POST", query: {}, headers: { authorization: "Bearer t" }, body: { action: "update-delivery", deliveryId: "d1", patch } },
    res,
    "me"
  );
  return res;
};

/** The parameter bound to the reaction CASE, and whether it was even applied. */
const reactionWrite = () => {
  const call = sqlCalls.find((c) => c.text.includes("UPDATE recommendation_deliveries"));
  const before = call.text.split("reaction      = CASE WHEN ")[1];
  const idx = call.text.slice(0, call.text.indexOf("reaction      = CASE WHEN ")).split("?").length - 1;
  return { hasReaction: call.values[idx], value: call.values[idx + 1], present: before !== undefined };
};

beforeEach(() => {
  sqlCalls.length = 0;
  vi.clearAllMocks();
  groupAuthRows = [];
  groupMemberRows = [];
});

describe("update-delivery leaves a reaction alone unless asked", () => {
  it("does not touch the reaction when only invested is patched", async () => {
    await patchDelivery({ isInvested: true, investedPrice: 100 });
    expect(reactionWrite().hasReaction).toBe(false);
  });

  it("does not touch the reaction when only hidden is patched", async () => {
    await patchDelivery({ isHidden: true });
    expect(reactionWrite().hasReaction).toBe(false);
  });

  it("writes a like when one is actually supplied", async () => {
    await patchDelivery({ reaction: "like" });
    const w = reactionWrite();
    expect(w.hasReaction).toBe(true);
    expect(w.value).toBe("like");
  });

  it("clears the reaction when null is supplied explicitly", async () => {
    // Distinct from "absent": this is the user un-liking something.
    await patchDelivery({ reaction: null });
    const w = reactionWrite();
    expect(w.hasReaction).toBe(true);
    expect(w.value).toBeNull();
  });

  it("mirrors a like into recommendation_reactions only when supplied", async () => {
    await patchDelivery({ reaction: "like" });
    expect(sqlCalls.some((c) => c.text.includes("INSERT INTO recommendation_reactions"))).toBe(true);

    sqlCalls.length = 0;
    await patchDelivery({ isInvested: true });
    expect(sqlCalls.some((c) => c.text.includes("recommendation_reactions"))).toBe(false);
  });

  it("removes the mirrored row when a like is explicitly cleared", async () => {
    await patchDelivery({ reaction: null });
    expect(sqlCalls.some((c) => c.text.includes("DELETE FROM recommendation_reactions"))).toBe(true);
  });

  it("still rejects a reaction value that is not allowed", async () => {
    const res = await patchDelivery({ reaction: "angry" });
    expect(res.statusCode).toBe(400);
    expect(sqlCalls.some((c) => c.text.includes("UPDATE recommendation_deliveries"))).toBe(false);
  });

  it("still scopes the write to the caller's own delivery row", async () => {
    await patchDelivery({ isHidden: true });
    const call = sqlCalls.find((c) => c.text.includes("UPDATE recommendation_deliveries"));
    expect(call.text).toContain("delivered_to_user_id");
    expect(call.values).toContain("me");
  });
});

// Regression coverage: ic_recommendations has no group/circle column of its
// own — a Circle's own page (getCircleFeed) is sourced entirely from
// recommendation_deliveries rows for that group. The member-delivery loop
// deliberately excludes the poster (a self-notification "someone shared an
// idea in your circle" would be wrong when that someone is you), which meant
// a Circle with no OTHER active members yet got zero delivery rows for
// everything its owner posted — the post itself succeeded, but nothing
// recorded that it belonged to that circle, so the circle page showed 0
// ideas despite every post "working".
describe("posting to your own Circle when it has no other members yet", () => {
  const postToCircle = async (uid = "admin1") => {
    const res = mkRes();
    await handleRecommendations(
      {
        method: "POST", query: {}, headers: { authorization: "Bearer t" },
        body: {
          action: "create",
          reco: { assetName: "Foo Corp", ticker: "FOO" },
          recipients: [{ type: "group", id: "circle1" }],
        },
      },
      res,
      uid
    );
    return res;
  };

  beforeEach(() => {
    // The poster is the circle's own admin/owner — the only role allowed to
    // post to a public circle (see authorizedCircleRecipientIds).
    groupAuthRows = [{ id: "circle1", circle_type: "public", role: "admin", status: "active" }];
    groupMemberRows = []; // nobody else has joined yet
  });

  it("still records a delivery row for the poster, so the circle's own feed isn't empty", async () => {
    await postToCircle();
    const selfDelivery = sqlCalls.find(c =>
      c.text.includes("INSERT INTO recommendation_deliveries") && c.values.includes("admin1")
    );
    expect(selfDelivery).toBeTruthy();
    expect(selfDelivery.text).toContain("'group'");
    expect(selfDelivery.values).toContain("circle1");
  });

  it("does not send a self-notification", async () => {
    await postToCircle();
    expect(sqlCalls.some(c => c.text.includes("INSERT INTO notifications") && c.text.includes("circle_idea"))).toBe(false);
  });

  it("still delivers to real members too once the circle has any", async () => {
    groupMemberRows = [{ user_id: "member1" }];
    await postToCircle();
    const memberDelivery = sqlCalls.find(c =>
      c.text.includes("INSERT INTO recommendation_deliveries") && c.values.includes("member1")
    );
    expect(memberDelivery).toBeTruthy();
    expect(sqlCalls.some(c => c.text.includes("INSERT INTO notifications") && c.text.includes("circle_idea"))).toBe(true);
    // The poster still gets their own delivery row too — harmless/idempotent,
    // and keeps the circle feed correct even if every other member later
    // leaves the circle.
    const selfDelivery = sqlCalls.find(c =>
      c.text.includes("INSERT INTO recommendation_deliveries") && c.values.includes("admin1")
    );
    expect(selfDelivery).toBeTruthy();
  });

  it("does not post to a circle the caller isn't authorized for", async () => {
    groupAuthRows = []; // caller has no role in this group at all
    await postToCircle();
    expect(sqlCalls.some(c => c.text.includes("INSERT INTO recommendation_deliveries"))).toBe(false);
  });
});
