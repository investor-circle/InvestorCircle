import { View, Text, Pressable, StyleSheet } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, GRADIENT } from "../../src/theme/colors";

// The <Tabs initialRouteName> prop below only decides which tab is focused
// when this navigator mounts fresh with no path. The app's actual landing
// navigation is router.replace("/(tabs)") in app/_layout.js's post-login
// redirect, which is Expo Router's own file-based resolution — separate
// from the React Navigation prop — and defaults to whichever file is named
// "index" unless this export says otherwise. Without it, every login opened
// on Feed (index.js) regardless of the Tabs prop below.
export const unstable_settings = {
  initialRouteName: "discover",
};

export default function TabsLayout() {
  const router = useRouter();
  // Gesture-nav / on-screen buttons eat the bottom edge — reserve the real
  // inset so the tab bar isn't hidden behind the Android system controls.
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Pulse first, and the tab the app opens on — the same default the web
          has, where Home is a two-tab page with Pulse selected and the raw
          idea feed behind it. Pulse is the daily read; the feed is where you
          go when you want everything. Landing on the feed instead meant the
          two clients answered "what's new?" with different screens. */}
      <Tabs
        initialRouteName="discover"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.line,
            height: 72 + bottomInset,
            paddingBottom: bottomInset + 6,
            paddingTop: 8,
          },
          tabBarItemStyle: { paddingTop: 4, paddingBottom: 4 },
          tabBarAllowFontScaling: false,
          // A style object handed to react-navigation's own label component
          // still truncated every label — even "Feed" (4 chars) — to 2-3
          // characters plus an ellipsis on this device. That component
          // measures/sizes itself before the custom Plus Jakarta Sans font
          // swaps in (see _layout.js's own note on fonts loading async), and
          // never re-measures once it does, so it keeps the system-font
          // layout box a wider Plus Jakarta Sans glyph run doesn't fit in.
          // Rendering the label directly removes that stale measurement:
          // this Text owns its own full-width, post-font-load layout.
          tabBarLabel: ({ focused, children }) => (
            <Text
              numberOfLines={1}
              style={{
                width: "100%",
                textAlign: "center",
                includeFontPadding: false,
                fontFamily: fonts.semibold,
                fontSize: 10.5,
                lineHeight: 13,
                color: focused ? colors.accent : colors.muted,
              }}
            >
              {children}
            </Text>
          ),
        }}
      >
        <Tabs.Screen
          name="discover"
          options={{
            title: "Pulse",
            tabBarIcon: ({ color, size }) => <Ionicons name="pulse" color={color} size={size} />,
          }}
        />
        {/* "Feed", not "Home": with Pulse as the landing tab, calling the
            second one Home would name two different tabs as the start. */}
        <Tabs.Screen
          name="index"
          options={{
            title: "Feed",
            tabBarIcon: ({ color, size }) => <Ionicons name="newspaper" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="track"
          options={{
            title: "My Ideas",
            tabBarIcon: ({ color, size }) => <Ionicons name="bookmark" color={color} size={size} />,
          }}
        />
        {/* Profile moved to the top bar's account avatar (see AppHeader) —
            it doesn't need a bottom-nav slot of its own, and that slot is
            better spent on Market Insights, which used to be buried inside
            the Profile menu and Pulse's own link. */}
        <Tabs.Screen
          name="market"
          options={{
            title: "Insights",
            tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" color={color} size={size} />,
          }}
        />
      </Tabs>

      {/* Gradient New-idea FAB — the web app's primary "New idea" action,
          always reachable above the tab bar (sits above the safe-area inset). */}
      <Pressable
        style={[styles.fab, { bottom: 80 + bottomInset }]}
        onPress={() => router.push("/new")}
        hitSlop={8}
      >
        <LinearGradient colors={GRADIENT.colors} start={GRADIENT.start} end={GRADIENT.end} style={styles.fabInner}>
          <Ionicons name="add" size={30} color="#fff" />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 18,
    width: 58,
    height: 58,
    borderRadius: 29,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  fabInner: { flex: 1, borderRadius: 29, alignItems: "center", justifyContent: "center" },
});
