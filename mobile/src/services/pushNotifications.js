import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { registerExpoPushToken, unregisterExpoPushToken } from "./api/pushApi";
import { addLog } from "../utils/logger";

/**
 * Device push notifications.
 *
 * The server sends the SAME notification to browsers (Web Push over VAPID)
 * and to devices (Expo push) — see api/push.js. This module owns the mobile
 * half: asking permission, getting the Expo token, registering it against
 * the signed-in account, and turning a tapped notification into navigation.
 *
 * DEGRADES QUIETLY BY DESIGN. Push needs things this build may not have —
 * a physical device, granted permission, and (on Android) FCM configuration
 * via google-services.json. When any of those is missing, every function
 * here no-ops and logs the reason to the on-device diagnostics rather than
 * throwing. A build without FCM configured must still run normally with
 * everything except push working, which is also why nothing here is called
 * during render.
 */

// Show a banner even when the app is in the foreground; without this a
// notification that arrives while the user is looking at the app is silently
// swallowed, which reads as "push is broken".
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * The EAS project id, which getExpoPushTokenAsync needs in a production
 * build (it can be inferred in Expo Go, but not in a standalone binary).
 */
function projectId() {
  return (
    Constants?.expoConfig?.extra?.eas?.projectId ||
    Constants?.easConfig?.projectId ||
    undefined
  );
}

/**
 * Ask for permission and return this device's Expo push token, or null.
 *
 * Never prompts twice: if permission was already decided, the existing
 * answer is used. A denied permission is a normal outcome, not an error —
 * the user simply doesn't get notifications.
 */
export async function getExpoPushToken() {
  // An emulator has no push transport; asking produces a confusing failure.
  if (!Device.isDevice) {
    addLog("info", "push: skipped — not a physical device");
    return null;
  }

  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }
    if (status !== "granted") {
      addLog("info", `push: permission not granted (${status})`);
      return null;
    }

    if (Platform.OS === "android") {
      // Android requires a channel before anything can be delivered; the
      // server sends channelId "default" (see api/_lib/expoPush.js).
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const res = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    const token = res?.data || null;
    addLog("info", token ? "push: got expo token" : "push: no token returned");
    return token;
  } catch (e) {
    // The common cause on Android is a build with no FCM configuration
    // (google-services.json / EAS credentials). Nothing the user can act on,
    // and nothing that should interrupt them.
    addLog("warn", `push: could not get token — ${e?.message}`);
    return null;
  }
}

// The token currently registered for the signed-in user, so sign-out can
// detach it without the caller having to thread it through.
let currentToken = null;

/**
 * Full registration for a signed-in user. Returns the token so the caller
 * can hand it back to unregisterDevice() at sign-out.
 */
export async function registerDevice() {
  const token = await getExpoPushToken();
  if (!token) return null;
  const ok = await registerExpoPushToken(token, Platform.OS);
  addLog(ok ? "info" : "warn", `push: token registration ${ok ? "ok" : "failed"}`);
  currentToken = ok ? token : null;
  return currentToken;
}

/**
 * Detach this device's token, for use at sign-out.
 *
 * MUST be called while the user is still signed in. Registration is an
 * authenticated call, so doing this after signOut() silently does nothing
 * and leaves the token attached to the account that just left — meaning the
 * next person to use the phone would receive their notifications. Hence
 * AuthContext.logout() awaits this before signing out, rather than relying
 * on a React cleanup that only runs once the user is already gone.
 */
export async function unregisterCurrentDevice() {
  const token = currentToken;
  currentToken = null;
  await unregisterDevice(token);
}

/**
 * Detach the token at sign-out, so the next person to use this device does
 * not receive the previous account's notifications.
 */
export async function unregisterDevice(token) {
  if (!token) return;
  if (token === currentToken) currentToken = null;
  try {
    await unregisterExpoPushToken(token);
    addLog("info", "push: token unregistered");
  } catch (e) {
    addLog("warn", `push: unregister failed — ${e?.message}`);
  }
}

/**
 * The URL a notification wants to open, if any.
 *
 * The server puts it in data.url (api/_lib/expoPush.js) — the same URL the
 * web notification opens — and the caller routes it through the existing
 * deep-link parser, so a tapped notification lands on exactly the screen a
 * shared link would.
 */
export function urlFromNotification(notification) {
  const data =
    notification?.request?.content?.data ||
    notification?.notification?.request?.content?.data ||
    notification?.data;
  const url = data?.url;
  return typeof url === "string" && url ? url : null;
}
