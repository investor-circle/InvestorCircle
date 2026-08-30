import { callApi } from "../api";

/**
 * Recommendations the caller has tracked (with tracking/invested metadata).
 * Mirrors src/db.js's getMyTrackedRecos(). Rows are snake_case from the
 * server — map via mapTrackedReco (src/utils/feed-ish) before rendering.
 */
export async function getMyTrackedRecos() {
  const api = await callApi("/data?resource=engagement&action=my-tracked-recos");
  return api.ok ? api.data.recos || [] : [];
}
