import { API_ORIGIN } from "../api";
import { addLog } from "../../utils/logger";

const SIGNUP_API = `${API_ORIGIN}/api/profile/signup`;
const RESET_API = `${API_ORIGIN}/api/reset`;

// Password rule, identical to the web LoginPage's pwCheck/pwValid.
export function pwCheck(pw) {
  return {
    length: pw.length >= 6 && pw.length <= 25,
    hasLetter: /[a-zA-Z]/.test(pw),
    hasNumber: /[0-9]/.test(pw),
  };
}
export function pwValid(pw) {
  const c = pwCheck(pw);
  return c.length && c.hasLetter && c.hasNumber;
}

// Server-enforced username shape (api/profile/signup.js).
export const USERNAME_RE = /^[a-z0-9_]{5,20}$/;

/**
 * Write the new user's name/username/consent to their profile row straight
 * after the Firebase account is created. Mirrors the web signup step —
 * identity comes from the verified ID token, never a client-supplied uid.
 *
 * Callers must pass the consent values the person actually gave; the login
 * screen refuses to create the account until both are ticked.
 */
export async function completeSignup(idToken, { firstName, lastName, username, consentTerms, consentData }) {
  try {
    const res = await fetch(SIGNUP_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({
        firstName: (firstName || "").trim(),
        lastName: (lastName || "").trim(),
        username: (username || "").trim(),
        // Passed through from the ticked boxes, never assumed. These used to
        // be hardcoded `true` while the signup form asked for neither, so
        // every account created in the app recorded an agreement its owner
        // was never shown. The server writes what it is given.
        consentTerms: consentTerms === true,
        consentData: consentData === true,
      }),
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    addLog("error", `signup profile write failed (${res.status}): ${data?.error || ""}`);
    return { ok: false, status: res.status, error: data?.error };
  } catch (e) {
    addLog("error", `signup profile write threw: ${e?.message || e}`);
    return { ok: false, error: "unreachable" };
  }
}

/**
 * Request a password-reset email. The server deliberately always returns 200
 * so an attacker can't discover which addresses exist — so the UI must show
 * the same confirmation either way.
 */
export async function requestPasswordReset(email) {
  try {
    await fetch(RESET_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: (email || "").trim().toLowerCase() }),
    });
  } catch (e) {
    addLog("warn", `password reset request failed: ${e?.message || e}`);
  }
  // Intentionally unconditional — see above.
  return { ok: true };
}
