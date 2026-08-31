import { useEffect, useState } from "react";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import { auth } from "../config/firebase";
import { addLog } from "../utils/logger";

/**
 * Google sign-in, via expo-auth-session -> a Google OAuth id_token ->
 * Firebase signInWithCredential. The resulting Firebase user is the SAME
 * account the web app's Google sign-in produces (same Firebase project, same
 * uid), so a user who signed up on web with Google lands in their own
 * account here rather than a duplicate.
 *
 * GATING: the OAuth client IDs come from EXPO_PUBLIC_ vars. If they are not
 * configured for a build, isConfigured is false and the Login screen renders
 * no Google button at all — a dead button that always errors is worse than
 * no button. Email/password sign-in is unaffected either way.
 *
 * On EXPO_PUBLIC_: OAuth *client IDs* are public by design — they are visible
 * in the redirect URL of any browser OAuth flow, and Google documents them as
 * non-secret. The client SECRET is what must never ship, and this flow (PKCE,
 * installed-app) never uses one. So this does not conflict with the rule that
 * EXPO_PUBLIC_/VITE_ carry only intentionally-public values.
 */

// Required so the auth popup/tab closes and hands control back to the app.
WebBrowser.maybeCompleteAuthSession();

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "";
const ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || "";
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "";

/**
 * True when this build has enough configuration for Google sign-in to work.
 * The web client id is what Firebase validates the id_token against, so it is
 * the one that is genuinely required; the platform ids are what the OS-level
 * flow uses.
 */
export const isGoogleSignInConfigured = Boolean(WEB_CLIENT_ID && (ANDROID_CLIENT_ID || IOS_CLIENT_ID));

/**
 * @returns {{ available: boolean, signIn: () => void, busy: boolean, error: string }}
 * `signIn` opens the Google account chooser; the Firebase sign-in completes
 * asynchronously and AuthContext's onAuthStateChanged picks it up, exactly as
 * with email/password — so callers don't need to navigate on success.
 *
 * MUST NOT be called unless isGoogleSignInConfigured is true. It is not a
 * hook that degrades gracefully: expo-auth-session's useIdTokenAuthRequest
 * calls invariantClientId(), which THROWS during render when the platform's
 * client id is undefined. Calling it unconditionally in an unconfigured build
 * would therefore blank the login screen for every user — no sign-in at all,
 * rather than merely no Google sign-in. GoogleSignInButton below is the only
 * intended caller, and it is rendered only behind that flag.
 */
export function useGoogleSignIn() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: WEB_CLIENT_ID || undefined,
    androidClientId: ANDROID_CLIENT_ID || undefined,
    iosClientId: IOS_CLIENT_ID || undefined,
  });

  useEffect(() => {
    if (!response) return;

    if (response.type === "success") {
      // expo-auth-session puts the id_token in params (implicit/id_token flow)
      // or on the exchanged token (PKCE); accept either.
      const idToken = response.params?.id_token || response.authentication?.idToken;
      if (!idToken) {
        addLog("warn", "google sign-in: success response carried no id_token");
        setError("Google didn't return a usable sign-in. Please try again.");
        setBusy(false);
        return;
      }
      signInWithCredential(auth, GoogleAuthProvider.credential(idToken))
        .then(() => addLog("info", "google sign-in: firebase credential accepted"))
        .catch((e) => {
          addLog("error", `google sign-in: firebase rejected credential — ${e?.code || e?.message}`);
          setError(
            e?.code === "auth/account-exists-with-different-credential"
              ? "That email is already registered with a password. Sign in with your password instead."
              : "Couldn't complete Google sign-in. Please try again."
          );
        })
        .finally(() => setBusy(false));
      return;
    }

    // dismiss/cancel is a normal user action, not an error worth showing.
    if (response.type === "error") {
      addLog("warn", `google sign-in: ${response.error?.message || "auth session error"}`);
      setError("Couldn't reach Google sign-in. Please try again.");
    }
    setBusy(false);
  }, [response]);

  return {
    available: isGoogleSignInConfigured && !!request,
    busy,
    error,
    signIn: () => {
      setError("");
      setBusy(true);
      // promptAsync resolves into `response` above; a rejection here means the
      // browser session couldn't even open.
      promptAsync().catch((e) => {
        addLog("error", `google sign-in: promptAsync failed — ${e?.message}`);
        setError("Couldn't open Google sign-in.");
        setBusy(false);
      });
    },
  };
}
