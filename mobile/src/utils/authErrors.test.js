import { describe, it, expect } from "vitest";
import { friendlyAuthError, googleErrorMessage } from "./authErrors";

// These strings are the only explanation a user gets when sign-in fails, so
// the important properties are: a known code never falls through to the
// generic message, and an unknown code never dead-ends without the raw code
// to report.

describe("friendlyAuthError", () => {
  it("gives a specific message for each documented code", () => {
    const cases = {
      "auth/user-not-found": /No account found/,
      "auth/wrong-password": /Incorrect password/,
      "auth/invalid-credential": /Incorrect email or password/,
      "auth/invalid-email": /valid email/,
      "auth/too-many-requests": /Too many attempts/,
      "auth/user-disabled": /disabled/,
      "auth/email-already-in-use": /already exists/,
      "auth/weak-password": /at least 6/,
      "auth/operation-not-allowed": /not enabled/,
      "auth/network-request-failed": /Network error/,
    };
    for (const [code, pattern] of Object.entries(cases)) {
      expect(friendlyAuthError(code), code).toMatch(pattern);
    }
  });

  it("distinguishes sign-in from sign-up in the fallback", () => {
    expect(friendlyAuthError("auth/something-new", false)).toMatch(/Sign in failed/);
    expect(friendlyAuthError("auth/something-new", true)).toMatch(/Sign up failed/);
  });

  it("never returns an empty message, even for missing input", () => {
    for (const code of [undefined, null, "", 0]) {
      expect(friendlyAuthError(code).length).toBeGreaterThan(10);
    }
  });

  it("is the message shown when the link password is wrong", () => {
    // The account-link prompt reuses this; a wrong password there must read
    // as a wrong password, not as a Google failure.
    expect(friendlyAuthError("auth/wrong-password")).toMatch(/password/i);
    expect(friendlyAuthError("auth/wrong-password")).not.toMatch(/Google/i);
  });
});

describe("googleErrorMessage", () => {
  it("explains the configuration failures a user could hit", () => {
    expect(googleErrorMessage("auth/operation-not-allowed")).toMatch(/isn't enabled/);
    expect(googleErrorMessage("auth/network-request-failed")).toMatch(/Network error/);
    expect(googleErrorMessage("auth/configuration-not-found")).toMatch(/temporarily unavailable/);
  });

  it("always points at email sign-in as the way out", () => {
    for (const code of [
      "auth/operation-not-allowed",
      "auth/internal-error",
      "auth/invalid-api-key",
      "auth/configuration-not-found",
      "auth/who-knows",
    ]) {
      expect(googleErrorMessage(code), code).toMatch(/email sign-in/i);
    }
  });

  it("includes the raw code in the fallback so a failure stays diagnosable", () => {
    expect(googleErrorMessage("auth/unheard-of")).toContain("auth/unheard-of");
    // ...but doesn't leave a dangling empty bracket when there is no code.
    expect(googleErrorMessage(undefined)).not.toMatch(/\(\)/);
  });

  it("does not surface the account-link case as an error", () => {
    // account-exists-with-different-credential is handled as a flow, not a
    // failure — if it ever reached this mapper the user would be told to
    // give up instead of being offered the link.
    const msg = googleErrorMessage("auth/account-exists-with-different-credential");
    expect(msg).toContain("auth/account-exists-with-different-credential");
  });
});
