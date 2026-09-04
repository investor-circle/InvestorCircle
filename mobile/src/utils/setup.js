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

/**
 * Should this account be shown the one-time "people to follow" step?
 *
 * The web shows it exactly once, right after setup, gated on the same
 * server-persisted flag (OnboardingGate -> DiscoverModal). The app had the
 * screen but only behind an icon on Find investors, so a new member — who by
 * definition follows nobody — arrived at an empty feed with nothing
 * suggesting how to fill it. That is the moment the step exists for.
 *
 * Deliberately false while setup is still outstanding: username and consent
 * come first, and stacking a second screen on top of that gate would be two
 * interruptions before the app has been seen at all.
 */
export function shouldOfferDiscover(profile) {
  if (!profile || profile.__local) return false;
  if (setupIncomplete(profile)) return false;
  return !profile.onboarding_discover_done;
}
