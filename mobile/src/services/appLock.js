import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { addLog } from "../utils/logger";

/**
 * App-lock — a fingerprint/Face ID/device-PIN gate in front of an ALREADY
 * signed-in session, the way WhatsApp or a banking app works. This is not a
 * login method: Firebase's own session already persists across app restarts
 * (see src/config/firebase.js) — nobody re-types their email/password just
 * from opening the app. What this adds is a device-level check on top of
 * that persisted session, so someone who picks up an unlocked phone still
 * can't get into the account without the phone owner's biometrics/PIN.
 *
 * A per-DEVICE preference (AsyncStorage, not synced to the server) — this is
 * a property of the device someone is holding, not the account, the same
 * way a phone's own lock screen isn't an account setting either.
 */
const PREF_KEY = "mic_applock_enabled";

/**
 * Whether this device can even offer app-lock at all. `hasHardwareAsync()`
 * alone isn't enough — a device with the sensor but nothing enrolled (no
 * fingerprint, no face, no PIN/pattern) would have every authenticateAsync()
 * call fail immediately, offering a toggle/lock screen that can only ever
 * strand someone. getEnrolledLevelAsync() covers PIN/pattern-only devices
 * too (SecurityLevel.SECRET), not just biometrics — matching "PIN or
 * fingerprint or face recognition", not biometrics alone.
 */
export async function isAppLockAvailable() {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return false;
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    return level !== LocalAuthentication.SecurityLevel.NONE;
  } catch (e) {
    addLog("warn", `appLock: availability check failed — ${e?.message}`);
    return false;
  }
}

/**
 * Defaults to ON: this is an opt-OUT feature (product decision), not opt-in
 * — most people who can use it want the extra layer, and it degrades to
 * fully invisible on a device isAppLockAvailable() says can't use it.
 */
export async function getAppLockEnabled() {
  try {
    const v = await AsyncStorage.getItem(PREF_KEY);
    return v === null ? true : v === "1";
  } catch (e) {
    return true;
  }
}

export async function setAppLockEnabled(on) {
  try {
    await AsyncStorage.setItem(PREF_KEY, on ? "1" : "0");
  } catch (e) {
    addLog("warn", `appLock: could not save preference — ${e?.message}`);
  }
}

/**
 * Prompts for fingerprint/Face ID, falling back to the device PIN/pattern
 * (the OS's own fallback UI — disableDeviceFallback defaults to false)
 * after a failed biometric attempt or if none is enrolled at all.
 */
export async function unlockWithBiometrics() {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock myInvestorCircle",
      cancelLabel: "Cancel",
    });
    if (!res.success) addLog("info", `appLock: unlock not completed (${res.error || "cancelled"})`);
    return !!res.success;
  } catch (e) {
    addLog("warn", `appLock: authenticateAsync threw — ${e?.message}`);
    return false;
  }
}
