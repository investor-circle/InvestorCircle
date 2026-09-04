import AsyncStorage from "@react-native-async-storage/async-storage";
import { processReferral } from "./api/profileApi";

/**
 * Invite links: remember who invited this person, then credit them once.
 *
 * WHY THIS EXISTS: an invite is `https://myinvestorcircle.com/?ref=alice`.
 * The web app stashes that code in localStorage on first load and redeems it
 * after the new account signs in (App.jsx: capture on mount, processReferral
 * in the post-login effect). The mobile app did neither, so an invite opened
 * on a phone credited nobody and left the new member unconnected from whoever
 * invited them.
 *
 * The two halves are deliberately split, exactly as on the web, because they
 * happen at different times: the code arrives BEFORE there is an account to
 * attach it to (that is the point of an invite), and can only be redeemed
 * after sign-up completes.
 *
 * The stored key mirrors the web's `mic_ref` name for the same reason its
 * behaviour is mirrored — one concept, one name, two clients.
 */
const KEY = "mic_ref";

/** Stash a code seen in a link. Never overwrites one already waiting. */
export async function rememberReferral(code) {
  if (!code) return;
  try {
    // First invite wins. Otherwise a later link (a shared idea from someone
    // else, say) would quietly reassign credit for a signup already in
    // progress to whoever was tapped most recently.
    const existing = await AsyncStorage.getItem(KEY);
    if (existing) return;
    await AsyncStorage.setItem(KEY, code);
  } catch (_) {
    /* a referral is a nicety; never let storage break the app */
  }
}

/** The code waiting to be redeemed, or null. */
export async function pendingReferral() {
  try {
    return (await AsyncStorage.getItem(KEY)) || null;
  } catch (_) {
    return null;
  }
}

export async function clearReferral() {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch (_) {
    /* nothing to do */
  }
}

/**
 * Redeem a waiting code for the signed-in user.
 *
 * Cleared on EVERY settled outcome, success or "no such member", so a code
 * that will never resolve does not sit in storage being retried on every
 * launch for the life of the install. An outright failure (offline, server
 * down) leaves it in place to try again next time — that one is worth
 * retrying, and the server ignores a repeat attribution anyway.
 *
 * @returns { referred, referrerName, referrerUsername } or null
 */
export async function redeemPendingReferral() {
  const code = await pendingReferral();
  if (!code) return null;
  let result = null;
  try {
    result = await processReferral(code);
  } catch (_) {
    return null; // keep the code; try again on the next launch
  }
  await clearReferral();
  return result;
}
