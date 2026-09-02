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
