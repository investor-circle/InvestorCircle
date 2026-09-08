import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { THESIS_MAX_IMAGES, THESIS_MAX_MB, THESIS_TARGET_KB } from "../utils/format";
import { addLog } from "../utils/logger";

/**
 * Pick and compress thesis images, to the web app's exact targets.
 *
 * The web draws each image onto a canvas capped at 1200px on its longer
 * side, then steps JPEG quality down from 0.82 until the encoded result is
 * under THESIS_TARGET_KB (src/utils/format.js compressImage). This does the
 * same with expo-image-manipulator so an idea's images are the same size and
 * shape regardless of which client posted them — they are stored as data:
 * URIs on the recommendation row itself, not in blob storage.
 *
 * Returns { images: string[] } with newly compressed data URIs to append, or
 * { error } with a user-facing message. Never throws. `existingCount` caps
 * how many more can be picked before hitting THESIS_MAX_IMAGES.
 */
export async function pickThesisImages(existingCount) {
  try {
    const remaining = THESIS_MAX_IMAGES - existingCount;
    if (remaining <= 0) return { error: `Maximum ${THESIS_MAX_IMAGES} images allowed.` };

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      return { error: "Photo access is needed to attach a picture. You can enable it in Settings." };
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 1, // compress in the manipulator, not here, so quality can be stepped
      exif: false,
    });
    if (picked.canceled) return { images: [] };

    const assets = (picked.assets || []).slice(0, remaining);
    if (!assets.length) return { images: [] };

    const images = [];
    for (const asset of assets) {
      if (!asset?.uri) continue;
      if (asset.fileSize && asset.fileSize > THESIS_MAX_MB * 1024 * 1024) {
        return { error: `Image "${asset.fileName || "file"}" exceeds ${THESIS_MAX_MB} MB. Please use a smaller file.` };
      }
      images.push(await compressThesisImage(asset));
    }
    return { images };
  } catch (e) {
    addLog("warn", `thesis image: pick/compress failed — ${e?.message}`);
    return { error: "Something went wrong processing that image. Please try uploading it again." };
  }
}

async function compressThesisImage(asset) {
  const maxDim = 1200;
  const { width, height } = asset;
  let resize = null;
  if (width > maxDim || height > maxDim) {
    resize = width >= height ? { resize: { width: maxDim } } : { resize: { height: maxDim } };
  }

  const limit = THESIS_TARGET_KB * 1024 * 1.37; // base64 is ~1.37x the binary size
  let quality = 0.82;
  let out = await ImageManipulator.manipulateAsync(
    asset.uri,
    resize ? [resize] : [],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  while (out.base64.length > limit && quality > 0.2) {
    quality -= 0.1;
    out = await ImageManipulator.manipulateAsync(
      asset.uri,
      resize ? [resize] : [],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
  }
  return `data:image/jpeg;base64,${out.base64}`;
}
