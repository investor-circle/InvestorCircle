/**
 * Expo Router's own automatic deep-link navigation, neutralized for every
 * link to myinvestorcircle.com.
 *
 * WHY THIS FILE EXISTS: app.json's Android intent filter (and iOS associated
 * domain) claims the ENTIRE https://myinvestorcircle.com domain with no path
 * restriction, so every link to the site is delivered to this app as a
 * native "url" event. app/_layout.js already has deliberate, correct
 * handling for all of it — referrals (?ref=), password reset
 * (?mode=resetPassword&oobCode=…), and everything else as a Custom Tab
 * fallback — via its own `Linking.addEventListener`/`getInitialURL()` calls.
 *
 * The problem: expo-router ALSO subscribes to the exact same native "url"
 * event on its own (see node_modules/expo-router/build/link/linking.js
 * `subscribe`), independently of _layout.js, and tries to resolve every
 * incoming URL into an in-app ROUTE via path matching. None of our real
 * links are path-based — a password reset link is a bare root URL with only
 * query params, and every shareable web URL (`#/investor/username`, etc.) is
 * a HashRouter URL whose actual route lives in the fragment, invisible to
 * path matching — so expo-router's own resolution never lands on anything
 * meaningful. Left alone, it still ACTS: on every incoming URL (cold start
 * via its own getInitialURL, or a live "url" event while already running) it
 * dispatches its own navigation for whatever an empty/unmatched path
 * resolves to, racing _layout.js's own handling.
 *
 * On a cold start our own effect usually wins that race (nothing is mounted
 * yet for expo-router to dispatch INTO). On a WARM start — the app already
 * running, e.g. in the background — expo-router's subscription fires a live
 * navigation dispatch that can land AFTER _layout.js has already routed to
 * /reset-password, snapping the app back to whatever it resolves the bare
 * root to (the login screen, while signed out). That is exactly the
 * "the reset link works after swiping the app away, but not from a warm
 * background state" report this file fixes.
 *
 * redirectSystemPath is expo-router's own escape hatch for this: returning
 * null tells it "do not treat this as a route, stay on the current path" —
 * a falsy return skips its navigation entirely (see expo-router's own
 * NativeIntent type). That leaves _layout.js as the sole handler for every
 * link to this domain, which it already is.
 */
export function redirectSystemPath({ path }) {
  try {
    if (new URL(path).hostname === "myinvestorcircle.com") return null;
  } catch (_) {
    // Not a full URL (already a bare in-app path, e.g. a custom-scheme
    // redirect) — let expo-router handle it as usual.
  }
  return path;
}
