/**
 * api/_lib/handlers/engagement.js — engagement resource handler
 *
 * Dispatched by api/data.js (resource=engagement). Covers the public-profile /
 * feed engagement surface that used to run directly against Neon from
 * src/App.jsx: reactions (likes) on recommendation_reactions, comments on
 * recommendation_comments, and the separate "tracking" table
 * (recommendation_tracking — bookmark + invested state), which is distinct
 * from recommendation_deliveries (see recommendations.js for the delivery
 * reaction/invested mirror, already migrated in Phase 3).
 *
 * userId always comes from the verified Firebase token (passed in by
 * api/data.js after requireUid) — never from req.body/req.query.
 *
 * GET  ?resource=engagement&recoId=<id>
 *   -> 200 { likes, commentsCount, myReaction: 'like'|null,
 *            tracking: { isInvested, investedPrice } | null,
 *            comments: [{ id, userId, userName, comment, createdAt }] }
 *
 * GET  ?resource=engagement&action=reactions-batch&recoIds=id1,id2,id3
 *   -> 200 { reactions: { [recoId]: 'like' } }  (only recoIds the caller liked)
 *
 * POST ?resource=engagement
 *   Body: { action, ... }
 *     react:   { recoId, reaction: 'like'|'dislike'|null }
 *              — mirrors the frontend's actual behaviour: recommendation_reactions
 *                only ever stores 'like' rows; 'dislike' and null both just
 *                remove any existing row for (recoId,userId).
 *     comment: { recoId, comment }
 *              — inserts using the commenter's user_profiles.full_name
 *                (never a client-supplied display name), then replicates the
 *                notification fan-out from App.jsx's RecoComments.submit():
 *                in-app 'contact_comment' notification + push + email to the
 *                recommendation owner, plus 'network_comment' notifications to
 *                the commenter's accepted connections (excluding the owner).
 *                Skipped entirely if the commenter is the recommendation owner.
 *     track:   { recoId, isInvested?, investedPrice? }
 *              — isInvested omitted/undefined: plain bookmark
 *                (INSERT ... ON CONFLICT DO NOTHING).
 *              — isInvested === true: upsert invested state
 *                (ON CONFLICT DO UPDATE, invested_at=now()).
 *              — isInvested === false: unmark invested on an existing tracked
 *                row (UPDATE; no-op if the row doesn't exist, matching the
 *                original fire-and-forget UPDATE in App.jsx).
 *     untrack: { recoId } — delete the tracking row for (recoId, userId).
 */

import { sql, parseBody } from '../auth.js';

const EMAIL_API = 'https://investor-circle.vercel.app/api/email';
const PUSH_API  = 'https://investor-circle.vercel.app/api/push';

/** Fire-and-forget email, mirrors src/App.jsx's sendEmail(). Never throws. */
function sendEmail(type, payload) {
  fetch(EMAIL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, ...payload }),
  }).catch(() => {});
}

/** Fire-and-forget push, mirrors src/App.jsx's sendPush(). Never throws. */
function sendPush(userId, { title, body, url = 'https://myinvestorcircle.com', tag = 'mic' }) {
  if (!userId) return;
  fetch(PUSH_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, title, body, url, tag }),
  }).catch(() => {});
}

function mapComment(c) {
  return {
    id:        c.id,
    userId:    c.user_id,
    userName:  c.user_name,
    comment:   c.comment,
    createdAt: c.created_at,
  };
}

async function getEngagement(recoId, userId) {
  const [likeRows, commentRows, myReactionRows, trackingRows] = await Promise.all([
    sql`SELECT COUNT(*)::int AS cnt FROM recommendation_reactions WHERE reco_id = ${String(recoId)}`,
    sql`SELECT id, user_id, user_name, comment, created_at
        FROM recommendation_comments WHERE reco_id = ${recoId} ORDER BY created_at ASC`,
    sql`SELECT reaction FROM recommendation_reactions
        WHERE reco_id = ${String(recoId)} AND user_id = ${userId} LIMIT 1`,
    sql`SELECT is_invested, invested_price FROM recommendation_tracking
        WHERE reco_id = ${recoId} AND user_id = ${userId} LIMIT 1`,
  ]);
  return {
    likes:         likeRows[0]?.cnt || 0,
    commentsCount: commentRows.length,
    myReaction:    myReactionRows[0]?.reaction === 'like' ? 'like' : null,
    tracking:      trackingRows[0]
      ? { isInvested: !!trackingRows[0].is_invested, investedPrice: trackingRows[0].invested_price != null ? Number(trackingRows[0].invested_price) : null }
      : null,
    comments: commentRows.map(mapComment),
  };
}

async function getReactionsBatch(recoIds, userId) {
  if (recoIds.length === 0) return {};
  const rows = await sql`
    SELECT reco_id, reaction FROM recommendation_reactions
    WHERE user_id = ${userId} AND reco_id = ANY(${recoIds})
  `;
  const out = {};
  for (const r of rows) {
    if (r.reaction === 'like') out[r.reco_id] = 'like';
  }
  return out;
}

async function notifyLike({ recoId, userId, likerName }) {
  const rows = await sql`
    SELECT ir.recommender_id, up.username AS recommender_username, up.full_name AS recommender_name,
           ir.ticker, ir.asset_name
    FROM ic_recommendations ir
    JOIN user_profiles up ON up.id = ir.recommender_id
    WHERE ir.id = ${recoId} LIMIT 1
  `;
  const row = rows[0];
  if (!row || row.recommender_id === userId) return; // no self-notifications

  const { recommender_id: ownerId, recommender_username: ownerUsername, recommender_name: ownerName, ticker, asset_name: assetName } = row;

  // Consolidated like notification (check-then-upsert), mirroring the
  // previous frontend logic exactly: one unread notification per reco that
  // accumulates liker names rather than spamming one row per like.
  const existing = await sql`
    SELECT id, metadata FROM notifications
    WHERE user_id = ${ownerId} AND type = 'contact_like'
      AND metadata->>'recoId' = ${recoId} AND is_read = false LIMIT 1
  `;
  if (existing[0]) {
    const prev = typeof existing[0].metadata === 'string' ? JSON.parse(existing[0].metadata) : (existing[0].metadata || {});
    const likerNames = [...new Set([...(prev.likerNames || []), likerName])];
    const newMeta = JSON.stringify({ ...prev, likerNames, likeCount: likerNames.length });
    await sql`UPDATE notifications SET metadata = ${newMeta}, from_user_id = ${userId}, created_at = NOW() WHERE id = ${existing[0].id}`;
  } else {
    const meta = JSON.stringify({
      ticker, assetName, recoId, likerNames: [likerName], likeCount: 1,
      recommenderUsername: ownerUsername || '', recommenderName: ownerName || '',
    });
    await sql`INSERT INTO notifications (user_id, type, from_user_id, metadata) VALUES (${ownerId}, 'contact_like', ${userId}, ${meta})`;
    sendPush(ownerId, {
      title: '👍 Someone liked your idea',
      body:  `${likerName} liked your idea${ticker ? ' · ' + ticker : ''}`,
      url:   ownerUsername && recoId ? `https://myinvestorcircle.com/#/investor/${ownerUsername}/reco/${recoId}` : 'https://myinvestorcircle.com',
      tag:   'contact_like',
    });
  }

  // Network fan-out — notify liker's connections
  const connRows = await sql`
    SELECT user_id FROM (
      SELECT addressee_id AS user_id FROM connections WHERE requester_id=${userId} AND status='accepted'
      UNION
      SELECT requester_id AS user_id FROM connections WHERE addressee_id=${userId} AND status='accepted'
    ) AS conn_ids WHERE user_id != ${ownerId}
  `;
  const netMeta = JSON.stringify({ ticker, assetName, recoId, recommenderName: ownerName || '', recommenderUsername: ownerUsername || '' });
  await Promise.all(connRows.map(c => sql`
    INSERT INTO notifications (user_id, type, from_user_id, metadata) VALUES (${c.user_id}, 'network_like', ${userId}, ${netMeta})
  `.catch(() => {})));
}

async function notifyComment({ recoId, userId, commenterName, commentText }) {
  const rows = await sql`
    SELECT ir.recommender_id, ir.ticker, ir.asset_name AS asset_name,
           up.email, up.username
    FROM ic_recommendations ir
    JOIN user_profiles up ON up.id = ir.recommender_id
    WHERE ir.id = ${recoId} LIMIT 1
  `;
  const row = rows[0];
  if (!row) return;
  const { recommender_id: ownerId, ticker, asset_name: assetName, email: ownerEmail, username: ownerUsername } = row;
  if (ownerId === userId) return; // no self-notifications

  const meta = JSON.stringify({ ticker, assetName, recoId, recommenderUsername: ownerUsername || '' });
  sql`INSERT INTO notifications (user_id, type, from_user_id, metadata)
      VALUES (${ownerId}, 'contact_comment', ${userId}, ${meta})`
    .then(() => sendPush(ownerId, {
      title: '💬 New comment on your idea',
      body:  `${commenterName} commented on your idea${ticker ? ' · ' + ticker : ''}`,
      url:   ownerUsername && recoId ? `https://myinvestorcircle.com/#/investor/${ownerUsername}/reco/${recoId}` : 'https://myinvestorcircle.com',
      tag:   'contact_comment',
    }))
    .catch(() => {});

  if (ownerEmail) {
    const recoUrl = ownerUsername
      ? `https://myinvestorcircle.com/#/investor/${ownerUsername}/reco/${recoId}`
      : `https://myinvestorcircle.com`;
    sendEmail('reco_comment', {
      to_email:       ownerEmail,
      commenter_name: commenterName,
      ticker,
      asset_name:     assetName,
      comment:        commentText,
      reco_url:       recoUrl,
    });
  }

  // Network fan-out — notify commenter's connections about the comment
  sql`SELECT user_id FROM (
        SELECT addressee_id AS user_id FROM connections WHERE requester_id=${userId} AND status='accepted'
        UNION
        SELECT requester_id AS user_id FROM connections WHERE addressee_id=${userId} AND status='accepted'
      ) AS conn_ids WHERE user_id != ${ownerId}`
    .then(connRows => {
      const netMeta = JSON.stringify({ ticker, assetName, recoId, commenterName, recommenderUsername: ownerUsername || '' });
      connRows.forEach(c => {
        sql`INSERT INTO notifications (user_id, type, from_user_id, metadata)
            VALUES (${c.user_id}, 'network_comment', ${userId}, ${netMeta})`.catch(() => {});
      });
    }).catch(() => {});
}

export default async function handleEngagement(req, res, userId) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const action = String(req.query?.action || '');

      if (action === 'my-tracked') {
        const rows = await sql`SELECT reco_id FROM recommendation_tracking WHERE user_id = ${userId}`;
        res.status(200).json({ recoIds: rows.map(r => r.reco_id) });
        return;
      }

      if (action === 'my-tracked-recos') {
        const rows = await sql`
          SELECT ir.id, ir.asset_name, ir.ticker, ir.asset_class, ir.recommendation_type,
                 ir.reco_price, ir.current_price, ir.target_price, ir.stop_loss,
                 ir.horizon, ir.thesis, ir.sector, ir.conviction, ir.exchange,
                 ir.exit_signal, ir.exit_date, ir.is_public, ir.created_at,
                 up.full_name as recommender_name, up.first_name, up.last_name, up.username as recommender_username,
                 rt.tracked_at, rt.is_invested, rt.invested_price
          FROM recommendation_tracking rt
          JOIN ic_recommendations ir ON rt.reco_id = ir.id
          JOIN user_profiles up ON ir.recommender_id = up.id
          WHERE rt.user_id = ${userId}
          ORDER BY rt.tracked_at DESC
        `;
        res.status(200).json({ recos: rows });
        return;
      }

      if (action === 'reactions-batch') {
        const raw = String(req.query?.recoIds || '');
        const recoIds = raw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 200);
        const reactions = await getReactionsBatch(recoIds, userId);
        res.status(200).json({ reactions });
        return;
      }

      const recoId = String(req.query?.recoId || '');
      if (!recoId) { res.status(400).json({ error: 'recoId is required' }); return; }
      const data = await getEngagement(recoId, userId);
      res.status(200).json(data);
      return;
    }

    const body = parseBody(req);
    const action = String(body.action || '');

    if (action === 'react') {
      const recoId = String(body.recoId || '');
      if (!recoId) { res.status(400).json({ error: 'recoId is required' }); return; }
      const allowed = ['like', 'dislike', null];
      const reaction = body.reaction === undefined ? null : body.reaction;
      if (reaction !== null && !allowed.includes(reaction)) {
        res.status(400).json({ error: 'invalid reaction' });
        return;
      }
      // recommendation_reactions only ever stores 'like' rows in the current
      // frontend behaviour — 'dislike' and null both clear any existing row.
      if (reaction === 'like') {
        await sql`INSERT INTO recommendation_reactions(reco_id,user_id,reaction)
                   VALUES(${recoId},${userId},'like')
                   ON CONFLICT(reco_id,user_id) DO UPDATE SET reaction='like'`;
        if (body.notify) {
          notifyLike({ recoId, userId, likerName: String(body.likerName || 'Someone') }).catch(() => {});
        }
      } else {
        await sql`DELETE FROM recommendation_reactions WHERE reco_id=${recoId} AND user_id=${userId}`;
      }
      res.status(200).json({ success: true, myReaction: reaction === 'like' ? 'like' : null });
      return;
    }

    if (action === 'comment') {
      const recoId = String(body.recoId || '');
      const commentText = typeof body.comment === 'string' ? body.comment.trim() : '';
      if (!recoId) { res.status(400).json({ error: 'recoId is required' }); return; }
      if (!commentText) { res.status(400).json({ error: 'comment is required' }); return; }
      if (commentText.length > 2000) { res.status(400).json({ error: 'comment is too long (max 2000 chars)' }); return; }

      const profileRows = await sql`SELECT full_name FROM user_profiles WHERE id=${userId} LIMIT 1`;
      const userName = profileRows[0]?.full_name || 'User';

      const inserted = await sql`
        INSERT INTO recommendation_comments (reco_id, user_id, user_name, comment)
        VALUES (${recoId}, ${userId}, ${userName}, ${commentText})
        RETURNING id, user_id, user_name, comment, created_at
      `;
      const comment = mapComment(inserted[0]);

      notifyComment({ recoId, userId, commenterName: userName, commentText }).catch(() => {});

      res.status(200).json({ comment });
      return;
    }

    if (action === 'track') {
      const recoId = String(body.recoId || '');
      if (!recoId) { res.status(400).json({ error: 'recoId is required' }); return; }

      if (body.isInvested === undefined) {
        // Plain bookmark toggle-on.
        await sql`INSERT INTO recommendation_tracking (reco_id, user_id)
                   VALUES (${recoId}, ${userId}) ON CONFLICT DO NOTHING`;
        res.status(200).json({ success: true });
        return;
      }

      if (typeof body.isInvested !== 'boolean') {
        res.status(400).json({ error: 'isInvested must be a boolean' });
        return;
      }
      const investedPrice = body.investedPrice === undefined || body.investedPrice === null
        ? null : Number(body.investedPrice);
      if (investedPrice !== null && !Number.isFinite(investedPrice)) {
        res.status(400).json({ error: 'investedPrice must be numeric or null' });
        return;
      }

      if (body.isInvested) {
        await sql`
          INSERT INTO recommendation_tracking (reco_id, user_id, is_invested, invested_price, invested_at)
          VALUES (${recoId}, ${userId}, true, ${investedPrice}, now())
          ON CONFLICT (reco_id, user_id) DO UPDATE
            SET is_invested = true, invested_price = ${investedPrice}, invested_at = now()
        `;
      } else {
        // Unmark invested on an already-tracked row. Mirrors App.jsx's
        // fire-and-forget UPDATE — a no-op if the row doesn't exist.
        await sql`
          UPDATE recommendation_tracking
          SET is_invested = false, invested_price = null, invested_at = null
          WHERE reco_id = ${recoId} AND user_id = ${userId}
        `;
      }
      res.status(200).json({ success: true });
      return;
    }

    if (action === 'untrack') {
      const recoId = String(body.recoId || '');
      if (!recoId) { res.status(400).json({ error: 'recoId is required' }); return; }
      await sql`DELETE FROM recommendation_tracking WHERE reco_id = ${recoId} AND user_id = ${userId}`;
      res.status(200).json({ success: true });
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[engagement] error:', e?.message);
    res.status(500).json({ error: 'Database error' });
  }
}
