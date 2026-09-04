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
 * Forward an existing idea to more people/Circles. Recipients are
 * { type: 'user'|'group', id } — the server re-runs the same Circle
 * authorization check the create flow uses, so a forward can never widen
 * access beyond what the forwarder is entitled to share.
 */
export async function forwardRecommendation(recommendationId, recipients) {
  const api = await callApi("/data?resource=recommendations", {
    method: "POST",
    body: { action: "forward", recommendationId, recipients },
  });
  if (api.ok) return { ok: true };
  return { ok: false, error: api.denied ? "not_authorized" : "unreachable" };
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

// NOT EXPOSED: deleting a recommendation.
//
// The server has a delete-reco action (api/_lib/handlers/recommendations.js)
// and the web app has an unwired handler for it, but neither client offers a
// way to reach it: by product decision an idea is permanent once posted.
// That is what makes a track record mean anything — nobody can quietly erase
// the calls that went wrong. An author closes a position with setExitSignal()
// instead, which records the outcome rather than hiding it.
//
// Do not add a deleteRecommendation() wrapper here to "restore parity" with
// the endpoint. If a post-publish correction window is ever introduced it
// will be a deliberate feature with its own time limit and rules.

/**
 * Fan out in-app notifications for a newly posted PUBLIC idea.
 *
 * A public idea creates no delivery rows, so nobody is notified server-side
 * when it is posted — the author's connections only find out if the client
 * asks. Mirrors notifyPublicContacts() in the web app.
 */
export async function notifyPublicContacts(recommendationId, contactIds, metadata) {
  const api = await callApi("/data?resource=recommendations", {
    method: "POST",
    body: { action: "notify-public-contacts", recommendationId, contactIds, metadata },
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

/**
 * Remove a received idea from your own feed.
 *
 * This deletes only the DELIVERY — your copy — leaving the idea itself and
 * everyone else's copy untouched. It is NOT a way to delete an idea (see the
 * note above): an author cannot remove what they posted, and a recipient
 * hiding their own copy changes nothing for anyone else. Mirrors
 * deleteDelivery() in the web app.
 */
export async function dismissDelivery(deliveryId) {
  const api = await callApi("/data?resource=recommendations", {
    method: "POST",
    body: { action: "delete-delivery", deliveryId },
  });
  return api.ok;
}

/**
 * The author's username for one idea, for building its public link.
 *
 * The feed payloads only carry `recommender_username` on the public-feed
 * shape, so an idea reached any other way (a received delivery, a tracked
 * idea, a deep link) has no username to build a URL from — and the share
 * sheet then fell back to the site root, handing someone a link to the
 * homepage instead of the idea. The web has always looked it up for exactly
 * this reason (getRecommenderUsername, used by its share popover).
 */
export async function getRecommenderUsername(recoId) {
  const api = await callApi(
    `/data?resource=lookups&action=reco-recommender-username&recoId=${encodeURIComponent(recoId)}`
  );
  return api.ok ? api.data.username || null : null;
}
