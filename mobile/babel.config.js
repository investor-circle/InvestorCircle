module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo already adds the worklets/reanimated Babel plugin
    // automatically whenever react-native-worklets / react-native-reanimated
    // is installed (see babel-preset-expo/build/configs/expo.js —
    // "Automatically add worklets or reanimated plugin when package is
    // installed"), so listing it here again is redundant. Verified by
    // compiling a 'worklet' function both ways: the transform is identical
    // and correct either way, so this is hygiene (matching Expo's documented
    // SDK 54+ setup), NOT a bug fix — it was not the cause of any runtime
    // issue.
    presets: ["babel-preset-expo"],
  };
};
