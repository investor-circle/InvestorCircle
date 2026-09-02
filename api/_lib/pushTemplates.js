/**
 * Server-composed push notification content.
 *
 * WHY THE CLIENT NO LONGER SENDS title/body/url:
 * /api/push used to accept a recipient id plus arbitrary title/body/url from
 * an unauthenticated request. That let anyone push any text to any user's
 * lock screen, under this app's name — including text impersonating another
 * member. Requiring a token fixes "anyone"; it does not fix "any text", since
 * a signed-in member could still push whatever they liked to anyone else.
 *
 * So the message is composed here instead. The client names a TYPE and the
 * recipient; the sender's display name comes from the verified token's own
 * profile row, never from the request. There is no way to inject text.
 *
 * PII rule (unchanged, and easier to enforce now that the strings live in one
 * place): a body must never contain prices, amounts, or account-specific
 * financial data — it can appear on a lock screen.
 */

/** The only notifications any client may trigger. */
export const PUSH_TYPES = ['connection_request', 'connection_accepted', 'contact_recommendation'];

const TEMPLATES = {
  connection_request: (name) => ({
    title: '🤝 New connection request',
    body: `${name} wants to connect with you`,
    tag: 'connection_request',
  }),
  connection_accepted: (name) => ({
    title: '🤝 Connection accepted',
    body: `${name} accepted your connection request`,
    tag: 'connection_accepted',
  }),
  contact_recommendation: (name) => ({
    title: '💡 New idea in your circle',
    body: `${name} posted a new idea`,
    tag: 'contact_recommendation',
  }),
};

/**
 * Build the notification for a type.
 *
 * @param type     one of PUSH_TYPES (validate before calling)
 * @param sender   { full_name, username } read from the DB for the VERIFIED
 *                 sender uid — not from the request body
 * @param deepLink optional in-app path (e.g. "/investor/asha/reco/12"). Only
 *                 the path is used; the origin is fixed here so a request
 *                 cannot point a notification at another site.
 */
export function buildPushPayload(type, sender, deepLink) {
  const make = TEMPLATES[type];
  if (!make) return null;
  const name = (sender?.full_name || '').trim() || 'Someone';
  const { title, body, tag } = make(name);
  return { title, body, tag, url: appUrl(deepLink, sender?.username) };
}

const ORIGIN = 'https://myinvestorcircle.com';

/**
 * Resolve a client-supplied deep link to an absolute URL on our own origin.
 * Anything that is not a simple in-app path is discarded rather than
 * followed — a notification is a link the user is invited to tap, so an
 * attacker-chosen destination would be a phishing hop.
 */
export function appUrl(deepLink, senderUsername) {
  const fallback = senderUsername ? `${ORIGIN}/#/investor/${encodeURIComponent(senderUsername)}` : ORIGIN;
  if (typeof deepLink !== 'string' || !deepLink) return fallback;
  // Only "/..." or "#/..." — never "//host", "http://…", or "javascript:".
  const path = deepLink.startsWith('#/') ? deepLink.slice(1) : deepLink;
  if (!path.startsWith('/') || path.startsWith('//')) return fallback;
  if (/[\s<>"']/.test(path)) return fallback;
  return `${ORIGIN}/#${path}`;
}
