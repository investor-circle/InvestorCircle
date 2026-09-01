// Diagnostics first: installing the logger before anything else runs means
// errors thrown during the rest of module init are still captured.
import { installLogger, loadPersistedLogs, addLog } from "../src/utils/logger";
installLogger();
loadPersistedLogs();

import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AppState } from "react-native";
import * as Linking from "expo-linking";
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import ErrorBoundary from "../src/components/ErrorBoundary";
import { parseDeepLink } from "../src/utils/deepLinks";
import * as Notifications from "expo-notifications";
import { registerDevice, unregisterDevice, urlFromNotification } from "../src/services/pushNotifications";
import { colors } from "../src/theme/colors";

function RootNavigator() {
  const { user, authLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  // useSegments() returns a NEW array every render, so depending on it
  // directly re-runs this effect on every render and can thrash
  // router.replace during a navigation transition. Depend on its string
  // form instead, which only changes when the route actually changes.
  const segKey = segments.join("/");

  // Lifecycle breadcrumbs: if the app hangs, the last entries in the log say
  // which route it was on and whether the OS had backgrounded it, which is
  // the difference between "our code hung" and "Android froze/killed us".
  useEffect(() => {
    addLog("info", `nav: route="${segKey || "/"}" authLoading=${authLoading} signedIn=${!!user}`);
  }, [segKey, authLoading, user]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => addLog("info", `appstate: ${s}`));
    return () => sub.remove();
  }, []);

  // Deep links. The web app's shareable URLs are HashRouter URLs, so the
  // route is in the fragment and expo-router's own linking would drop it —
  // parse and navigate deliberately instead. Deferred until the user is
  // resolved so a link never lands on a screen behind the auth gate.
  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;

    const go = (url) => {
      const target = parseDeepLink(url);
      if (!target || cancelled) return;
      addLog("info", `deeplink: ${url} -> ${target.path}`);
      router.push(
        target.username ? `${target.path}?username=${encodeURIComponent(target.username)}` : target.path
      );
    };

    Linking.getInitialURL().then((url) => url && go(url));
    const sub = Linking.addEventListener("url", ({ url }) => go(url));

    // A tapped push notification routes through the SAME parser: the server
    // puts the web app's own URL in data.url (api/_lib/expoPush.js), so a
    // notification lands on exactly the screen the equivalent shared link
    // would. Covers both a tap while running and a cold start from a tap.
    const openFromNotification = (response) => {
      const url = urlFromNotification(response);
      if (!url) return;
      addLog("info", "push: opened from notification");
      go(url);
    };

    const tapSub = Notifications.addNotificationResponseReceivedListener(openFromNotification);
    Notifications.getLastNotificationResponseAsync()
      .then((response) => response && openFromNotification(response))
      .catch(() => {});

    return () => {
      cancelled = true;
      sub.remove();
      tapSub.remove();
    };
  }, [authLoading, user, router]);

  // Register this device for push once the user is known. Fire-and-forget:
  // registerDevice() never throws and returns null when push isn't available
  // (emulator, permission denied, no FCM config in this build).
  //
  // Detaching at sign-out is NOT done here. Unregistering is an authenticated
  // call, and a cleanup only runs once `user` is already null — by which time
  // Firebase has signed out and the call would silently no-op, leaving the
  // token attached to the account that just left. AuthContext.logout() does it
  // while still signed in. The one case still worth handling here is a sign-out
  // that lands mid-registration, which would otherwise re-attach the token
  // moments after logout already detached it.
  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;

    registerDevice().then((token) => {
      if (cancelled && token) unregisterDevice(token);
    });

    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  useEffect(() => {
    if (authLoading) return;
    const inAuthGroup = segments[0] === "(auth)";
    if (!user && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (user && inAuthGroup) {
      router.replace("/(tabs)");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, segKey]);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="reco/[id]" />
      <Stack.Screen name="investor/[username]" />
      <Stack.Screen name="circle/[id]" />
      <Stack.Screen name="circle/new" options={{ presentation: "modal" }} />
      <Stack.Screen name="circle/manage" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="network" />
      <Stack.Screen name="circles" />
      <Stack.Screen name="people" />
      <Stack.Screen name="portfolio" />
      <Stack.Screen name="portfolio-import" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="debug" />
      <Stack.Screen name="new" options={{ presentation: "modal" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  // Fonts are PURELY cosmetic and must never gate the UI. A previous version
  // covered the app with a full-screen spinner until useFonts() resolved —
  // if that promise never settles (neither loaded nor error) the overlay
  // stays up forever, which on a device is indistinguishable from the app
  // freezing, and leaves no trace in the log. Text simply falls back to the
  // system font until the faces are ready. These transitions are logged so
  // Diagnostics can confirm whether fonts ever resolve.
  useEffect(() => {
    addLog("info", `fonts: loaded=${!!fontsLoaded} error=${fontError ? fontError.message || fontError : "none"}`);
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!fontsLoaded && !fontError) {
        addLog("warn", "fonts: still unresolved after 4s — rendering with system font fallback");
      }
    }, 4000);
    return () => clearTimeout(t);
  }, [fontsLoaded, fontError]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          {/* Light theme → dark status-bar content. */}
          <StatusBar style="dark" />
          <ErrorBoundary label="app root">
            <RootNavigator />
          </ErrorBoundary>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
