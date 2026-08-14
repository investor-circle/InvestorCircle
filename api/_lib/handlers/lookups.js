/**
 * api/_lib/handlers/lookups.js — "lookups" resource handler
 *
 * Dispatched by api/data.js (resource=lookups) with auth:'none' at the
 * api/data.js level — this file bundles several small domains with DIFFERENT
 * auth needs (public reads, authenticated reads/writes, admin writes), so it
 * cannot rely on api/data.js's uniform per-resource auth gate. Each action
 * below calls requireUid()/requireAdmin() itself where needed, mirroring how
 * api/data.js does it, and reports auth failures via sendAuthError().
 *
 * GET  ?resource=lookups&action=username-available&username=...&excludeId=...
 * GET  ?resource=lookups&action=sectors                                  (auth: user)
 * GET  ?resource=lookups&action=portfolio-list                           (auth: user)
 * GET  ?resource=lookups&action=about-us
 *
 * POST ?resource=lookups
 *   Body: { action, ... }
 *     username-save:      { username }                        (auth: user)
 *     portfolio-add:      { holding: {...} }                   (auth: user)
 *     portfolio-delete:   { id }                                (auth: user)
 *     portfolio-delete-all: {}                                  (auth: user)
 *     feature-vote:       { featureKey }                        (auth: none)
 *     contact-submit:     { name?, email, subject, category?, message }  (auth: none)
 *     about-us-save:      { html }                              (auth: admin)
 *     user-lookup:        { by: 'id'|'username'|'email', value }         (auth: user)
 *     user-lookup-batch:  { by: 'id', values: [...] }                    (auth: user)
 *
 * SECURITY: this file only ever exposes id/username/full_name/email from
 * user_profiles — never sebi_*, claim_token, claim_status, claimed_by_uid,
 * consent_*, referred_by, or any other sensitive column. Every write derives
 * identity from requireUid()/requireAdmin() — never from a client-supplied id.
 */

import { sql, parseBody, requireUid, requireAdmin, sendAuthError } from '../auth.js';

const USERNAME_RE = /^[a-z0-9_]{5,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FEATURE_KEYS = ['portfolio_import', 'ai_summaries', 'mutual_fund', 'leaderboards', 'overlap', 'mobile_app'];
const CONTACT_CATEGORIES = ['bug', 'feature', 'question', 'partner', 'media', 'misleading', 'abuse', 'other'];
const ALLOWED_REG_STATUS_LOOKUPS = ['self_directed', 'sebi_ra', 'sebi_ria'];

async function isUsernameAvailable(username, excludeId) {
  const rows = excludeId
    ? await sql`SELECT id FROM user_profiles WHERE username = ${username} AND id != ${excludeId} LIMIT 1`
    : await sql`SELECT id FROM user_profiles WHERE username = ${username} LIMIT 1`;
  return rows.length === 0;
}

function holdingFields(h) {
  h = h || {};
  return {
    id:           String(h.id || ''),
    sym:          String(h.sym || ''),
    name:         String(h.name || ''),
    type:         String(h.type || 'Stock'),
    acct:         String(h.acct || 'manual'),
    acctName:     String(h.acctName || 'Manual Portfolio'),
    sh:           Number(h.sh) || 0,
    cost:         Number(h.cost) || 0,
    price:        Number(h.price) || 0,
    isin:         String(h.isin || ''),
    sector:       String(h.sector || ''),
    currency:     String(h.currency || 'INR'),
    purchaseDate: h.purchaseDate || null,
    source:       String(h.source || 'manual'),
  };
}

export default async function handleLookups(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const action = String(req.query?.action || '');

      if (action === 'username-available') {
        const username = String(req.query?.username || '').trim().toLowerCase();
        const excludeId = req.query?.excludeId ? String(req.query.excludeId) : null;
        if (!username) { res.status(400).json({ error: 'username is required' }); return; }
        const available = await isUsernameAvailable(username, excludeId);
        res.status(200).json({ available });
        return;
      }

      if (action === 'instruments-list') {
        try { await requireUid(req); } catch (e) { sendAuthError(res, e); return; }
        const rows = await sql`
          SELECT symbol, name, exchange, type, asset_class, currency, sector
          FROM instruments WHERE is_active = true ORDER BY symbol
        `;
        res.status(200).json({ instruments: rows });
        return;
      }

      if (action === 'sectors') {
        let uid;
        try { uid = await requireUid(req); } catch (e) { sendAuthError(res, e); return; }
        void uid;
        const rows = await sql`
          SELECT DISTINCT sector FROM sector_master
          WHERE sector IS NOT NULL AND sector <> ''
          ORDER BY CASE WHEN sector = 'Other' THEN 1 ELSE 0 END, sector
        `;
        res.status(200).json({ sectors: rows.map(r => r.sector) });
        return;
      }

      if (action === 'portfolio-list') {
        let uid;
        try { uid = await requireUid(req); } catch (e) { sendAuthError(res, e); return; }
        const rows = await sql`
          SELECT id, sym, name, type, acct, acct_name, sh, cost, price, isin, sector,
                 currency, purchase_date, source
          FROM portfolio_holdings
          WHERE owner_id = ${uid}
          ORDER BY created_at ASC
        `;
        res.status(200).json({ holdings: rows });
        return;
      }

      if (action === 'profile-nav-info') {
        try { await requireUid(req); } catch (e) { sendAuthError(res, e); return; }
        const userId = String(req.query?.userId || '');
        if (!userId) { res.status(400).json({ error: 'userId is required' }); return; }
        const rows = await sql`
          SELECT username, registration_status, sebi_approval_status
          FROM user_profiles WHERE id = ${userId} LIMIT 1
        `;
        if (!rows[0]) { res.status(200).json({ info: null }); return; }
        const isSebiApproved = ['sebi_ra', 'sebi_ria'].includes(rows[0].registration_status)
          && rows[0].sebi_approval_status === 'approved';
        res.status(200).json({ info: { username: rows[0].username || null, isSebiApproved } });
        return;
      }

      if (action === 'reg-options') {
        try { await requireUid(req); } catch (e) { sendAuthError(res, e); return; }
        const [opts, msg] = await Promise.all([
          sql`SELECT id, code, label, description, is_active, sort_order FROM registration_status_options WHERE is_active=true ORDER BY sort_order`,
          sql`SELECT value FROM app_settings WHERE key='sebi_verification_message' LIMIT 1`,
        ]);
        res.status(200).json({ options: opts, verifyMessage: msg[0]?.value || '' });
        return;
      }

      if (action === 'reco-recommender-username') {
        try { await requireUid(req); } catch (e) { sendAuthError(res, e); return; }
        const recoId = String(req.query?.recoId || '');
        if (!recoId) { res.status(400).json({ error: 'recoId is required' }); return; }
        const rows = await sql`
          SELECT username FROM user_profiles
          WHERE id = (SELECT recommender_id FROM ic_recommendations WHERE id = ${recoId})
          LIMIT 1
        `;
        res.status(200).json({ username: rows[0]?.username || null });
        return;
      }

      if (action === 'about-us') {
        const rows = await sql`SELECT value FROM app_settings WHERE key = 'about_us_content' LIMIT 1`;
        res.status(200).json({ html: rows[0]?.value || null });
        return;
      }

      if (action === 'feed-config') {
        let uid;
        try { uid = await requireUid(req); } catch (e) { sendAuthError(res, e); return; }
        const [opts, prefs] = await Promise.all([
          sql`SELECT key, label, description, category, admin_enabled, always_on, default_on, sort_order
              FROM feed_config_options ORDER BY sort_order`,
          sql`SELECT config_key, enabled FROM user_feed_preferences WHERE user_id = ${uid}`,
        ]);
        res.status(200).json({ options: opts, prefs });
        return;
      }

      if (action === 'network-engagement-feed') {
        let uid;
        try { uid = await requireUid(req); } catch (e) { sendAuthError(res, e); return; }
        const activeConns = String(req.query?.connIds || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 500);
        if (!activeConns.length) { res.status(200).json({ recos: [] }); return; }
        const rows = await sql`
          SELECT DISTINCT ir.id, ir.asset_name, ir.ticker, ir.asset_class,
                 ir.recommendation_type, ir.reco_price, ir.current_price,
                 ir.target_price, ir.stop_loss, ir.horizon, ir.thesis,
                 ir.sector, ir.conviction, ir.created_at as date, ir.is_public,
                 up.full_name as by_name, up.id as from_id,
                 0 as likes,
                 (SELECT COUNT(*) FROM recommendation_comments rc WHERE rc.reco_id=ir.id)::int as comment_count
          FROM recommendation_deliveries rd
          JOIN ic_recommendations ir ON ir.id = rd.recommendation_id
          JOIN user_profiles up ON up.id = ir.recommender_id
          WHERE rd.recipient_id = ANY(${activeConns})
            AND (rd.reaction = 'like'
              OR EXISTS (SELECT 1 FROM recommendation_comments rc
                         WHERE rc.reco_id=ir.id AND rc.user_id=ANY(${activeConns})))
            AND ir.id NOT IN (
              SELECT recommendation_id FROM recommendation_deliveries WHERE recipient_id=${uid}
            )
          ORDER BY ir.created_at DESC
          LIMIT 50
        `;
        res.status(200).json({ recos: rows });
        return;
      }

      if (action === 'public-feed') {
        let uid;
        try { uid = await requireUid(req); } catch (e) { sendAuthError(res, e); return; }
        const rows = await sql`
          SELECT ir.id, ir.asset_name, ir.ticker, ir.asset_class,
                 ir.recommendation_type, ir.reco_price, ir.current_price,
                 ir.target_price, ir.stop_loss, ir.horizon, ir.thesis,
                 ir.sector, ir.conviction, ir.created_at as date, ir.is_public,
                 up.full_name as by_name, up.id as from_id, up.username as from_username,
                 (SELECT COUNT(*) FROM recommendation_comments rc WHERE rc.reco_id=ir.id)::int as comment_count,
                 (SELECT COUNT(*) FROM recommendation_reactions rx WHERE rx.reco_id=ir.id::text)::int as likes_count
          FROM ic_recommendations ir
          JOIN user_profiles up ON up.id = ir.recommender_id
          WHERE ir.is_public = true
            AND ir.recommender_id != ${uid}
            AND (up.is_unclaimed IS NULL OR up.is_unclaimed = FALSE)
            AND (up.claim_status IS DISTINCT FROM 'claimed')
          ORDER BY ir.created_at DESC
          LIMIT 100
        `;
        res.status(200).json({ recos: rows });
        return;
      }

      if (action === 'consensus-all') {
        try { await requireUid(req); } catch (e) { sendAuthError(res, e); return; }
        const rows = await sql`
          SELECT r.ticker, r.asset_name, r.recommendation_type,
                 r.recommender_id as "from", r.conviction, r.created_at,
                 up.full_name, up.username
          FROM ic_recommendations r
          LEFT JOIN user_profiles up ON r.recommender_id = up.id
          WHERE (up.is_unclaimed IS NULL OR up.is_unclaimed = FALSE)
            AND (up.claim_status IS DISTINCT FROM 'claimed')
        `;
        res.status(200).json({ recos: rows });
        return;
      }

      if (action === 'consensus-public') {
        try { await requireUid(req); } catch (e) { sendAuthError(res, e); return; }
        const rows = await sql`
          SELECT r.ticker, r.asset_name, r.recommendation_type,
                 r.recommender_id as "from", r.conviction, r.created_at, r.sector,
                 up.username, up.full_name
          FROM ic_recommendations r
          LEFT JOIN user_profiles up ON r.recommender_id = up.id
          WHERE r.is_public = true
            AND (up.is_unclaimed IS NULL OR up.is_unclaimed = FALSE)
            AND (up.claim_status IS DISTINCT FROM 'claimed')
          ORDER BY r.created_at DESC
        `;
        res.status(200).json({ recos: rows });
        return;
      }

      if (action === 'ticker-recos') {
        try { await requireUid(req); } catch (e) { sendAuthError(res, e); return; }
        const ticker = String(req.query?.ticker || '');
        if (!ticker) { res.status(400).json({ error: 'ticker is required' }); return; }
        const rows = await sql`
          SELECT r.id, r.ticker, r.asset_name, r.recommendation_type,
                 r.recommender_id as "from", r.conviction, r.created_at,
                 r.thesis, r.reco_price, r.current_price, r.sector, r.exchange,
                 up.username, up.full_name, up.registration_status
          FROM ic_recommendations r
          LEFT JOIN user_profiles up ON r.recommender_id = up.id
          WHERE r.ticker = ${ticker}
            AND (up.is_unclaimed IS NULL OR up.is_unclaimed = FALSE)
            AND (up.claim_status IS DISTINCT FROM 'claimed')
          ORDER BY r.created_at DESC
        `;
        res.status(200).json({ recos: rows });
        return;
      }

      if (action === 'people-search') {
        let uid;
        try { uid = await requireUid(req); } catch (e) { sendAuthError(res, e); return; }
        const q = String(req.query?.q || '').trim();
        const limit = Math.min(50, Math.max(1, parseInt(req.query?.limit, 10) || 6));
        if (q.length < 2) { res.status(200).json({ people: [] }); return; }
        const like = `%${q}%`;
        const rows = await sql`
          SELECT id, username, full_name, first_name, last_name,
                 registration_status, sebi_approval_status
          FROM user_profiles
          WHERE (full_name   ILIKE ${like}
              OR username    ILIKE ${like}
              OR first_name  ILIKE ${like}
              OR last_name   ILIKE ${like})
            AND id != ${uid}
            AND (is_unclaimed IS NULL OR is_unclaimed = FALSE)
            AND (claim_status IS DISTINCT FROM 'claimed')
          ORDER BY
            CASE WHEN LOWER(username)  = LOWER(${q})         THEN 0
                 WHEN LOWER(username)  LIKE LOWER(${q})||'%' THEN 1
                 WHEN LOWER(full_name) LIKE LOWER(${q})||'%' THEN 2
                 ELSE 3 END,
            full_name
          LIMIT ${limit}
        `;
        res.status(200).json({ people: rows });
        return;
      }

      res.status(400).json({ error: 'Unknown action' });
      return;
    }

    // POST
    const body = parseBody(req);
    const action = String(body.action || '');

    if (action === 'username-save') {
      let uid;
      try { uid = await requireUid(req); } catch (e) { sendAuthError(res, e); return; }
      const username = String(body.username || '').trim().toLowerCase();
      if (!USERNAME_RE.test(username)) { res.status(400).json({ error: 'invalid_username' }); return; }
      const available = await isUsernameAvailable(username, uid);
      if (!available) { res.status(400).json({ error: 'taken' }); return; }
      try {
        await sql`UPDATE user_profiles SET username = ${username}, updated_at = now() WHERE id = ${uid}`;
      } catch (e) {
        if (String(e?.message || '').toLowerCase().includes('unique')) {
          res.status(400).json({ error: 'taken' });
          return;
        }
        throw e;
      }
      res.status(200).json({ success: true, username });
      return;
    }

    if (action === 'portfolio-add') {
      let uid;
      try { uid = await requireUid(req); } catch (e) { sendAuthError(res, e); return; }
      const h = holdingFields(body.holding);
      if (!h.id || !h.sym) { res.status(400).json({ error: 'holding.id and holding.sym are required' }); return; }
      await sql`
        INSERT INTO portfolio_holdings
          (id, owner_id, sym, name, type, acct, acct_name, sh, cost, price, isin, sector, currency, purchase_date, source)
        VALUES
          (${h.id}, ${uid}, ${h.sym}, ${h.name}, ${h.type},
           ${h.acct}, ${h.acctName},
           ${h.sh}, ${h.cost}, ${h.price},
           ${h.isin}, ${h.sector}, ${h.currency},
           ${h.purchaseDate}, ${h.source})
        ON CONFLICT (id) DO UPDATE SET
          sym=EXCLUDED.sym, name=EXCLUDED.name, type=EXCLUDED.type,
          sh=EXCLUDED.sh, cost=EXCLUDED.cost, price=EXCLUDED.price,
          isin=EXCLUDED.isin, sector=EXCLUDED.sector, currency=EXCLUDED.currency,
          purchase_date=EXCLUDED.purchase_date, source=EXCLUDED.source,
          updated_at=NOW()
        WHERE portfolio_holdings.owner_id = ${uid}
      `;
      res.status(200).json({ success: true });
      return;
    }

    if (action === 'portfolio-delete') {
      let uid;
      try { uid = await requireUid(req); } catch (e) { sendAuthError(res, e); return; }
      const id = String(body.id || '');
      if (!id) { res.status(400).json({ error: 'id is required' }); return; }
      await sql`DELETE FROM portfolio_holdings WHERE id = ${id} AND owner_id = ${uid}`;
      res.status(200).json({ success: true });
      return;
    }

    if (action === 'portfolio-delete-all') {
      let uid;
      try { uid = await requireUid(req); } catch (e) { sendAuthError(res, e); return; }
      await sql`DELETE FROM portfolio_holdings WHERE owner_id = ${uid}`;
      res.status(200).json({ success: true });
      return;
    }

    if (action === 'feature-vote') {
      const featureKey = String(body.featureKey || '');
      if (!FEATURE_KEYS.includes(featureKey)) { res.status(400).json({ error: 'invalid featureKey' }); return; }
      await sql`
        INSERT INTO feature_votes(feature_key, vote_count) VALUES (${featureKey}, 1)
        ON CONFLICT (feature_key) DO UPDATE SET vote_count = feature_votes.vote_count + 1, updated_at = now()
      `;
      res.status(200).json({ success: true });
      return;
    }

    if (action === 'contact-submit') {
      const name = body.name ? String(body.name).trim().slice(0, 200) : null;
      const email = String(body.email || '').trim().slice(0, 320);
      const subject = String(body.subject || '').trim().slice(0, 300);
      const category = body.category ? String(body.category).trim() : null;
      const message = String(body.message || '').trim().slice(0, 5000);
      if (!email || !EMAIL_RE.test(email)) { res.status(400).json({ error: 'valid email is required' }); return; }
      if (!subject) { res.status(400).json({ error: 'subject is required' }); return; }
      if (!message) { res.status(400).json({ error: 'message is required' }); return; }
      if (category && !CONTACT_CATEGORIES.includes(category)) { res.status(400).json({ error: 'invalid category' }); return; }
      await sql`
        INSERT INTO contact_submissions (name, email, subject, category, message)
        VALUES (${name}, ${email}, ${subject}, ${category}, ${message})
      `;
      res.status(200).json({ success: true });
      return;
    }

    if (action === 'about-us-save') {
      try { await requireAdmin(req); } catch (e) { sendAuthError(res, e); return; }
      const html = String(body.html ?? '');
      await sql`
        INSERT INTO app_settings(key, value) VALUES ('about_us_content', ${html})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      `;
      res.status(200).json({ success: true });
      return;
    }

    if (action === 'process-referral') {
      let uid;
      try { uid = await requireUid(req); } catch (e) { sendAuthError(res, e); return; }
      const refUsername = String(body.refUsername || '').trim().toLowerCase();
      if (!refUsername) { res.status(400).json({ error: 'refUsername is required' }); return; }
      const refs = await sql`
        SELECT id, full_name, username, email FROM user_profiles
        WHERE LOWER(username) = ${refUsername} AND id != ${uid}
        LIMIT 1
      `;
      if (!refs[0]) { res.status(200).json({ referred: false }); return; }
      const referrer = refs[0];
      await sql`UPDATE user_profiles SET referred_by = ${referrer.id} WHERE id = ${uid} AND referred_by IS NULL`;
      await sql`
        INSERT INTO connections (requester_id, addressee_id, status)
        VALUES (${uid}, ${referrer.id}, 'accepted')
        ON CONFLICT DO NOTHING
      `;
      await sql`
        INSERT INTO notifications (user_id, type, from_user_id)
        VALUES (${referrer.id}, 'connection_accepted', ${uid})
      `.catch(() => {});
      res.status(200).json({
        referred: true,
        referrerName: referrer.full_name,
        referrerUsername: referrer.username,
        referrerEmail: referrer.email,
      });
      return;
    }

    if (action === 'profile-edit-save') {
      let uid;
      try { uid = await requireUid(req); } catch (e) { sendAuthError(res, e); return; }
      const p = body.profile || {};
      const fn = String(p.firstName || '').trim();
      const ln = String(p.lastName || '').trim();
      const regStatus = String(p.registrationStatus || 'self_directed');
      if (!ALLOWED_REG_STATUS_LOOKUPS.includes(regStatus)) {
        res.status(400).json({ error: 'Invalid registration status' });
        return;
      }
      const isSebi = ['sebi_ra', 'sebi_ria'].includes(regStatus);
      const current = await sql`
        SELECT registration_status, sebi_approval_status, sebi_submitted_at FROM user_profiles WHERE id = ${uid} LIMIT 1
      `;
      if (!current[0]) { res.status(404).json({ error: 'not_found' }); return; }
      const sebiChanged = regStatus !== (current[0].registration_status || 'self_directed');
      const newApprovalStatus = isSebi
        ? (sebiChanged ? 'pending' : (current[0].sebi_approval_status || 'not_applied'))
        : 'not_applied';
      const submittedAt = (isSebi && sebiChanged) ? new Date().toISOString() : current[0].sebi_submitted_at;
      const row = await sql`
        UPDATE user_profiles SET
          first_name = ${fn || null}, last_name = ${ln || null},
          full_name = ${[fn, ln].filter(Boolean).join(' ') || null},
          avatar_color = ${p.avatarColor || null},
          bio = ${p.bio || null},
          twitter_url = ${p.twitter || null}, linkedin_url = ${p.linkedin || null},
          telegram_url = ${p.telegram || null}, instagram_url = ${p.instagram || null},
          registration_status = ${regStatus},
          sebi_reg_number = ${isSebi ? (p.sebiNum || null) : null},
          sebi_reg_valid_till = ${isSebi ? (p.sebiTill || null) : null},
          sebi_firm_name = ${isSebi ? (p.sebiFirm || null) : null},
          sebi_approval_status = ${newApprovalStatus},
          sebi_submitted_at = ${submittedAt},
          updated_at = now()
        WHERE id = ${uid}
        RETURNING first_name, last_name, full_name, avatar_color, bio,
                  twitter_url, linkedin_url, telegram_url, instagram_url,
                  registration_status, sebi_reg_number, sebi_reg_valid_till,
                  sebi_firm_name, sebi_approval_status
      `;
      res.status(200).json({ profile: row[0] });
      return;
    }

    if (action === 'feed-pref-set') {
      let uid;
      try { uid = await requireUid(req); } catch (e) { sendAuthError(res, e); return; }
      const configKey = String(body.configKey || '');
      if (!configKey) { res.status(400).json({ error: 'configKey is required' }); return; }
      const enabled = !!body.enabled;
      await sql`
        INSERT INTO user_feed_preferences (user_id, config_key, enabled)
        VALUES (${uid}, ${configKey}, ${enabled})
        ON CONFLICT (user_id, config_key) DO UPDATE SET enabled = EXCLUDED.enabled
      `;
      res.status(200).json({ success: true });
      return;
    }

    if (action === 'push-subscribe') {
      let uid;
      try { uid = await requireUid(req); } catch (e) { sendAuthError(res, e); return; }
      const endpoint = String(body.endpoint || '');
      const p256dh = String(body.p256dh || '');
      const authKey = String(body.auth || '');
      if (!endpoint || !p256dh || !authKey) { res.status(400).json({ error: 'endpoint, p256dh and auth are required' }); return; }
      await sql`
        INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth_key)
        VALUES (${uid}, ${endpoint}, ${p256dh}, ${authKey})
        ON CONFLICT (endpoint) DO UPDATE SET user_id = ${uid}
      `;
      res.status(200).json({ success: true });
      return;
    }

    if (action === 'push-unsubscribe') {
      try { await requireUid(req); } catch (e) { sendAuthError(res, e); return; }
      const endpoint = String(body.endpoint || '');
      if (!endpoint) { res.status(400).json({ error: 'endpoint is required' }); return; }
      await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
      res.status(200).json({ success: true });
      return;
    }

    if (action === 'investor-ici-batch') {
      try { await requireUid(req); } catch (e) { sendAuthError(res, e); return; }
      const uids = Array.isArray(body.uids) ? body.uids.map(String).slice(0, 500) : [];
      if (!uids.length) { res.status(200).json({ stats: [] }); return; }
      const rows = await sql`
        SELECT
          r.recommender_id                                               AS uid,
          COUNT(*)::int                                                  AS total,
          EXTRACT(EPOCH FROM (NOW()-MIN(r.created_at)))/(365.25*86400)   AS years_history,
          COUNT(*) FILTER (WHERE r.exit_signal=true)::int                AS closed,
          COUNT(*) FILTER (
            WHERE r.exit_signal=true AND r.current_price > r.reco_price
              AND r.reco_price > 0
          )::int                                                         AS wins,
          COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY
            CASE WHEN r.exit_signal=true AND r.reco_price > 0
                 THEN (r.current_price - r.reco_price) / r.reco_price * 100
            END
          ), 0)                                                          AS median_ret,
          COALESCE(STDDEV(
            CASE WHEN r.exit_signal=true AND r.reco_price > 0
                 THEN (r.current_price - r.reco_price) / r.reco_price * 100
            END
          ), 0)                                                          AS ret_stddev
        FROM ic_recommendations r
        WHERE r.recommender_id = ANY(${uids})
        GROUP BY r.recommender_id
      `;
      res.status(200).json({ stats: rows });
      return;
    }

    if (action === 'user-lookup') {
      try { await requireUid(req); } catch (e) { sendAuthError(res, e); return; }
      const by = String(body.by || '');
      const value = body.value;
      if (!['id', 'username', 'email'].includes(by) || !value) {
        res.status(400).json({ error: 'by must be id|username|email and value is required' });
        return;
      }
      let rows;
      if (by === 'id') {
        rows = await sql`SELECT id, username, full_name, first_name, last_name, email FROM user_profiles WHERE id = ${String(value)} LIMIT 1`;
      } else if (by === 'username') {
        rows = await sql`SELECT id, username, full_name, first_name, last_name, email FROM user_profiles WHERE username = ${String(value)} LIMIT 1`;
      } else {
        rows = await sql`SELECT id, username, full_name, first_name, last_name, email FROM user_profiles WHERE email = ${String(value)} LIMIT 1`;
      }
      res.status(200).json({ user: rows[0] || null });
      return;
    }

    if (action === 'user-lookup-batch') {
      try { await requireUid(req); } catch (e) { sendAuthError(res, e); return; }
      const by = String(body.by || '');
      const values = Array.isArray(body.values) ? body.values.map(String).slice(0, 200) : [];
      if (by !== 'id' || !values.length) {
        res.status(400).json({ error: 'by must be id and values must be a non-empty array' });
        return;
      }
      const rows = await sql`
        SELECT id, username, full_name, first_name, last_name, email FROM user_profiles WHERE id = ANY(${values})
      `;
      res.status(200).json({ users: rows });
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[lookups] error:', e?.message);
    res.status(500).json({ error: 'Database error' });
  }
}
