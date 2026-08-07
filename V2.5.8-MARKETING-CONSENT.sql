-- Marketing consent audit trail. Backs both the previously-orphaned
-- marketingConsent checkbox on the login/index.html join form (captured
-- into localStorage but never persisted anywhere) and the new Account page
-- "Marketing preferences" toggle. ICO expects evidence of when consent was
-- given or withdrawn, not just a boolean -- keeping the timestamps on the
-- same profiles row is enough of an audit trail at this scale, rather than
-- a separate consent-log table.
-- No new grants needed: public.profiles already has select/insert/update
-- granted to authenticated and service_role (V2.5-DATABASE-MIGRATION.sql,
-- V2.5.3-SERVICE-ROLE-GRANTS-ALL-TABLES.sql).
-- Safe to run more than once.

alter table public.profiles add column if not exists marketing_consent boolean not null default false;
alter table public.profiles add column if not exists marketing_consent_at timestamptz;
alter table public.profiles add column if not exists marketing_unsubscribed_at timestamptz;
