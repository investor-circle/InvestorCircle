import { setupIncomplete } from "./setup";

// The web has blocked the app on username + consent since setup stopped being
// a skippable nudge (features/onboarding/Onboarding.jsx). The phone did not,
// and the hole that left is Google sign-in: no signup form, so the account
// arrives with no username and no consent, and the app dropped straight into
// the feed with both missing.
//
// This condition decides whether a person is locked out of their own app, so
// both directions matter: too loose and consent is never recorded; too tight
// and someone with a perfectly good account cannot get past it.

const complete = {
  username: "asha",
  consent_terms_accepted: true,
  consent_data_accepted: true,
};

describe("blocks an account that is not finished", () => {
  it("with no username — what Google sign-in produces", () => {
    expect(setupIncomplete({ ...complete, username: null })).toBe(true);
    expect(setupIncomplete({ ...complete, username: "" })).toBe(true);
  });

  it("with either consent missing", () => {
    expect(setupIncomplete({ ...complete, consent_terms_accepted: false })).toBe(true);
    expect(setupIncomplete({ ...complete, consent_data_accepted: false })).toBe(true);
    expect(setupIncomplete({ ...complete, consent_terms_accepted: undefined })).toBe(true);
  });

  it("with nothing at all", () => {
    expect(setupIncomplete({})).toBe(true);
  });
});

describe("lets a finished account through", () => {
  it("when the username and both consents are on record", () => {
    expect(setupIncomplete(complete)).toBe(false);
  });
});

describe("never decides from something it cannot trust", () => {
  it("stays out of the way while the profile is still loading", () => {
    // profile is null before the first fetch resolves; flashing the gate at
    // every signed-in user on every cold start would be worse than the bug.
    expect(setupIncomplete(null)).toBe(false);
    expect(setupIncomplete(undefined)).toBe(false);
  });

  it("ignores the local fallback shape, whose consent flags are placeholders", () => {
    // AuthContext builds this when the profile API is unreachable. Its
    // consent fields assert agreement it has no way to know about, so a
    // decision either way would be made up: an offline user must not be
    // locked out, and a genuinely unconsented one must not be waved through
    // on the strength of a placeholder.
    expect(setupIncomplete({ __local: true, username: null })).toBe(false);
    expect(setupIncomplete({ __local: true, ...complete })).toBe(false);
  });
});
