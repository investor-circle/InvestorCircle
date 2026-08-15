/**
 * Client-side profile-picture compression — resizes/re-encodes an uploaded
 * image to a small JPEG before it's sent to api/_lib/handlers/lookups.js
 * (action=avatar-upload), which stores it as a data: URI directly on
 * user_profiles.avatar_url. Keeping this small matters: there's no blob/object
 * storage in this app (see CLAUDE.md), so every byte here is a byte in the
 * free-tier Neon database.
 */
const MAX_DIMENSION = 256;
const JPEG_QUALITY = 0.72;
export const MAX_AVATAR_SOURCE_BYTES = 8 * 1024 * 1024; // reject absurdly large source files outright

/** Read+downscale an image File to a small square-cropped JPEG data: URI. */
export function compressAvatarFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith('image/')) { reject(new Error('Please choose an image file')); return; }
    if (file.size > MAX_AVATAR_SOURCE_BYTES) { reject(new Error('Image is too large (max 8MB)')); return; }

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      const outSide = Math.min(MAX_DIMENSION, side);

      const canvas = document.createElement('canvas');
      canvas.width = outSide;
      canvas.height = outSide;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, sx, sy, side, side, 0, 0, outSide, outSide);

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
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')); };
    img.src = url;
  });
}
