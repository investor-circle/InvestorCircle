import { API_ORIGIN } from "./api";
import { auth } from "../config/firebase";

/**
 * Fan-out notifications, mirroring the web's src/services/notify.js.
 *
 * Both clients hit the same two endpoints, so an idea posted from the phone
 * reaches people exactly the way one posted from the browser does. Before
 * this file existed, mobile posted public ideas silently: the author's
 * connections got no in-app notification, no push and no email, so an idea
 * shared from the phone effectively disappeared.
 *
 * /api/push delivers to BOTH transports for a user — W3C/VAPID browser
 * subscriptions and Expo device tokens (see api/push.js) — so one call from
 * either client reaches whichever the recipient has.
 *
 * Both are fire-and-forget and neither ever throws: a notification that
 * fails must not make the user think their idea failed to post.
 */

const EMAIL_API = `${API_ORIGIN}/api/email`;
const PUSH_API = `${API_ORIGIN}/api/push`;

/**
 * Fire-and-forget email. Never throws.
 *
 * Carries a verified token: /api/email used to accept any of its branded
 * templates, to any address, from anyone. The server also overwrites the
 * sender-identity fields with the token's own name, so an email can never
 * claim to come from somebody else, whatever this payload says.
 */
export async function sendEmail(type, payload) {
  if (!auth.currentUser) return; // unauthenticated callers are rejected anyway
  try {
    const idToken = await auth.currentUser.getIdToken();
    await fetch(EMAIL_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ type, ...payload }),
    });
  } catch (_) {
    /* never surface a failed notification as a failed action */
  }
}

/**
 * Fire-and-forget push. Never throws.
 *
 * The message CONTENT is composed server-side from `type` (see
 * api/_lib/pushTemplates.js), not sent from here: /api/push previously took
 * arbitrary title/body/url from an unauthenticated request, which let anyone
 * push any text to any user's lock screen under this app's name. The sender
 * is now the verified token's uid, the display name is read from the
 * database, and a push is only accepted for someone the sender is connected
 * to. That also means the PII rule (no prices or amounts in a body) is
 * enforced by construction rather than by convention.
 *
 * @param userId   recipient
 * @param type     'connection_request' | 'connection_accepted' | 'contact_recommendation'
 * @param deepLink optional in-app path, e.g. `/investor/asha/reco/12`
 */
export async function sendPush(userId, { type, deepLink } = {}) {
  if (!userId || !type) return;
  if (!auth.currentUser) return; // unauthenticated callers are rejected anyway
  try {
    const idToken = await auth.currentUser.getIdToken();
    await fetch(PUSH_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ userId, type, deepLink }),
    });
  } catch (_) {
    /* never surface a failed notification as a failed action */
  }
}
