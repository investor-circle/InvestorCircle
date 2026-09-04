const fs = require("fs");
const path = require("path");

/**
 * Expo config.
 *
 * app.json remains the source of truth for everything static; this file
 * exists for one reason: google-services.json must only be referenced when
 * it is actually present.
 *
 * Android push delivery needs Firebase Cloud Messaging config, which ships
 * as a google-services.json downloaded from the Firebase console. Naming a
 * missing file in `android.googleServicesFile` FAILS THE BUILD outright, so
 * hardcoding it would mean nobody can build until that file is added.
 * Instead the app builds either way:
 *
 *   file absent  -> builds and runs normally; push registration no-ops and
 *                   says why in the on-device diagnostics
 *   file present -> wired up, and device push works
 *
 * The file is not secret (it holds public project identifiers), but adding
 * it is the repo owner's call, so it stays gitignored by default — see
 * mobile/README.md, "Enabling device push".
 */
const GOOGLE_SERVICES = "./google-services.json";

module.exports = ({ config }) => {
  const hasGoogleServices = fs.existsSync(path.join(__dirname, GOOGLE_SERVICES));

  return {
    ...config,
    android: {
      ...config.android,
      ...(hasGoogleServices ? { googleServicesFile: GOOGLE_SERVICES } : {}),
    },
    plugins: [...(config.plugins || []), "expo-notifications"],
  };
};
