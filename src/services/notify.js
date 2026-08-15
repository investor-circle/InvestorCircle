export const EMAIL_API       = (import.meta.env.VITE_CAS_API_URL || 'https://investor-circle.vercel.app') + '/api/email';

export const PUSH_API        = (import.meta.env.VITE_CAS_API_URL || 'https://investor-circle.vercel.app') + '/api/push';

export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

/** Fire-and-forget email. Never throws. */

export const sendEmail = (type, payload) =>
  fetch(EMAIL_API, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ type, ...payload }),
  }).catch(() => {});

/** Fire-and-forget push notification. Never throws.
 *  PII rule: body must never contain prices, amounts, or account-specific data.
 *  Content may appear on device lock screen. */

export const sendPush = (userId, { title, body, url = 'https://myinvestorcircle.com', tag = 'mic' }) => {
  if (!userId || !VAPID_PUBLIC_KEY) return;
  fetch(PUSH_API, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId, title, body, url, tag }),
  }).catch(() => {});
};
