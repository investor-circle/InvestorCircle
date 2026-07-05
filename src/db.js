/**
 * InvestorCircle — Database helpers (v2 shared data model)
 *
 * All functions here talk to the Neon tables defined in migration_v2.sql.
 * Each function is responsible for ONE logical operation: it writes the data
 * AND inserts any notifications that operation should generate.
 *
 * Usage:
 *   import { sendConnectionRequest, getMyConnections, ... } from "./db";
 *
 * Every exported function:
 *   - Takes typed arguments (no raw SQL in components)
 *   - Returns a plain object the component can put straight into state
 *   - Throws on unexpected DB errors (catch in the component)
 */

import { sql } from "./supabaseClient";

// ─────────────────────────────────────────────────────────────────────────────
// CONNECTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load all connections for the current user (all statuses).
 * Returns an array ready to use as the `connections` React state.
 *
 * Each element:
 *   { connectionId, userId, name, email, status, direction }
 *   direction: 'sent' = I requested | 'received' = they requested
 */
export async function getMyConnections(myId) {
  if (!sql) return [];
  const rows = await sql`
    SELECT
      c.id                                                          AS connection_id,
      c.status,
      c.created_at,
      c.updated_at,
      CASE WHEN c.requester_id = ${myId} THEN 'sent'
           ELSE 'received' END                                      AS direction,
      CASE WHEN c.requester_id = ${myId} THEN c.addressee_id
           ELSE c.requester_id END                                  AS user_id,
      up.full_name                                                  AS name,
      up.email
    FROM connections c
    JOIN user_profiles up
      ON up.id = CASE WHEN c.requester_id = ${myId}
                      THEN c.addressee_id
                      ELSE c.requester_id END
    WHERE c.requester_id = ${myId} OR c.addressee_id = ${myId}
    ORDER BY c.updated_at DESC
  `;
  return rows;
}

/**
 * Send a connection request from myId to addresseeId.
 * Returns { connection } on success, { error } if one already exists.
 */
export async function sendConnectionRequest(myId, addresseeId) {
  if (!sql) throw new Error("Neon not configured");
  // Check both directions for an existing connection
  const existing = await sql`
    SELECT id, status FROM connections
    WHERE (requester_id = ${myId} AND addressee_id = ${addresseeId})
       OR (requester_id = ${addresseeId} AND addressee_id = ${myId})
    LIMIT 1
  `;
  if (existing.length > 0) return { error: "already_exists", existing: existing[0] };

  const conn = await sql`
    INSERT INTO connections (requester_id, addressee_id, status)
    VALUES (${myId}, ${addresseeId}, 'pending')
    RETURNING *
  `;
  // Notify the addressee
  await sql`
    INSERT INTO notifications (user_id, type, from_user_id, reference_id)
    VALUES (${addresseeId}, 'connection_request', ${myId}, ${conn[0].id})
  `;
  return { connection: conn[0] };
}

/** Accept an incoming connection request. */
export async function acceptConnection(connectionId, myId) {
  if (!sql) throw new Error("Neon not configured");
  const rows = await sql`
    UPDATE connections
    SET status = 'accepted', updated_at = now()
    WHERE id = ${connectionId} AND addressee_id = ${myId} AND status = 'pending'
    RETURNING *
  `;
  if (!rows[0]) return { error: "not_found" };
  // Notify the requester
  await sql`
    INSERT INTO notifications (user_id, type, from_user_id, reference_id)
    VALUES (${rows[0].requester_id}, 'connection_accepted', ${myId}, ${connectionId})
  `;
  return { connection: rows[0] };
}

/** Reject an incoming connection request. */
export async function rejectConnection(connectionId, myId) {
  if (!sql) throw new Error("Neon not configured");
  const rows = await sql`
    UPDATE connections
    SET status = 'rejected', updated_at = now()
    WHERE id = ${connectionId} AND addressee_id = ${myId} AND status = 'pending'
    RETURNING *
  `;
  return rows[0] ? { connection: rows[0] } : { error: "not_found" };
}

/** Remove an accepted connection (unfriend). */
export async function removeConnection(connectionId, myId) {
  if (!sql) throw new Error("Neon not configured");
  await sql`
    DELETE FROM connections
    WHERE id = ${connectionId}
      AND (requester_id = ${myId} OR addressee_id = ${myId})
  `;
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// GROUPS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load all groups where the current user is an active member.
 * Returns array ready for the `groups` React state.
 */
export async function getMyGroups(myId) {
  if (!sql) return [];
  const groups = await sql`
    SELECT g.id, g.name, g.color, g.created_by, g.created_at,
           gm.role AS my_role
    FROM ic_groups g
    JOIN group_members gm ON gm.group_id = g.id
    WHERE gm.user_id = ${myId} AND gm.status = 'active'
    ORDER BY g.created_at DESC
  `;
  // Fetch all members for each group in one query
  if (groups.length === 0) return [];
  const groupIds = groups.map(g => g.id);
  const members = await sql`
    SELECT gm.group_id, gm.user_id, gm.role, gm.status,
           up.full_name AS name, up.email
    FROM group_members gm
    JOIN user_profiles up ON up.id = gm.user_id
    WHERE gm.group_id = ANY(${groupIds}::uuid[])
    ORDER BY gm.joined_at ASC
  `;
  // Attach members array to each group
  const membersByGroup = members.reduce((acc, m) => {
    if (!acc[m.group_id]) acc[m.group_id] = [];
    acc[m.group_id].push(m);
    return acc;
  }, {});
  groups.forEach(g => { g.members = membersByGroup[g.id] || []; });
  return groups;
}

/**
 * Create a new group. Creator is automatically admin.
 * memberIds: array of user IDs of confirmed contacts to add initially.
 * Returns the new group object.
 */
export async function createGroup(name, color, creatorId, memberIds) {
  if (!sql) throw new Error("Neon not configured");
  const g = await sql`
    INSERT INTO ic_groups (name, color, created_by)
    VALUES (${name}, ${color}, ${creatorId})
    RETURNING *
  `;
  const groupId = g[0].id;
  // Add creator as admin
  await sql`
    INSERT INTO group_members (group_id, user_id, role)
    VALUES (${groupId}, ${creatorId}, 'admin')
  `;
  // Add confirmed members and notify each
  for (const memberId of memberIds) {
    await sql`
      INSERT INTO group_members (group_id, user_id, role)
      VALUES (${groupId}, ${memberId}, 'member')
      ON CONFLICT (group_id, user_id) DO NOTHING
    `;
    await sql`
      INSERT INTO notifications (user_id, type, from_user_id, reference_id, metadata)
      VALUES (${memberId}, 'group_added', ${creatorId}, ${groupId},
              ${JSON.stringify({ groupName: name })})
    `;
  }
  return g[0];
}

/** Rename a group. Only the group's admin may do this. */
export async function renameGroup(groupId, newName, myId) {
  if (!sql) throw new Error("Neon not configured");
  const rows = await sql`
    UPDATE ic_groups SET name = ${newName}, updated_at = now()
    WHERE id = ${groupId}
      AND EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = ${groupId} AND user_id = ${myId}
          AND role = 'admin' AND status = 'active'
      )
    RETURNING *
  `;
  return rows[0] || null;
}

/** Delete a group entirely. Only the creator may do this. */
export async function deleteGroup(groupId, myId) {
  if (!sql) throw new Error("Neon not configured");
  const rows = await sql`
    DELETE FROM ic_groups
    WHERE id = ${groupId} AND created_by = ${myId}
    RETURNING id
  `;
  return rows[0] || null;
}

/** A member voluntarily exits a group. Notifies group admins. */
export async function exitGroup(groupId, myId) {
  if (!sql) throw new Error("Neon not configured");
  const rows = await sql`
    UPDATE group_members
    SET status = 'exited', exited_at = now()
    WHERE group_id = ${groupId} AND user_id = ${myId}
    RETURNING *
  `;
  // Notify group admins
  const admins = await sql`
    SELECT gm.user_id FROM group_members gm
    WHERE gm.group_id = ${groupId} AND gm.role = 'admin'
      AND gm.status = 'active' AND gm.user_id != ${myId}
  `;
  const grp = await sql`SELECT name FROM ic_groups WHERE id = ${groupId} LIMIT 1`;
  const groupName = grp[0]?.name || "";
  for (const a of admins) {
    await sql`
      INSERT INTO notifications (user_id, type, from_user_id, reference_id, metadata)
      VALUES (${a.user_id}, 'group_member_exit', ${myId}, ${groupId},
              ${JSON.stringify({ groupName })})
    `;
  }
  return rows[0] || null;
}

/** Admin adds more members to an existing group. */
export async function addGroupMembers(groupId, memberIds, addedById) {
  if (!sql) throw new Error("Neon not configured");
  const grp = await sql`SELECT name FROM ic_groups WHERE id = ${groupId} LIMIT 1`;
  const groupName = grp[0]?.name || "";
  for (const memberId of memberIds) {
    await sql`
      INSERT INTO group_members (group_id, user_id, role)
      VALUES (${groupId}, ${memberId}, 'member')
      ON CONFLICT (group_id, user_id) DO UPDATE
        SET status = 'active', exited_at = null, joined_at = now()
    `;
    await sql`
      INSERT INTO notifications (user_id, type, from_user_id, reference_id, metadata)
      VALUES (${memberId}, 'group_added', ${addedById}, ${groupId},
              ${JSON.stringify({ groupName })})
    `;
  }
}

/** Admin removes a member from a group (soft-exit). */
export async function removeGroupMember(groupId, memberId) {
  if (!sql) throw new Error("Neon not configured");
  await sql`
    UPDATE group_members SET status = 'exited', exited_at = now()
    WHERE group_id = ${groupId} AND user_id = ${memberId}
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// RECOMMENDATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a recommendation and deliver it to recipients.
 *
 * recipients: array of { type: 'user'|'group', id: string }
 *   - type 'user'  → deliver directly to that user
 *   - type 'group' → deliver to all active members of that group
 */
export async function createRecommendation(reco, senderId, recipients) {
  if (!sql) throw new Error("Neon not configured");
  // Insert the shared recommendation row
  const rec = await sql`
    INSERT INTO ic_recommendations
      (recommender_id, asset_name, ticker, asset_class,
       reco_price, current_price, target_price, horizon, target_date, thesis, is_public,
       recommendation_type, stop_loss, conviction, sector, exchange,
       price_source, price_stamped_at)
    VALUES
      (${senderId}, ${reco.assetName}, ${reco.ticker}, ${reco.assetClass},
       ${reco.priceAt || null}, ${reco.price || null}, ${reco.targetPrice || null},
       ${reco.horizon || null}, ${reco.targetDate || null}, ${reco.thesis || null},
       ${reco.isPublic !== false},
       ${reco.recType || 'Buy'}, ${reco.stopLoss || null},
       ${reco.conviction || null}, ${reco.sector || null},
       ${reco.exchange || 'NSE'},
       ${reco.priceSource || null}, ${reco.priceAt ? 'now()' : null})
    RETURNING *
  `;
  const recId = rec[0].id;
  const delivered = new Set(); // prevent duplicate deliveries

  for (const r of recipients) {
    if (r.type === "user") {
      if (!delivered.has(r.id)) {
        delivered.add(r.id);
        await sql`
          INSERT INTO recommendation_deliveries
            (recommendation_id, delivered_to_user_id, via_type)
          VALUES (${recId}, ${r.id}, 'direct')
          ON CONFLICT (recommendation_id, delivered_to_user_id) DO NOTHING
        `;
        await sql`
          INSERT INTO notifications (user_id, type, from_user_id, reference_id, metadata)
          VALUES (${r.id}, 'recommendation', ${senderId}, ${recId},
                  ${JSON.stringify({ ticker: reco.ticker, assetName: reco.assetName })})
        `;
      }
    } else if (r.type === "group") {
      const members = await sql`
        SELECT user_id FROM group_members
        WHERE group_id = ${r.id} AND status = 'active' AND user_id != ${senderId}
      `;
      for (const m of members) {
        if (!delivered.has(m.user_id)) {
          delivered.add(m.user_id);
          await sql`
            INSERT INTO recommendation_deliveries
              (recommendation_id, delivered_to_user_id, via_type, via_group_id)
            VALUES (${recId}, ${m.user_id}, 'group', ${r.id})
            ON CONFLICT (recommendation_id, delivered_to_user_id) DO NOTHING
          `;
          await sql`
            INSERT INTO notifications (user_id, type, from_user_id, reference_id, metadata)
            VALUES (${m.user_id}, 'recommendation', ${senderId}, ${recId},
                    ${JSON.stringify({ ticker: reco.ticker, assetName: reco.assetName })})
          `;
        }
      }
    }
  }
  return rec[0];
}

/**
 * Load all recommendations received by a user.
 * Returns rows that map directly to the recsReceived UI state shape.
 */
export async function getMyReceivedRecos(userId) {
  if (!sql) return [];
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
      r.recommendation_type, r.stop_loss, r.conviction, r.sector, r.exit_price,
      r.created_at        AS reco_date,
      rec_up.full_name    AS from_name,
      rec_up.email        AS from_email,
      sb_up.full_name     AS shared_by_name,
      grp.name            AS via_group_name,
      -- Aggregate totals visible to all recipients
      (SELECT COUNT(*) FROM recommendation_deliveries d2
       WHERE d2.recommendation_id = r.id AND d2.reaction = 'like')     AS likes,
      (SELECT COUNT(*) FROM recommendation_deliveries d2
       WHERE d2.recommendation_id = r.id AND d2.reaction = 'dislike')  AS dislikes,
      (SELECT COUNT(*) FROM recommendation_deliveries d2
       WHERE d2.recommendation_id = r.id AND d2.is_invested = true)    AS reco_acted
    FROM recommendation_deliveries rd
    JOIN ic_recommendations r    ON r.id   = rd.recommendation_id
    JOIN user_profiles rec_up    ON rec_up.id = r.recommender_id
    LEFT JOIN user_profiles sb_up ON sb_up.id = rd.shared_by_id
    LEFT JOIN ic_groups grp       ON grp.id   = rd.via_group_id
    WHERE rd.delivered_to_user_id = ${userId}
    ORDER BY r.created_at DESC
  `;
  return rows.map(r => ({
    // Delivery-level fields (personal to this user)
    deliveryId:    r.delivery_id,
    id:            r.id,          // recommendation id — used for forwarding, exit signals
    from:          r.from_uid,
    byName:        r.from_name,
    sharedBy:      r.shared_by_id,
    sharedByName:  r.shared_by_name,
    shareType:     r.via_type === "group" ? "group" : "one",
    groupId:       r.via_group_id,
    groupName:     r.via_group_name,
    // Recommendation fields
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
    // Personal interaction
    invested:      r.is_invested,
    investedPrice: r.invested_price ? Number(r.invested_price) : null,
    reaction:      r.reaction || "none",
    hidden:        r.is_hidden,
    // Aggregates
    likes:         Number(r.likes || 0),
    dislikes:      Number(r.dislikes || 0),
    recoActed:     Number(r.reco_acted || 0),
  }));
}

/** Load all recommendations made by a user (for "Made by me" tab). */
export async function getMyMadeRecos(userId) {
  if (!sql) return [];
  const recs = await sql`
    SELECT
      r.*,
      (SELECT COUNT(*) FROM recommendation_deliveries d WHERE d.recommendation_id = r.id)
        AS recipient_count,
      (SELECT COUNT(*) FROM recommendation_deliveries d
       WHERE d.recommendation_id = r.id AND d.is_invested = true)
        AS acted_count,
      (SELECT COUNT(*) FROM recommendation_deliveries d
       WHERE d.recommendation_id = r.id AND d.reaction = 'like')
        AS like_count,
      (SELECT COUNT(*) FROM recommendation_deliveries d
       WHERE d.recommendation_id = r.id AND d.reaction = 'dislike')
        AS dislike_count
    FROM ic_recommendations r
    WHERE r.recommender_id = ${userId}
    ORDER BY r.created_at DESC
  `;
  // Also load who acted (for the expand panel)
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
    if (!acc[a.recommendation_id]) acc[a.recommendation_id] = [];
    acc[a.recommendation_id].push({ name: a.name, date: a.date });
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
    actedList:   actedByRec[r.id] || [],
    likes:       Number(r.like_count    || 0),
    dislikes:    Number(r.dislike_count || 0),
    isPublic:    r.is_public !== false,
    recType:     r.recommendation_type || 'Buy',
    stopLoss:    r.stop_loss     ? +r.stop_loss     : null,
    conviction:  r.conviction    || null,
    sector:      r.sector        || null,
    exitPrice:   r.exit_price    ? +r.exit_price    : null,
    recipients:  [], // populated separately if needed
  }));
}

/** Update a delivery row (mark invested, react, hide). */
export async function updateDelivery(deliveryId, patch, userId) {
  if (!sql) throw new Error("Neon not configured");
  const row = await sql`
    UPDATE recommendation_deliveries SET
      is_invested   = COALESCE(${patch.isInvested   ?? null}, is_invested),
      invested_price= COALESCE(${patch.investedPrice ?? null}, invested_price),
      invested_at   = CASE WHEN ${patch.isInvested ?? null} = true AND NOT is_invested
                          THEN now() ELSE invested_at END,
      reaction      = ${patch.reaction  ?? null},
      is_hidden     = COALESCE(${patch.isHidden ?? null}, is_hidden),
      updated_at    = now()
    WHERE id = ${deliveryId} AND delivered_to_user_id = ${userId}
    RETURNING *
  `;
  return row[0];
}

/** Set exit signal with an auto-stamped price from the market data service. */
export async function setExitSignal(recommendationId, userId, exitPrice, exitPriceSource) {
  if (!sql) throw new Error("Neon not configured");
  const row = await sql`
    UPDATE ic_recommendations
    SET exit_signal            = true,
        exit_date              = CURRENT_DATE,
        exit_price             = ${exitPrice || null},
        exit_price_source      = ${exitPriceSource || null},
        exit_price_stamped_at  = ${exitPrice ? new Date().toISOString() : null},
        updated_at             = now()
    WHERE id = ${recommendationId} AND recommender_id = ${userId}
    RETURNING *
  `;
  // Notify all recipients
  const recipients = await sql`
    SELECT delivered_to_user_id FROM recommendation_deliveries
    WHERE recommendation_id = ${recommendationId}
  `;
  for (const r of recipients) {
    await sql`
      INSERT INTO notifications (user_id, type, from_user_id, reference_id, metadata)
      VALUES (${r.delivered_to_user_id}, 'exit_signal', ${userId}, ${recommendationId},
              ${JSON.stringify({ ticker: row[0]?.ticker })})
    `;
  }
  return row[0];
}

/** Cancel an exit (undo). Clears all exit fields. */
export async function cancelExitSignal(recommendationId, userId) {
  if (!sql) throw new Error("Neon not configured");
  const row = await sql`
    UPDATE ic_recommendations
    SET exit_signal            = false,
        exit_date              = null,
        exit_price             = null,
        exit_price_source      = null,
        exit_price_stamped_at  = null,
        updated_at             = now()
    WHERE id = ${recommendationId} AND recommender_id = ${userId}
    RETURNING *
  `;
  return row[0];
}

/** @deprecated kept for backward compat — use setExitSignal / cancelExitSignal */
export async function toggleExitSignal(recommendationId, userId) {
  const cur = await sql`SELECT exit_signal FROM ic_recommendations WHERE id=${recommendationId} LIMIT 1`;
  return cur[0]?.exit_signal
    ? cancelExitSignal(recommendationId, userId)
    : setExitSignal(recommendationId, userId, null, null);
}

/** Forward a recommendation to additional recipients. */
export async function forwardRecommendation(recommendationId, forwarderId, recipients) {
  if (!sql) throw new Error("Neon not configured");
  const rec = await sql`
    SELECT ticker, asset_name FROM ic_recommendations WHERE id = ${recommendationId}
  `;
  const delivered = new Set();
  for (const r of recipients) {
    if (r.type === "user" && !delivered.has(r.id)) {
      delivered.add(r.id);
      await sql`
        INSERT INTO recommendation_deliveries
          (recommendation_id, delivered_to_user_id, via_type, shared_by_id)
        VALUES (${recommendationId}, ${r.id}, 'forward', ${forwarderId})
        ON CONFLICT (recommendation_id, delivered_to_user_id) DO NOTHING
      `;
      await sql`
        INSERT INTO notifications (user_id, type, from_user_id, reference_id, metadata)
        VALUES (${r.id}, 'recommendation', ${forwarderId}, ${recommendationId},
                ${JSON.stringify({ ticker: rec[0]?.ticker, assetName: rec[0]?.asset_name })})
      `;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

/** Load recent notifications for a user (last 50, newest first). */
export async function getMyNotifications(userId) {
  if (!sql) return [];
  const rows = await sql`
    SELECT n.*, up.full_name AS from_name, up.email AS from_email
    FROM notifications n
    LEFT JOIN user_profiles up ON up.id = n.from_user_id
    WHERE n.user_id = ${userId}
    ORDER BY n.created_at DESC
    LIMIT 50
  `;
  return rows;
}

/** Mark a single notification as read. */
export async function markNotifRead(notifId, userId) {
  if (!sql) return;
  await sql`
    UPDATE notifications SET is_read = true
    WHERE id = ${notifId} AND user_id = ${userId}
  `;
}

/** Mark all notifications as read for a user. */
export async function markAllNotifRead(userId) {
  if (!sql) return;
  await sql`UPDATE notifications SET is_read = true WHERE user_id = ${userId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARING PREFERENCES
// ─────────────────────────────────────────────────────────────────────────────

/** Load all sharing preferences for a user as { targetId → {visibility, level, selected} }. */
export async function getSharingPrefs(userId) {
  if (!sql) return {};
  const rows = await sql`
    SELECT target_id, visibility, level, selected_holding_ids
    FROM sharing_preferences WHERE user_id = ${userId}
  `;
  return rows.reduce((acc, r) => {
    acc[r.target_id] = {
      visibility: r.visibility,
      level: r.level,
      selected: r.selected_holding_ids || [],
    };
    return acc;
  }, {});
}

/** Save (upsert) a sharing preference for one target. */
export async function upsertSharingPref(userId, targetId, targetType, prefs) {
  if (!sql) return;
  await sql`
    INSERT INTO sharing_preferences
      (user_id, target_id, target_type, visibility, level, selected_holding_ids)
    VALUES
      (${userId}, ${targetId}, ${targetType},
       ${prefs.visibility}, ${prefs.level}, ${prefs.selected || []})
    ON CONFLICT (user_id, target_id) DO UPDATE SET
      visibility           = EXCLUDED.visibility,
      level                = EXCLUDED.level,
      selected_holding_ids = EXCLUDED.selected_holding_ids,
      updated_at           = now()
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hard-delete a recommendation the current user made.
 * CASCADE removes all delivery rows and notifications automatically.
 * Only the recommender can delete their own recommendation.
 */
export async function deleteRecommendation(recommendationId, userId) {
  if (!sql) return;
  await sql`
    DELETE FROM ic_recommendations
    WHERE id = ${recommendationId} AND recommender_id = ${userId}
  `;
}

/**
 * Remove a received recommendation from this user's list.
 * Deletes only THIS user's delivery row — other recipients are unaffected.
 * The underlying recommendation (and the recommender's record) is preserved.
 */
export async function deleteDelivery(deliveryId, userId) {
  if (!sql) return;
  await sql`
    DELETE FROM recommendation_deliveries
    WHERE id = ${deliveryId} AND delivered_to_user_id = ${userId}
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// USERNAME
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check whether a username is available.
 * Returns true if nobody else has it, false if taken.
 * Excludes the current user's own ID so they can "re-save" their existing username.
 */
export async function checkUsername(username, myId) {
  if (!sql) return true; // can't check without DB — assume available
  const rows = await sql`
    SELECT id FROM user_profiles
    WHERE username = ${username}
      AND id != ${myId}
    LIMIT 1
  `;
  return rows.length === 0; // true = available
}

/**
 * Persist a username for the current user.
 * Should only be called once the caller has verified availability.
 */
export async function saveUsername(userId, username) {
  if (!sql) throw new Error("Neon not configured");
  await sql`
    UPDATE user_profiles
    SET username = ${username}, updated_at = now()
    WHERE id = ${userId}
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC PROFILE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load everything needed to render a user's public profile page.
 * No authentication required — called with just a username string.
 *
 * Return logic for "in/out of money":
 *   • Active rec (not expired, no exit signal): compare current_price to reco_price
 *   • Expired OR exited: still compare current_price (best available; no historical prices stored)
 *   • No price at all: treat as 0% return (not in money, not out of money)
 *
 * All stats filter to is_public = true only.
 */
// ─────────────────────────────────────────────────────────────────────────────
// ICI SCORE — computed in JS from summary data
// ─────────────────────────────────────────────────────────────────────────────
export function computeIci({ years_history, total, hit_rate_pct, median_return, risk_adjusted_return, deleted_count }) {
  const yrs    = Math.max(Number(years_history)       || 0, 0);
  const recs   = Math.max(Number(total)               || 0, 0);
  const hr     = Math.max(Number(hit_rate_pct)        || 0, 0);
  const med    = Math.max(Number(median_return)       || 0, 0);
  const ra     = Math.max(Number(risk_adjusted_return)|| 0, 0);
  const dels   = Math.max(Number(deleted_count)       || 0, 0);

  const trackLen    = Math.min(yrs  / 3,  1) * 15;   // 3 yrs = full marks
  const volume      = Math.min(recs / 20, 1) * 15;   // 20 recs = full marks
  const hitRate     = (hr / 100)               * 20;
  const medianRet   = Math.min(med / 15, 1)    * 15;  // 15% median = full
  const riskAdj     = Math.min(ra  / 2,  1)    * 15;  // Sharpe 2 = full
  const transparency = (1 - Math.min(dels / Math.max(recs, 1), 1)) * 10;
  const profileVerif = 10; // upgraded later when identity verification is built

  const score = Math.min(Math.round(trackLen + volume + hitRate + medianRet + riskAdj + transparency + profileVerif), 100);
  const band  = score >= 75 ? 'Strong' : score >= 55 ? 'Good' : score >= 35 ? 'Building' : 'Early';

  return {
    score, band,
    components: [
      { label: 'Track record length',   score: Math.round(trackLen),    max: 15 },
      { label: 'Recommendation volume', score: Math.round(volume),      max: 15 },
      { label: 'Hit rate',              score: Math.round(hitRate),      max: 20 },
      { label: 'Median return',         score: Math.round(medianRet),    max: 15 },
      { label: 'Risk-adjusted return',  score: Math.round(riskAdj),     max: 15 },
      { label: 'Transparency',          score: Math.round(transparency), max: 10 },
      { label: 'Profile verification',  score: Math.round(profileVerif), max: 10 },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC PROFILE — full data for the public profile page
// Status rules (per product spec):
//   Active  = NOT exit_signal AND (target_date IS NULL OR target_date >= today)
//   Closed  = exit_signal = true
//   Expired = NOT exit_signal AND target_date IS NOT NULL AND target_date < today
// ─────────────────────────────────────────────────────────────────────────────
export async function getPublicProfile(username) {
  if (!sql || !username) return null;

  // ── 1. User basics ───────────────────────────────────────────────────────
  const users = await sql`
    SELECT
      up.id, up.full_name, up.first_name, up.last_name,
      up.username, up.created_at,
      (SELECT COUNT(*) FROM connections
       WHERE (requester_id = up.id OR addressee_id = up.id)
         AND status = 'accepted')                                AS connection_count,
      (SELECT COUNT(*) FROM group_members
       WHERE user_id = up.id AND status = 'active')             AS group_count
    FROM user_profiles up
    WHERE up.username = ${username}
    LIMIT 1
  `;
  if (!users[0]) return null;
  const userId = users[0].id;

  // ── 2. Summary counts ────────────────────────────────────────────────────
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
      ROUND(
        EXTRACT(EPOCH FROM (now() - MIN(created_at))) / 86400 / 365,
        1
      )                                                          AS years_history
    FROM ic_recommendations
    WHERE recommender_id = ${userId} AND is_public = true
  `;
  const sumRow = summary[0] || {};

  // ── 3. Live scorecard (active positions) ─────────────────────────────────
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

  // Best / worst live
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

  // ── 4. Realized scorecard (closed positions only) ────────────────────────
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

  // ── 5. Sector breakdown ──────────────────────────────────────────────────
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

  // ── 6. Recommendations list (all, sorted by date) ────────────────────────
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

  const realRow   = realized[0] || {};
  const liveRow   = live[0]     || {};
  const sumData   = sumRow;

  return {
    profile:  users[0],
    summary: {
      total:         Number(sumData.total         || 0),
      active:        Number(sumData.active        || 0),
      closed:        Number(sumData.closed        || 0),
      expired:       Number(sumData.expired       || 0),
      years_history: Number(sumData.years_history || 0),
    },
    live: {
      count:          Number(liveRow.active_count  || 0),
      in_profit:      Number(liveRow.in_profit     || 0),
      in_loss:        Number(liveRow.in_loss       || 0),
      avg_return:     Number(liveRow.avg_live_return || 0),
      avg_holding_days: Number(liveRow.avg_holding_days || 0),
      best:  bestLive[0]  || null,
      worst: worstLive[0] || null,
    },
    realized: {
      count:              Number(realRow.closed_count         || 0),
      win_count:          Number(realRow.win_count            || 0),
      loss_count:         Number(realRow.loss_count           || 0),
      hit_rate_pct:       Number(realRow.hit_rate_pct         || 0),
      median_return:      Number(realRow.median_return        || 0),
      avg_return:         Number(realRow.avg_return           || 0),
      risk_adjusted:      Number(realRow.risk_adjusted_return || 0),
      avg_holding_days:   Number(realRow.avg_holding_days     || 0),
      best: bestClosed[0] || null,
    },
    sectors: sectors.map(s => ({
      sector:            s.sector,
      total_recs:        Number(s.total_recs         || 0),
      active_count:      Number(s.active_count       || 0),
      active_in_profit:  Number(s.active_in_profit   || 0),
      closed_count:      Number(s.closed_count       || 0),
      closed_wins:       Number(s.closed_wins        || 0),
      median_return:     Number(s.median_closed_return || 0),
    })),
    recos,
  };
}
