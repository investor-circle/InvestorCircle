import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Image } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Avatar from "./Avatar";
import { useAuth } from "../context/AuthContext";
import { getMyNotifications } from "../services/api/notificationsApi";
import { colors, fonts } from "../theme/colors";

const LOGO = require("../../assets/mic-logo.png");

/**
 * The app's one top bar: mic logo, the current page's name, then search /
 * notifications / account — in that fixed order on every tab root screen.
 *
 * Replaces the old per-screen GradientHero. That component doubled as both
 * chrome (icons, navigation) AND content (a big coloured banner with its own
 * copy), which is why every screen's header looked and behaved a little
 * differently and why "Profile" had nowhere to live except as its own tab.
 * A native top app bar is chrome only — plain background, fixed height,
 * pinned above the scrolling content rather than scrolling away with it —
 * and account access is the avatar on the right, the same place every other
 * native app puts it, not a fifth item competing for space on the bottom bar.
 */
export default function AppHeader({ title }) {
  const router = useRouter();
  const { profile } = useAuth();
  const [unread, setUnread] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    getMyNotifications()
      .then((list) => {
        if (mounted.current) setUnread((list || []).filter((n) => !n.is_read).length);
      })
      .catch(() => {});
    return () => {
      mounted.current = false;
    };
  }, []);

  return (
    <View style={styles.bar}>
      <Image source={LOGO} style={styles.logo} />
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={{ flex: 1 }} />
      <Pressable style={styles.iconBtn} onPress={() => router.push("/search")} hitSlop={6}>
        <Ionicons name="search-outline" size={22} color={colors.ink} />
      </Pressable>
      <Pressable style={styles.iconBtn} onPress={() => router.push("/notifications")} hitSlop={6}>
        <Ionicons name="notifications-outline" size={22} color={colors.ink} />
        {unread > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
          </View>
        ) : null}
      </Pressable>
      <Pressable style={styles.avatarBtn} onPress={() => router.push("/profile")} hitSlop={6}>
        <Avatar profile={profile} size={30} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    gap: 9,
  },
  logo: { width: 24, height: 24 },
  title: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 17, letterSpacing: -0.2 },
  iconBtn: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  avatarBtn: { marginLeft: 2 },
  badge: {
    position: "absolute",
    top: 3,
    right: 3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.loss,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#fff", fontFamily: fonts.bold, fontSize: 9 },
});
