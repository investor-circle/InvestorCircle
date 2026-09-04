import { auth } from "../firebase";

export const EMAIL_API       = (import.meta.env.VITE_CAS_API_URL || 'https://investor-circle.vercel.app') + '/api/email';

export const PUSH_API        = (import.meta.env.VITE_CAS_API_URL || 'https://investor-circle.vercel.app') + '/api/push';

export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

/**
 * Fire-and-forget email. Never throws.
 *
 * Carries a verified token: /api/email used to accept any of its branded
 * templates, to any address, from anyone — a phishing vector on a verified
 * sending domain. The server now also overwrites the sender-identity fields
 * (from_name and friends) with the token's own name, so an email can never
 * claim to come from somebody else, whatever this payload says.
 */
export const sendEmail = async (type, payload) => {
  if (!auth.currentUser) return; // unauthenticated callers are rejected anyway
  try {
    const idToken = await auth.currentUser.getIdToken();
    await fetch(EMAIL_API, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body:    JSON.stringify({ type, ...payload }),
    });
  } catch (_) {
    /* a notification that doesn't arrive must never surface as a failed action */
  }
};

/**
 * Fire-and-forget push notification. Never throws.
 *
 * The CONTENT is no longer sent from here. /api/push used to accept a
 * recipient plus arbitrary title/body/url with no authentication at all,
 * which let anyone push any text to any user's lock screen under this app's
 * name. Now the caller names a `type` and the server composes the message
 * from a fixed template (api/_lib/pushTemplates.js), using the sender's own
 * profile name read from the database, and only for someone the sender is
 * actually connected to.
 *
 * @param userId   recipient
 * @param type     'connection_request' | 'connection_accepted' | 'contact_recommendation'
 * @param deepLink optional in-app path, e.g. `/investor/asha/reco/12`. The
 *                 origin is fixed server-side, so this cannot redirect the
 *                 notification off-site.
 *
 * Note the VAPID gate is gone: that key is only needed to SUBSCRIBE a browser,
 * never to trigger a send, and keeping it here meant a deployment without the
 * key silently dropped mobile-device notifications too.
 */
export const sendPush = async (userId, { type, deepLink } = {}) => {
  if (!userId || !type) return;
  if (!auth.currentUser) return; // unauthenticated callers are rejected anyway
  try {
    const idToken = await auth.currentUser.getIdToken();
    await fetch(PUSH_API, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body:    JSON.stringify({ userId, type, deepLink }),
    });
  } catch (_) {
    /* a notification that doesn't arrive must never surface as a failed action */
  }
};
