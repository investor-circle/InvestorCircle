import { describe, it, expect } from "vitest";
import { buildExpoMessages } from "./expoPush.js";

// The server writes the deep link into the notification; the mobile app reads
// it back and navigates. Those two live in different packages with different
// test runners, so nothing else would catch them drifting apart — the failure
// mode is silent: every tapped notification opens the feed instead of the
// thing it was about.
//
// This pins the server half against a copy of the client's reader. The mobile
// side pins the same contract from its end in
// mobile/src/services/pushNotifications.test.js. If you change the payload
// shape, both must change together.

// Verbatim copy of urlFromNotification() from
// mobile/src/services/pushNotifications.js.
function urlFromNotification(notification) {
  const data =
    notification?.request?.content?.data ||
    notification?.notification?.request?.content?.data ||
    notification?.data;
  const url = data?.url;
  return typeof url === "string" && url ? url : null;
}

/** How Expo wraps a sent message when the user taps it. */
const asTapResponse = (message) => ({
  notification: { request: { content: { title: message.title, body: message.body, data: message.data } } },
});

describe("push payload contract: server -> device tap", () => {
  it("a notification the server builds opens the URL it was given", () => {
    const url = "https://myinvestorcircle.com/#/investor/alice/reco/42";
    const [message] = buildExpoMessages(["ExponentPushToken[a]"], {
      title: "New idea from Alice",
      body: "Alice shared an idea with you",
      url,
      tag: "reco",
    });

    expect(urlFromNotification(asTapResponse(message))).toBe(url);
  });

  it("the default URL is still openable when the caller supplies none", () => {
    const [message] = buildExpoMessages(["ExponentPushToken[a]"], {});
    expect(urlFromNotification(asTapResponse(message))).toBe("https://myinvestorcircle.com");
  });

  it("the deep link is in data, not in the visible text", () => {
    // A URL leaking into title/body would show as raw text on the lock
    // screen; it belongs in the payload only.
    const [message] = buildExpoMessages(["ExponentPushToken[a]"], {
      title: "New idea",
      body: "Someone shared an idea",
      url: "https://myinvestorcircle.com/#/reco/42",
    });
    expect(message.title).not.toMatch(/https?:/);
    expect(message.body).not.toMatch(/https?:/);
    expect(message.data.url).toMatch(/^https:/);
  });
});
