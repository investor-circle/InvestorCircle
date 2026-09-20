import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import {
  OAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  linkWithCredential,
} from "firebase/auth";
import { auth } from "../config/firebase";
import { addLog } from "../utils/logger";
import { track } from "./analytics";
import { friendlyAuthError, appleErrorMessage } from "../utils/authErrors";

/**
 * Sign in with Apple, via expo-apple-authentication -> a Firebase
 * OAuthProvider('apple.com') credential -> signInWithCredential. Mirrors
 * googleAuth.js's shape (same account-linking flow, same Firebase project,
 * same event names) rather than introducing a second auth architecture.
 *
 * WHY THIS EXISTS: Apple's App Store Review Guideline 4.8 requires Sign in
 * with Apple as an equivalent option in any app that offers a third-party
 * login (this app already offers Google). iOS 13+ also gates the OS-level
 * capability the same way.
 *
 * UNTESTABLE IN THIS ENVIRONMENT. `expo-apple-authentication` is a native
 * module — `AppleAuthentication.isAvailableAsync()` degrades to resolving
 * `false` when the native module isn't present (Android, web, a JS-only
 * sandbox with no iOS build), so this file is safe to ship today and simply
 * stays inert everywhere except a real iOS build. It has not been exercised
 * against Apple's actual sign-in sheet — that needs an iOS build. See
 * mobile/README.md / CLAUDE_HANDOVER.md for the remaining Apple Developer
 * steps (enabling the capability on the App ID, a provisioning profile that
 * includes it) — none of which this file depends on to simply COMPILE and
 * degrade safely; they are required only for the sheet to actually work.
 *
 * NONCE: Apple signs whatever nonce you send it into the identityToken's
 * `nonce` claim; Firebase verifies by hashing the RAW nonce you hand its
 * credential() call and comparing. So a fresh random value is generated per
 * attempt, its SHA-256 hex digest goes to Apple, and the raw (unhashed)
 * value goes to Firebase — never the other way around.
 */

export function useAppleSignIn() {
  // Read fresh each render rather than cached at module scope (unlike
  // googleAuth.js's PLATFORM_CLIENT_ID): Platform.OS never actually changes
  // during a real app's lifetime, but this hook renders real state through
  // react-test-renderer in tests, and caching this as a module-level
  // constant would require jest.resetModules() between "ios"/"android"
  // cases — which re-evaluates React itself, handing this hook a different
  // React module instance than the one the test's renderer is using
  // (`Cannot read properties of null (reading 'useState')`). Reading it
  // per-render avoids that entirely.
  const isPlatformSupported = Platform.OS === "ios";
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Same shape as useGoogleSignIn's linkPending: set when this Apple email
  // already has a password account, so the UI can offer to link them.
  const [linkPending, setLinkPending] = useState(null);
  const pendingCredential = useRef(null);

  useEffect(() => {
    if (!isPlatformSupported) return;
    let cancelled = false;
    AppleAuthentication.isAvailableAsync()
      .then((ok) => {
        if (!cancelled) setAvailable(!!ok);
      })
      .catch((e) => {
        // isAvailableAsync() itself degrades to false rather than throwing
        // (see ExpoAppleAuthentication.js's optional-native-module fallback),
        // but guard anyway rather than trust a third-party promise never to
        // reject in a future SDK version.
        addLog("warn", `apple sign-in: availability check failed — ${e?.message}`);
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isPlatformSupported]);

  const signIn = useCallback(async () => {
    if (!isPlatformSupported || busy) return;
    setError("");
    setBusy(true);
    try {
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

      const appleCredential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
        nonce: hashedNonce,
      });

      if (!appleCredential.identityToken) {
        addLog("warn", "apple sign-in: no identityToken in response");
        setError("Apple didn't return a usable sign-in. Please try again.");
        return;
      }

      const provider = new OAuthProvider("apple.com");
      const credential = provider.credential({
        idToken: appleCredential.identityToken,
        rawNonce,
      });

      try {
        await signInWithCredential(auth, credential);
        addLog("info", "apple sign-in: firebase credential accepted");
        track("login", { method: "apple" });
      } catch (e) {
        if (e?.code === "auth/account-exists-with-different-credential") {
          // Same recovery as Google: this email already has a password
          // account, so ask for that password and link the two rather than
          // creating a second profile. See useGoogleSignIn for the full
          // rationale — this mirrors it exactly.
          const email = e.customData?.email || "";
          if (!email) {
            addLog("warn", "apple sign-in: account conflict reported without an email — cannot offer link");
            setError("That email is already registered with a password. Please sign in with your password instead.");
            return;
          }
          pendingCredential.current = credential;
          setLinkPending({ email });
          addLog("info", "apple sign-in: email already has a password account — offering to link");
          setError("");
          return;
        }
        addLog("error", `apple sign-in: firebase rejected credential — ${e?.code || e?.message}`);
        setError(appleErrorMessage(e?.code));
      }
    } catch (e) {
      // The user dismissing Apple's sheet is a normal action, not an error.
      if (e?.code !== "ERR_REQUEST_CANCELED") {
        addLog("warn", `apple sign-in: signInAsync failed — ${e?.code || e?.message}`);
        setError("Couldn't open Apple sign-in.");
      }
    } finally {
      setBusy(false);
    }
  }, [busy, isPlatformSupported]);

  const linkAccount = async (password) => {
    if (!linkPending || !password) return;
    setBusy(true);
    setError("");
    try {
      const cred = await signInWithEmailAndPassword(auth, linkPending.email, password);
      try {
        await linkWithCredential(cred.user, pendingCredential.current);
        addLog("info", "apple sign-in: linked apple credential to existing account");
        track("apple_account_linked");
      } catch (linkErr) {
        // Password sign-in already succeeded — only the link failed. Degrade
        // quietly; the next Apple attempt simply offers to link again.
        addLog("warn", `apple sign-in: link failed after sign-in — ${linkErr?.code || linkErr?.message}`);
      }
      pendingCredential.current = null;
      setLinkPending(null);
    } catch (e) {
      addLog("warn", `apple sign-in: link sign-in failed — ${e?.code}`);
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
    available: isPlatformSupported && available,
    busy,
    error,
    signIn,
    linkPending,
    linkAccount,
    cancelLink,
  };
}
