const { withInfoPlist } = require("expo/config-plugins");

// Expo's iOS prebuild template adds landscape to UISupportedInterfaceOrientations~ipad
// unconditionally whenever ios.supportsTablet is true, regardless of the
// top-level "orientation": "portrait" setting (that field only constrains
// iPhone). Phase 1 deliberately does not build an iPad-adapted layout — no
// screen has orientation-aware code, useWindowDimensions, or breakpoints —
// so an untested landscape iPad layout is more likely to look broken than a
// portrait-stretched one. Locking iPad to the same portrait-only set as
// iPhone removes that whole untested axis without touching any screen code,
// while keeping supportsTablet true (so the app still runs native-quality,
// not letterboxed iPhone-compatibility mode). Revisit once a real iPad
// layout pass happens.
module.exports = function withIpadPortraitOnly(config) {
  return withInfoPlist(config, (config) => {
    config.modResults["UISupportedInterfaceOrientations~ipad"] = [
      "UIInterfaceOrientationPortrait",
      "UIInterfaceOrientationPortraitUpsideDown",
    ];
    return config;
  });
};
