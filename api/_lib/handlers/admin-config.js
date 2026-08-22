/**
 * api/_lib/handlers/admin-config.js — admin-config resource handler
 *
 * Dispatched by api/data.js (resource=admin-config). Admin authorization is
 * enforced by api/data.js (requireAdmin) BEFORE this handler ever runs — the
 * caller's identity is derived from their verified Firebase ID token, then
 * their user_profiles.is_admin flag is looked up server-side (never trusted
 * from the client); non-admins never reach this code. See admin-sebi.js for
 * the same pattern.
 *
 * Covers three admin-only config domains previously done via direct browser
 * Neon access in src/App.jsx:
 *   (A) Feed configuration  — AdminFeedConfig (~App.jsx:8750)
 *   (B) Instruments admin   — AdminInstruments / InstrumentBrowser /
 *                              InstrumentUploader / InstrumentAddForm
 *                              (~App.jsx:8838-9046)
 *   (C) Admin user deletion — AdminUsers.hardDelete (~App.jsx:9273-9295)
 *
 * NOTE: the non-admin read paths for feed config options (Sharing & Privacy
 * toggle screen, ~App.jsx:4870) and instruments (loadInstruments/loadSectorOpts
 * typeahead, ~App.jsx:8153-8184) are NOT covered here — those are ordinary
 * logged-in-user reads, handled by a separate non-admin-gated resource.
 *
 * GET ?resource=admin-config&scope=feed-config
 *   -> 200 { options: [{ key, label, description, category, admin_enabled,
 *                        always_on, default_on, sort_order }] }
 *
 * GET ?resource=admin-config&scope=instruments&search=&page=&pageSize=
 *   -> 200 { instruments: [{ id, symbol, name, exchange, type, asset_class,
 *                            currency, sector }], total }
 *   search: optional substring, matched against symbol/name (ILIKE).
 *   page: 0-based page index (default 0). pageSize: default 50, max 200.
 *
 * GET ?resource=admin-config&scope=instruments-export
 *   -> 200 { instruments: [{ symbol, name, exchange, type, "Asset Class",
 *                            currency }] }  (all active, unpaginated)
 *
 * POST ?resource=admin-config
 *   Body: { action, ... }
 *     feed-config-toggle:   { key, field: 'admin_enabled'|'always_on'|'default_on', value: boolean }
 *     instrument-upsert:    { symbol, name, exchange, type, assetClass, currency, sector? }
 *       — used by both the bulk-import and single-add-form frontend call
 *         sites (identical INSERT ... ON CONFLICT (symbol,exchange) DO UPDATE
 *         shape in both; only the caller's loop cardinality differs).
 *     instrument-deactivate: { id }
 *     delete-user:           { userId }
 *       — hard-deletes a user: inserts into deleted_users (blacklist, so
 *         AuthContext.jsx force-signs them out) then deletes user_profiles.
 *         ON DELETE CASCADE on the FKs referencing user_profiles(id)
 *         (connections, ic_groups, group_members, ic_recommendations,
 *         recommendation_deliveries, notifications, etc — see
 *         supabase/migration_v2.sql) removes their v2 table data; no manual
 *         cascade needed here.
 */

import { sql, parseBody } from '../auth.js';

const FEED_TOGGLE_FIELDS = ['admin_enabled', 'always_on', 'default_on'];

async function getFeedConfig() {
  const options = await sql`
    SELECT key, label, description, category, admin_enabled, always_on, default_on, sort_order
    FROM feed_config_options
    ORDER BY sort_order
  `;
  return options;
}

async function getInstruments(search, page, pageSize) {
  const offset = page * pageSize;
  const like = `%${search}%`;
  const [instruments, countRows] = await Promise.all([
    search
      ? sql`
          SELECT id, symbol, name, exchange, type, asset_class, currency, sector, source
          FROM instruments
          WHERE is_active = true AND (symbol ILIKE ${like} OR name ILIKE ${like})
          ORDER BY symbol
          LIMIT ${pageSize} OFFSET ${offset}
        `
      : sql`
          SELECT id, symbol, name, exchange, type, asset_class, currency, sector, source
          FROM instruments
          WHERE is_active = true
          ORDER BY symbol
          LIMIT ${pageSize} OFFSET ${offset}
        `,
    search
      ? sql`SELECT COUNT(*) FROM instruments WHERE is_active = true AND (symbol ILIKE ${like} OR name ILIKE ${like})`
      : sql`SELECT COUNT(*) FROM instruments WHERE is_active = true`,
  ]);
  return { instruments, total: Number(countRows[0]?.count || 0) };
}

async function getInstrumentsExport() {
  return sql`
    SELECT symbol, name, exchange, type, asset_class AS "Asset Class", currency, source
    FROM instruments
    WHERE is_active = true
    ORDER BY symbol
  `;
}

export default async function handleAdminConfig(req, res, userId) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const scope = String(req.query?.scope || '');

      if (scope === 'feed-config') {
        res.status(200).json({ options: await getFeedConfig() });
        return;
      }

      if (scope === 'instruments') {
        const search = String(req.query?.search || '').trim();
        const page = Math.max(0, parseInt(req.query?.page, 10) || 0);
        const pageSize = Math.min(200, Math.max(1, parseInt(req.query?.pageSize, 10) || 50));
        const { instruments, total } = await getInstruments(search, page, pageSize);
        res.status(200).json({ instruments, total });
        return;
      }

      if (scope === 'instruments-export') {
        res.status(200).json({ instruments: await getInstrumentsExport() });
        return;
      }

      if (scope === 'user-by-email') {
        const email = String(req.query?.email || '').trim().toLowerCase();
        if (!email) { res.status(400).json({ error: 'email is required' }); return; }
        const rows = await sql`
          SELECT id, full_name, email, is_admin, created_at FROM user_profiles WHERE email = ${email} LIMIT 1
        `;
        res.status(200).json({ user: rows[0] || null });
        return;
      }

      if (scope === 'all-users') {
        const rows = await sql`
          SELECT id, full_name, email, username, is_admin, is_unclaimed, claim_status, created_at
          FROM user_profiles
          WHERE (claim_status IS DISTINCT FROM 'claimed')
          ORDER BY created_at
        `;
        res.status(200).json({ users: rows });
        return;
      }

      res.status(400).json({ error: 'Unknown scope' });
      return;
    }

    const body = parseBody(req);
    const action = String(body.action || '');

    if (action === 'feed-config-toggle') {
      const key = String(body.key || '');
      const field = String(body.field || '');
      const value = body.value;
      if (!key) { res.status(400).json({ error: 'key is required' }); return; }
      if (!FEED_TOGGLE_FIELDS.includes(field)) {
        res.status(400).json({ error: 'field must be one of admin_enabled, always_on, default_on' });
        return;
      }
      if (typeof value !== 'boolean') {
        res.status(400).json({ error: 'value must be a boolean' });
        return;
      }
      if (field === 'admin_enabled') {
        await sql`UPDATE feed_config_options SET admin_enabled = ${value} WHERE key = ${key}`;
      } else if (field === 'always_on') {
        await sql`UPDATE feed_config_options SET always_on = ${value} WHERE key = ${key}`;
      } else {
        await sql`UPDATE feed_config_options SET default_on = ${value} WHERE key = ${key}`;
      }
      res.status(200).json({ success: true });
      return;
    }

    if (action === 'instrument-upsert') {
      const symbol = String(body.symbol || '').trim().toUpperCase();
      const name = String(body.name || '').trim();
      const exchange = String(body.exchange || '').trim();
      const type = String(body.type || '').trim();
      const assetClass = String(body.assetClass || '').trim();
      const currency = String(body.currency || '').trim();
      const sector = body.sector ? String(body.sector).trim() : null;
      if (!symbol || !name || !exchange || !type || !assetClass || !currency) {
        res.status(400).json({ error: 'symbol, name, exchange, type, assetClass and currency are required' });
        return;
      }
      // Instrument identity is (symbol, asset_class) as of the Phase 9
      // migration — NOT (symbol, exchange). Exchange is informational: this
      // app never treats the NSE and BSE listings of one company as
      // different instruments, so re-importing a CSV that lists both now
      // updates the single canonical row instead of creating two.
      //
      // The conflict branch refreshes every field the admin actually
      // supplied. Previously it silently dropped `exchange`, `type` and
      // `currency` — correcting a wrong exchange or type through the admin
      // form appeared to succeed and changed nothing. It also resets
      // `is_active` to true, so re-adding a previously deactivated symbol
      // brings it back rather than writing an invisible row, and re-stamps
      // `source='admin'`: a human curating a row the nightly price batch
      // auto-minted promotes it out of 'auto', which is the intended
      // reconciliation path for auto-created rows.
      const row = await sql`
        INSERT INTO instruments (symbol, name, exchange, type, asset_class, currency, sector, source)
        VALUES (${symbol}, ${name}, ${exchange}, ${type}, ${assetClass}, ${currency}, ${sector}, 'admin')
        ON CONFLICT (symbol, asset_class) DO UPDATE SET
          name = EXCLUDED.name,
          exchange = EXCLUDED.exchange,
          type = EXCLUDED.type,
          currency = EXCLUDED.currency,
          sector = COALESCE(EXCLUDED.sector, instruments.sector),
          is_active = true,
          source = 'admin',
          updated_at = now()
        RETURNING id, symbol, name, exchange, type, asset_class, currency, sector, source
      `;
      res.status(200).json({ instrument: row[0] });
      return;
    }

    if (action === 'instrument-deactivate') {
      const id = body.id;
      if (!id) { res.status(400).json({ error: 'id is required' }); return; }
      await sql`UPDATE instruments SET is_active = false WHERE id = ${id}`;
      res.status(200).json({ success: true });
      return;
    }

    if (action === 'bulk-seed-profiles') {
      const profiles = Array.isArray(body.profiles) ? body.profiles : [];
      const results = [];
      for (const p of profiles) {
        try {
          const res = await sql`
            UPDATE user_profiles SET
              first_name=${p.first_name || null}, last_name=${p.last_name || null},
              full_name=${[p.first_name, p.last_name].filter(Boolean).join(' ') || null},
              bio=${p.bio}, avatar_color=${p.avatar_color},
              registration_status=${p.registration_status || 'self_directed'},
              twitter_url=${p.twitter_url}, linkedin_url=${p.linkedin_url},
              telegram_url=${p.telegram_url}, instagram_url=${p.instagram_url}
            WHERE email=${p.email} RETURNING id
          `;
          results.push({ email: p.email, ok: res.length > 0 });
        } catch (e) { results.push({ email: p.email, ok: false, error: e?.message }); }
      }
      res.status(200).json({ results });
      return;
    }

    if (action === 'bulk-seed-recos') {
      const recos = Array.isArray(body.recos) ? body.recos : [];
      const seedMode = body.seedMode === 'replace' ? 'replace' : (body.seedMode === 'skip' ? 'skip' : 'append');
      const results = [];

      const usernames = [...new Set(recos.map(r => r.username))];
      const userMap = {};
      for (const uname of usernames) {
        try {
          const rows = await sql`SELECT id FROM user_profiles WHERE username=${uname} LIMIT 1`;
          if (rows.length) userMap[uname] = rows[0].id;
          results.push({ kind: 'lookup', username: uname, found: rows.length > 0 });
        } catch (e) { results.push({ kind: 'lookup', username: uname, found: false, error: e?.message }); }
      }

      if (seedMode === 'replace') {
        for (const [uname, uid] of Object.entries(userMap)) {
          try {
            const del = await sql`DELETE FROM ic_recommendations WHERE recommender_id=${uid} RETURNING id`;
            results.push({ kind: 'delete', username: uname, count: del.length });
          } catch (e) { results.push({ kind: 'delete', username: uname, error: e?.message }); }
        }
      }

      for (const r of recos) {
        const uid = userMap[r.username];
        if (!uid) { results.push({ kind: 'reco', ticker: r.ticker, username: r.username, status: 'skipped_no_user' }); continue; }
        if (r._rowErrs && r._rowErrs.length) { results.push({ kind: 'reco', ticker: r.ticker, username: r.username, status: 'skipped_errors', errors: r._rowErrs }); continue; }

        if (seedMode === 'skip') {
          try {
            const ex = await sql`SELECT id FROM ic_recommendations WHERE recommender_id=${uid} AND ticker=${r.ticker} AND created_at::date=${r.created_date} LIMIT 1`;
            if (ex.length) { results.push({ kind: 'reco', ticker: r.ticker, username: r.username, status: 'skipped_exists' }); continue; }
          } catch (_) { /* fall through to insert attempt */ }
        }

        try {
          await sql`
            INSERT INTO ic_recommendations (
              recommender_id, asset_name, ticker, asset_class, exchange,
              recommendation_type, reco_price, current_price, target_price, stop_loss,
              horizon, thesis, sector, conviction, is_public,
              created_at, exit_signal, exit_date
            ) VALUES (
              ${uid}, ${r.asset_name}, ${r.ticker}, ${r.asset_class}, ${r.exchange},
              ${r.recommendation_type}, ${r.reco_price}, ${r.current_price},
              ${r.target_price}, ${r.stop_loss},
              ${r.horizon}, ${r.thesis}, ${r.sector}, ${r.conviction}, ${r.is_public},
              ${r.created_date + 'T09:00:00.000Z'},
              ${r.status === 'closed'}, ${r.exit_date}
            )
          `;
          results.push({ kind: 'reco', ticker: r.ticker, username: r.username, status: 'inserted' });
        } catch (e) { results.push({ kind: 'reco', ticker: r.ticker, username: r.username, status: 'failed', error: e?.message }); }
      }
      res.status(200).json({ results });
      return;
    }

    if (action === 'create-user-profile') {
      const id = String(body.id || '');
      const email = String(body.email || '').trim();
      const fullName = String(body.fullName || '').trim();
      const firstName = String(body.firstName || '').trim();
      const lastName = String(body.lastName || '').trim();
      const username = body.username ? String(body.username).trim() : null;
      if (!id || !email || !fullName) {
        res.status(400).json({ error: 'id, email and fullName are required' });
        return;
      }
      const row = await sql`
        INSERT INTO user_profiles (id, email, full_name, first_name, last_name, is_admin, username)
        VALUES (${id}, ${email}, ${fullName}, ${firstName}, ${lastName}, false, ${username})
        ON CONFLICT (id) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          first_name = COALESCE(NULLIF(user_profiles.first_name, ''), EXCLUDED.first_name),
          last_name = COALESCE(NULLIF(user_profiles.last_name, ''), EXCLUDED.last_name),
          username = COALESCE(user_profiles.username, EXCLUDED.username),
          updated_at = now()
        RETURNING id, full_name, email, is_admin, created_at
      `;
      res.status(200).json({ user: row[0] });
      return;
    }

    if (action === 'seed-creator-recos') {
      const creatorId = String(body.creatorId || '');
      const recos = Array.isArray(body.recos) ? body.recos : [];
      if (!creatorId || !recos.length) { res.status(400).json({ error: 'creatorId and recos are required' }); return; }
      let count = 0;
      for (const r of recos) {
        const ts = r.recoDate ? new Date(r.recoDate + 'T12:00:00').toISOString() : null;
        const exitTs = r.exitDate ? new Date(r.exitDate + 'T12:00:00').toISOString() : null;
        await sql`
          INSERT INTO ic_recommendations (
            recommender_id, asset_name, ticker, asset_class, exchange,
            recommendation_type, reco_price, target_price, stop_loss,
            horizon, thesis, sector, conviction, is_public, currency, created_at,
            exit_signal, exit_date, current_price
          ) VALUES (
            ${creatorId},    ${r.assetName},  ${r.ticker},    ${r.assetClass}, ${r.exchange},
            ${r.recType},    ${r.recoPrice},  ${r.targetPrice}, ${r.stopLoss},
            ${r.horizon},    ${r.thesis},      ${r.sector},    ${r.conviction},
            ${r.isPublic},   ${r.currency},    ${ts},
            ${r.exitSignal || false}, ${exitTs}, ${r.exitSignal ? r.exitPrice : null}
          )
        `;
        count++;
      }
      res.status(200).json({ count });
      return;
    }

    if (action === 'delete-user') {
      const targetUserId = String(body.userId || '');
      if (!targetUserId) { res.status(400).json({ error: 'userId is required' }); return; }
      const target = await sql`SELECT id, email FROM user_profiles WHERE id = ${targetUserId} LIMIT 1`;
      if (!target[0]) { res.status(404).json({ error: 'not_found' }); return; }
      await sql`INSERT INTO deleted_users (id, email) VALUES (${target[0].id}, ${target[0].email}) ON CONFLICT DO NOTHING`;
      await sql`DELETE FROM user_profiles WHERE id = ${targetUserId}`;
      res.status(200).json({ success: true, deletedUserId: targetUserId });
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[admin-config] error:', e?.message);
    res.status(500).json({ error: 'Database error' });
  }
}
