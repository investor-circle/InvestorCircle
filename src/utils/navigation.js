import {
  getProfileNavInfo as dbGetProfileNavInfo
} from "../services/api/profileApi";

export const _profileInfoCache = new Map(); // userId → { username, isSebiApproved }

export async function fetchPublicProfileInfo(userId) {
  if (!userId) return null;
  if (_profileInfoCache.has(userId)) return _profileInfoCache.get(userId);
  try {
    const info = await dbGetProfileNavInfo(userId);
    if (info) {
      _profileInfoCache.set(userId, info);
      return info;
    }
  } catch(_) {}
  return null;
}

/** Navigate to a public profile by username (hash-based routing). */

export function openProfile(username) {
  if (username) window.location.hash = `#/investor/${username}`;
}

/** Look up username from userId then navigate — used for click handlers. */

export async function gotoUserProfile(userId) {
  const info = await fetchPublicProfileInfo(userId);
  if (info?.username) openProfile(info.username);
}
