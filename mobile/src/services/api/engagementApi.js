import { callApi } from "../api";

/**
 * Recommendations the caller has tracked (with tracking/invested metadata).
 * Mirrors src/db.js's getMyTrackedRecos().
 */
export async function getMyTrackedRecos() {
  const api = await callApi("/data?resource=engagement&action=my-tracked-recos");
  return api.ok ? api.data.recos || [] : [];
}

/**
 * Full engagement for one reco — comments, like count, the caller's own
 * reaction, and their tracking/invested state. Mirrors getEngagement().
 * Returns { likes, commentsCount, myReaction, tracking, comments }.
 */
export async function getEngagement(recoId) {
  const api = await callApi(`/data?resource=engagement&action=engagement&recoId=${encodeURIComponent(recoId)}`);
  return api.ok ? api.data : { likes: 0, commentsCount: 0, myReaction: null, tracking: null, comments: [] };
}

/** Like / unlike a reco. reaction = 'like' to like, null to clear. */
export async function reactToReco(recoId, reaction, notifyOpts) {
  const api = await callApi("/data?resource=engagement", {
    method: "POST",
    body: {
      action: "react",
      recoId,
      reaction,
      ...(notifyOpts ? { notify: true, likerName: notifyOpts.likerName } : {}),
    },
  });
  return api.ok;
}

/** Post a comment on a reco. Returns the created comment, or null. */
export async function commentOnReco(recoId, comment) {
  const api = await callApi("/data?resource=engagement", {
    method: "POST",
    body: { action: "comment", recoId, comment },
  });
  return api.ok ? api.data.comment : null;
}

/**
 * Track a reco (bookmark), and optionally mark it invested.
 * isInvested omitted → plain bookmark; boolean → set invested state.
 */
export async function trackReco(recoId, isInvested, investedPrice) {
  const body = { action: "track", recoId };
  if (isInvested !== undefined) {
    body.isInvested = isInvested;
    if (investedPrice !== undefined) body.investedPrice = investedPrice;
  }
  const api = await callApi("/data?resource=engagement", { method: "POST", body });
  return api.ok;
}

/** Untrack (remove bookmark) a reco. */
export async function untrackReco(recoId) {
  const api = await callApi("/data?resource=engagement", {
    method: "POST",
    body: { action: "untrack", recoId },
  });
  return api.ok;
}
