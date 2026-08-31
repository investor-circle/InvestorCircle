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
