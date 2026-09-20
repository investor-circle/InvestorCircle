const fs = require("fs");
const path = require("path");

/**
 * Expo config.
 *
 * app.json remains the source of truth for everything static; this file
 * exists for one reason: google-services.json / GoogleService-Info.plist
 * must only be referenced when actually present.
 *
 * Firebase (Android push delivery, and — via @react-native-firebase/app —
 * the analytics native module on both platforms) needs native config files
 * downloaded from the Firebase console: google-services.json for Android,
 * GoogleService-Info.plist for iOS. Naming a missing file in
 * `android.googleServicesFile` / `ios.googleServicesFile` FAILS THE BUILD
 * outright (the @react-native-firebase/app config plugin, listed in
 * app.json's `plugins`, requires it once a build actually targets that
 * platform), so hardcoding either would mean nobody can build until that
 * file is added. Instead the app builds either way, per platform,
 * independently:
 *
 *   file absent  -> builds and runs normally; push (Android) / analytics
 *                   (either platform) no-ops and says why in the on-device
 *                   diagnostics
 *   file present -> wired up, and the corresponding native feature works
 *
 * Neither file is secret (both hold public project identifiers), but adding
 * either is the repo owner's call — google-services.json stays gitignored by
 * default (see mobile/README.md, "Enabling device push"); the same applies
 * to GoogleService-Info.plist once it exists.
 */
const GOOGLE_SERVICES_ANDROID = "./google-services.json";
const GOOGLE_SERVICES_IOS = "./GoogleService-Info.plist";

module.exports = ({ config }) => {
  const hasGoogleServicesAndroid = fs.existsSync(path.join(__dirname, GOOGLE_SERVICES_ANDROID));
  const hasGoogleServicesIos = fs.existsSync(path.join(__dirname, GOOGLE_SERVICES_IOS));

  return {
    ...config,
    android: {
      ...config.android,
      ...(hasGoogleServicesAndroid ? { googleServicesFile: GOOGLE_SERVICES_ANDROID } : {}),
    },
    ios: {
      ...config.ios,
      ...(hasGoogleServicesIos ? { googleServicesFile: GOOGLE_SERVICES_IOS } : {}),
    },
    plugins: [...(config.plugins || []), "expo-notifications"],
  };
};
