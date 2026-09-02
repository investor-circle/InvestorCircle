import { View, Text, Image, StyleSheet } from "react-native";
import { initialsOf } from "../utils/format";
import { avatarSource } from "../utils/avatar";
import { colors, fonts } from "../theme/colors";

/**
 * A person's picture, falling back to their initials.
 *
 * One component for every place an avatar appears, so a picture uploaded from
 * either client shows up consistently. The picture is a data: URI stored on
 * user_profiles.avatar_url (see src/utils/avatar.js), which <Image> renders
 * directly — no network fetch, no caching to get wrong.
 *
 * `profile` accepts either the snake_case server row or a camelCase object;
 * lists and profile screens hand over different shapes and both should work.
 */
export default function Avatar({ profile, name, size = 40, style }) {
  const source = avatarSource(profile);
  const label = name || profile?.full_name || profile?.name || profile?.username;
  const dim = { width: size, height: size, borderRadius: size / 2 };

  if (source) {
    return <Image source={source} style={[styles.img, dim, style]} accessibilityIgnoresInvertColors />;
  }

  return (
    <View style={[styles.fallback, dim, style]}>
      <Text style={[styles.initials, { fontSize: Math.max(9, size * 0.36) }]}>{initialsOf(label)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  img: { backgroundColor: colors.surface2 },
  fallback: { backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  initials: { color: colors.inkSoft, fontFamily: fonts.bold },
});
