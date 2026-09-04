import { notifyPublicContacts } from "./api/recommendationsApi";
import { recoUrl, WEB_ORIGIN } from "../utils/links";
import { sendEmail, sendPush } from "./notify";

/**
 * Announce a newly posted PUBLIC idea to the author's connections.
 *
 * A direct/Circle share is delivered server-side (deliverToRecipients writes
 * the delivery rows and their notifications). A PUBLIC idea has no delivery
 * rows — nobody is a recipient — so the fan-out to the author's contacts is
 * something the client has to ask for. The web does it inline in its create
 * flow (Recommendations.jsx); mobile did not do it at all, which meant an
 * idea posted from the phone was seen by nobody unless they happened to
 * scroll the public feed.
 *
 * Three channels, matching the web exactly and in the same order:
 *   1. in-app notifications, fanned out server-side in one call
 *   2. push, per contact
 *   3. email, per contact
 *
 * Fire-and-forget by design: the author has already seen their idea post,
 * and a failed notification must never surface as a failed post. Nothing
 * here throws.
 */
export function announcePublicReco({ reco, recoId, me, contacts }) {
  const id = String(recoId || "");
  const list = (contacts || []).filter((c) => c && c.user_id);
  if (!id || !list.length) return;

  const username = me?.username || "";
  const deepLink = username ? `/investor/${username}/reco/${id}` : null;
  // The email still carries a full URL of its own; only push has its
  // destination resolved server-side.
  // One definition of what a public idea link looks like (services/api.js),
  // rather than a second hand-built copy that can drift from the share
  // sheet's — or from the host the site is actually served on.
  // The author is the sender, and the setup gate guarantees they have a
  // username, so this resolves in practice. The site root is the fallback
  // rather than a malformed profile path, which is what this used to build.
  const url = recoUrl(username, id) || WEB_ORIGIN;

  // One server call for every contact, rather than one per contact.
  notifyPublicContacts(
    id,
    list.map((c) => c.user_id),
    {
      ticker: reco.ticker,
      assetName: reco.assetName,
      recommenderUsername: username,
      recoId: id,
    }
  ).catch(() => {});

  for (const c of list) {
    // Content is composed server-side from the type (see notify.js): the
    // caller cannot put a price or an amount into a lock-screen body even
    // by accident.
    try {
      sendPush(c.user_id, { type: "contact_recommendation", deepLink });
    } catch (_) {
      /* one unreachable contact must not stop the rest */
    }
  }

  for (const c of list) {
    if (!c.email) continue;
    try {
      sendEmail("contact_recommendation", {
        to_email: c.email,
        from_name: me?.full_name || "Someone in your circle",
        from_username: username,
        ticker: reco.ticker,
        asset_name: reco.assetName,
        reco_type: reco.recType || "Buy",
        entry_price: reco.priceAt ? `₹${Number(reco.priceAt).toLocaleString("en-IN")}` : "",
        conviction: reco.conviction || "",
        reco_url: url,
      });
    } catch (_) {
      /* as above */
    }
  }
}
