
// Why this file exists:
//
// expo-auth-session's useIdTokenAuthRequest calls invariantClientId(), which
// THROWS during render when the platform's OAuth client id is undefined. So
// if a build ships without Google OAuth configured and the login screen calls
// that hook anyway, the login screen crashes — meaning NO sign-in at all, not
// merely no Google sign-in. The gate that prevents this is
// isGoogleSignInConfigured, and it is only safe if it is false whenever the
// ids are missing or partial. That is what these tests pin.

const loadFlag = (env, platform = "android") => {
  jest.resetModules();
  for (const k of [
    "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
    "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID",
    "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID",
  ]) {
    delete process.env[k];
  }
  Object.assign(process.env, env);
  // require, not dynamic import: jest's CJS runtime honours resetModules +
  // doMock for require, whereas a dynamic import needs VM modules enabled.
  // eslint-disable-next-line global-require
  require("react-native").Platform.OS = platform;
  // eslint-disable-next-line global-require
  const mod = require("./googleAuth");
  return mod.isGoogleSignInConfigured;
};

// The module pulls in native-only packages at import time; stub them so this
// runs under plain Node. The stubs are irrelevant to what's being tested —
// only the env-var logic is.
beforeEach(() => {
  jest.doMock("expo-auth-session/providers/google", () => ({ useIdTokenAuthRequest: () => [null, null, jest.fn()] }));
  jest.doMock("expo-web-browser", () => ({ maybeCompleteAuthSession: () => {} }));
  jest.doMock("firebase/auth", () => ({
    GoogleAuthProvider: { credential: () => ({}) },
    signInWithCredential: jest.fn(),
  }));
  jest.doMock("../config/firebase", () => ({ auth: {} }));
  jest.doMock("../utils/logger", () => ({ addLog: () => {} }));
});

afterEach(() => {
  jest.dontMock("expo-auth-session/providers/google");
  jest.resetModules();
});

describe("isGoogleSignInConfigured — the crash gate", () => {
  it("is false when nothing is configured (the default build)", () => {
    expect(loadFlag({})).toBe(false);
  });

  it("is false when only the web client id is set", () => {
    // The web id alone can't drive the Android flow — androidClientId would
    // be undefined and the hook would throw.
    expect(loadFlag({ EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: "web.apps.googleusercontent.com" })).toBe(false);
  });

  it("is false when only the android client id is set", () => {
    // Firebase validates the id_token against the web client id, so without
    // it sign-in would fail at the credential exchange.
    expect(loadFlag({ EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: "android.apps.googleusercontent.com" })).toBe(false);
  });

  it("is false for empty-string vars (an unset GitHub secret expands to '')", () => {
    expect(
      loadFlag({ EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: "", EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: "" })
    ).toBe(false);
  });

  it("is true only with a web id plus THIS platform's id", () => {
    expect(
      loadFlag(
        {
          EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: "web.apps.googleusercontent.com",
          EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: "android.apps.googleusercontent.com",
        },
        "android"
      )
    ).toBe(true);

    expect(
      loadFlag(
        {
          EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: "web.apps.googleusercontent.com",
          EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: "ios.apps.googleusercontent.com",
        },
        "ios"
      )
    ).toBe(true);
  });

  // Regression test for the cross-platform crash: useIdTokenAuthRequest
  // resolves its client id per-platform and throws if the one for the
  // CURRENT platform is missing — it does not fall back to the other
  // platform's id. Before PLATFORM_CLIENT_ID was scoped to Platform.OS, an
  // Android-only configuration (the only one this project has set up so
  // far) satisfied this flag on iOS too, which would have crashed the iOS
  // login screen the first time it rendered the Google button.
  it("is false on iOS when only the Android client id is set", () => {
    expect(
      loadFlag(
        {
          EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: "web.apps.googleusercontent.com",
          EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: "android.apps.googleusercontent.com",
        },
        "ios"
      )
    ).toBe(false);
  });

  it("is false on Android when only the iOS client id is set", () => {
    expect(
      loadFlag(
        {
          EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: "web.apps.googleusercontent.com",
          EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: "ios.apps.googleusercontent.com",
        },
        "android"
      )
    ).toBe(false);
  });
});
