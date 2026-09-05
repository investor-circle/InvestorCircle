// Mobile palette — the SAME tokens the web app uses (src/styles/globalStyles.js
// :root). Keeping these identical is what makes the native app read as the
// same product as the web app rather than a separate dark-themed client.
export const colors = {
  bg: "#f5f5fb",
  surface: "#ffffff",
  surface2: "#f1f1f8",

  ink: "#13142b",
  inkSoft: "#565a78",
  muted: "#8d90ad",

  line: "#e9e9f2",
  line2: "#dddcec",

  accent: "#6d5df5",
  accentInk: "#5a49e6",
  accentSoft: "#eeecff",
  accentLine: "#dcd8fb",

  gain: "#15924e",
  gainSoft: "#e6f4ec",
  loss: "#c2453d",
  lossSoft: "#f8eae8",

  side: "#0a0b18",

  white: "#ffffff",

  // Back-compat aliases for code written against the old dark palette names.
  card: "#ffffff",
  cardBorder: "#e9e9f2",
  text: "#13142b",
  textMuted: "#8d90ad",
  divider: "#e9e9f2",
  green: "#15924e",
  red: "#c2453d",
};

// The web's signature 135° purple→magenta gradient (--grad). Used for
// primary buttons, the New-idea FAB and avatars. Consumed by
// expo-linear-gradient as {colors, start, end}.
export const GRADIENT = {
  colors: ["#6d5df5", "#9a55ee", "#cf52d8"],
  locations: [0, 0.55, 1],
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
};

// Font-family names registered by useFonts in app/_layout.js. Falls back to
// the system font until the Plus Jakarta Sans faces finish loading.
export const fonts = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
};
