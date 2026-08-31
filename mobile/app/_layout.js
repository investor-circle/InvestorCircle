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
      <Stack.Screen name="notifications" />
      <Stack.Screen name="network" />
      <Stack.Screen name="circles" />
      <Stack.Screen name="people" />
      <Stack.Screen name="portfolio" />
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
