import { describe, it, expect, vi, beforeEach } from "vitest";

// update-delivery carries four independent bits of a recipient's own state:
// invested, invested price, hidden, and their like/dislike. Three collapse
// safely through COALESCE because "absent" and "no value" mean the same
// thing for them. Reaction does not: null MEANS "clear my like". It used to
// be written on every call regardless, so marking an idea invested — or
// hiding it — silently wiped the like the user had left on it.

const sqlCalls = [];
let updateRow = { id: "d1", recommendation_id: "r1", reaction: null };
const sqlTag = (strings, ...values) => {
  const text = strings.join("?");
  sqlCalls.push({ text, values });
  if (text.includes("UPDATE recommendation_deliveries")) return Promise.resolve([updateRow]);
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
