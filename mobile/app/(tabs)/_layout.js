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
      <Tabs
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
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="discover"
          options={{
            title: "Pulse",
            tabBarIcon: ({ color, size }) => <Ionicons name="pulse" color={color} size={size} />,
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
