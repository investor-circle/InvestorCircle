import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getAboutUsContent } from "../src/services/api/lookupsApi";
import { parseHtmlBlocks } from "../src/utils/htmlText";
import { colors, fonts } from "../src/theme/colors";
import { withBoundary } from "../src/components/ErrorBoundary";

/**
 * About Us — the same admin-authored text the web shows, read from the same
 * app_settings row, so editing it in the admin panel updates both clients.
 *
 * It arrives as HTML. The web renders it directly; here it is flattened to
 * blocks and spans (src/utils/htmlText.js) and drawn with ordinary <Text>.
 * That means the app shows the WORDS, not the web page's layout — deliberate:
 * the alternative was bundling a WebView to display one page of prose.
 */
function AboutScreen() {
  const router = useRouter();
  const [blocks, setBlocks] = useState([]);
  // "nothing published yet" and "the request failed" both show the fallback
  // text, but only one of them is worth apologising for, so they are kept
  // apart rather than collapsed into a single empty state.
  const [status, setStatus] = useState("loading"); // loading | ready | empty | error

  useEffect(() => {
    let cancelled = false;
    getAboutUsContent()
      .then((html) => {
        if (cancelled) return;
        const parsed = parseHtmlBlocks(html);
        setBlocks(parsed);
        setStatus(parsed.length ? "ready" : "empty");
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 40 }}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>About</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.eyebrow}>ABOUT</Text>
        <Text style={styles.pageTitle}>My Investor Circle</Text>

        {status === "loading" ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
        ) : status !== "ready" ? (
          <Fallback apologise={status === "error"} />
        ) : (
          <View style={styles.card}>
            {blocks.map((b, i) => (
              <Block key={i} block={b} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Block({ block }) {
  if (block.type === "hr") return <View style={styles.rule} />;

  const inline = block.spans.map((s, i) => (
    <Text
      key={i}
      style={[s.bold && styles.bold, s.italic && styles.italic, s.link && styles.link]}
      onPress={s.link ? () => Linking.openURL(s.link).catch(() => {}) : undefined}
    >
      {s.text}
    </Text>
  ));

  if (block.type === "li") {
    return (
      <View style={styles.liRow}>
        <Text style={styles.liMark}>{block.ordered ? `${block.index}.` : "•"}</Text>
        <Text style={[styles.para, { flex: 1 }]}>{inline}</Text>
      </View>
    );
  }

  const style =
    block.type === "h1" || block.type === "h2"
      ? styles.h2
      : block.type === "h3"
      ? styles.h3
      : block.type === "quote"
      ? styles.quote
      : styles.para;

  return <Text style={style}>{inline}</Text>;
}

/**
 * Shown when nothing has been published to app_settings yet, or the fetch
 * failed. Deliberately NOT a copy of the web's ABOUT_DEFAULT_HTML: that is
 * three kilobytes of styled marketing markup, and a second copy of it here
 * would be a copy that drifts. This says the same thing in the app's own
 * voice, in the one case where the real text is unavailable.
 */
function Fallback({ apologise }) {
  return (
    <View style={styles.card}>
      <Text style={styles.para}>
        My Investor Circle is a private community where investors share their ideas and build a
        transparent, permanent public track record. Every idea leaves a record — no disappearing
        posts, no cherry-picked winners.
      </Text>
      <Text style={styles.para}>
        We don't tell anyone what to buy or sell, and we don't endorse any person, idea or strategy.
        We're the scorekeeper, not the coach — you decide who to trust, we just make it easier to
        see the full picture.
      </Text>
      {apologise ? (
        <Text style={styles.note}>We couldn't load the full page just now — please try again later.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
  },
  topTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 17 },
  body: { padding: 16, paddingBottom: 44 },
  eyebrow: { color: colors.muted, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1 },
  pageTitle: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 24, marginTop: 4, marginBottom: 16 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 18,
  },
  h2: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 19, lineHeight: 26, marginTop: 14, marginBottom: 8 },
  h3: { color: colors.ink, fontFamily: fonts.bold, fontSize: 16, lineHeight: 23, marginTop: 12, marginBottom: 6 },
  para: { color: colors.inkSoft, fontFamily: fonts.regular, fontSize: 15, lineHeight: 25, marginBottom: 14 },
  quote: {
    color: colors.inkSoft,
    fontFamily: fonts.medium,
    fontSize: 15,
    lineHeight: 25,
    marginBottom: 14,
    paddingLeft: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  liRow: { flexDirection: "row", gap: 8, marginBottom: 2 },
  liMark: { color: colors.accentInk, fontFamily: fonts.bold, fontSize: 15, lineHeight: 25, minWidth: 16 },
  bold: { fontFamily: fonts.bold, color: colors.ink },
  italic: { fontStyle: "italic" },
  link: { color: colors.accentInk, textDecorationLine: "underline" },
  rule: { height: 1, backgroundColor: colors.line, marginVertical: 12 },
  note: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, marginTop: 4 },
});

export default withBoundary(AboutScreen, "About");
