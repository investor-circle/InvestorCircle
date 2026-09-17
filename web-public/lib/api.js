// Server-side data access for this app. Every function here calls the main
// app's already-public, unauthenticated /api/data?resource=public-ideas
// endpoint — the one file (api/_lib/handlers/public-ideas.js, in the main
// repo) that's allowed to query ic_recommendations for anonymous/crawler
// traffic, with its own test asserting every statement filters
// is_public = true. This app deliberately does not import that handler or
// hold a database credential — see README.md.
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
