/**
 * Building the profile-edit-save payload.
 *
 * This exists because profile-edit-save is a WHOLE-RECORD write, not a patch:
 * the server sets every column it handles from the payload it receives, so a
 * field left out is written as NULL. Sending only the changed fields would
 * silently wipe the user's bio and social links — a data-loss bug that no
 * error would report. Everything therefore starts from the current profile.
 *
 * Pure, so the round-trip (server row -> form state -> payload) is testable.
 */

// Exactly two profile categories. Mirrors api/_lib/registrationStatus.js and
// src/constants/app.js — keep the three in step. The retired self_directed /
// enthusiast / sebi_ra / sebi_ria codes are mapped (never written), so a
// profile row that predates the data migration still renders correctly.
export const REG_PUBLISHER = "verified_research_publisher";
export const REG_CONTRIBUTOR = "independent_market_contributor";
export const REG_STATUSES = [REG_PUBLISHER, REG_CONTRIBUTOR];

export const REG_LABELS = {
  [REG_PUBLISHER]: "Verified Research Publisher",
  [REG_CONTRIBUTOR]: "Independent Market Contributor",
};

export const REG_DESCRIPTIONS = {
  [REG_PUBLISHER]:
    "SEBI-registered Research Analysts and Research Entities who publish professional investment research.",
  [REG_CONTRIBUTOR]:
    "Investors and market participants who share independent views, analysis and commentary on companies and markets.",
};

const LEGACY_REG_STATUS = {
  sebi_ra: REG_PUBLISHER,
  self_directed: REG_CONTRIBUTOR,
  enthusiast: REG_CONTRIBUTOR,
  sebi_ria: REG_CONTRIBUTOR,
};

/** Any stored value (current, legacy, or missing) -> a current category code. */
export function normalizeRegStatus(status) {
  if (REG_STATUSES.includes(status)) return status;
  return LEGACY_REG_STATUS[status] || REG_CONTRIBUTOR;
}

/** Whether a status is Verified Research Publisher — the only one with SEBI fields. */
export function isSebiStatus(status) {
  return normalizeRegStatus(status) === REG_PUBLISHER;
}

/**
 * Server profile row -> form state. Maps the row's snake_case columns onto
 * the camelCase names the save endpoint expects, so the form round-trips
 * without a second mapping in the screen.
 */
export function profileToForm(profile) {
  const p = profile || {};
  const status = normalizeRegStatus(p.registration_status);
  return {
    firstName: p.first_name || "",
    lastName: p.last_name || "",
    bio: p.bio || "",
    twitter: p.twitter_url || "",
    linkedin: p.linkedin_url || "",
    telegram: p.telegram_url || "",
    instagram: p.instagram_url || "",
    avatarColor: p.avatar_color || "",
    registrationStatus: status,
    sebiNum: p.sebi_reg_number || "",
    sebiTill: p.sebi_reg_valid_till || "",
    sebiFirm: p.sebi_firm_name || "",
  };
}

/**
 * Form state -> the payload profile-edit-save expects.
 *
 * SEBI fields are dropped for an Independent Market Contributor rather than sent blank:
 * the server already nulls them for non-SEBI statuses, and sending stale
 * values would misrepresent what the user claimed.
 */
export function buildProfilePayload(form) {
  const f = form || {};
  const status = normalizeRegStatus(f.registrationStatus);
  const payload = {
    firstName: String(f.firstName || "").trim(),
    lastName: String(f.lastName || "").trim(),
    bio: String(f.bio || "").trim(),
    twitter: String(f.twitter || "").trim(),
    linkedin: String(f.linkedin || "").trim(),
    telegram: String(f.telegram || "").trim(),
    instagram: String(f.instagram || "").trim(),
    avatarColor: f.avatarColor || null,
    registrationStatus: status,
  };
  if (isSebiStatus(status)) {
    payload.sebiNum = String(f.sebiNum || "").trim();
    payload.sebiTill = String(f.sebiTill || "").trim();
    payload.sebiFirm = String(f.sebiFirm || "").trim();
  }
  return payload;
}

// 300, not some other round number — matches the web's textarea maxLength
// exactly (Profile.jsx: both the inline hero editor and ProfileEditModal),
// so a bio written right up against the limit on one client isn't truncated
// or rejected on the other.
export const BIO_MAX_LENGTH = 300;

/**
 * Returns an error string, or null when the form can be saved.
 *
 * No SEBI-number requirement here: the web's own save paths (Profile.jsx
 * saveEdit / ProfileEditModal.save) never require one even when the
 * registration status is a SEBI-registered kind — the field is optional
 * there, so mobile blocking on it would let a user complete this edit on
 * web but not on the phone for the identical input.
 */
export function validateProfile(form) {
  const f = form || {};
  if (!String(f.firstName || "").trim()) return "First name is required.";
  if (String(f.bio || "").length > BIO_MAX_LENGTH) return `Bio must be ${BIO_MAX_LENGTH} characters or fewer.`;
  return null;
}
