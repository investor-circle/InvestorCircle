// Firebase Auth error -> user-facing message.
//
// Ported from the web app's friendlyError()/googleErrorMessage() in
// src/LoginPage.jsx so both clients say the same thing about the same
// failure. Codes that only exist in a browser (popup-blocked,
// unauthorized-domain) are dropped, since this flow uses a system browser
// tab rather than a popup and cannot produce them.
//
// Every branch is safe to show a user: these are standard, publicly
// documented Firebase Auth codes, never server or database internals. The
// raw code is appended to the fallback so a genuine failure stays
// diagnosable instead of being a dead end.

export function friendlyAuthError(code, isSignup = false) {
  switch (code) {
    case "auth/user-not-found":
      return "No account found with this email.";
    case "auth/wrong-password":
      return "Incorrect password. Please try again.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many attempts — please wait a moment, then try again.";
    case "auth/user-disabled":
      return "This account has been disabled. Contact your admin.";
    case "auth/email-already-in-use":
      return "An account with this email already exists. Try signing in instead.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/operation-not-allowed":
      return "Sign-ups are not enabled. Contact your admin.";
    case "auth/network-request-failed":
      return "Network error. Please check your connection and try again.";
    default:
      return isSignup
        ? "Sign up failed. Please check your details and try again."
        : "Sign in failed. Please check your credentials and try again.";
  }
}

/**
 * The mirror of the account-link case: someone whose account was created with
 * Google types an email and password instead. Firebase answers "wrong
 * credentials", which is true but useless — there is no password on that
 * account to get right. Mirrors the hint in the web LoginPage's handleLogin.
 *
 * @param methods         fetchSignInMethodsForEmail() result for that email
 * @param googleAvailable whether this build actually shows a Google button
 * @returns a replacement message, or null to keep the generic one
 *
 * Returns null whenever the answer isn't certain — an empty list (which is
 * also what Firebase returns when email-enumeration protection is on), an
 * account that does have a password, or anything unexpected. A wrong hint is
 * worse than a generic message, and this must never become a way to probe
 * which emails are registered: it only ever runs after a failed sign-in
 * attempt for that exact address, and never reports "no such account".
 */
export function googleOnlyAccountHint(methods, googleAvailable) {
  const list = Array.isArray(methods) ? methods : [];
  if (!list.includes("google.com")) return null;
  if (list.includes("password")) return null;

  return googleAvailable
    ? 'This account uses Google Sign-In. Tap "Continue with Google" below instead.'
    : // Google sign-in isn't configured in this build, so there is no button
      // to point at — and this user genuinely cannot sign in here. Say so,
      // and send them somewhere that works, rather than looping them through
      // a password they don't have.
      "This account uses Google Sign-In, which isn't available in this version of the app yet. Please sign in on the website for now.";
}

export function googleErrorMessage(code) {
  switch (code) {
    case "auth/operation-not-allowed":
      return "Google sign-in isn't enabled for this app yet. Please use email sign-in for now, or contact support.";
    case "auth/network-request-failed":
      return "Network error while contacting Google. Please check your connection and try again.";
    case "auth/internal-error":
    case "auth/invalid-api-key":
    case "auth/configuration-not-found":
      return "Google sign-in is temporarily unavailable. Please try email sign-in, or try again shortly.";
    default:
      return `Google sign-in failed${code ? ` (${code})` : ""}. Please try email sign-in for now, or contact support if this continues.`;
  }
}
