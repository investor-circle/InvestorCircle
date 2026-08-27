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

/** Update a delivery row (mark invested, react, hide). */
export async function updateDelivery(deliveryId, patch) {
  const api = await callApi("/data?resource=recommendations", {
    method: "POST",
    body: { action: "update-delivery", deliveryId, patch },
  });
  if (api.ok) return api.data.delivery;
  return null;
}
