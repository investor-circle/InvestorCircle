/**
 * Deep-link parsing.
 *
 * The web app is a HashRouter SPA, so its shareable URLs put the route in the
 * fragment: https://myinvestorcircle.com/#/investor/:username/reco/:id.
 * Android intent filters match scheme/host/path only — the fragment is not a
 * path, so expo-router would route such a link to "/" and silently drop the
 * target. Hence we parse it ourselves and navigate deliberately.
 *
 * Handles the hash form, the equivalent bare-path form, and the app's own
 * custom scheme (myinvestorcircle://…). Pure and side-effect free so it can
 * be unit tested.
 *
 * @returns {{path: string, username?: string} | null}
 */
export function parseDeepLink(url) {
  if (!url || typeof url !== "string") return null;

  // Strip scheme + host, keeping whatever route the link is pointing at,
  // whether it lives in the fragment or the path.
  let route = url;
  const hashAt = route.indexOf("#");
  if (hashAt !== -1) {
    route = route.slice(hashAt + 1);
  } else {
    const schemeMatch = route.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//);
    if (schemeMatch) {
      const isHttp = /^https?$/i.test(schemeMatch[1]);
      route = route.slice(schemeMatch[0].length);
      if (isHttp) {
        // http(s) links carry a host that is not part of the route.
        const slashAt = route.indexOf("/");
        route = slashAt === -1 ? "" : route.slice(slashAt);
      }
      // A custom-scheme link (myinvestorcircle://investor/alice) has NO host:
      // everything after "://" is already the route, so stripping to the
      // first slash here would silently eat the first segment.
    }
  }

  route = route.split("?")[0].replace(/\/+$/, "");
  if (!route.startsWith("/")) route = "/" + route;

  const parts = route.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  // /investor/:username/reco/:id  → the idea, remembering whose it is so the
  // screen can fall back to that profile if the idea can't be resolved.
  if (parts[0] === "investor" && parts[1]) {
    if (parts[2] === "reco" && parts[3]) {
      return { path: `/reco/${encodeURIComponent(parts[3])}`, username: parts[1] };
    }
    return { path: `/investor/${encodeURIComponent(parts[1])}` };
  }

  // /reco/:id — the app's own internal shape, also accepted from outside.
  if (parts[0] === "reco" && parts[1]) {
    return { path: `/reco/${encodeURIComponent(parts[1])}` };
  }

  // /circle/:id and a few top-level screens, so links from notifications or
  // other clients land somewhere sensible rather than nowhere.
  // /ticker/:symbol — market consensus for one security.
  if (parts[0] === "ticker" && parts[1]) {
    return { path: `/ticker/${encodeURIComponent(parts[1].toUpperCase())}` };
  }

  // /circle/:slug — an invite link. These always carry a SLUG (the web's
  // gotoCircle hands out `#/circle/:slug`), whereas the app's own Circle
  // route takes a group id, so following one used to open a screen that
  // looked up a Circle whose "id" was really a slug and found nothing.
  if (parts[0] === "circle" && parts[1] && parts[1] !== "new" && parts[1] !== "manage") {
    return { path: `/circle/s/${encodeURIComponent(parts[1])}` };
  }
  if (["notifications", "network", "circles", "portfolio", "people", "settings"].includes(parts[0])) {
    return { path: `/${parts[0]}` };
  }

  return null;
}
