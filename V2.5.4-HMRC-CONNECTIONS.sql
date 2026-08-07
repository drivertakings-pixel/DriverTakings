-- HMRC MTD ITSA Phase 1: per-driver OAuth connection state.
-- First CREATE TABLE migration in this repo -- prior migrations only
-- altered/granted existing tables. Safe to run more than once.

-- Short-lived: correlates the bare, unauthenticated browser redirect HMRC
-- sends back (?code=&state=) to the DriverTakings user who started the
-- connection, and carries the fraud-prevention signals collected in the
-- browser before the redirect (the callback leg has no JS execution, so
-- these can't be re-collected at that point).
create table if not exists public.hmrc_oauth_state (
  state         text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  fraud_headers jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '10 minutes'
);

-- Long-lived: one row per driver once connected. Holds live HMRC OAuth
-- tokens -- deliberately not exposed to the browser (see grants below).
create table if not exists public.hmrc_connections (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  hmrc_business_id   text,
  access_token       text,
  refresh_token      text,
  token_expires_at   timestamptz,
  token_scope        text,
  connected_at       timestamptz,
  last_refreshed_at  timestamptz,
  updated_at         timestamptz not null default now()
);

alter table public.hmrc_oauth_state enable row level security;
alter table public.hmrc_connections enable row level security;

-- Deliberately NOT granted to `authenticated`. These tables hold live OAuth
-- tokens (and the state table maps a bare, unauthenticated browser redirect
-- back to a Supabase user) -- the browser must never read them directly.
-- The app only ever sees a derived summary via the hmrc-status function.
-- All access happens through Netlify Functions using SUPABASE_SERVICE_ROLE_KEY.
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.hmrc_oauth_state to service_role;
grant select, insert, update on table public.hmrc_connections to service_role;
