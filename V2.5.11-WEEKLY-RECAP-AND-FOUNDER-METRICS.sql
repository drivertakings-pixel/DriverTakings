-- Weekly recap email + founder metrics, 2026-08-08.
-- The recap is sent to all active users by default (it's a service email
-- about their own account activity, not a marketing message -- see
-- weekly-recap-email.js), so this needs its own opt-out flag separate
-- from profiles.marketing_consent.
-- No new grants needed: public.profiles already has select/insert/update
-- granted to authenticated and service_role (V2.5-DATABASE-MIGRATION.sql,
-- V2.5.3-SERVICE-ROLE-GRANTS-ALL-TABLES.sql).
-- Safe to run more than once.

alter table public.profiles add column if not exists weekly_recap_opt_out boolean not null default false;

-- Idempotency guard: the scheduled function stamps this after a successful
-- send so a duplicate/retried invocation for the same week is a no-op
-- rather than a second email. Also closes off the main practical risk of
-- the function's URL being publicly reachable (as all Netlify scheduled
-- functions are) -- worst case is a wasted invocation, not duplicate
-- sends or data exposure, since the function takes no caller input and
-- returns only a send-count summary.
alter table public.profiles add column if not exists last_recap_week_start date;
