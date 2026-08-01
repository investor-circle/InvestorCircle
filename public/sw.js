/**
 * myInvestorCircle — Service Worker
 * Handles push notifications and notification click routing.
 *
 * PII note: no user data is stored in the service worker cache.
 * Notification payloads are kept generic (no prices, no account data).
 */

const APP_ORIGIN = self.location.origin;

// ── Push event: show the notification ────────────────────────────────────────
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { data = {}; }

  const title   = data.title || 'myInvestorCircle';
  const options = {
    body:             data.body || 'You have a new notification',
    icon:             '/mic-logo.png',
    badge:            '/mic-logo.png',
    tag:              data.tag  || 'mic-general',   // groups same-type notifications
    renotify:         false,                         // don't re-alert for same tag
    requireInteraction: false,
    data:             { url: data.url || APP_ORIGIN },
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ── Notification click: deep-link into the app ────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || APP_ORIGIN;

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // If the app is already open in a tab, focus it and send a message
        // so the React app can update its hash route directly.
        // postMessage is used instead of WindowClient.navigate() because
        // navigate() is unreliable on iOS Safari and some Android browsers.
        const existing = clientList.find(c =>
          c.url.startsWith(APP_ORIGIN) && 'focus' in c
        );
        if (existing) {
          existing.focus();
          existing.postMessage({ type: 'MIC_NAVIGATE', url: target });
          return;
        }
        // No open tab — open a new window at the target URL directly
        if (clients.openWindow) return clients.openWindow(target);
      })
  );
});

// ── Minimal install/activate: no caching strategy needed ─────────────────────
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});
