import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import {
  MAX_DIMENSION,
  QUALITY_STEPS,
  toDataUrl,
  validateSource,
  validateDataUrl,
  MAX_AVATAR_DATA_URL_LENGTH,
} from "../utils/avatar";
import { addLog } from "../utils/logger";

/**
 * Pick and compress a profile picture, to the web app's exact targets.
 *
 * The web resizes to a 256px square JPEG at q0.72 in a canvas before upload
 * (src/utils/image.js). This does the same with expo-image-manipulator, so
 * the picture stored from a phone is the same size and shape as one stored
 * from a browser — which matters because it lives as a data: URI in the
 * database, not in blob storage.
 *
 * Returns { dataUrl } on success, { error } with a user-facing message, or
 * { cancelled: true }. Never throws.
 */
export async function pickAndCompressAvatar() {
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      return { error: "Photo access is needed to choose a picture. You can enable it in Settings." };
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      // Square crop up front, mirroring the web's centre-crop to a square.
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1, // compress in the manipulator, not here, so quality can be stepped
      exif: false,
    });
    if (picked.canceled) return { cancelled: true };

    const asset = picked.assets?.[0];
    if (!asset?.uri) return { error: "Could not read that image." };

    const sourceProblem = validateSource({ fileSize: asset.fileSize, mimeType: asset.mimeType });
    if (sourceProblem) return { error: sourceProblem };

    // Resize once, then step the quality down only if the encoded result is
    // over the server's cap. A 256px JPEG is normally well inside it; this is
    // for the occasional high-detail photo, and it keeps the SIZE RULE the
    // same as the web's rather than raising the ceiling for mobile.
    for (const quality of QUALITY_STEPS) {
      const out = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: MAX_DIMENSION, height: MAX_DIMENSION } }],
        { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      const dataUrl = toDataUrl(out.base64, "image/jpeg");
      if (dataUrl && dataUrl.length <= MAX_AVATAR_DATA_URL_LENGTH) {
        addLog("info", `avatar: encoded at q${quality}, ${dataUrl.length} chars`);
        return { dataUrl };
      }
      addLog("info", `avatar: q${quality} too large (${dataUrl?.length ?? 0} chars), retrying`);
    }

    return {
      error: "That image is still too large after compression. Try a smaller or simpler picture.",
    };
  } catch (e) {
    addLog("warn", `avatar: pick/compress failed — ${e?.message}`);
    return { error: "Could not process that image." };
  }
}

export { validateDataUrl };
