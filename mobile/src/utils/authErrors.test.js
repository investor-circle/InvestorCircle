import { friendlyAuthError, googleErrorMessage, googleOnlyAccountHint } from "./authErrors";

// These strings are the only explanation a user gets when sign-in fails, so
// the important properties are: a known code never falls through to the
// generic message, and an unknown code never dead-ends without the raw code
// to report.

describe("friendlyAuthError", () => {
  it.each([
    ["auth/user-not-found", /No account found/],
    ["auth/wrong-password", /Incorrect password/],
    ["auth/invalid-credential", /Incorrect email or password/],
    ["auth/invalid-email", /valid email/],
    ["auth/too-many-requests", /Too many attempts/],
    ["auth/user-disabled", /disabled/],
    ["auth/email-already-in-use", /already exists/],
    ["auth/weak-password", /at least 6/],
    ["auth/operation-not-allowed", /not enabled/],
    ["auth/network-request-failed", /Network error/],
  ])("gives a specific message for %s", (code, pattern) => {
    expect(friendlyAuthError(code)).toMatch(pattern);
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

  it.each([
    "auth/operation-not-allowed",
    "auth/internal-error",
    "auth/invalid-api-key",
    "auth/configuration-not-found",
    "auth/who-knows",
  ])("always points at email sign-in as the way out (%s)", (code) => {
    expect(googleErrorMessage(code)).toMatch(/email sign-in/i);
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

describe("googleOnlyAccountHint — the mirror of the account-link case", () => {
  it("points a Google-only account at the Google button when there is one", () => {
    const hint = googleOnlyAccountHint(["google.com"], true);
    expect(hint).toMatch(/Google Sign-In/);
    expect(hint).toMatch(/Continue with Google/);
  });

  it("sends them to the website when this build has no Google button", () => {
    // Pointing at a button that isn't rendered would be worse than saying
    // nothing; this user cannot sign in on mobile at all, so say where they can.
    const hint = googleOnlyAccountHint(["google.com"], false);
    expect(hint).toMatch(/website/i);
    expect(hint).not.toMatch(/Continue with Google/);
  });

  it("stays silent when the account also has a password", () => {
    // A real wrong-password typo on a linked account — the generic message is
    // correct and the hint would be actively misleading.
    expect(googleOnlyAccountHint(["google.com", "password"], true)).toBeNull();
    expect(googleOnlyAccountHint(["password"], true)).toBeNull();
  });

  it("stays silent when Firebase tells us nothing", () => {
    // An empty list is exactly what email-enumeration protection returns, so
    // this is the common production case, not an edge case.
    for (const methods of [[], null, undefined, "google.com", {}, [null]]) {
      expect(googleOnlyAccountHint(methods, true)).toBeNull();
    }
  });

  it("never reveals that an account does not exist", () => {
    // The hint must only ever say "use Google instead" — never "no such
    // account", which would turn a failed login into an email prober.
    for (const methods of [[], ["google.com"], ["password"], ["google.com", "password"]]) {
      const hint = googleOnlyAccountHint(methods, true);
      if (hint) expect(hint).not.toMatch(/no account|not found|doesn't exist|unregistered/i);
    }
  });
});
