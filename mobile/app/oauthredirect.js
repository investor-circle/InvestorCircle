import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "../src/theme/colors";
import { addLog } from "../src/utils/logger";
import { useAuth } from "../src/context/AuthContext";

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
 * there exactly as with email/password.
 *
 * That exchange is a real network round trip (Google id_token -> Firebase
 * signInWithCredential) that has not necessarily finished — may not have
 * even started — the instant this route mounts. A fixed-delay navigation
 * here used to guess the outcome (router.back() to whatever screen, usually
 * login, was open before the OAuth tab) before Firebase's own auth state
 * had actually changed, landing back on login looking signed-out even when
 * sign-in was about to succeed a moment later; tapping Google sign-in again
 * then hit the ALREADY-authenticated state and worked. Waiting for
 * authLoading/user instead removes the guess: this screen holds its spinner
 * until the real outcome is known, then goes to exactly one place.
 */
export default function OAuthRedirectScreen() {
  const router = useRouter();
  const { user, authLoading } = useAuth();

  useEffect(() => {
    addLog("info", "oauthredirect: landed on OAuth redirect route, returning to app");
  }, []);

  useEffect(() => {
    if (authLoading) return;
    addLog("info", `oauthredirect: auth resolved signedIn=${!!user}, navigating`);
    if (user) router.replace("/(tabs)");
    else if (router.canGoBack()) router.back();
    else router.replace("/(auth)/login");
  }, [authLoading, user, router]);

  // Fallback only: if the credential exchange itself never settles (a
  // genuine network failure rather than "still in flight"), don't strand
  // the user on a spinner forever — send them back to try again.
  useEffect(() => {
    const t = setTimeout(() => {
      if (authLoading) {
        addLog("warn", "oauthredirect: auth still unresolved after 10s, giving up and returning to login");
        router.replace("/(auth)/login");
      }
    }, 10000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );
}
