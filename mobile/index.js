// Custom entry point (replaces "expo-router/entry" as package.json's "main")
// so Sentry.init() runs before anything else in the JS bundle — including
// expo-router's own setup and every other module import. This matters
// specifically because we've been debugging an app-launch crash with no
// visible error (see git history on this file's neighbors): whatever
// throws, however early, needs to be captured before more code runs.
//
// Sentry.init() alone (no extra wrapping) automatically captures both
// unhandled JS exceptions and native crashes — exactly the two failure
// classes we've been guessing between blind.
import * as Sentry from "@sentry/react-native";

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  // No-ops safely if no DSN is configured (e.g. a local dev run without
  // .env.local set up) instead of sending events to nowhere or throwing.
  enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN,
  debug: false,
  tracesSampleRate: 1.0,
});

// Must come after Sentry.init() above.
import "expo-router/entry";
