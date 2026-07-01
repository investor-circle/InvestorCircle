-- ============================================================================
-- InvestorCircle — Supabase / Postgres schema
-- ----------------------------------------------------------------------------
-- Run this in the Supabase SQL editor (or `supabase db push`). It models the
-- full app: profiles, brokerage accounts, holdings, the connection graph with
-- per-contact/per-group sharing permissions, groups, and recommendations with
-- forwarding ("shared by" distinct from "recommended by"), per-user actions,
-- reactions, and hides.
--
-- The running prototype uses in-memory mock data; this schema is provided so you
-- can wire persistence later. Row Level Security policies are included as
-- commented examples — review them carefully before enabling in production.
-- ============================================================================

create extension if not exists "pgcrypto";   -- for gen_random_uuid()

-- ---------- enums -----------------------------------------------------------
do $$ begin
  create type asset_type        as enum ('Stock','ETF','Fund','Crypto','Bond','Other');
  create type share_level       as enum ('off','names','full');          -- how much I expose
  create type share_visibility  as enum ('off','all','selected');        -- which holdings
  create type group_role        as enum ('admin','member');
  create type reco_share_type   as enum ('one','group');                 -- 1:1 or group
  create type recipient_type    as enum ('contact','group');
  create type reaction_kind     as enum ('like','dislike');
  create type connection_status as enum ('pending','active','blocked');
  create type group_create_policy as enum ('all','mods','admins');
exception when duplicate_object then null; end $$;

-- ---------- helper: updated_at trigger --------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

-- ============================================================================
-- PROFILES  (1:1 with auth.users when you use Supabase Auth)
-- ============================================================================
create table if not exists profiles (
  id            uuid primary key default gen_random_uuid(),
  -- when using Supabase Auth, set this to auth.users.id:
  -- id uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  email         text unique,
  initials      text,
  title         text,                       -- "Growth investor", etc.
  avatar_color  text,
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================================
-- ACCOUNTS  (linked brokerage / exchange accounts)
-- ============================================================================
create table if not exists accounts (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references profiles(id) on delete cascade,
  name         text not null,               -- "Fidelity 401(k)"
  provider     text,                         -- "Fidelity"
  source       text not null default 'manual', -- manual | import | pan | aggregator
  created_at   timestamptz not null default now()
);
create index if not exists idx_accounts_owner on accounts(owner_id);

-- ============================================================================
-- HOLDINGS
-- ============================================================================
create table if not exists holdings (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references profiles(id) on delete cascade,
  account_id   uuid references accounts(id) on delete set null,
  symbol       text not null,
  name         text not null,
  asset_type   asset_type not null default 'Stock',
  shares       numeric(20,6) not null check (shares >= 0),
  cost_basis   numeric(20,6) not null default 0,   -- per share
  price        numeric(20,6) not null default 0,   -- last/current per share
  source       text not null default 'manual',     -- manual | import | pan
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index if not exists idx_holdings_owner on holdings(owner_id);
create index if not exists idx_holdings_account on holdings(account_id);
create trigger trg_holdings_updated before update on holdings
  for each row execute function set_updated_at();

-- ============================================================================
-- CONNECTIONS  (the contact graph + what *I* expose to them by default)
--   one row per directed edge requester -> addressee
-- ============================================================================
create table if not exists connections (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references profiles(id) on delete cascade,
  addressee_id  uuid not null references profiles(id) on delete cascade,
  status        connection_status not null default 'pending',
  -- quick outbound default (full per-holding control lives in sharing_permissions)
  my_level      share_level not null default 'off',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
create index if not exists idx_conn_requester on connections(requester_id);
create index if not exists idx_conn_addressee on connections(addressee_id);

-- ============================================================================
-- GROUPS
-- ============================================================================
create table if not exists groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  color        text,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table if not exists group_members (
  group_id     uuid not null references groups(id) on delete cascade,
  profile_id   uuid not null references profiles(id) on delete cascade,
  role         group_role not null default 'member',
  joined_at    timestamptz not null default now(),
  primary key (group_id, profile_id)
);
create index if not exists idx_gm_profile on group_members(profile_id);

-- ============================================================================
-- SHARING PERMISSIONS  (per owner, scoped to a contact OR a group)
--   visibility = off | all | selected ; level = off | names | full
--   selected_holdings only used when visibility = 'selected'
-- ============================================================================
create table if not exists sharing_permissions (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references profiles(id) on delete cascade,
  target_type   recipient_type not null,            -- contact | group
  contact_id    uuid references profiles(id) on delete cascade,
  group_id      uuid references groups(id) on delete cascade,
  visibility    share_visibility not null default 'off',
  level         share_level not null default 'names',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- exactly one target must be set, matching target_type
  check (
    (target_type = 'contact' and contact_id is not null and group_id is null) or
    (target_type = 'group'   and group_id   is not null and contact_id is null)
  ),
  unique (owner_id, target_type, contact_id, group_id)
);
create index if not exists idx_share_owner on sharing_permissions(owner_id);

create table if not exists sharing_selected_holdings (
  permission_id uuid not null references sharing_permissions(id) on delete cascade,
  holding_id    uuid not null references holdings(id) on delete cascade,
  primary key (permission_id, holding_id)
);

-- ============================================================================
-- ASSET CLASSES  (configurable taxonomy used by recommendations)
-- ============================================================================
create table if not exists asset_classes (
  id          uuid primary key default gen_random_uuid(),
  name        text unique not null,
  color       text,
  sort_order  int not null default 0
);

-- ============================================================================
-- RECOMMENDATIONS
--   recommender_id = the ORIGINAL author of the idea.
--   A separate recommendation_shares row records each delivery, including the
--   forwarder (shared_by_id) — which is how "Shared by" can differ from
--   "Recommended by".
-- ============================================================================
create table if not exists recommendations (
  id              uuid primary key default gen_random_uuid(),
  recommender_id  uuid references profiles(id) on delete set null,
  recommender_name text,                       -- for off-platform/manual tips
  asset_name      text not null,
  ticker          text,
  asset_class     text,                         -- denormalized for simplicity
  thesis          text,                         -- the rationale shown on row expand
  price_at        numeric(20,6),                -- price when recommended
  current_price   numeric(20,6),
  recommended_on  date not null default current_date,
  exit_signal     boolean not null default false,
  exit_date       date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_reco_recommender on recommendations(recommender_id);
create trigger trg_reco_updated before update on recommendations
  for each row execute function set_updated_at();

-- Each delivery of a recommendation to a contact or group.
-- shared_by_id is who pushed THIS delivery; when it differs from the
-- recommendation's recommender_id, the recipient sees it as "forwarded".
create table if not exists recommendation_shares (
  id              uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references recommendations(id) on delete cascade,
  shared_by_id    uuid references profiles(id) on delete set null,
  share_type      reco_share_type not null default 'one',
  recipient_type  recipient_type not null,
  recipient_contact_id uuid references profiles(id) on delete cascade,
  recipient_group_id   uuid references groups(id) on delete cascade,
  note            text,
  shared_at       timestamptz not null default now(),
  check (
    (recipient_type = 'contact' and recipient_contact_id is not null and recipient_group_id is null) or
    (recipient_type = 'group'   and recipient_group_id   is not null and recipient_contact_id is null)
  )
);
create index if not exists idx_recoshare_reco on recommendation_shares(recommendation_id);
create index if not exists idx_recoshare_sharedby on recommendation_shares(shared_by_id);

-- A user acting on a recommendation (the "Mark invested" flow).
create table if not exists recommendation_actions (
  id               uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references recommendations(id) on delete cascade,
  profile_id       uuid not null references profiles(id) on delete cascade,
  invested         boolean not null default true,
  invested_price   numeric(20,6),               -- captured by the price prompt
  acted_on         date not null default current_date,
  created_at       timestamptz not null default now(),
  unique (recommendation_id, profile_id)
);
create index if not exists idx_recoaction_reco on recommendation_actions(recommendation_id);

-- Like / dislike, one per user per recommendation.
create table if not exists recommendation_reactions (
  recommendation_id uuid not null references recommendations(id) on delete cascade,
  profile_id        uuid not null references profiles(id) on delete cascade,
  reaction          reaction_kind not null,
  created_at        timestamptz not null default now(),
  primary key (recommendation_id, profile_id)
);

-- A user hiding a recommendation from their own list.
create table if not exists recommendation_hidden (
  recommendation_id uuid not null references recommendations(id) on delete cascade,
  profile_id        uuid not null references profiles(id) on delete cascade,
  primary key (recommendation_id, profile_id)
);

-- ============================================================================
-- INVITES  (email invitations to people not yet on the platform)
-- ============================================================================
create table if not exists invites (
  id           uuid primary key default gen_random_uuid(),
  inviter_id   uuid not null references profiles(id) on delete cascade,
  email        text not null,
  status       text not null default 'pending',  -- pending | accepted | expired
  created_at   timestamptz not null default now(),
  unique (inviter_id, email)
);

-- ============================================================================
-- APP CONFIG  (single-row admin configuration; mirrors the Admin console)
-- ============================================================================
create table if not exists app_config (
  id                      int primary key default 1,
  enable_recommendations  boolean not null default true,
  allow_crypto_accounts   boolean not null default true,
  public_feed             boolean not null default true,
  require_account_approval boolean not null default true,
  allow_amount_sharing    boolean not null default true,
  default_disclosure      share_level not null default 'names',
  max_group_members       int not null default 8,
  group_creation_policy   group_create_policy not null default 'all',
  updated_at              timestamptz not null default now(),
  check (id = 1)
);
insert into app_config (id) values (1) on conflict (id) do nothing;

-- ============================================================================
-- SEED  (optional starter asset classes)
-- ============================================================================
insert into asset_classes (name, color, sort_order) values
  ('Equity','#6d5df5',1), ('Bonds','#0ea5b7',2), ('ETF','#9a55ee',3),
  ('Mutual Funds','#cf52d8',4), ('Crypto','#d97706',5), ('Metals','#64748b',6),
  ('F&P','#15924e',7), ('Others','#8d90ad',8)
on conflict (name) do nothing;

-- ============================================================================
-- ROW LEVEL SECURITY  (EXAMPLES — review before enabling)
-- ----------------------------------------------------------------------------
-- These assume Supabase Auth where auth.uid() = profiles.id. Sharing-aware read
-- policies (letting a connection see holdings you've shared) are intentionally
-- left as an exercise — they need to join sharing_permissions/group_members and
-- should be written and tested carefully.
-- ============================================================================
-- alter table profiles enable row level security;
-- alter table accounts enable row level security;
-- alter table holdings enable row level security;
-- alter table recommendation_actions enable row level security;
--
-- create policy "profiles are readable by everyone"
--   on profiles for select using (true);
-- create policy "users manage their own profile"
--   on profiles for update using (auth.uid() = id);
--
-- create policy "owner can read own accounts"
--   on accounts for select using (auth.uid() = owner_id);
-- create policy "owner can write own accounts"
--   on accounts for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
--
-- create policy "owner can read own holdings"
--   on holdings for select using (auth.uid() = owner_id);
-- create policy "owner can write own holdings"
--   on holdings for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
--
-- create policy "user manages own recommendation actions"
--   on recommendation_actions for all
--   using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
