/**
 * api/sitemap.js — sitemap.xml, served at /sitemap.xml via vercel.json
 *
 * Lists only what is meant to be indexed: the home page and one URL per stock
 * that has at least one public idea. Individual idea pages are deliberately
 * absent — they exist so a shared link renders properly, but a few hundred
 * words each would be thin content competing with the stock page that
 * aggregates them. Profile pages are absent for a different reason: they are
 * not indexed at all (see public/robots.txt).
 *
 * Stock URLs point at /security/:symbol (web-public/, a separate SSR Next.js
 * app), not /stock/:symbol (api/seo.js) — the latter still resolves and is
 * not retired, but its own canonical tag now defers to /security/:symbol, so
 * listing /stock/:symbol here too would submit the same content twice under
 * two URLs.
 *
 * The symbol list comes from public-ideas' `symbols` action, which returns
 * tickers and counts and nothing else — no author, no thesis — so the sitemap
 * is not itself worth scraping.
 */

import handlePublicIdeas from './_lib/handlers/public-ideas.js';

const SITE = 'https://myinvestorcircle.com';

const escXml = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const iso = (d) => {
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10);
};

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).send('Method not allowed'); return; }

  let symbols = [];
  try {
    let body = null;
    await handlePublicIdeas(
      { method: 'GET', query: { action: 'symbols' } },
      { setHeader() {}, status() { return this; }, json(b) { body = b; return this; }, end() { return this; } }
    );
    symbols = body?.symbols || [];
  } catch (err) {
    // A sitemap that 500s tells Google nothing useful; one listing just the
    // home page is still valid and still true.
    console.error('[sitemap]', err);
  }

  const urls = [
    `  <url>\n    <loc>${SITE}/</loc>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>`,
    ...symbols.map((s) => {
      const last = iso(s.last_posted);
      return `  <url>\n    <loc>${SITE}/security/${encodeURIComponent(escXml(s.symbol))}</loc>${
        last ? `\n    <lastmod>${last}</lastmod>` : ''
      }\n    <changefreq>weekly</changefreq>\n  </url>`;
    }),
  ];

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
  );
}
