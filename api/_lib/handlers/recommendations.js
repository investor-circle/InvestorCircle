/**
 * api/_lib/handlers/recommendations.js — recommendations resource handler
 *
 * Dispatched by api/data.js (resource=recommendations). See connections.js
 * for why this lives under api/_lib/ instead of being its own route.
 *
 * GET  ?resource=recommendations&scope=received|made
 * GET  ?resource=recommendations&scope=circle&groupId=<id>
 *   -> ideas delivered to a Circle, newest-ACTIVITY-first (posting, a new
 *      comment, or a new reaction all count) — caller must be an active
 *      member or the owner of that circle (private circles: never exposed
 *      to non-members; public circles: members-only too, same as the
 *      Circle's member list itself).
 *
 * POST ?resource=recommendations
 *   Body: { action, ... }
 *     create:            { reco: {...}, recipients: [{type:'user'|'group', id}] }
 *     update-delivery:   { deliveryId, patch: { isInvested?, investedPrice?, reaction?, isHidden? } }
 *     set-exit-signal:   { recommendationId, exitPrice?, exitPriceSource? }
 *     cancel-exit-signal:{ recommendationId }
 *     forward:           { recommendationId, recipients: [{type:'user'|'group', id}] }
 *                        — group recipients are authorized exactly like the
 *                          'create' action (see authorizedCircleRecipientIds)
 *     delete-reco:       { recommendationId }  — only the recommender may delete
 *     delete-delivery:   { deliveryId }        — only the caller's own delivery row
 *
 * userId always comes from the verified token. All row-level mutations are
 * scoped with WHERE clauses tying the row to userId.
 */

import { sql, parseBody } from '../auth.js';

function mapReceivedRow(r) {
  return {
    deliveryId:    r.delivery_id,
    id:            r.id,
    from:          r.from_uid,
    byName:        r.from_name,
    sharedBy:      r.shared_by_id,
    sharedByName:  r.shared_by_name,
    shareType:     r.via_type === 'group' ? 'group' : 'one',
    groupId:       r.via_group_id,
    groupName:     r.via_group_name,
    assetName:    r.asset_name,
    ticker:       r.ticker,
    assetClass:   r.asset_class,
    priceAt:      Number(r.price_at || 0),
    price:        Number(r.price    || 0),
    targetPrice:  r.target_price ? Number(r.target_price) : null,
    horizon:      r.horizon,
    targetDate:   r.target_date ? r.target_date.toISOString?.().slice(0,10) ?? r.target_date : null,
    thesis:       r.thesis,
    date:         r.reco_date ? r.reco_date.toISOString?.().slice(0,10) ?? String(r.reco_date) : null,
    exitSignal:   r.exit_signal,
    exitDate:     r.exit_date,
    exitPrice:    r.exit_price ? Number(r.exit_price) : null,
    expiryPrice:  r.expiry_price ? Number(r.expiry_price) : null,
    invested:      r.is_invested,
    investedPrice: r.invested_price ? Number(r.invested_price) : null,
    reaction:      r.reaction || 'none',
    hidden:        r.is_hidden,
    likes:         Number(r.likes || 0),
    recoActed:     Number(r.reco_acted || 0),
    commentCount:  Number(r.comment_count || 0),
    isPublic:      r.is_public !== false,
    recType:       r.recommendation_type || 'Buy',
    stopLoss:      r.stop_loss  ? Number(r.stop_loss)  : null,
    conviction:    r.conviction || null,
    sector:        r.sector     || null,
  };
}

async function getReceived(userId) {
  const rows = await sql`
    SELECT
      rd.id               AS delivery_id,
      rd.via_type, rd.via_group_id, rd.shared_by_id,
      rd.is_invested, rd.invested_price, rd.invested_at,
      rd.reaction, rd.is_hidden, rd.created_at AS delivered_at,
      r.id                AS id,
      r.recommender_id    AS from_uid,
      r.asset_name, r.ticker, r.asset_class,
      r.reco_price        AS price_at,
      r.current_price     AS price,
      r.target_price, r.horizon, r.target_date, r.thesis,
      r.is_public,
      r.exit_signal, r.exit_date,
      r.recommendation_type, r.stop_loss, r.conviction, r.sector, r.exit_price, r.expiry_price,
      r.created_at        AS reco_date,
      rec_up.full_name    AS from_name,
      rec_up.email        AS from_email,
      sb_up.full_name     AS shared_by_name,
      grp.name            AS via_group_name,
      (SELECT COUNT(*) FROM recommendation_reactions rx WHERE rx.reco_id = r.id::text) AS likes,
      (SELECT COUNT(*) FROM recommendation_deliveries d2
       WHERE d2.recommendation_id = r.id AND d2.is_invested = true) AS reco_acted,
      (SELECT COUNT(*) FROM recommendation_comments rc WHERE rc.reco_id = r.id)::int AS comment_count
    FROM recommendation_deliveries rd
    JOIN ic_recommendations r    ON r.id   = rd.recommendation_id
    JOIN user_profiles rec_up    ON rec_up.id = r.recommender_id
    LEFT JOIN user_profiles sb_up ON sb_up.id = rd.shared_by_id
    LEFT JOIN ic_groups grp       ON grp.id   = rd.via_group_id
    WHERE rd.delivered_to_user_id = ${userId}
    ORDER BY r.created_at DESC
  `;
  return rows.map(mapReceivedRow);
}

async function getMade(userId) {
  const recs = await sql`
    SELECT
      r.id, r.asset_name, r.ticker, r.asset_class, r.created_at,
      r.reco_price, r.current_price, r.target_price, r.horizon, r.target_date,
      r.thesis, r.exit_signal, r.exit_date, r.is_public,
      r.recommendation_type, r.stop_loss, r.conviction, r.sector, r.exit_price, r.expiry_price,
      (SELECT COUNT(*) FROM recommendation_deliveries d WHERE d.recommendation_id = r.id) AS recipient_count,
      (SELECT COUNT(*) FROM recommendation_deliveries d
       WHERE d.recommendation_id = r.id AND d.is_invested = true) AS acted_count,
      (SELECT COUNT(*) FROM recommendation_deliveries d
       WHERE d.recommendation_id = r.id AND d.reaction = 'like') AS like_count,
      (SELECT COUNT(*) FROM recommendation_deliveries d
       WHERE d.recommendation_id = r.id AND d.reaction = 'dislike') AS dislike_count
    FROM ic_recommendations r
    WHERE r.recommender_id = ${userId}
    ORDER BY r.created_at DESC
  `;
  const recIds = recs.map(r => r.id);
  let actedRows = [];
  if (recIds.length > 0) {
    actedRows = await sql`
      SELECT rd.recommendation_id, up.full_name AS name, rd.invested_at AS date
      FROM recommendation_deliveries rd
      JOIN user_profiles up ON up.id = rd.delivered_to_user_id
      WHERE rd.recommendation_id = ANY(${recIds}::uuid[]) AND rd.is_invested = true
    `;
  }
  const actedByRec = actedRows.reduce((acc, a) => {
    (acc[a.recommendation_id] ??= []).push({ name: a.name, date: a.date });
    return acc;
  }, {});
  return recs.map(r => ({
    id:          r.id,
    assetName:   r.asset_name,
    ticker:      r.ticker,
    assetClass:  r.asset_class,
    date:        r.created_at ? r.created_at.toISOString?.().slice(0,10) ?? String(r.created_at) : null,
    priceAt:     Number(r.reco_price    || 0),
    price:       Number(r.current_price || 0),
    targetPrice: r.target_price ? Number(r.target_price) : null,
    horizon:     r.horizon,
    targetDate:  r.target_date,
    thesis:      r.thesis,
    exit:        r.exit_signal,
    exitDate:    r.exit_date,
    expiryPrice: r.expiry_price  ? +r.expiry_price  : null,
    actedList:   actedByRec[r.id] || [],
    likes:       Number(r.like_count    || 0),
    dislikes:    Number(r.dislike_count || 0),
    isPublic:    r.is_public !== false,
    recType:     r.recommendation_type || 'Buy',
    stopLoss:    r.stop_loss     ? +r.stop_loss     : null,
    conviction:  r.conviction    || null,
    sector:      r.sector        || null,
    exitPrice:   r.exit_price    ? +r.exit_price    : null,
    recipients:  [],
  }));
}

/**
 * Which of the caller's requested Circle (group) recipients they're actually
 * allowed to post to — never trust the client's target list. Rule (product
 * spec): a PRIVATE circle's ideas are shared between its members, so any
 * active member may post to it; a PUBLIC circle is the owner's broadcast
 * channel, so only its owner/admin may post to it. Recipients that fail
 * this check are silently dropped rather than rejecting the whole idea, the
 * same pattern already used for Circle direct-add eligibility filtering.
 */
async function authorizedCircleRecipientIds(senderId, recipients) {
  const groupIds = [...new Set((recipients || []).filter(r => r.type === 'group').map(r => String(r.id)))];
  if (!groupIds.length) return new Set();
  const rows = await sql`
    SELECT g.id, g.circle_type, gm.role, gm.status
    FROM ic_groups g
    LEFT JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ${senderId}
    WHERE g.id = ANY(${groupIds}::uuid[])
  `;
  const ok = new Set();
  for (const row of rows) {
    if (row.status !== 'active') continue;                            // not a member at all
    if (row.circle_type === 'public' && row.role !== 'admin') continue; // only the owner may post to a public circle
    ok.add(row.id);
  }
  return ok;
}

async function getCircleFeed(groupId, userId) {
  const membership = await sql`
    SELECT 1 FROM ic_groups g
    LEFT JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ${userId} AND gm.status = 'active'
    WHERE g.id = ${groupId} AND (g.created_by = ${userId} OR gm.user_id IS NOT NULL)
    LIMIT 1
  `;
  if (!membership.length) return null; // not authorized — caller decides the response code

  const rows = await sql`
    SELECT
      r.id, r.asset_name, r.ticker, r.asset_class, r.recommendation_type,
      r.reco_price, r.current_price, r.target_price, r.horizon, r.target_date,
      r.thesis, r.exit_signal, r.exit_date, r.is_public, r.created_at,
      r.conviction, r.sector,
      rec_up.id          AS recommender_id,
      rec_up.full_name   AS recommender_name,
      rec_up.username    AS recommender_username,
      rec_up.avatar_url  AS recommender_avatar_url,
      rec_up.avatar_color AS recommender_avatar_color,
      (SELECT COUNT(*) FROM recommendation_reactions rx WHERE rx.reco_id = r.id::text) AS likes,
      (SELECT COUNT(*) FROM recommendation_comments  c  WHERE c.reco_id  = r.id)        AS comments_count,
      GREATEST(
        r.created_at,
        COALESCE((SELECT MAX(c.created_at)  FROM recommendation_comments  c  WHERE c.reco_id = r.id), r.created_at),
        COALESCE((SELECT MAX(rx.created_at) FROM recommendation_reactions rx WHERE rx.reco_id = r.id::text), r.created_at)
      ) AS last_activity_at
    FROM ic_recommendations r
    JOIN user_profiles rec_up ON rec_up.id = r.recommender_id
    WHERE r.id IN (
      SELECT DISTINCT recommendation_id FROM recommendation_deliveries
      WHERE via_type = 'group' AND via_group_id = ${groupId}
    )
    ORDER BY last_activity_at DESC
    LIMIT 200
  `;
  return rows;
}

async function deliverToRecipients(recId, senderId, recipients, reco, { asForward, forwarderId, authorizedGroupIds } = {}) {
  const delivered = new Set();
  for (const r of recipients || []) {
    if (r.type === 'user') {
      const rid = String(r.id);
      if (delivered.has(rid)) continue;
      delivered.add(rid);
      if (asForward) {
        await sql`
          INSERT INTO recommendation_deliveries
            (recommendation_id, delivered_to_user_id, via_type, shared_by_id)
          VALUES (${recId}, ${rid}, 'forward', ${forwarderId})
          ON CONFLICT (recommendation_id, delivered_to_user_id) DO NOTHING
        `;
      } else {
        await sql`
          INSERT INTO recommendation_deliveries
            (recommendation_id, delivered_to_user_id, via_type)
          VALUES (${recId}, ${rid}, 'direct')
          ON CONFLICT (recommendation_id, delivered_to_user_id) DO NOTHING
        `;
      }
      await sql`
        INSERT INTO notifications (user_id, type, from_user_id, reference_id, metadata)
        VALUES (${rid}, 'recommendation', ${asForward ? forwarderId : senderId}, ${recId},
                ${JSON.stringify({ ticker: reco.ticker, assetName: reco.assetName })})
      `;
    } else if (r.type === 'group') {
      if (!authorizedGroupIds?.has(String(r.id))) continue; // not authorized to post to this circle — see authorizedCircleRecipientIds
      const circleRows = await sql`SELECT name, slug FROM ic_groups WHERE id = ${r.id} LIMIT 1`;
      const circleMeta = {
        ticker: reco.ticker, assetName: reco.assetName,
        groupName: circleRows[0]?.name || '', groupSlug: circleRows[0]?.slug || '',
        recoId: recId,
      };
      const members = await sql`
        SELECT user_id FROM group_members
        WHERE group_id = ${r.id} AND status = 'active' AND user_id != ${senderId}
      `;
      for (const m of members) {
        if (delivered.has(m.user_id)) continue;
        delivered.add(m.user_id);
        await sql`
          INSERT INTO recommendation_deliveries
            (recommendation_id, delivered_to_user_id, via_type, via_group_id)
          VALUES (${recId}, ${m.user_id}, 'group', ${r.id})
          ON CONFLICT (recommendation_id, delivered_to_user_id) DO NOTHING
        `;
        // Distinct type from a direct/1:1 share ('recommendation') so the
        // notification can name the Circle and deep-link straight to it
        // (see NotificationPanel.jsx + App.jsx's onNavigate handler).
        await sql`
          INSERT INTO notifications (user_id, type, from_user_id, reference_id, metadata)
          VALUES (${m.user_id}, 'circle_idea', ${senderId}, ${recId}, ${JSON.stringify(circleMeta)})
        `;
      }
    }
  }
}

export default async function handleRecommendations(req, res, userId) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const scope = String(req.query?.scope || 'received');
      if (scope === 'made') {
        res.status(200).json({ recommendations: await getMade(userId) });
      } else if (scope === 'received') {
        res.status(200).json({ recommendations: await getReceived(userId) });
      } else if (scope === 'circle') {
        const groupId = String(req.query?.groupId || '');
        if (!groupId) { res.status(400).json({ error: 'groupId is required' }); return; }
        const rows = await getCircleFeed(groupId, userId);
        if (rows === null) { res.status(403).json({ error: 'Not authorized for this circle' }); return; }
        res.status(200).json({ ideas: rows });
      } else {
        res.status(400).json({ error: 'scope must be "received", "made" or "circle"' });
      }
      return;
    }

    const body = parseBody(req);
    const action = String(body.action || '');

    if (action === 'create') {
      const reco = body.reco || {};
      const recipients = Array.isArray(body.recipients) ? body.recipients : [];
      if (!reco.assetName || !reco.ticker) {
        res.status(400).json({ error: 'reco.assetName and reco.ticker are required' });
        return;
      }
      const rec = await sql`
        INSERT INTO ic_recommendations
          (recommender_id, asset_name, ticker, asset_class,
           reco_price, current_price, target_price, horizon, target_date, thesis, is_public,
           recommendation_type, stop_loss, conviction, sector, exchange,
           price_source, price_stamped_at)
        VALUES
          (${userId}, ${reco.assetName}, ${reco.ticker}, ${reco.assetClass},
           ${reco.priceAt || null}, ${reco.price || null}, ${reco.targetPrice || null},
           ${reco.horizon || null}, ${reco.targetDate || null}, ${reco.thesis || null},
           ${reco.isPublic !== false},
           ${reco.recType || 'Buy'}, ${reco.stopLoss || null},
           ${reco.conviction || null}, ${reco.sector || null},
           ${reco.exchange || 'NSE'},
           ${reco.priceSource || null}, ${reco.priceAt ? 'now()' : null})
        RETURNING id, recommender_id, asset_name, ticker, asset_class, reco_price, current_price,
                  target_price, horizon, target_date, thesis, is_public, recommendation_type,
                  stop_loss, conviction, sector, exchange, created_at
      `;
      const authorizedGroupIds = await authorizedCircleRecipientIds(userId, recipients);
      await deliverToRecipients(rec[0].id, userId, recipients, reco, { authorizedGroupIds });
      res.status(200).json({ recommendation: rec[0] });
      return;
    }

    if (action === 'update-delivery') {
      const deliveryId = String(body.deliveryId || '');
      const patch = body.patch || {};
      if (!deliveryId) { res.status(400).json({ error: 'deliveryId is required' }); return; }
      const allowedReactions = ['like', 'dislike', null];
      const reaction = patch.reaction === undefined ? null : patch.reaction;
      if (reaction !== null && !allowedReactions.includes(reaction)) {
        res.status(400).json({ error: 'invalid reaction' });
        return;
      }
      const row = await sql`
        UPDATE recommendation_deliveries SET
          is_invested   = COALESCE(${patch.isInvested   ?? null}, is_invested),
          invested_price= COALESCE(${patch.investedPrice ?? null}, invested_price),
          invested_at   = CASE WHEN ${patch.isInvested ?? null} = true AND NOT is_invested
                              THEN now() ELSE invested_at END,
          reaction      = ${reaction},
          is_hidden     = COALESCE(${patch.isHidden ?? null}, is_hidden),
          updated_at    = now()
        WHERE id = ${deliveryId} AND delivered_to_user_id = ${userId}
        RETURNING id, recommendation_id, is_invested, invested_price, invested_at, reaction, is_hidden
      `;
      if (!row[0]) { res.status(404).json({ error: 'not_found' }); return; }
      if (patch.reaction !== undefined) {
        const recoId = row[0].recommendation_id;
        if (patch.reaction === 'like') {
          sql`INSERT INTO recommendation_reactions(reco_id,user_id,reaction)
              VALUES(${String(recoId)},${userId},'like') ON CONFLICT DO NOTHING`.catch(() => {});
        } else {
          sql`DELETE FROM recommendation_reactions
              WHERE reco_id=${String(recoId)} AND user_id=${userId}`.catch(() => {});
        }
      }
      res.status(200).json({ delivery: row[0] });
      return;
    }

    if (action === 'set-exit-signal') {
      const recommendationId = String(body.recommendationId || '');
      if (!recommendationId) { res.status(400).json({ error: 'recommendationId is required' }); return; }
      const exitPrice = body.exitPrice ?? null;
      const exitPriceSource = body.exitPriceSource ?? null;
      const row = await sql`
        UPDATE ic_recommendations
        SET exit_signal            = true,
            exit_date              = CURRENT_DATE,
            exit_price             = ${exitPrice || null},
            exit_price_source      = ${exitPriceSource || null},
            exit_price_stamped_at  = ${exitPrice ? new Date().toISOString() : null},
            updated_at             = now()
        WHERE id = ${recommendationId} AND recommender_id = ${userId}
        RETURNING id, ticker, asset_name, exit_signal, exit_date, exit_price
      `;
      if (!row[0]) { res.status(404).json({ error: 'not_found' }); return; }

      // Recipients = delivery recipients UNION trackers, so someone who
      // tracked this idea from a public profile/discovery (never a direct
      // delivery recipient) still hears that it was exited, not just the
      // people it was originally shared with.
      const recipients = await sql`
        SELECT delivered_to_user_id AS user_id FROM recommendation_deliveries
        WHERE recommendation_id = ${recommendationId}
        UNION
        SELECT user_id FROM recommendation_tracking
        WHERE reco_id = ${recommendationId}
      `;
      const [caller] = await sql`SELECT username, full_name FROM user_profiles WHERE id = ${userId}`;
      const metadata = JSON.stringify({
        ticker: row[0]?.ticker,
        assetName: row[0]?.asset_name,
        recoId: recommendationId,
        recommenderUsername: caller?.username,
        recommenderName: caller?.full_name,
      });
      for (const r of recipients) {
        if (r.user_id === userId) continue; // never notify yourself about your own exit
        await sql`
          INSERT INTO notifications (user_id, type, from_user_id, reference_id, metadata)
          VALUES (${r.user_id}, 'exit_signal', ${userId}, ${recommendationId}, ${metadata})
        `;
      }
      res.status(200).json({ recommendation: row[0] });
      return;
    }

    if (action === 'cancel-exit-signal') {
      const recommendationId = String(body.recommendationId || '');
      if (!recommendationId) { res.status(400).json({ error: 'recommendationId is required' }); return; }
      const row = await sql`
        UPDATE ic_recommendations
        SET exit_signal            = false,
            exit_date              = null,
            exit_price             = null,
            exit_price_source      = null,
            exit_price_stamped_at  = null,
            updated_at             = now()
        WHERE id = ${recommendationId} AND recommender_id = ${userId}
        RETURNING id, ticker, exit_signal, exit_date, exit_price
      `;
      if (!row[0]) { res.status(404).json({ error: 'not_found' }); return; }
      res.status(200).json({ recommendation: row[0] });
      return;
    }

    if (action === 'forward') {
      const recommendationId = String(body.recommendationId || '');
      const recipients = Array.isArray(body.recipients) ? body.recipients : [];
      if (!recommendationId) { res.status(400).json({ error: 'recommendationId is required' }); return; }
      const rec = await sql`
        SELECT ticker, asset_name FROM ic_recommendations WHERE id = ${recommendationId}
      `;
      if (!rec[0]) { res.status(404).json({ error: 'not_found' }); return; }
      // Group recipients reuse the same authorization check the 'create' action
      // uses (authorizedCircleRecipientIds): the forwarder must be an active
      // member of a private circle, or the owner/admin of a public one.
      const authorizedGroupIds = await authorizedCircleRecipientIds(userId, recipients);
      await deliverToRecipients(
        recommendationId, userId,
        recipients.filter(r => r.type === 'user' || r.type === 'group'),
        { ticker: rec[0].ticker, assetName: rec[0].asset_name },
        { asForward: true, forwarderId: userId, authorizedGroupIds }
      );
      res.status(200).json({ success: true });
      return;
    }

    if (action === 'delete-reco') {
      const recommendationId = String(body.recommendationId || '');
      if (!recommendationId) { res.status(400).json({ error: 'recommendationId is required' }); return; }
      await sql`
        DELETE FROM ic_recommendations
        WHERE id = ${recommendationId} AND recommender_id = ${userId}
      `;
      res.status(200).json({ success: true });
      return;
    }

    if (action === 'notify-public-contacts') {
      const recommendationId = String(body.recommendationId || '');
      const contactIds = Array.isArray(body.contactIds) ? body.contactIds.map(String) : [];
      const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
      if (!recommendationId || !contactIds.length) {
        res.status(400).json({ error: 'recommendationId and contactIds are required' });
        return;
      }
      const meta = JSON.stringify(metadata);
      await Promise.all(contactIds.map(cid => sql`
        INSERT INTO notifications (user_id, type, from_user_id, metadata)
        VALUES (${cid}, 'contact_recommendation', ${userId}, ${meta})
      `.catch(() => {})));
      res.status(200).json({ success: true });
      return;
    }

    if (action === 'delete-delivery') {
      const deliveryId = String(body.deliveryId || '');
      if (!deliveryId) { res.status(400).json({ error: 'deliveryId is required' }); return; }
      await sql`
        DELETE FROM recommendation_deliveries
        WHERE id = ${deliveryId} AND delivered_to_user_id = ${userId}
      `;
      res.status(200).json({ success: true });
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[recommendations] error:', e?.message);
    res.status(500).json({ error: 'Database error' });
  }
}
