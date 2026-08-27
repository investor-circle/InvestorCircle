const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Firebase JS SDK + Metro package-exports resolution issue: the top-level
// `firebase` package's "./auth" export map has no "react-native" condition
// (only node/browser/default), so with Metro's default
// unstable_enablePackageExports: true, `import ... from "firebase/auth"`
// resolves to the browser build — which does NOT export
// getReactNativePersistence — even though @firebase/auth (the underlying
// package) ships a real React Native build. Disabling package-exports
// resolution here falls back to Metro's legacy `resolverMainFields`
// (["react-native","browser","main"]), which @firebase/auth's own
// package.json "react-native" field correctly points at its RN build.
// This is the standard workaround for this known Firebase/Metro
// interaction (affects every RN+Firebase-JS-SDK+Expo Router project on
// SDK 50+, not something specific to this app). Without it, auth silently
// falls back to in-memory persistence and the session does not survive
// closing the app — see src/config/firebase.js.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
