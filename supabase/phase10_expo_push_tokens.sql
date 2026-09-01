-- Phase 10 — device push tokens for the mobile app
--
-- The existing push_subscriptions table holds W3C Web Push subscriptions:
-- an endpoint URL plus the p256dh/auth key pair the browser generates, which
-- api/push.js feeds to the web-push library under VAPID. A mobile push token
-- has none of that shape — it is a single opaque string issued by Expo
-- ("ExponentPushToken[...]") and delivered through Expo's push service, not
-- through VAPID.
--
-- Hence a separate table rather than bending the existing one. This is
-- purely ADDITIVE: push_subscriptions is not altered, and nothing here
-- changes how web notifications are stored or sent.
--
-- SAFE TO RUN MORE THAN ONCE.

CREATE TABLE IF NOT EXISTS expo_push_tokens (
  -- The Expo token is globally unique per device+app install, so it is the
  -- natural primary key. Same rationale as push_subscriptions keying on
  -- endpoint: when the same device signs in as a different user, the row is
  -- reassigned rather than duplicated (see the ON CONFLICT in
  -- api/_lib/handlers/lookups.js, action 'expo-push-register').
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  platform    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- api/push.js looks tokens up by user on every notification send, so this
-- index is on the read path, not a nicety.
CREATE INDEX IF NOT EXISTS idx_expo_push_tokens_user
  ON expo_push_tokens (user_id);
