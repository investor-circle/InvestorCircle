/**
 * api/_lib/handlers/public-profile.js — public-profile resource handler
 *
 * Dispatched by api/data.js (resource=public-profile). Deliberately
 * UNAUTHENTICATED by design — public profile pages are viewable by anyone,
 * same as before — but now runs server-side against DATABASE_URL instead of
 * the browser-exposed VITE_DATABASE_URL, and selects only the same
 * non-sensitive fields the original function returned (no SEBI/consent/claim
 * columns are read or returned here).
 *
 * GET ?resource=public-profile&username=<username>
 *   -> 200 { profile: {...} } | 404 if no such username
 */

import { sql } from '../auth.js';

export default async function handlePublicProfile(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const username = String(req.query?.username || '').trim();
  if (!username) { res.status(400).json({ error: 'username is required' }); return; }

  try {
    const users = await sql`
      SELECT
        up.id, up.full_name, up.first_name, up.last_name,
        up.username, up.created_at,
        up.bio, up.twitter_url, up.linkedin_url, up.telegram_url, up.instagram_url,
        up.avatar_color, up.avatar_url,
        (SELECT COUNT(*) FROM connections
         WHERE (requester_id = up.id OR addressee_id = up.id)
           AND status = 'accepted')                                AS connection_count,
        (SELECT COUNT(*) FROM group_members
         WHERE user_id = up.id AND status = 'active')             AS group_count
      FROM user_profiles up
      WHERE up.username = ${username}
      LIMIT 1
    `;
    if (!users[0]) { res.status(404).json({ error: 'not_found' }); return; }
    const userId = users[0].id;

    const summary = await sql`
      SELECT
        COUNT(*)                                                   AS total,
        COUNT(CASE WHEN NOT exit_signal
                        AND (target_date IS NULL OR target_date >= CURRENT_DATE)
                   THEN 1 END)                                     AS active,
        COUNT(CASE WHEN exit_signal THEN 1 END)                   AS closed,
        COUNT(CASE WHEN NOT exit_signal
                        AND target_date IS NOT NULL
                        AND target_date < CURRENT_DATE
                   THEN 1 END)                                     AS expired,
        ROUND(EXTRACT(EPOCH FROM (now() - MIN(created_at))) / 86400 / 365, 1) AS years_history
      FROM ic_recommendations
      WHERE recommender_id = ${userId} AND is_public = true
    `;
    const sumRow = summary[0] || {};

    const live = await sql`
      SELECT
        COUNT(*)                                                   AS active_count,
        COUNT(CASE WHEN
          (recommendation_type = 'Buy'  AND COALESCE(current_price, reco_price) > COALESCE(reco_price, 0))
          OR (recommendation_type = 'Sell' AND COALESCE(current_price, reco_price) < COALESCE(reco_price, 0))
          THEN 1 END)                                             AS in_profit,
        COUNT(CASE WHEN NOT (
          (recommendation_type = 'Buy'  AND COALESCE(current_price, reco_price) > COALESCE(reco_price, 0))
          OR (recommendation_type = 'Sell' AND COALESCE(current_price, reco_price) < COALESCE(reco_price, 0))
          ) THEN 1 END)                                           AS in_loss,
        ROUND(AVG(
          CASE recommendation_type
            WHEN 'Sell' THEN (COALESCE(reco_price,0) - COALESCE(current_price, reco_price, 0)) / NULLIF(reco_price,0) * 100
            ELSE             (COALESCE(current_price, reco_price, 0) - COALESCE(reco_price,0)) / NULLIF(reco_price,0) * 100
          END
        )::numeric, 2)                                            AS avg_live_return,
        ROUND(AVG(CURRENT_DATE - created_at::date)::numeric, 0)  AS avg_holding_days
      FROM ic_recommendations
      WHERE recommender_id = ${userId} AND is_public = true
        AND NOT exit_signal
        AND (target_date IS NULL OR target_date >= CURRENT_DATE)
    `;
    const bestLive = await sql`
      SELECT ticker, asset_name,
        CASE recommendation_type
          WHEN 'Sell' THEN ROUND(((COALESCE(reco_price,0) - COALESCE(current_price, reco_price, 0)) / NULLIF(reco_price,0) * 100)::numeric, 2)
          ELSE             ROUND(((COALESCE(current_price, reco_price, 0) - COALESCE(reco_price,0)) / NULLIF(reco_price,0) * 100)::numeric, 2)
        END AS ret_pct
      FROM ic_recommendations
      WHERE recommender_id = ${userId} AND is_public = true
        AND NOT exit_signal AND (target_date IS NULL OR target_date >= CURRENT_DATE)
      ORDER BY ret_pct DESC LIMIT 1
    `;
    const worstLive = await sql`
      SELECT ticker, asset_name,
        CASE recommendation_type
          WHEN 'Sell' THEN ROUND(((COALESCE(reco_price,0) - COALESCE(current_price, reco_price, 0)) / NULLIF(reco_price,0) * 100)::numeric, 2)
          ELSE             ROUND(((COALESCE(current_price, reco_price, 0) - COALESCE(reco_price,0)) / NULLIF(reco_price,0) * 100)::numeric, 2)
        END AS ret_pct
      FROM ic_recommendations
      WHERE recommender_id = ${userId} AND is_public = true
        AND NOT exit_signal AND (target_date IS NULL OR target_date >= CURRENT_DATE)
      ORDER BY ret_pct ASC LIMIT 1
    `;

    const realized = await sql`
      WITH closed_rets AS (
        SELECT
          CASE recommendation_type
            WHEN 'Sell' THEN (COALESCE(reco_price,0) - COALESCE(exit_price, current_price, reco_price, 0)) / NULLIF(reco_price,0) * 100
            ELSE             (COALESCE(exit_price, current_price, reco_price, 0) - COALESCE(reco_price,0)) / NULLIF(reco_price,0) * 100
          END                                                  AS ret_pct,
          COALESCE(exit_date::date, CURRENT_DATE) - created_at::date AS hold_days,
          ticker, asset_name
        FROM ic_recommendations
        WHERE recommender_id = ${userId} AND is_public = true AND exit_signal = true
      )
      SELECT
        COUNT(*)                                               AS closed_count,
        COUNT(CASE WHEN ret_pct > 0 THEN 1 END)              AS win_count,
        COUNT(CASE WHEN ret_pct <= 0 THEN 1 END)             AS loss_count,
        ROUND(COUNT(CASE WHEN ret_pct > 0 THEN 1 END)::numeric / NULLIF(COUNT(*),0) * 100, 1)   AS hit_rate_pct,
        ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY ret_pct)::numeric, 2)                  AS median_return,
        ROUND(AVG(ret_pct)::numeric, 2)                       AS avg_return,
        ROUND((AVG(ret_pct) / NULLIF(STDDEV_POP(ret_pct), 0))::numeric, 2)                       AS risk_adjusted_return,
        ROUND(AVG(hold_days)::numeric, 0)                     AS avg_holding_days
      FROM closed_rets
    `;
    const bestClosed = await sql`
      SELECT ticker, asset_name,
        ROUND((CASE recommendation_type
          WHEN 'Sell' THEN (COALESCE(reco_price,0) - COALESCE(exit_price, current_price, reco_price, 0)) / NULLIF(reco_price,0) * 100
          ELSE             (COALESCE(exit_price, current_price, reco_price, 0) - COALESCE(reco_price,0)) / NULLIF(reco_price,0) * 100
        END)::numeric, 2) AS ret_pct
      FROM ic_recommendations
      WHERE recommender_id = ${userId} AND is_public = true AND exit_signal = true
      ORDER BY ret_pct DESC LIMIT 1
    `;

    const sectors = await sql`
      SELECT
        COALESCE(sector, 'Uncategorised')                      AS sector,
        COUNT(*)                                               AS total_recs,
        COUNT(CASE WHEN NOT exit_signal
                        AND (target_date IS NULL OR target_date >= CURRENT_DATE) THEN 1 END) AS active_count,
        COUNT(CASE WHEN NOT exit_signal
                        AND (target_date IS NULL OR target_date >= CURRENT_DATE)
                        AND (
                          (recommendation_type = 'Buy'  AND COALESCE(current_price, reco_price) > COALESCE(reco_price,0))
                          OR (recommendation_type = 'Sell' AND COALESCE(current_price, reco_price) < COALESCE(reco_price,0))
                        ) THEN 1 END)                          AS active_in_profit,
        COUNT(CASE WHEN exit_signal THEN 1 END)               AS closed_count,
        COUNT(CASE WHEN exit_signal AND (
          (recommendation_type = 'Buy'  AND COALESCE(exit_price, current_price, reco_price) > COALESCE(reco_price,0))
          OR (recommendation_type = 'Sell' AND COALESCE(exit_price, current_price, reco_price) < COALESCE(reco_price,0))
        ) THEN 1 END)                                          AS closed_wins,
        ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY
          CASE WHEN exit_signal THEN
            CASE recommendation_type
              WHEN 'Sell' THEN (COALESCE(reco_price,0) - COALESCE(exit_price, current_price, reco_price,0)) / NULLIF(reco_price,0) * 100
              ELSE             (COALESCE(exit_price, current_price, reco_price,0) - COALESCE(reco_price,0)) / NULLIF(reco_price,0) * 100
            END
          END
        )::numeric, 1)                                         AS median_closed_return
      FROM ic_recommendations
      WHERE recommender_id = ${userId} AND is_public = true
      GROUP BY COALESCE(sector, 'Uncategorised')
      ORDER BY total_recs DESC
    `;

    const recos = await sql`
      SELECT
        r.id, r.ticker, r.asset_name, r.asset_class,
        r.recommendation_type, r.sector, r.conviction,
        r.reco_price, r.current_price, r.exit_price,
        r.target_price, r.stop_loss,
        r.horizon, r.target_date, r.thesis,
        r.exit_signal, r.exit_date, r.is_public, r.created_at,
        CASE
          WHEN r.exit_signal                                                        THEN 'Closed'
          WHEN r.target_date IS NOT NULL AND r.target_date < CURRENT_DATE           THEN 'Expired'
          ELSE                                                                           'Active'
        END AS status,
        ROUND((CASE
          WHEN r.exit_signal THEN
            CASE r.recommendation_type
              WHEN 'Sell' THEN (COALESCE(r.reco_price,0) - COALESCE(r.exit_price, r.current_price, r.reco_price,0)) / NULLIF(r.reco_price,0) * 100
              ELSE             (COALESCE(r.exit_price, r.current_price, r.reco_price,0) - COALESCE(r.reco_price,0)) / NULLIF(r.reco_price,0) * 100
            END
          ELSE
            CASE r.recommendation_type
              WHEN 'Sell' THEN (COALESCE(r.reco_price,0) - COALESCE(r.current_price, r.reco_price,0)) / NULLIF(r.reco_price,0) * 100
              ELSE             (COALESCE(r.current_price, r.reco_price,0) - COALESCE(r.reco_price,0)) / NULLIF(r.reco_price,0) * 100
            END
        END)::numeric, 2)                                        AS return_pct,
        CASE
          WHEN r.exit_signal THEN COALESCE(r.exit_date::date, CURRENT_DATE) - r.created_at::date
          ELSE CURRENT_DATE - r.created_at::date
        END                                                      AS holding_days
      FROM ic_recommendations r
      WHERE r.recommender_id = ${userId} AND r.is_public = true
      ORDER BY r.created_at DESC
      LIMIT 100
    `;

    const realRow = realized[0] || {};
    const liveRow  = live[0]     || {};

    res.status(200).json({
      profile: users[0],
      summary: {
        total:         Number(sumRow.total         || 0),
        active:        Number(sumRow.active        || 0),
        closed:        Number(sumRow.closed        || 0),
        expired:       Number(sumRow.expired       || 0),
        years_history: Number(sumRow.years_history || 0),
      },
      live: {
        count:            Number(liveRow.active_count    || 0),
        in_profit:        Number(liveRow.in_profit        || 0),
        in_loss:          Number(liveRow.in_loss          || 0),
        avg_return:       Number(liveRow.avg_live_return   || 0),
        avg_holding_days: Number(liveRow.avg_holding_days || 0),
        best:  bestLive[0]  || null,
        worst: worstLive[0] || null,
      },
      realized: {
        count:            Number(realRow.closed_count         || 0),
        win_count:        Number(realRow.win_count            || 0),
        loss_count:       Number(realRow.loss_count           || 0),
        hit_rate_pct:     Number(realRow.hit_rate_pct         || 0),
        median_return:    Number(realRow.median_return        || 0),
        avg_return:       Number(realRow.avg_return           || 0),
        risk_adjusted:    Number(realRow.risk_adjusted_return || 0),
        avg_holding_days: Number(realRow.avg_holding_days     || 0),
        best: bestClosed[0] || null,
      },
      sectors: sectors.map(s => ({
        sector:           s.sector,
        total_recs:       Number(s.total_recs         || 0),
        active_count:     Number(s.active_count       || 0),
        active_in_profit: Number(s.active_in_profit   || 0),
        closed_count:     Number(s.closed_count       || 0),
        closed_wins:      Number(s.closed_wins        || 0),
        median_return:    Number(s.median_closed_return || 0),
      })),
      recos,
    });
  } catch (e) {
    console.error('[public-profile] error:', e?.message);
    res.status(500).json({ error: 'Database error' });
  }
}
