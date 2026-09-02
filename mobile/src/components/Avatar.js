import { useSyncExternalStore } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { initialsOf } from "../utils/format";
import { avatarSource } from "../utils/avatar";
import { subscribeAvatars, cachedAvatar } from "../services/avatarCache";
import { colors, fonts, GRADIENT } from "../theme/colors";

/**
 * A person's picture, falling back to their initials.
 *
 * One component for every place an avatar appears, so a picture uploaded from
 * either client shows up consistently. The picture is a data: URI stored on
 * user_profiles.avatar_url (see src/utils/avatar.js), which <Image> renders
 * directly — no network fetch, no caching to get wrong.
 *
 * TWO WAYS TO SUPPLY THE PICTURE:
 *
 *  - `profile` — a row that already carries avatar_url (profile screens,
 *    where the picture came back with the rest of the data anyway). Accepts
 *    either the snake_case server row or a camelCase object, because lists
 *    and profile screens hand over different shapes.
 *  - `uid` — just the person's id. The picture is read from the avatar cache
 *    (src/services/avatarCache.js), which lists fill in AFTER they paint.
 *    This is how feed cards get pictures without putting a data: URI on the
 *    critical path: the card renders initials immediately and swaps in the
 *    picture if and when the cache has one. Rendering NEVER waits on it.
 *
 * `gradient` draws the initials on the brand gradient rather than a flat
 * chip — the feed card's look. It only affects the fallback; a real picture
 * looks the same either way.
 */
export default function Avatar({ profile, uid, name, size = 40, gradient = false, style }) {
  // Subscribed rather than read once: a list paints before the avatar batch
  // resolves, and this is what makes those rows update when it lands.
  const cached = useSyncExternalStore(
    subscribeAvatars,
    () => (uid ? cachedAvatar(uid) : null),
    () => null // server snapshot — unused in RN, required by the signature
  );

  const source = avatarSource(profile) || (cached ? { uri: cached } : null);
  const label = name || profile?.full_name || profile?.name || profile?.username;
  const dim = { width: size, height: size, borderRadius: size / 2 };

  if (source) {
    return <Image source={source} style={[styles.img, dim, style]} accessibilityIgnoresInvertColors />;
  }

  const initials = (
    <Text style={[gradient ? styles.initialsOnGradient : styles.initials, { fontSize: Math.max(9, size * 0.36) }]}>
      {initialsOf(label)}
    </Text>
  );

  if (gradient) {
    return (
      <LinearGradient
        colors={GRADIENT.colors}
        start={GRADIENT.start}
        end={GRADIENT.end}
        style={[styles.fallbackBase, dim, style]}
      >
        {initials}
      </LinearGradient>
    );
  }

  return <View style={[styles.fallback, dim, style]}>{initials}</View>;
}

const styles = StyleSheet.create({
  img: { backgroundColor: colors.surface2 },
  fallbackBase: { alignItems: "center", justifyContent: "center" },
  fallback: { backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  initials: { color: colors.inkSoft, fontFamily: fonts.bold },
  initialsOnGradient: { color: "#fff", fontFamily: fonts.extrabold },
});
