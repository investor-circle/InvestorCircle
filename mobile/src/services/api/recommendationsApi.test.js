import * as recommendationsApi from "./recommendationsApi";
import { callApi } from "../api";

jest.mock("../api", () => ({ callApi: jest.fn() }));

// A posted idea is permanent, by product decision: a credibility score only
// means something if nobody can erase the calls that went wrong. The server
// still HAS a delete-reco action, so the only thing standing between a user
// and deleting their idea is the absence of a client path to it. That is easy
// to undo by accident — the endpoint exists, so wiring a Delete button looks
// like completing something rather than reversing a decision. This test is
// the guardrail.
//
// If this ever fails, the fix is NOT to update the test. It is to confirm
// deletion was actually intended, with its own rules (e.g. a time-limited
// correction window), before anything ships.

const actionsSentBy = async (fn) => {
  callApi.mockReset();
  callApi.mockResolvedValue({ ok: true, data: {} });
  try {
    // Args are deliberately generic — the point is which endpoint gets hit,
    // not what the call returns.
    await fn("id", "id", "id");
  } catch (_) {
    // A signature mismatch is fine; the call was still recorded if it made one.
  }
  return callApi.mock.calls.map((c) => c[1]?.body?.action).filter(Boolean);
};

describe("deleting a posted idea is not offered", () => {
  it("exports no function that deletes a recommendation", () => {
    expect(recommendationsApi.deleteRecommendation).toBeUndefined();
  });

  it("has no export named as a deletion of an idea", () => {
    // Catches a wrapper added under a different name (removeIdea, retract…).
    for (const name of Object.keys(recommendationsApi)) {
      expect(name).not.toMatch(/deleteReco|removeReco|retract/i);
    }
  });

  it("has no export that calls the server's delete-reco action", async () => {
    // Behavioural, not a source-text scan: every exported function is invoked
    // against a mocked transport and its request inspected. A wrapper under
    // any name, however written, is caught here.
    for (const [name, fn] of Object.entries(recommendationsApi)) {
      if (typeof fn !== "function") continue;
      expect([name, await actionsSentBy(fn)]).not.toContainEqual(
        expect.arrayContaining(["delete-reco"])
      );
    }
  });

  it("still offers the two things that ARE allowed, so this is not vacuous", async () => {
    // An author closes a position by signalling an exit — recording the
    // outcome rather than hiding it.
    expect(await actionsSentBy(recommendationsApi.setExitSignal)).toContain("set-exit-signal");
    // A recipient may drop their OWN copy; the idea and everyone else's copy
    // are untouched. Different action, different endpoint.
    expect(await actionsSentBy(recommendationsApi.dismissDelivery)).toContain("delete-delivery");
  });
});
