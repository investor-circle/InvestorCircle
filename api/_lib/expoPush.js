/**
 * api/_lib/expoPush.js — sending to Expo's push service.
 *
 * Companion to the existing Web Push path in api/push.js, NOT a replacement.
 * Browsers get W3C Web Push over VAPID; the mobile app gets Expo push tokens
 * delivered through https://exp.host. The two are independent transports and
 * a failure in this one must never affect the other — see api/push.js.
 *
 * The pure helpers here (message building, chunking, receipt interpretation)
 * are separated from the network call so the delivery rules can be tested
 * without a live push service.
 *
 * PII note carried over from api/push.js: notification bodies must NOT
 * contain prices, amounts, or account-specific financial data — this content
 * appears on lock screens.
 */

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Expo rejects requests with more than 100 messages.
export const EXPO_CHUNK_SIZE = 100;

/**
 * Expo tokens look like ExponentPushToken[xxxxxxxx] (or the older
 * ExpoPushToken[...]). Validating locally keeps obviously-bad rows from
 * costing a round trip, and stops a malformed value stored by an older
 * client from failing an entire chunk.
 */
export function isExpoPushToken(token) {
  return typeof token === 'string' && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
}

/**
 * Build the Expo message array for one notification.
 *
 * `data` carries the deep-link target: the mobile app reads data.url when the
 * user taps the notification (see mobile/src/services/pushNotifications.js),
 * which is the same URL the web notification opens.
 */
export function buildExpoMessages(tokens, { title, body, url, tag } = {}) {
  return (tokens || [])
    .filter(isExpoPushToken)
    .map(to => ({
      to,
      title: title || 'myInvestorCircle',
      body: body || 'You have a new notification',
      data: { url: url || 'https://myinvestorcircle.com', tag: tag || 'mic-general' },
      sound: 'default',
      // Collapse repeats of the same kind of notification, matching the
      // `tag` behaviour of the web notification.
      channelId: 'default',
      ...(tag ? { collapseId: String(tag).slice(0, 64) } : {}),
    }));
}

export function chunk(items, size = EXPO_CHUNK_SIZE) {
  const out = [];
  for (let i = 0; i < (items || []).length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Interpret an Expo response body into { sent, failed, unregistered }.
 *
 * Expo answers 200 with a per-message ticket array: {status:'ok'} or
 * {status:'error', details:{error:'DeviceNotRegistered'}}. DeviceNotRegistered
 * is the mobile equivalent of Web Push's 410 Gone — the app was uninstalled
 * or the token rotated — so those tokens get deleted, mirroring what
 * api/push.js already does for stale browser subscriptions.
 *
 * `messages` is the chunk that produced this response, so a ticket can be
 * mapped back to the token that caused it (Expo returns tickets in order).
 */
export function readExpoReceipts(responseBody, messages) {
  const tickets = Array.isArray(responseBody?.data) ? responseBody.data : [];
  let sent = 0;
  let failed = 0;
  const unregistered = [];

  tickets.forEach((ticket, i) => {
    if (ticket?.status === 'ok') {
      sent += 1;
      return;
    }
    failed += 1;
    const reason = ticket?.details?.error;
    const token = messages?.[i]?.to;
    if (reason === 'DeviceNotRegistered' && token) unregistered.push(token);
  });

  // A malformed or truncated response must not be counted as success.
  const unaccounted = (messages?.length || 0) - tickets.length;
  if (unaccounted > 0) failed += unaccounted;

  return { sent, failed, unregistered };
}

/**
 * Deliver to Expo. Resolves to { sent, failed, unregistered } and NEVER
 * throws: this runs alongside the web-push send, and a problem reaching
 * Expo must not turn a successful browser notification into a failed
 * request.
 */
export async function sendExpoPush(tokens, payload, { fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  const messages = buildExpoMessages(tokens, payload);
  if (!messages.length) return { sent: 0, failed: 0, unregistered: [] };

  const totals = { sent: 0, failed: 0, unregistered: [] };

  for (const group of chunk(messages)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(group),
        signal: controller.signal,
      });

      if (!res.ok) {
        console.warn(`[push][expo] HTTP ${res.status} for ${group.length} message(s)`);
        totals.failed += group.length;
        continue;
      }

      const parsed = await res.json();
      const { sent, failed, unregistered } = readExpoReceipts(parsed, group);
      totals.sent += sent;
      totals.failed += failed;
      totals.unregistered.push(...unregistered);
    } catch (e) {
      console.warn('[push][expo] send failed:', e?.message);
      totals.failed += group.length;
    } finally {
      clearTimeout(timer);
    }
  }

  return totals;
}
