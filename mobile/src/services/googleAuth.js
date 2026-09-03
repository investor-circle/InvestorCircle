import { useEffect, useRef, useState } from "react";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  linkWithCredential,
} from "firebase/auth";
import { auth } from "../config/firebase";
import { addLog } from "../utils/logger";
import { track } from "./analytics";
import { friendlyAuthError, googleErrorMessage } from "../utils/authErrors";

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
  // Set when Google reports that this email already has a password account.
  // { email } — the pending Google credential itself is held in a ref, not
  // in state, so it is never a render dependency and never logged.
  const [linkPending, setLinkPending] = useState(null);
  const pendingCredential = useRef(null);

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
      const credential = GoogleAuthProvider.credential(idToken);
      signInWithCredential(auth, credential)
        .then(() => {
          addLog("info", "google sign-in: firebase credential accepted");
          track("login", { method: "google" });
        })
        .catch((e) => {
          if (e?.code === "auth/account-exists-with-different-credential") {
            // This email already has an email/password account. Firebase will
            // not silently merge the two; the documented safe path (and what
            // the web app does) is to sign the user in with their EXISTING
            // method first, then link the Google credential onto that same
            // account — so they end up with one InvestorCircle profile
            // instead of two. Ask for the password to do that.
            //
            // credentialFromError is the documented way to recover the
            // credential Firebase rejected; fall back to the one we just
            // built from the same id_token, which is equivalent.
            const email = e.customData?.email || "";
            if (!email) {
              // Firebase normally reports the conflicting email here. Without
              // it there is nothing to sign in as, so a password prompt would
              // just fail with "invalid email" and look broken — fall back to
              // telling the user plainly what happened.
              addLog("warn", "google sign-in: account conflict reported without an email — cannot offer link");
              setError("That email is already registered with a password. Please sign in with your password instead.");
              return;
            }
            pendingCredential.current = GoogleAuthProvider.credentialFromError(e) || credential;
            setLinkPending({ email });
            addLog("info", "google sign-in: email already has a password account — offering to link");
            setError("");
            return;
          }
          addLog("error", `google sign-in: firebase rejected credential — ${e?.code || e?.message}`);
          setError(googleErrorMessage(e?.code));
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

  /**
   * Finish the link: verify the existing password account, then attach the
   * pending Google credential to it. Mirrors handleLinkGoogleAccount() in the
   * web app's LoginPage.
   *
   * The email is the one Firebase itself reported in the error — it is never
   * taken from user input — so this cannot be used to attempt a sign-in
   * against an arbitrary address.
   */
  const linkAccount = async (password) => {
    if (!linkPending || !password) return;
    setBusy(true);
    setError("");
    try {
      const cred = await signInWithEmailAndPassword(auth, linkPending.email, password);
      try {
        await linkWithCredential(cred.user, pendingCredential.current);
        addLog("info", "google sign-in: linked google credential to existing account");
        track("google_account_linked");
      } catch (linkErr) {
        // The password sign-in already succeeded, so the user IS signed in to
        // the right account — only the Google link failed. Degrade quietly
        // rather than showing an error over a screen they've already left;
        // next Google attempt simply offers to link again.
        addLog("warn", `google sign-in: link failed after sign-in — ${linkErr?.code || linkErr?.message}`);
      }
      pendingCredential.current = null;
      setLinkPending(null);
      // onAuthStateChanged has already fired — the user is in.
    } catch (e) {
      addLog("warn", `google sign-in: link sign-in failed — ${e?.code}`);
      setError(friendlyAuthError(e?.code));
      setBusy(false);
    }
  };

  const cancelLink = () => {
    pendingCredential.current = null;
    setLinkPending(null);
    setError("");
    setBusy(false);
  };

  return {
    available: isGoogleSignInConfigured && !!request,
    busy,
    error,
    linkPending,
    linkAccount,
    cancelLink,
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
