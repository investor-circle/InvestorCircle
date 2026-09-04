/**
 * Profile-picture constraints.
 *
 * These MUST match the web app, in both directions:
 *
 *  - The server (api/_lib/handlers/lookups.js, action=avatar-upload) rejects
 *    anything over MAX_AVATAR_DATA_URL_LENGTH or not matching its data-URI
 *    regex. Both values are mirrored here so mobile fails early with a clear
 *    message instead of round-tripping to a 400.
 *  - The compression targets (256px square, JPEG q0.72) are the web's, from
 *    src/utils/image.js. They matter because the picture is stored as a
 *    data: URI directly on user_profiles.avatar_url — there is no blob
 *    storage in this app, so every byte is a byte in the Neon database.
 *
 * Because both clients write the same column, a picture uploaded from either
 * one is the picture everywhere: no sync step, and no second copy to drift.
 *
 * Pure; no React Native imports, so the limits are testable directly.
 */

/** Square output side, in pixels. Web: MAX_DIMENSION in src/utils/image.js. */
export const MAX_DIMENSION = 256;

/** JPEG quality. Web: JPEG_QUALITY. */
export const JPEG_QUALITY = 0.72;

/** Reject absurd source files before doing any work. Web: MAX_AVATAR_SOURCE_BYTES. */
export const MAX_AVATAR_SOURCE_BYTES = 8 * 1024 * 1024;

/**
 * Hard server-side cap on the encoded data URI, in characters.
 * Web/server: MAX_AVATAR_DATA_URL_LENGTH in lookups.js (~95KB binary).
 */
export const MAX_AVATAR_DATA_URL_LENGTH = 130000;

/** The exact shape the server accepts. Server: AVATAR_DATA_URL_RE. */
export const AVATAR_DATA_URL_RE = /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/;

/** Build the data URI the upload endpoint expects from a base64 payload. */
export function toDataUrl(base64, mime = "image/jpeg") {
  if (!base64 || typeof base64 !== "string") return null;
  // expo-image-manipulator returns bare base64; a caller that already has a
  // full data URI should not get a doubled prefix.
  if (base64.startsWith("data:")) return base64;
  return `data:${mime};base64,${base64}`;
}

/**
 * Validate a source file before compressing it.
 * @returns an error string, or null when acceptable.
 */
export function validateSource({ fileSize, mimeType } = {}) {
  if (mimeType && !String(mimeType).startsWith("image/")) return "Please choose an image file.";
  if (fileSize && fileSize > MAX_AVATAR_SOURCE_BYTES) return "That image is too large (max 8MB).";
  return null;
}

/**
 * Validate the encoded result against exactly what the server will check.
 * @returns an error string, or null when it will be accepted.
 */
export function validateDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return "Could not process that image.";
  if (!AVATAR_DATA_URL_RE.test(dataUrl)) return "That image format isn't supported.";
  if (dataUrl.length > MAX_AVATAR_DATA_URL_LENGTH) {
    return "That image is still too large after compression. Try a smaller or simpler picture.";
  }
  return null;
}

/**
 * Quality steps to try, in order, when the first encode lands over the cap.
 *
 * A 256px JPEG at q0.72 is normally far inside the limit, but a high-detail
 * photo can still exceed it. Retrying at lower quality is better than telling
 * someone their picture is unusable — and it keeps the SIZE rule identical to
 * the web's rather than quietly raising the ceiling for mobile.
 */
export const QUALITY_STEPS = [JPEG_QUALITY, 0.5, 0.35, 0.2];

/** Best-effort display source for an <Image>, or null when there is none. */
export function avatarSource(profile) {
  const url = profile?.avatar_url || profile?.avatarUrl;
  return typeof url === "string" && url ? { uri: url } : null;
}
