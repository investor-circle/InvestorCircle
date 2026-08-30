import { callApi } from "../api";

/**
 * Feed configuration + the caller's per-source preferences.
 * Mirrors src/db.js's getFeedConfigAndPrefs() — returns { options, prefs }.
 * Degrades to empty arrays (→ safe defaults in computeEffectiveFeedConfig)
 * when the endpoint fails or the feed_config tables predate this migration.
 */
export async function getFeedConfigAndPrefs() {
  const api = await callApi("/data?resource=lookups&action=feed-config");
  return api.ok ? api.data : { options: [], prefs: [] };
}

/**
 * Recommendation IDs the caller has tracked. Mirrors getMyTrackedRecoIds()
 * — used by the Feed's scoreFeedRec ranking (rank_untracked_first) so a
 * tracked idea is lightly downranked, exactly as on web.
 */
export async function getMyTrackedRecoIds() {
  const api = await callApi("/data?resource=engagement&action=my-tracked");
  return api.ok ? api.data.recoIds || [] : [];
}
