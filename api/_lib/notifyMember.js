import { sql } from './auth.js';
import { deliverPush } from './deliverPush.js';
import { buildPushPayload } from './pushTemplates.js';
import { INTERNAL_SECRET_HEADER, internalSecret } from './internalAuth.js';

/**
 * Tell one member that something happened, on every channel at once.
 *
 * WHY THIS IS SERVER-SIDE:
 * The in-app notification row was always written here, but the email and the
 * push were fired by the BROWSER after the request came back. Mobile never
 * learned to do that, so a connection request sent from the phone reached the
 * recipient's bell icon and nowhere else — no email, no push. Rather than
 * teach a second client the same dance, the whole fan-out moves to the one
 * place that already knows who to tell and has their address.
 *
 * That also removes the reason the browser had to look up another member's
 * EMAIL to send them a notification: it never needs to know it now.
 *
 * Fire-and-forget by construction — nothing here is awaited by the action
 * that triggered it, and nothing throws. A notification that fails must never
 * fail the connection request that caused it.
 *
 * @param recipientId  who to tell
 * @param senderId     who caused it (their name is read from the DB, never passed in)
 * @param type         a key in pushTemplates.js / the email TEMPLATES registry
 * @param emailFields  extra template fields for the email, if it takes any
 */
export function notifyMember({ recipientId, senderId, type, emailFields = {} }) {
  if (!recipientId || !senderId || !type) return;
  // Deliberately not awaited: the caller responds to its own request without
  // waiting on Resend or a push service.
  fanOut({ recipientId, senderId, type, emailFields }).catch((e) =>
    console.warn('[notify] fan-out failed:', e?.message)
  );
}

async function fanOut({ recipientId, senderId, type, emailFields }) {
  // One query for both halves: the sender's display name for the message, and
  // the recipient's address for the email.
  let sender = {};
  let recipientEmail = null;
  try {
    const rows = await sql`
      SELECT id, full_name, username, email FROM user_profiles
      WHERE id = ANY(${[String(senderId), String(recipientId)]})
    `;
    sender = rows.find((r) => String(r.id) === String(senderId)) || {};
    recipientEmail = rows.find((r) => String(r.id) === String(recipientId))?.email || null;
  } catch (e) {
    console.warn('[notify] profile lookup failed:', e?.message);
    return;
  }

  const message = buildPushPayload(type, sender);
  if (message) await deliverPush(sql, recipientId, message);

  if (recipientEmail) {
    await sendInternalEmail(type, {
      to_email: recipientEmail,
      from_name: sender.full_name || '',
      from_username: sender.username || '',
      their_name: sender.full_name || '',
      their_username: sender.username || '',
      ...emailFields,
    });
  }
}

/**
 * /api/email is a Python function, so it cannot be called in-process the way
 * push now is. It carries the shared secret because the endpoint requires
 * either a user's Firebase token or proof the caller is our own backend, and
 * this path has no user token — the "sender" is the server reacting to
 * something it just recorded. Without INTERNAL_API_SECRET configured the
 * header is absent and the email is refused, which is the safe direction.
 */
const EMAIL_API = 'https://investor-circle.vercel.app/api/email';

export async function sendInternalEmail(type, payload) {
  const headers = { 'Content-Type': 'application/json' };
  const secret = internalSecret();
  if (secret) headers[INTERNAL_SECRET_HEADER] = secret;
  try {
    await fetch(EMAIL_API, { method: 'POST', headers, body: JSON.stringify({ type, ...payload }) });
  } catch (e) {
    console.warn('[notify] email failed:', e?.message);
  }
}
