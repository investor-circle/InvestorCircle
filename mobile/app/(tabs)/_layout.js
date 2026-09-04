import { View, Pressable, StyleSheet } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, GRADIENT } from "../../src/theme/colors";

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
            height: 58 + bottomInset,
            paddingBottom: bottomInset,
            paddingTop: 6,
          },
          tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11 },
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
            title: "My Recs",
            tabBarIcon: ({ color, size }) => <Ionicons name="bookmark" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" color={color} size={size} />,
          }}
        />
      </Tabs>

      {/* Gradient New-idea FAB — the web app's primary "New idea" action,
          always reachable above the tab bar (sits above the safe-area inset). */}
      <Pressable
        style={[styles.fab, { bottom: 74 + bottomInset }]}
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
