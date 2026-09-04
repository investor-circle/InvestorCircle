import { notifText, notifIcon, notifRecoId, notifTarget } from "./notifications";

// These strings are a port of the web NotificationPanel's notifText(). If the
// wording drifts, mobile and web describe the same event differently — and
// the bundled variants (likes, tracking) are easy to get subtly wrong.

describe("notifText", () => {
  it("names a single liker", () => {
    expect(notifText({ type: "contact_like", from_name: "Rahul", metadata: { likeCount: 1, ticker: "INFY" } })).toBe(
      "Rahul liked your INFY idea"
    );
  });

  it("bundles two likers by name", () => {
    expect(
      notifText({ type: "contact_like", metadata: { likerNames: ["Rahul", "Meera"], likeCount: 2 } })
    ).toBe("Rahul and Meera liked your idea");
  });

  it("bundles three or more as 'and N others'", () => {
    expect(
      notifText({ type: "contact_like", metadata: { likerNames: ["Rahul", "Meera", "Arjun"], likeCount: 3 } })
    ).toBe("Rahul and 2 others liked your idea");
  });

  it("pluralises the tracking bundle correctly", () => {
    expect(notifText({ type: "tracking_new", metadata: { count: 1, leadName: "Rahul" } })).toBe(
      "Rahul started tracking you"
    );
    expect(notifText({ type: "tracking_new", metadata: { count: 2, leadName: "Rahul" } })).toBe(
      "Rahul + 1 new investor started tracking you"
    );
    expect(notifText({ type: "tracking_new", metadata: { count: 4, leadName: "Rahul" } })).toBe(
      "Rahul + 3 new investors started tracking you"
    );
  });

  it("names the Circle when one is known, and degrades when it isn't", () => {
    expect(notifText({ type: "circle_idea", from_name: "Vivaan", metadata: { groupName: "Piggy Wealth", ticker: "HFCL" } })).toBe(
      "Vivaan shared an idea in Piggy Wealth — HFCL"
    );
    expect(notifText({ type: "circle_idea", from_name: "Vivaan", metadata: {} })).toBe(
      "Vivaan shared an idea in a Circle"
    );
  });

  it("credits the original recommender on network events", () => {
    expect(
      notifText({ type: "network_like", from_name: "Ankur", metadata: { ticker: "TCS", recommenderName: "Abhijheet" } })
    ).toBe("Ankur liked TCS by Abhijheet");
  });

  it("falls back to a readable label for connection types", () => {
    expect(notifText({ type: "connection_request", from_name: "Sara", metadata: {} })).toBe(
      "Sara wants to connect with you"
    );
  });

  it("never throws on missing name/metadata", () => {
    for (const n of [{ type: "contact_like" }, { type: "unknown_type" }, { type: "network_comment", metadata: null }]) {
      expect(() => notifText(n)).not.toThrow();
      expect(typeof notifText(n)).toBe("string");
    }
  });
});

describe("notifRecoId / notifIcon", () => {
  it("returns a reco id only for idea-related notifications", () => {
    expect(notifRecoId({ type: "contact_comment", reference_id: "42" })).toBe("42");
    // A connection request's reference_id is not a recommendation — following
    // it would open the wrong screen.
    expect(notifRecoId({ type: "connection_request", reference_id: "42" })).toBeNull();
    expect(notifRecoId({ type: "contact_comment" })).toBeNull();
  });

  it("picks a sensible icon per family", () => {
    expect(notifIcon("contact_like")).toBe("heart");
    expect(notifIcon("network_comment")).toBe("chatbubble");
    expect(notifIcon("connection_request")).toBe("person-add");
    expect(notifIcon("circle_idea")).toBe("people");
    expect(notifIcon(undefined)).toBe("notifications");
  });
});

describe("where a notification goes when tapped", () => {
  // Every notification is about something that exists somewhere in the app,
  // so a row that does nothing when tapped reads as broken. Before this,
  // only reco-linked and connection rows went anywhere.
  it("opens the idea for anything that names one", () => {
    expect(notifTarget({ type: "contact_like", reference_id: 7 })).toBe("/reco/7");
    expect(notifTarget({ type: "circle_idea", reference_id: 7 })).toBe("/reco/7");
  });

  it("lands a new-tracker notice on Tracking me, not Connections", () => {
    expect(notifTarget({ type: "tracking_new", reference_id: "u1" })).toBe("/network?tab=trackers");
  });

  it("sends connection notices to the network screen", () => {
    expect(notifTarget({ type: "connection_request", reference_id: "c1" })).toBe("/network");
    expect(notifTarget({ type: "connection_accepted", reference_id: "c1" })).toBe("/network");
  });

  it("sends a join request to manage — the only screen that can act on it", () => {
    expect(notifTarget({ type: "circle_join_request", reference_id: "g9" })).toBe("/circle/manage?id=g9");
  });

  it("opens the Circle for the notices that are about being in one", () => {
    expect(notifTarget({ type: "group_added", reference_id: "g9" })).toBe("/circle/g9");
    expect(notifTarget({ type: "circle_join_approved", reference_id: "g9" })).toBe("/circle/g9");
  });

  it("does NOT open a Circle the reader was just refused", () => {
    // circle_join_rejected names a Circle they cannot enter; opening it would
    // show them a locked door.
    expect(notifTarget({ type: "circle_join_rejected", reference_id: "g9" })).toBeNull();
  });

  it("returns null rather than a broken route when there is no reference", () => {
    expect(notifTarget({ type: "group_added" })).toBeNull();
    expect(notifTarget({ type: "something_new", reference_id: "x" })).toBeNull();
    expect(notifTarget(null)).toBeNull();
  });
});
