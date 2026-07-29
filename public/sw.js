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

// ── Notification click: focus or open the app ─────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || APP_ORIGIN;

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // If the app tab is already open, focus it
        const existing = clientList.find(c =>
          c.url.startsWith(APP_ORIGIN) && 'focus' in c
        );
        if (existing) {
          existing.focus();
          // Navigate to the target URL within the existing tab
          if ('navigate' in existing) existing.navigate(target);
          return;
        }
        // Otherwise open a new window/tab
        if (clients.openWindow) return clients.openWindow(target);
      })
  );
});

// ── Minimal install/activate: no caching strategy needed ─────────────────────
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});
