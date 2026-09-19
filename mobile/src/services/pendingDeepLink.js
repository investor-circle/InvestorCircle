import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * A shared idea/security/profile/circle link tapped while signed out:
 * remember it, land on it once sign-in completes — the same problem
 * services/referral.js already solves for invite links (?ref=), same
 * store-now-redeem-later shape.
 *
 * WHY THIS EXISTS: app/_layout.js's deep-link navigation effect only ever
 * ran while `user` was already truthy — it early-returns otherwise, and
 * critically never even calls Linking.addEventListener("url", ...) in that
 * case, so a link TAPPED while signed out was never listened for at all,
 * not just ignored. A cold start (app not running yet) happened to still
 * work by accident: Linking.getInitialURL() keeps returning the app's
 * launch URL for the life of that JS instance, so the effect re-running
 * once auth resolved still saw it. A WARM start — the app already running
 * in the background, signed out, and a fresh link tapped — has no such
 * accident to rely on: the live "url" event fires while nothing is
 * listening, and is gone forever. The reporter's exact scenario (idea
 * shared from the app, recipient also has the app) surfaces this whenever
 * the recipient happens to be signed out at the moment they tap.
 *
 * Deliberately last-wins (plain overwrite), unlike referral's first-wins:
 * a referral code identifies WHO gets credit, so a later, unrelated link
 * tapped mid-signup must not silently reassign that; a pending deep link
 * is just WHERE to land next, where the most recent tap is the one that
 * actually reflects what the person wants to see.
 */
const KEY = "mic_pending_link";

/** Stash the raw URL from a link tapped while signed out. */
export async function rememberDeepLink(url) {
  if (!url) return;
  try {
    await AsyncStorage.setItem(KEY, url);
  } catch (_) {
    /* a missed deep link is a worse UX, never a crash */
  }
}

/** The URL waiting to be navigated to, or null. */
export async function pendingDeepLink() {
  try {
    return (await AsyncStorage.getItem(KEY)) || null;
  } catch (_) {
    return null;
  }
}

export async function clearPendingDeepLink() {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch (_) {
    /* nothing to do */
  }
}
