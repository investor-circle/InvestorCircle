/**
 * api/_lib/handlers/public-ideas.js — public idea/stock resource handler
 *
 * Dispatched by api/data.js (resource=public-ideas). Deliberately
 * UNAUTHENTICATED: it backs the pages a signed-out visitor, a search engine
 * and a link-preview crawler can all reach — /stock/:symbol, /idea/:id and
 * /search.
 *
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE: every statement below filters
 * `is_public = true`. A private idea is shared with named people on the
 * platform and must never appear in anything served from here, whatever
 * query string arrives. public-ideas.test.js reads the SQL each action emits
 * and fails if any statement touching ic_recommendations lacks that filter,
 * so the guarantee survives someone adding a fifth action later.
 *
 * Author fields are limited to what a public idea has to show to be worth
 * anything — display name, username, avatar. No email, no SEBI registration,
 * no consent or claim columns are read or returned. Profile *pages* stay out
 * of the search index (see public/robots.txt); an author's name on an idea
 * is not the same thing as publishing their profile.
 *
 * The status/return expression below is a byte-for-byte copy of the one in
 * public-profile.js, repeated in each query rather than shared. The Neon HTTP
 * driver's tagged template turns every ${} into a bound PARAMETER, not SQL
 * text, so query fragments cannot be composed — and reimplementing the maths
 * in JavaScript would fork a calculation CLAUDE.md marks as sensitive. The
 * test asserts all three copies stay identical, which is the part that
 * actually needs guarding.
 *
 * GET ?resource=public-ideas&action=idea&id=<id>
 *   -> 200 { idea } | 404 { error:'not_found' }   (also 404 when private)
 * GET ?resource=public-ideas&action=by-symbol&symbol=<ticker>
 *   -> 200 { symbol, name, sector, summary, ideas: [...] } | 404
 * GET ?resource=public-ideas&action=search&q=<text>
 *   -> 200 { query, ideas: [...] }
 * GET ?resource=public-ideas&action=symbols
 *   -> 200 { symbols: [{ symbol, idea_count, last_posted }] }   (sitemap)
 */

import { sql } from '../auth.js';

// Tickers are short alphanumerics with the odd dot/dash/ampersand (BSE codes,
// "M&M", "BAJAJ-AUTO"). Anything else is not a symbol we hold ideas for, so it
// is rejected before it reaches a query rather than returning an empty set and
// inviting the caller to keep probing.
const SYMBOL_RE = /^[A-Za-z0-9.&_-]{1,24}$/;
const MAX_LIMIT = 60;

/* r.thesis is either legacy plain text or a JSON-encoded rich payload —
   {"__v":"1","text":"...","images":["data:image/jpeg;base64,..."]} — written
   by ThesisEditor/serializeThesis (src/features/recommendations/Recommendations.jsx).
   Every consumer of this handler (web-public's IdeaCard/generateMetadata,
   api/_lib/seo.js's /stock/:symbol page) treats `thesis` as plain display
   text with no access to the app's parseThesis/ThesisRenderer, so the raw
   JSON — base64 images included — must never leave here. Images are
   dropped entirely: there is no public-page image story yet (see CLAUDE.md's
   "Per-idea share IMAGES" deferred note), so exposing the data URI would
   only ever be a bug, not a missing feature. */
function plainThesisText(raw) {
  if (!raw || raw === '—') return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.__v === '1') return parsed.text || null;
  } catch {}
  return String(raw);
}

const clampLimit = (raw, fallback) => {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, MAX_LIMIT);
};

export default async function handlePublicIdeas(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const action = String(req.query?.action || '').trim();

  try {
    if (action === 'idea')      return await oneIdea(req, res);
    if (action === 'by-symbol') return await bySymbol(req, res);
    if (action === 'search')    return await search(req, res);
    if (action === 'symbols')   return await symbols(req, res);
    res.status(400).json({ error: 'Unknown or missing action' });
  } catch (err) {
    console.error('[public-ideas]', action, err);
    res.status(500).json({ error: 'server_error' });
  }
}

/* One idea. A private id and a non-existent id both 404 — telling them apart
   would confirm the id exists, which is a probe worth denying. */
async function oneIdea(req, res) {
  const id = String(req.query?.id || '').trim();
  if (!id || id.length > 64) { res.status(400).json({ error: 'id is required' }); return; }

  const rows = await sql`
    SELECT
      r.id, r.ticker, r.asset_name, r.asset_class,
      r.recommendation_type, r.sector, r.conviction,
      r.reco_price, r.current_price, r.exit_price,
      r.expiry_price, r.target_price, r.stop_loss,
      r.horizon, r.target_date, r.thesis,
      r.exit_signal, r.exit_date, r.created_at,
      up.full_name AS author_name,
      up.username  AS author_username,
      up.avatar_color, up.avatar_url,
      CASE
        WHEN r.exit_signal                                              THEN 'Closed'
        WHEN r.target_date IS NOT NULL AND r.target_date < CURRENT_DATE THEN 'Expired'
        ELSE                                                                 'Active'
      END AS status,
      ROUND((CASE
        WHEN r.exit_signal THEN
          CASE r.recommendation_type
            WHEN 'Sell' THEN (COALESCE(r.reco_price,0) - COALESCE(r.exit_price, r.current_price, r.reco_price,0)) / NULLIF(r.reco_price,0) * 100
            ELSE             (COALESCE(r.exit_price, r.current_price, r.reco_price,0) - COALESCE(r.reco_price,0)) / NULLIF(r.reco_price,0) * 100
          END
        WHEN r.target_date IS NOT NULL AND r.target_date < CURRENT_DATE THEN
          CASE r.recommendation_type
            WHEN 'Sell' THEN (COALESCE(r.reco_price,0) - COALESCE(r.expiry_price, r.current_price, r.reco_price,0)) / NULLIF(r.reco_price,0) * 100
            ELSE             (COALESCE(r.expiry_price, r.current_price, r.reco_price,0) - COALESCE(r.reco_price,0)) / NULLIF(r.reco_price,0) * 100
          END
        ELSE
          CASE r.recommendation_type
            WHEN 'Sell' THEN (COALESCE(r.reco_price,0) - COALESCE(r.current_price, r.reco_price,0)) / NULLIF(r.reco_price,0) * 100
            ELSE             (COALESCE(r.current_price, r.reco_price,0) - COALESCE(r.reco_price,0)) / NULLIF(r.reco_price,0) * 100
          END
      END)::numeric, 2) AS return_pct
    FROM ic_recommendations r
    JOIN user_profiles up ON up.id = r.recommender_id
    WHERE r.id = ${id} AND r.is_public = true
    LIMIT 1
  `;
  if (!rows[0]) { res.status(404).json({ error: 'not_found' }); return; }
  const idea = { ...rows[0], thesis: plainThesisText(rows[0].thesis) };
  res.status(200).json({ idea });
}

/* Every public idea on one stock, plus the aggregate the hub page leads with. */
async function bySymbol(req, res) {
  const symbol = String(req.query?.symbol || '').trim().toUpperCase();
  if (!SYMBOL_RE.test(symbol)) { res.status(400).json({ error: 'invalid symbol' }); return; }
  const limit = clampLimit(req.query?.limit, MAX_LIMIT);

  const [ideas, summary] = await Promise.all([
    sql`
      SELECT
        r.id, r.ticker, r.asset_name, r.asset_class,
        r.recommendation_type, r.sector, r.conviction,
        r.reco_price, r.current_price, r.exit_price,
        r.expiry_price, r.target_price, r.stop_loss,
        r.horizon, r.target_date, r.thesis,
        r.exit_signal, r.exit_date, r.created_at,
        up.full_name AS author_name,
        up.username  AS author_username,
        up.avatar_color, up.avatar_url,
        CASE
          WHEN r.exit_signal                                              THEN 'Closed'
          WHEN r.target_date IS NOT NULL AND r.target_date < CURRENT_DATE THEN 'Expired'
          ELSE                                                                 'Active'
        END AS status,
        ROUND((CASE
          WHEN r.exit_signal THEN
            CASE r.recommendation_type
              WHEN 'Sell' THEN (COALESCE(r.reco_price,0) - COALESCE(r.exit_price, r.current_price, r.reco_price,0)) / NULLIF(r.reco_price,0) * 100
              ELSE             (COALESCE(r.exit_price, r.current_price, r.reco_price,0) - COALESCE(r.reco_price,0)) / NULLIF(r.reco_price,0) * 100
            END
          WHEN r.target_date IS NOT NULL AND r.target_date < CURRENT_DATE THEN
            CASE r.recommendation_type
              WHEN 'Sell' THEN (COALESCE(r.reco_price,0) - COALESCE(r.expiry_price, r.current_price, r.reco_price,0)) / NULLIF(r.reco_price,0) * 100
              ELSE             (COALESCE(r.expiry_price, r.current_price, r.reco_price,0) - COALESCE(r.reco_price,0)) / NULLIF(r.reco_price,0) * 100
            END
          ELSE
            CASE r.recommendation_type
              WHEN 'Sell' THEN (COALESCE(r.reco_price,0) - COALESCE(r.current_price, r.reco_price,0)) / NULLIF(r.reco_price,0) * 100
              ELSE             (COALESCE(r.current_price, r.reco_price,0) - COALESCE(r.reco_price,0)) / NULLIF(r.reco_price,0) * 100
            END
        END)::numeric, 2) AS return_pct
      FROM ic_recommendations r
      JOIN user_profiles up ON up.id = r.recommender_id
      WHERE UPPER(r.ticker) = ${symbol} AND r.is_public = true
      ORDER BY r.created_at DESC
      LIMIT ${limit}
    `,
    sql`
      SELECT
        COUNT(*)                                  AS idea_count,
        COUNT(DISTINCT r.recommender_id)          AS contributor_count,
        COUNT(CASE WHEN r.exit_signal THEN 1 END) AS closed_count,
        MAX(r.created_at)                         AS last_posted,
        MIN(r.created_at)                         AS first_posted,
        MAX(r.asset_name)                         AS asset_name,
        MAX(r.sector)                             AS sector
      FROM ic_recommendations r
      WHERE UPPER(r.ticker) = ${symbol} AND r.is_public = true
    `,
  ]);

  const s = summary[0] || {};
  if (!Number(s.idea_count)) { res.status(404).json({ error: 'not_found' }); return; }

  res.status(200).json({
    symbol,
    name:   s.asset_name || symbol,
    sector: s.sector || null,
    summary: {
      idea_count:        Number(s.idea_count) || 0,
      contributor_count: Number(s.contributor_count) || 0,
      closed_count:      Number(s.closed_count) || 0,
      first_posted:      s.first_posted || null,
      last_posted:       s.last_posted || null,
    },
    ideas: ideas.map(i => ({ ...i, thesis: plainThesisText(i.thesis) })),
  });
}

/* Free-text search across public ideas — ticker, company and thesis. Also the
   endpoint behind the sitelinks searchbox, so it has to answer a bare query
   string with no session. */
async function search(req, res) {
  const q = String(req.query?.q || '').trim();
  if (!q) { res.status(200).json({ query: '', ideas: [] }); return; }
  if (q.length > 80) { res.status(400).json({ error: 'query too long' }); return; }
  const limit = clampLimit(req.query?.limit, 30);
  const like = `%${q}%`;
  const exact = q.toUpperCase();

  const ideas = await sql`
    SELECT
      r.id, r.ticker, r.asset_name, r.asset_class,
      r.recommendation_type, r.sector, r.conviction,
      r.reco_price, r.current_price, r.exit_price,
      r.expiry_price, r.target_price, r.stop_loss,
      r.horizon, r.target_date, r.thesis,
      r.exit_signal, r.exit_date, r.created_at,
      up.full_name AS author_name,
      up.username  AS author_username,
      up.avatar_color, up.avatar_url,
      CASE
        WHEN r.exit_signal                                              THEN 'Closed'
        WHEN r.target_date IS NOT NULL AND r.target_date < CURRENT_DATE THEN 'Expired'
        ELSE                                                                 'Active'
      END AS status,
      ROUND((CASE
        WHEN r.exit_signal THEN
          CASE r.recommendation_type
            WHEN 'Sell' THEN (COALESCE(r.reco_price,0) - COALESCE(r.exit_price, r.current_price, r.reco_price,0)) / NULLIF(r.reco_price,0) * 100
            ELSE             (COALESCE(r.exit_price, r.current_price, r.reco_price,0) - COALESCE(r.reco_price,0)) / NULLIF(r.reco_price,0) * 100
          END
        WHEN r.target_date IS NOT NULL AND r.target_date < CURRENT_DATE THEN
          CASE r.recommendation_type
            WHEN 'Sell' THEN (COALESCE(r.reco_price,0) - COALESCE(r.expiry_price, r.current_price, r.reco_price,0)) / NULLIF(r.reco_price,0) * 100
            ELSE             (COALESCE(r.expiry_price, r.current_price, r.reco_price,0) - COALESCE(r.reco_price,0)) / NULLIF(r.reco_price,0) * 100
          END
        ELSE
          CASE r.recommendation_type
            WHEN 'Sell' THEN (COALESCE(r.reco_price,0) - COALESCE(r.current_price, r.reco_price,0)) / NULLIF(r.reco_price,0) * 100
            ELSE             (COALESCE(r.current_price, r.reco_price,0) - COALESCE(r.reco_price,0)) / NULLIF(r.reco_price,0) * 100
          END
      END)::numeric, 2) AS return_pct
    FROM ic_recommendations r
    JOIN user_profiles up ON up.id = r.recommender_id
    WHERE r.is_public = true
      AND (r.ticker ILIKE ${like} OR r.asset_name ILIKE ${like} OR r.thesis ILIKE ${like})
    ORDER BY
      CASE WHEN UPPER(r.ticker) = ${exact} THEN 0 ELSE 1 END,
      r.created_at DESC
    LIMIT ${limit}
  `;
  res.status(200).json({ query: q, ideas: ideas.map(i => ({ ...i, thesis: plainThesisText(i.thesis) })) });
}

/* Distinct tickers with at least one public idea — the sitemap's source.
   Symbols and counts only: no author, no thesis, nothing that makes this
   worth scraping in its own right. */
async function symbols(_req, res) {
  const rows = await sql`
    SELECT
      UPPER(r.ticker)   AS symbol,
      COUNT(*)          AS idea_count,
      MAX(r.created_at) AS last_posted
    FROM ic_recommendations r
    WHERE r.is_public = true AND r.ticker IS NOT NULL AND r.ticker <> ''
    GROUP BY UPPER(r.ticker)
    ORDER BY MAX(r.created_at) DESC
  `;
  res.status(200).json({ symbols: rows });
}
