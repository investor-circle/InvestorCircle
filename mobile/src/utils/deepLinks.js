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
  if (
    ["notifications", "network", "circles", "portfolio", "people", "settings", "about", "contact"].includes(parts[0])
  ) {
    return { path: `/${parts[0]}` };
  }
  // The web calls this route /market and the page "Market Insights"; the app
  // uses the same path so a shared link lands on the same thing.
  if (parts[0] === "market") return { path: "/market" };

  return null;
}

/**
 * The referral code from an invite link, or null.
 *
 * An invite is `https://myinvestorcircle.com/?ref=alice` — a QUERY parameter
 * on the site root, not a route, which is why parseDeepLink (which strips the
 * query and needs a path) cannot see it and why following one on a phone used
 * to open the app with the invitation silently discarded. The referrer got no
 * credit and the new member never became connected to the person who invited
 * them.
 *
 * Same normalisation the web does in App.jsx (lower-cased, trimmed), and the
 * same shape the server matches on: a username, so anything that cannot be one
 * is rejected here rather than stored and sent.
 */
const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

export function parseReferral(url) {
  if (!url || typeof url !== "string") return null;
  // Take the LAST ?ref= — a link can carry a query before the fragment and
  // another inside it, and the fragment is the more specific one.
  const matches = [...url.matchAll(/[?&]ref=([^&#\s]*)/g)];
  if (!matches.length) return null;
  let code;
  try {
    code = decodeURIComponent(matches[matches.length - 1][1]);
  } catch (_) {
    return null; // a malformed escape — not a username either way
  }
  code = code.trim().toLowerCase();
  return USERNAME_RE.test(code) ? code : null;
}

/**
 * The Firebase oobCode from a password-reset link, or null.
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS: the Android intent filter claims
 * https://myinvestorcircle.com with autoVerify and NO path restriction (see
 * app.json), so the app intercepts every link to the site — including the
 * reset link api/reset.py emails out, which is
 * `https://myinvestorcircle.com/?mode=resetPassword&oobCode=…`.
 *
 * parseDeepLink() cannot see it (a query on the root, no route), so tapping
 * that link on a phone with the app installed opened the app and dropped the
 * code: the person could not reset their password from their phone at all,
 * even if they only ever use the web app. Handling it here is what makes the
 * app a working destination for the link it has taken over.
 */
export function parsePasswordReset(url) {
  if (!url || typeof url !== "string") return null;
  if (!/[?&]mode=resetPassword(?:[&#]|$)/.test(url)) return null;
  const m = url.match(/[?&]oobCode=([^&#\s]+)/);
  if (!m) return null;
  let code;
  try {
    code = decodeURIComponent(m[1]);
  } catch (_) {
    code = m[1]; // a code we can't decode is still worth letting Firebase judge
  }
  return code.trim() || null;
}

/**
 * True when this is one of our own web links that the app has taken over but
 * cannot render itself — a creator claim link, Market Insights, the privacy
 * policy, or any page added to the web app after this build shipped.
 *
 * The same over-broad intent filter that broke password reset silently
 * swallows all of these too: the app opens, nothing happens, and the link
 * appears broken. Sending them to a browser tab instead means an unhandled
 * link always goes SOMEWHERE — and that a page added to the web later keeps
 * working on phones without needing a new app build.
 *
 * Deliberately excludes the bare site root: tapping a plain link to the site
 * should open the app, not bounce straight back out to a browser.
 */
export function isExternalWebLink(url) {
  if (!url || typeof url !== "string") return false;
  if (!/^https?:\/\//i.test(url)) return false; // our own scheme is never external
  if (parseDeepLink(url) || parseReferral(url) || parsePasswordReset(url)) return false;

  const afterHost = url.replace(/^https?:\/\/[^/?#]*/i, "");
  // "", "/", "/#", "/#/" — the site root in its various spellings.
  return !/^\/?(#\/?)?$/.test(afterHost);
}
