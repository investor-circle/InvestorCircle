import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, GRADIENT } from "../theme/colors";

// The web app's signature gradient hero (STYLES .hero-grad): purple→magenta
// gradient block with an uppercase eyebrow, a serif-ish bold title and a
// muted subtitle. Used at the top of the main list screens so the native app
// opens with the same branded header the web feed does.
export default function GradientHero({
  eyebrow,
  title,
  subtitle,
  icon,
  onIconPress,
  badge,
  // A second action, drawn to the LEFT of the primary one. Search lives here
  // on the feed: the web puts it in the header of every page, and the app had
  // it buried behind Profile → Find investors with no way to look up a stock
  // at all.
  secondaryIcon,
  onSecondaryPress,
  secondaryLabel,
}) {
  return (
    <LinearGradient colors={GRADIENT.colors} start={GRADIENT.start} end={GRADIENT.end} style={styles.hero}>
      <View style={styles.row}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {secondaryIcon ? (
          <Pressable
            style={styles.iconBtn}
            onPress={onSecondaryPress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={secondaryLabel}
          >
            <Ionicons name={secondaryIcon} size={20} color="#fff" />
          </Pressable>
        ) : null}
        {icon ? (
          <Pressable style={styles.iconBtn} onPress={onIconPress} hitSlop={8}>
            <Ionicons name={icon} size={20} color="#fff" />
            {badge > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badge > 9 ? "9+" : badge}</Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingTop: 22,
    paddingBottom: 26,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    marginBottom: 8,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  eyebrow: {
    color: "rgba(255,255,255,0.8)",
    fontFamily: fonts.extrabold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  title: { color: "#fff", fontFamily: fonts.extrabold, fontSize: 26, letterSpacing: -0.5, lineHeight: 30 },
  subtitle: { color: "rgba(255,255,255,0.85)", fontFamily: fonts.medium, fontSize: 13, marginTop: 8 },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.loss,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: { color: "#fff", fontFamily: fonts.bold, fontSize: 10 },
});
