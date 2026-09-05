// Diagnostics first: installing the logger before anything else runs means
// errors thrown during the rest of module init are still captured.
import { installLogger, loadPersistedLogs, addLog } from "../src/utils/logger";
import { mark } from "../src/utils/perf";
installLogger();
loadPersistedLogs();
// First entry on the startup timeline. Everything after this is measured
// from here, so a launch that never reaches the feed says which phase it
// stopped at instead of just never arriving.
mark("js-bundle-executed");

import { useEffect, useRef } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AppState, StyleSheet, View } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
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
import SetupGate, { setupIncomplete } from "../src/components/SetupGate";
import { shouldOfferDiscover } from "../src/utils/setup";
import { parseDeepLink, parseReferral, parsePasswordReset, isExternalWebLink } from "../src/utils/deepLinks";
import { rememberReferral, redeemPendingReferral } from "../src/services/referral";
import { trackScreen } from "../src/services/analytics";
import * as Notifications from "expo-notifications";
import { registerDevice, unregisterDevice, urlFromNotification } from "../src/services/pushNotifications";
import { colors } from "../src/theme/colors";

function RootNavigator() {
  const { user, authLoading, profile, patchProfile } = useAuth();
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

  // The two moments that separate "still starting" from "started": when
  // Firebase finishes restoring the session, and when a real screen (not the
  // splash) is on screen. A launch that hangs before either one is a
  // different bug from one that hangs after, and the timeline says which.
  const markedAuth = useRef(false);
  const markedFirstScreen = useRef(false);
  useEffect(() => {
    if (!authLoading && !markedAuth.current) {
      markedAuth.current = true;
      mark("auth-resolved");
    }
    if (!authLoading && segKey && !markedFirstScreen.current) {
      markedFirstScreen.current = true;
      mark(`first-screen:${segKey}`);
    }
  }, [authLoading, segKey]);

  // Screen tracking, in ONE place rather than a call per screen. The web
  // does the same thing at its single setPage wrapper, and reports it as
  // `page_view` with a `page_name` — matched exactly here so a visit is one
  // row in one report whichever client it came from. Only while signed in:
  // the login screen is not a page anyone navigated to.
  useEffect(() => {
    if (authLoading || !user) return;
    trackScreen(segKey || "home");
  }, [segKey, authLoading, user]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => addLog("info", `appstate: ${s}`));
    return () => sub.remove();
  }, []);

  // Links that must work while SIGNED OUT, and the catch-all for links this
  // build cannot render. Deliberately NOT inside the deep-link effect below:
  // that one waits for a signed-in user, and every case here happens before
  // there is an account, or when there is no way to sign in to one.
  //
  // The context for all three: the Android intent filter claims
  // https://myinvestorcircle.com with autoVerify and NO path restriction
  // (app.json), so this app intercepts EVERY link to the site. Anything it
  // doesn't understand is a link the user watched do nothing.
  useEffect(() => {
    const handle = (url) => {
      // An invite (?ref=alice) arrives before there is an account to attach it
      // to — that is the point of an invite — so it is stored now and
      // redeemed by the effect below once there is one.
      const code = parseReferral(url);
      if (code) {
        addLog("info", `referral: captured "${code}"`);
        rememberReferral(code);
        return;
      }
      // A password reset is the one flow whose whole premise is being unable
      // to sign in.
      const oobCode = parsePasswordReset(url);
      if (oobCode) {
        addLog("info", "deeplink: password reset");
        router.replace(`/reset-password?oobCode=${encodeURIComponent(oobCode)}`);
        return;
      }
      // Our own web pages this app has taken over but cannot draw — a creator
      // claim link, Market Insights, the privacy policy, anything added to
      // the web after this build. A browser tab is a working destination;
      // silently doing nothing is not. Deliberately a Custom Tab rather than
      // Linking.openURL, which Android would route straight back to this app.
      if (isExternalWebLink(url)) {
        addLog("info", `deeplink: opening in browser ${url}`);
        WebBrowser.openBrowserAsync(url).catch(() => {});
      }
    };
    Linking.getInitialURL().then((url) => url && handle(url));
    const sub = Linking.addEventListener("url", ({ url }) => handle(url));
    return () => sub.remove();
  }, [router]);

  // …and redeem it once there IS an account. Mirrors the web's post-login
  // effect (App.jsx calls processReferral there for the same reason). The
  // server ignores a repeat, and the service clears a code that resolved.
  useEffect(() => {
    if (authLoading || !user) return;
    redeemPendingReferral()
      .then((r) => r && addLog("info", `referral: redeemed referred=${r.referred}`))
      .catch(() => {});
  }, [authLoading, user]);

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
    // Choosing a new password is what you do when you CANNOT sign in, so this
    // one screen has to stay reachable while signed out — otherwise the
    // redirect below would bounce someone straight off the reset link they
    // just tapped and back to the login form they are locked out of.
    const isPublicRoute = segments[0] === "reset-password";
    if (!user && !inAuthGroup && !isPublicRoute) {
      router.replace("/(auth)/login");
    } else if (user && inAuthGroup) {
      router.replace("/(tabs)");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, segKey]);

  // Username + consent are required before the account can be used, exactly
  // as on the web. Google sign-in has no signup form, so those accounts arrive
  // with neither; without this they landed straight in the feed with no public
  // identity and no consent on record.
  //
  // Drawn as a full-screen cover OVER the navigator rather than in place of
  // it: the redirect and deep-link effects above still run while it is up, and
  // returning something other than <Stack> would leave them calling
  // router.replace with no navigator mounted.
  const gateOpen = !!user && setupIncomplete(profile);

  // One-time "people to follow", the way the web shows it once after setup.
  // The ref makes it once per app run as well as once per account: the
  // server flag is only written when the screen is finished, so without it a
  // profile refetch mid-session would push the screen again on top of itself.
  const offeredDiscover = useRef(false);
  useEffect(() => {
    if (authLoading || !user || gateOpen) return;
    if (offeredDiscover.current || !shouldOfferDiscover(profile)) return;
    offeredDiscover.current = true;
    router.push("/suggested");
  }, [authLoading, user, gateOpen, profile, router]);

  return (
    <View style={{ flex: 1 }}>
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
        <Stack.Screen name="ticker/[symbol]" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="search" />
        <Stack.Screen name="track-record" />
        <Stack.Screen name="suggested" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="about" />
        <Stack.Screen name="contact" />
        <Stack.Screen name="debug" />
        <Stack.Screen name="new" options={{ presentation: "modal" }} />
      </Stack>
      {/* Last child, so it covers the navigator rather than sitting behind
          it. absoluteFill + the default pointerEvents means nothing
          underneath is reachable while setup is outstanding. */}
      {gateOpen ? (
        <View style={StyleSheet.absoluteFill}>
          <ErrorBoundary label="setup">
            <SetupGate profile={profile} patchProfile={patchProfile} />
          </ErrorBoundary>
        </View>
      ) : null}
    </View>
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
    if (fontsLoaded || fontError) mark("fonts-settled");
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
