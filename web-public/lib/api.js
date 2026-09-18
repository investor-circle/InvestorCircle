// Server-side data access for this app. Every function here calls one of two
// deliberately-unauthenticated endpoints on the main app: most call
// /api/data?resource=public-ideas (api/_lib/handlers/public-ideas.js, in the
// main repo — the one file allowed to query ic_recommendations for
// anonymous/crawler traffic, with its own test asserting every statement
// filters is_public = true); getDailyPrice below calls
// /api/data?resource=pricing&action=public-daily instead
// (api/_lib/handlers/pricing.js's single-symbol, unauthenticated action —
// see its own header comment for why it's safe to expose: the same
// non-sensitive close/change fields already shown to signed-in users, one
// instrument at a time). This app deliberately does not import either
// handler or hold a database credential — see README.md.
//
// These run inside React Server Components (Node, per-request), never in
// the browser, so a plain relative-free fetch with an absolute base URL is
// required (there is no "current origin" to resolve against).

const API_BASE = process.env.PUBLIC_API_BASE || 'https://myinvestorcircle.com';

async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    // Public data changes when someone posts/closes an idea, not every
    // second — a short revalidate window keeps this from hammering the
    // main API on every crawl hit while still catching same-day changes.
    next: { revalidate: 120 },
  });
  if (!res.ok) return { ok: false, status: res.status, data: null };
  return { ok: true, status: res.status, data: await res.json() };
}

export async function getSecurityByTicker(symbol) {
  const { ok, data } = await getJson(`/api/data?resource=public-ideas&action=by-symbol&symbol=${encodeURIComponent(symbol)}`);
  return ok ? data : null;
}

export async function getIdea(id) {
  const { ok, data } = await getJson(`/api/data?resource=public-ideas&action=idea&id=${encodeURIComponent(id)}`);
  return ok ? data.idea : null;
}

export async function searchIdeas(q) {
  if (!q || !q.trim()) return { query: '', ideas: [] };
  const { ok, data } = await getJson(`/api/data?resource=public-ideas&action=search&q=${encodeURIComponent(q.trim())}`);
  return ok ? data : { query: q, ideas: [] };
}

export async function getRelatedSecurities(symbol) {
  const { ok, data } = await getJson(`/api/data?resource=public-ideas&action=related&symbol=${encodeURIComponent(symbol)}`);
  return ok ? (data.related || []) : [];
}

// Nightly-batch EOD snapshot (never live/intraday — see pricing.js's own
// header comment on where this is written). null when the instrument has no
// stored snapshot, same as every other "graceful degradation" path here.
export async function getDailyPrice(symbol) {
  const { ok, data } = await getJson(`/api/data?resource=pricing&action=public-daily&symbol=${encodeURIComponent(symbol)}`);
  return ok ? (data.price || null) : null;
}
