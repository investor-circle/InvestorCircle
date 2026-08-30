// Diagnostics first: installing the logger before anything else runs means
// errors thrown during the rest of module init are still captured.
import { installLogger, loadPersistedLogs } from "../src/utils/logger";
installLogger();
loadPersistedLogs();

import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View, ActivityIndicator } from "react-native";
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

  useEffect(() => {
    if (fontError) console.warn("font load failed:", fontError?.message || fontError);
  }, [fontError]);

  // Render the navigator unconditionally — unmounting/remounting it once
  // fonts resolve resets navigation state mid-redirect. Fonts failing to
  // load must never block the app either (it falls back to the system
  // font), so proceed on either fontsLoaded or fontError.
  const fontsReady = fontsLoaded || !!fontError;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          {/* Light theme → dark status-bar content. */}
          <StatusBar style="dark" />
          <ErrorBoundary label="app root">
            <RootNavigator />
          </ErrorBoundary>
          {!fontsReady ? (
            <View style={styles.splash} pointerEvents="none">
              <ActivityIndicator color={colors.accent} size="large" />
            </View>
          ) : null}
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = {
  splash: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
};
