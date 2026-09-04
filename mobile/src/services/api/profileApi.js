import { callApi } from "../api";

/**
 * Full profile save — the same endpoint and payload shape the web Profile
 * page uses (lookups action=profile-edit-save).
 *
 * Note this is a WHOLE-RECORD save, not a patch: the server writes every
 * column it handles from the payload it receives, so a field omitted here is
 * written as null. Callers must therefore send the complete current profile,
 * not just what changed — see buildProfilePayload() in src/utils/profile.js,
 * which exists to make that hard to get wrong.
 *
 * Identity comes from the verified Firebase token; the uid is never sent.
 */
export async function saveProfileEdit(profile) {
  const api = await callApi("/data?resource=lookups", {
    method: "POST",
    body: { action: "profile-edit-save", profile },
  });
  if (!api.ok) throw new Error(api.data?.error || "Could not save");
  return api.data.profile;
}

/**
 * The registration-status options and the message shown to someone claiming
 * SEBI registration. Server-driven so the wording stays in one place.
 */
export async function getRegOptions() {
  const api = await callApi("/data?resource=lookups&action=reg-options");
  return api.ok ? api.data : { options: [], verifyMessage: "" };
}

/**
 * Upload a profile picture.
 *
 * Same endpoint the web uses, writing the same user_profiles.avatar_url
 * column — so a picture set on either client is the picture on both, with no
 * sync step and no second copy that could drift.
 *
 * The server re-validates size and format; the client checks first only so
 * the user gets a useful message instead of a 400.
 */
export async function uploadAvatar(dataUrl) {
  const api = await callApi("/data?resource=lookups", {
    method: "POST",
    body: { action: "avatar-upload", dataUrl },
  });
  if (api.ok) return api.data.avatarUrl;
  throw new Error(api.data?.error || "Could not upload image");
}

/**
 * Username availability. Mirrors checkUsername() in the web app.
 *
 * `excludeId` is the caller's own id so their CURRENT username reads as
 * available to them — without it, editing anything else on the form and
 * leaving the username alone would report it taken.
 */
export async function checkUsername(username, excludeId) {
  const q = `/data?resource=lookups&action=username-available&username=${encodeURIComponent(username)}` +
    (excludeId ? `&excludeId=${encodeURIComponent(excludeId)}` : "");
  const api = await callApi(q);
  return api.ok ? !!api.data.available : false;
}

/**
 * Change the signed-in user's username. Server re-validates the format and
 * re-checks availability against the verified uid, so this cannot take a name
 * that is already someone else's. Mirrors saveUsername() in the web app.
 *
 * Returns null on success, or an error string to show.
 */
export async function saveUsername(username, consent) {
  const body = { action: "username-save", username: String(username || "").trim().toLowerCase() };
  // Sent together only when completing the mandatory setup gate; a plain
  // username change from an already-consented account omits them, so editing
  // your handle never rewrites what you agreed to (see the action's contract
  // in api/_lib/handlers/lookups.js).
  if (consent) {
    body.consentTerms = consent.terms === true;
    body.consentData = consent.data === true;
  }
  const api = await callApi("/data?resource=lookups", { method: "POST", body });
  if (api.ok) return null;
  const err = api.data?.error;
  if (err === "taken") return "That username is already taken.";
  if (err === "invalid_username") return "Use 5–20 lowercase letters, numbers or underscores.";
  return "Could not save your username.";
}

/**
 * Redeem a referral code for the signed-in user (lookups
 * action=process-referral) — the same call the web makes after a signup that
 * arrived through an invite link.
 *
 * The server records the attribution, connects the two members, and sends
 * both referral emails itself. It answers `{ referred: false }` when the code
 * matches nobody, which is an ordinary outcome (a mistyped or stale link),
 * not an error.
 */
export async function processReferral(refUsername) {
  const api = await callApi("/data?resource=lookups", {
    method: "POST",
    body: { action: "process-referral", refUsername },
  });
  return api.ok ? api.data : { referred: false };
}
