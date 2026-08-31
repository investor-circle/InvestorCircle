import { callApi } from "../api";

/** Recommendations delivered to the current user (Feed / "Received"). */
export async function getMyReceivedRecos() {
  const api = await callApi("/data?resource=recommendations&scope=received");
  if (api.ok) return api.data.recommendations || [];
  return [];
}

/** Recommendations posted by the current user ("Made by me"). */
export async function getMyMadeRecos() {
  const api = await callApi("/data?resource=recommendations&scope=made");
  if (api.ok) return api.data.recommendations || [];
  return [];
}

/** Public feed (public recos across the platform), same source as web HomeFeed. */
export async function getPublicFeed() {
  const api = await callApi("/data?resource=lookups&action=public-feed");
  return api.ok ? api.data.recos || [] : [];
}

/** Recos on recos liked/commented by the user's connections ("what your circle is into"). */
export async function getNetworkEngagementFeed(activeConnIds) {
  if (!activeConnIds || activeConnIds.length === 0) return [];
  const api = await callApi(
    `/data?resource=lookups&action=network-engagement-feed&connIds=${encodeURIComponent(activeConnIds.join(","))}`
  );
  return api.ok ? api.data.recos || [] : [];
}

/**
 * Create a new recommendation. Mirrors src/db.js's createRecommendation() —
 * `reco` needs at least { assetName, ticker }; `recipients` is an array of
 * { type: 'user'|'group', id } (empty → a public idea with no direct
 * delivery). Server derives the author from the verified token.
 * Returns { ok, recommendation } | { ok:false, error }.
 */
export async function createRecommendation(reco, recipients = []) {
  const api = await callApi("/data?resource=recommendations", {
    method: "POST",
    body: { action: "create", reco, recipients },
  });
  if (api.ok) return { ok: true, recommendation: api.data.recommendation };
  if (api.denied) return { ok: false, error: "not_authorized" };
  return { ok: false, error: "unreachable" };
}

/**
 * Flag an idea as exited. Server stamps the exit price/source and enforces
 * that only the recommender may do this.
 */
export async function setExitSignal(recommendationId, exitPrice, exitPriceSource) {
  const api = await callApi("/data?resource=recommendations", {
    method: "POST",
    body: { action: "set-exit-signal", recommendationId, exitPrice, exitPriceSource },
  });
  return api.ok ? api.data.recommendation : null;
}

/** Undo an exit signal, clearing all exit fields. */
export async function cancelExitSignal(recommendationId) {
  const api = await callApi("/data?resource=recommendations", {
    method: "POST",
    body: { action: "cancel-exit-signal", recommendationId },
  });
  return api.ok ? api.data.recommendation : null;
}

/** Delete one of the caller's own recommendations (server checks ownership). */
export async function deleteRecommendation(recommendationId) {
  const api = await callApi("/data?resource=recommendations", {
    method: "POST",
    body: { action: "delete-reco", recommendationId },
  });
  return api.ok;
}

/** Update a delivery row (mark invested, react, hide). */
export async function updateDelivery(deliveryId, patch) {
  const api = await callApi("/data?resource=recommendations", {
    method: "POST",
    body: { action: "update-delivery", deliveryId, patch },
  });
  if (api.ok) return api.data.delivery;
  return null;
}
