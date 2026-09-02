import { API_ORIGIN } from "./api";

/**
 * Fan-out notifications, mirroring the web's src/services/notify.js.
 *
 * Both clients hit the same two endpoints, so an idea posted from the phone
 * reaches people exactly the way one posted from the browser does. Before
 * this file existed, mobile posted public ideas silently: the author's
 * connections got no in-app notification, no push and no email, so an idea
 * shared from the phone effectively disappeared.
 *
 * /api/push now delivers to BOTH transports for a user — W3C/VAPID browser
 * subscriptions and Expo device tokens (see api/push.js) — so one call from
 * either client reaches whichever the recipient has. Note the web gates
 * sendPush on VITE_VAPID_PUBLIC_KEY, but that key is only needed to
 * SUBSCRIBE a browser, never to trigger a send; there is nothing to gate on
 * here.
 *
 * Both are fire-and-forget and neither ever throws: a notification that
 * fails must not make the user think their idea failed to post.
 */

const EMAIL_API = `${API_ORIGIN}/api/email`;
const PUSH_API = `${API_ORIGIN}/api/push`;

/** Fire-and-forget email. Never throws. */
export function sendEmail(type, payload) {
  fetch(EMAIL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, ...payload }),
  }).catch(() => {});
}

/**
 * Fire-and-forget push. Never throws.
 *
 * PII rule, copied from the web deliberately: `body` must never contain
 * prices, amounts or account-specific data — it can appear on a lock screen.
 */
export function sendPush(userId, { title, body, url = "https://myinvestorcircle.com", tag = "mic" }) {
  if (!userId) return;
  fetch(PUSH_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, title, body, url, tag }),
  }).catch(() => {});
}
