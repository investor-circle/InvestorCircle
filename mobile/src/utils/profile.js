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

export const REG_STATUSES = ["self_directed", "sebi_ra", "sebi_ria"];

export const REG_LABELS = {
  self_directed: "Self-directed investor",
  sebi_ra: "SEBI Registered Analyst",
  sebi_ria: "SEBI Registered Investment Adviser",
};

/** Whether a registration status is one of the SEBI-registered kinds. */
export function isSebiStatus(status) {
  return status === "sebi_ra" || status === "sebi_ria";
}

/**
 * Server profile row -> form state. Maps the row's snake_case columns onto
 * the camelCase names the save endpoint expects, so the form round-trips
 * without a second mapping in the screen.
 */
export function profileToForm(profile) {
  const p = profile || {};
  const status = REG_STATUSES.includes(p.registration_status) ? p.registration_status : "self_directed";
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
 * SEBI fields are dropped for a self-directed user rather than sent blank:
 * the server already nulls them for non-SEBI statuses, and sending stale
 * values would misrepresent what the user claimed.
 */
export function buildProfilePayload(form) {
  const f = form || {};
  const status = REG_STATUSES.includes(f.registrationStatus) ? f.registrationStatus : "self_directed";
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

/** Returns an error string, or null when the form can be saved. */
export function validateProfile(form) {
  const f = form || {};
  if (!String(f.firstName || "").trim()) return "First name is required.";
  if (String(f.bio || "").length > 500) return "Bio must be 500 characters or fewer.";
  if (isSebiStatus(f.registrationStatus) && !String(f.sebiNum || "").trim()) {
    return "SEBI registration number is required for a registered status.";
  }
  return null;
}
