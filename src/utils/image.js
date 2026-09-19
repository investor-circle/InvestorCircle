/**
 * Client-side profile-picture crop + compression — turns a user-selected
 * File into a small, pre-cropped JPEG data: URI before it's sent to
 * api/_lib/handlers/lookups.js (action=avatar-upload), which stores it as a
 * data: URI directly on user_profiles.avatar_url. Keeping this small
 * matters: there's no blob/object storage in this app (see CLAUDE.md), so
 * every byte here is a byte in the free-tier Neon database.
 *
 * The actual crop UI (AvatarCropModal, Profile.jsx) drives these three
 * functions: validate the file, decode it into an <img>, then encode a
 * user-chosen square region of it.
 */
const MAX_DIMENSION = 256;
const JPEG_QUALITY = 0.72;
export const MAX_AVATAR_SOURCE_BYTES = 8 * 1024 * 1024; // reject absurdly large source files outright

/** Throws a friendly Error if `file` isn't a usable image. */
export function validateAvatarFile(file) {
  if (!file || !file.type?.startsWith('image/')) throw new Error('Please choose an image file');
  if (file.size > MAX_AVATAR_SOURCE_BYTES) throw new Error('Image is too large (max 8MB)');
}

/** Decode a File into a loaded <img>, for the interactive crop modal to measure/draw. */
export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')); };
    img.src = url;
  });
}

/** Draw a square region (natural-pixel coords: {sx,sy,sSide}) of an already-
 *  loaded <img> — the user's chosen crop — to a small JPEG data: URI. */
export function cropImageToDataUrl(img, { sx, sy, sSide }) {
  return new Promise((resolve, reject) => {
    const outSide = Math.min(MAX_DIMENSION, sSide);
    const canvas = document.createElement('canvas');
    canvas.width = outSide;
    canvas.height = outSide;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, sx, sy, sSide, sSide, 0, 0, outSide, outSide);
    canvas.toBlob(
      (blob) => {
        if (!blob) { reject(new Error('Could not process image')); return; }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read image'));
        reader.readAsDataURL(blob);
      },
      'image/jpeg',
      JPEG_QUALITY
    );
  });
}
