-- HMRC MTD ITSA Phase 2: audit trail of what DriverTakings actually sent to
-- HMRC's cumulative self-employment PUT endpoint, and what HMRC returned.
-- Same access pattern as V2.5.4's hmrc_connections: service_role only, the
-- browser never reads this table directly. Records both successful and
-- failed submission attempts -- what we tried to tell HMRC matters either way.
-- Safe to run more than once.

create table if not exists public.hmrc_submissions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  business_id    text not null,
  tax_year       text not null,
  period_start   date not null,
  period_end     date not null,
  submitted_at   timestamptz not null default now(),
  payload        jsonb not null,
  hmrc_status    int,
  hmrc_response  jsonb,
  created_at     timestamptz not null default now()
);

alter table public.hmrc_submissions enable row level security;

grant usage on schema public to service_role;
grant select, insert on table public.hmrc_submissions to service_role;
