/**
 * Is this account still missing what it needs before it can be used?
 *
 * The web has blocked on username + consent since setup stopped being a
 * skippable nudge (src/features/onboarding/Onboarding.jsx —
 * MandatorySetupGate). The app did not, and the hole that left is Google
 * sign-in: that flow has no signup form, so it produces an account with no
 * username and no recorded consent, and the app dropped straight into the
 * feed with both missing. A member with no username has no public profile and
 * no shareable ideas, and consent that was never asked for is not consent.
 *
 * Same condition as the web's, on the same server-persisted fields, so
 * someone who abandons setup half-way resumes where they left off on either
 * client rather than being re-asked for what is already saved.
 *
 * Pure, and kept out of the component, so it can be tested without pulling
 * Firebase into the test environment.
 */
export function setupIncomplete(profile) {
  if (!profile) return false; // still loading — decide nothing
  // The local fallback shape AuthContext builds when the profile API is
  // unreachable asserts consent it has no way to know about. Deciding either
  // way from it would be making something up: an offline member must not be
  // locked out, and a genuinely unconsented one must not be waved through on
  // the strength of a placeholder.
  if (profile.__local) return false;
  return !profile.username || !profile.consent_terms_accepted || !profile.consent_data_accepted;
}
