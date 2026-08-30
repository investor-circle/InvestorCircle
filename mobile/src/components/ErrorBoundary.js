import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { addLog } from "../utils/logger";
import { colors, fonts } from "../theme/colors";

/**
 * Catches render/lifecycle errors so one broken screen shows a readable
 * message instead of unmounting React to the root — which on a device looks
 * exactly like the app freezing (see the web app's CLAUDE.md incident note:
 * a single uncaught throw with no boundary above it blanks the whole app).
 *
 * The error is also pushed into the on-device log (src/utils/logger.js), so
 * it survives into the Diagnostics screen and can be copied out even if the
 * screen that threw is unusable.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    addLog(
      "fatal",
      `render error in <${this.props.label || "screen"}>: ${error?.message || error}\n${
        error?.stack || ""
      }\ncomponentStack:${info?.componentStack || ""}`
    );
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Something broke on this screen</Text>
        <Text style={styles.sub}>
          The error was saved to Profile → Diagnostics. Copy it from there and send it over.
        </Text>
        <ScrollView style={styles.box} contentContainerStyle={{ padding: 12 }}>
          <Text style={styles.err}>
            {String(error?.message || error)}
            {error?.stack ? `\n\n${error.stack}` : ""}
          </Text>
        </ScrollView>
        <Pressable style={styles.btn} onPress={() => this.setState({ error: null })}>
          <Text style={styles.btnText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

/**
 * Wrap a screen component in its own boundary, so a throw in one screen
 * shows an error there instead of taking down the whole navigator.
 * Usage: `export default withBoundary(FeedScreen, "Feed");`
 */
export function withBoundary(Component, label) {
  const Wrapped = (props) => (
    <ErrorBoundary label={label}>
      <Component {...props} />
    </ErrorBoundary>
  );
  Wrapped.displayName = `withBoundary(${label || Component.displayName || Component.name || "Screen"})`;
  return Wrapped;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: 20, justifyContent: "center" },
  title: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 18, marginBottom: 6 },
  sub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  box: {
    maxHeight: 280,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
  },
  err: { color: colors.loss, fontSize: 11, lineHeight: 16 },
  btn: {
    marginTop: 16,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontFamily: fonts.bold, fontSize: 15 },
});
