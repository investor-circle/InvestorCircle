import { describe, it, expect } from "vitest";
import { notifText, notifIcon, notifRecoId } from "./notifications";

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
