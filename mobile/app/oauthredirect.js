import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "../src/theme/colors";
import { addLog } from "../src/utils/logger";

/**
 * The missing landing spot for Google sign-in's OAuth redirect.
 *
 * expo-auth-session's native (non-proxy) redirect for this app's custom
 * scheme defaults to `myinvestorcircle://oauthredirect?state=…&code=…` (its
 * own built-in redirect path when none is passed explicitly — see
 * src/services/googleAuth.js, which does not pass a `redirectUri`). Two
 * things happen when Google hands that URL back to the app:
 *
 *  1. expo-web-browser's own native listener (armed by
 *     WebBrowser.maybeCompleteAuthSession(), called at googleAuth.js import
 *     time) resolves the in-flight promptAsync() call and closes the auth
 *     browser tab. This part already worked.
 *  2. expo-router's OWN linking config sees the exact same incoming URL as
 *     a normal deep link. With no route registered for "oauthredirect", it
 *     rendered its built-in Unmatched Route screen — the raw redirect URI,
 *     `code` and `state` shown as plain text — on top of whatever screen
 *     the app was on, which is the bug as reported.
 *
 * This file is the missing route (2) needed. It does not itself parse
 * `code`/`state` — the actual credential exchange already happened via (1),
 * driven by expo-auth-session's own `response` state in useGoogleSignIn(),
 * which Firebase sign-in and AuthContext's onAuthStateChanged pick up from
 * there exactly as with email/password. This screen's only job is to not be
 * an error page: it shows a brief spinner and bounces back to whatever the
 * root navigator already decided is the right screen (the signed-in app, or
 * back to login if the sign-in did not complete), the same way a browser
 * "redirecting…" interstitial would.
 */
export default function OAuthRedirectScreen() {
  const router = useRouter();

  useEffect(() => {
    addLog("info", "oauthredirect: landed on OAuth redirect route, returning to app");
    // A tick, not immediate: on Android the auth browser tab is still
    // finishing its own dismiss animation at the moment this route mounts,
    // and replacing navigation state mid-transition has been flaky on
    // react-native-screens. Letting that settle first is cheap insurance.
    const t = setTimeout(() => {
      if (router.canGoBack()) router.back();
      else router.replace("/");
    }, 50);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );
}
