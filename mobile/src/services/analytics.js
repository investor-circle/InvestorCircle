/**
 * Analytics — the mobile half of the same Firebase/GA4 property the web
 * reports into.
 *
 * WHY NATIVE AND NOT THE JS SDK: the app already uses the Firebase JS SDK for
 * Auth, but `firebase/analytics` is web-only — it needs `window`, `document`
 * and a browser measurement cookie, and calling getAnalytics() in React Native
 * throws rather than degrading. So analytics specifically goes through
 * @react-native-firebase/analytics, configured from the google-services.json
 * for the SAME Firebase project (`investorcircle`) the web app uses. Events
 * therefore land in the same GA4 property, split by platform, which is what
 * makes web-vs-app comparable rather than two disconnected dashboards.
 *
 * MUST NEVER CRASH THE APP. Two independent reasons, both of which have real
 * precedent in this project (see googleAuth.js):
 *
 *   1. The native module only exists in a build made AFTER this dependency
 *      was added. Running the current JS against an older binary — Expo Go,
 *      a colleague's install, a rollback — would otherwise throw at import
 *      time, before any UI renders, which on a device is indistinguishable
 *      from the app being broken.
 *   2. Analytics is never worth a crash. Every call here is wrapped, and a
 *      failure is logged to Diagnostics rather than surfaced.
 *
 * The event names and parameter shapes are deliberately IDENTICAL to the
 * web's (src/firebase.js `track`, called from App.jsx, LoginPage.jsx and the
 * feature files) — see EVENTS below. Two clients emitting `sign_up` and
 * `signup_mobile` for the same action would make the funnel useless.
 */
import { addLog } from "../utils/logger";

/**
 * The events the web already emits, so the app's names can be checked
 * against a list rather than typed twice and hoped over. Not enforced at
 * runtime — an unknown name is still sent — but a test compares this list
 * against the web's call sites, so a rename on either side is caught.
 */
export const EVENTS = [
  "login",
  "sign_up",
  "google_account_linked",
  "password_reset_requested",
  "password_reset_completed",
  "page_view",
  "connection_sent",
  "connection_accepted",
  "reco_created",
  "reco_liked",
  "push_enabled",
];

// Resolved once, lazily: a build without the native module must fail here
// quietly rather than at import time.
let _analytics;
let _resolved = false;

function analytics() {
  if (_resolved) return _analytics;
  _resolved = true;
  try {
    // require, not import: a static import is hoisted and would throw during
    // module initialisation in a build that lacks the native side.
    const mod = require("@react-native-firebase/analytics");
    const factory = mod?.default || mod?.getAnalytics;
    _analytics = typeof factory === "function" ? factory() : null;
    addLog("info", `analytics: ${_analytics ? "ready" : "unavailable"}`);
  } catch (e) {
    _analytics = null;
    addLog("warn", `analytics: native module missing (${e?.message || e})`);
  }
  return _analytics;
}

/** True when this build can actually report. Useful in Diagnostics. */
export function isAnalyticsAvailable() {
  return !!analytics();
}

/**
 * Log one event. Mirrors the web's `track(name, params)` exactly.
 *
 * Fire-and-forget: nothing awaits it and nothing throws out of it.
 */
export function track(eventName, params = {}) {
  const a = analytics();
  if (!a || !eventName) return;
  try {
    // GA4 rejects null/undefined parameter values, and silently drops the
    // whole event rather than the offending field, so they are stripped here.
    const clean = {};
    for (const [k, v] of Object.entries(params || {})) {
      if (v !== null && v !== undefined) clean[k] = v;
    }
    a.logEvent(eventName, clean)?.catch?.((e) => addLog("warn", `analytics ${eventName}: ${e?.message}`));
  } catch (e) {
    addLog("warn", `analytics ${eventName} threw: ${e?.message || e}`);
  }
}

/**
 * Which screen someone is on.
 *
 * The web reports this as `page_view` with a `page_name` (App.jsx's setPage
 * wrapper), so the same event name and parameter are sent here — a screen
 * visit should be one row in one report whichever client it came from, not
 * two differently-named ones that have to be unioned by hand. Firebase's own
 * `logScreenView` is sent as well, because it is what drives the console's
 * built-in screen reporting for apps.
 */
export function trackScreen(name) {
  const a = analytics();
  if (!a || !name) return;
  track("page_view", { page_name: name });
  try {
    a.logScreenView({ screen_name: name, screen_class: name })?.catch?.(() => {});
  } catch (_) {
    /* the page_view above is the one that has to land */
  }
}

/**
 * Tie events to the signed-in member, and clear that on sign-out.
 *
 * The uid is the same one the web sets, so one person using both clients is
 * one user in the reports rather than two. Called from AuthContext.
 *
 * Deliberately ONLY the uid: user properties are attached to every event and
 * retained by Google, so an email address or a name here would be exporting
 * member identity to a third party for no analytical gain.
 */
export function identify(uid) {
  const a = analytics();
  if (!a) return;
  try {
    a.setUserId(uid || null)?.catch?.(() => {});
  } catch (_) {
    /* never crash for analytics */
  }
}

export function _resetAnalytics() {
  _analytics = undefined;
  _resolved = false;
}
