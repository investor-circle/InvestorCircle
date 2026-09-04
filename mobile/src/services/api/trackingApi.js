import { callApi } from "../api";

/**
 * Tracking = following an investor, so their ideas reach you and their
 * activity feeds the "tracked creator" boosts in the feed and Pulse rankings
 * (see src/utils/feed.js and trending.js, which already accept
 * trackedCreatorIds but had no way to be given any on mobile until now).
 *
 * Distinct from a CONNECTION, which is mutual and requires acceptance.
 * Tracking is one-way and needs no approval — mirrors the web app.
 */

/** Start tracking an investor. */
export async function trackInvestor(targetId) {
  const api = await callApi("/data?resource=tracking", {
    method: "POST",
    body: { action: "track", targetId },
  });
  return api.ok;
}

/** Stop tracking an investor. */
export async function untrackInvestor(targetId) {
  const api = await callApi("/data?resource=tracking", {
    method: "POST",
    body: { action: "untrack", targetId },
  });
  return api.ok;
}

/** Whether the signed-in user tracks targetId. */
export async function getTrackingStatus(targetId) {
  const api = await callApi(
    `/data?resource=tracking&action=status&targetId=${encodeURIComponent(targetId)}`
  );
  return api.ok ? !!api.data.tracking : false;
}

/** Ids of everyone the signed-in user tracks. Unpaginated; small payload. */
export async function getMyTracking() {
  const api = await callApi("/data?resource=tracking");
  return api.ok ? api.data.tracking || [] : [];
}

/** Cheap counts for the Network tab badges — no list payload. */
export async function getTrackingCounts() {
  const api = await callApi("/data?resource=tracking&action=counts");
  return api.ok
    ? { trackersCount: api.data.trackersCount || 0, trackingCount: api.data.trackingCount || 0 }
    : { trackersCount: 0, trackingCount: 0 };
}

/** People the signed-in user tracks. */
export async function getMyTrackingList(limit = 20, offset = 0, sort = "date_desc", q = "") {
  const api = await callApi(
    `/data?resource=tracking&action=tracking-list&limit=${limit}&offset=${offset}&sort=${sort}&q=${encodeURIComponent(q)}`
  );
  return api.ok ? { people: api.data.people || [], hasMore: !!api.data.hasMore } : { people: [], hasMore: false };
}

/** People who track the signed-in user. */
export async function getMyTrackers(limit = 20, offset = 0, sort = "date_desc", q = "") {
  const api = await callApi(
    `/data?resource=tracking&action=trackers&limit=${limit}&offset=${offset}&sort=${sort}&q=${encodeURIComponent(q)}`
  );
  return api.ok ? { people: api.data.people || [], hasMore: !!api.data.hasMore } : { people: [], hasMore: false };
}

/** Batched credibility stats for a set of uids. Feeds computeIci(). */
export async function getInvestorIciBatch(uids) {
  const api = await callApi("/data?resource=lookups", {
    method: "POST",
    body: { action: "investor-ici-batch", uids },
  });
  return api.ok ? api.data.stats || [] : [];
}
