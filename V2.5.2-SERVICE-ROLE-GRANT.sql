-- Fixes: "permission denied for table memberships" from Netlify Functions
-- (confirm-checkout-session, stripe-webhook) using SUPABASE_SERVICE_ROLE_KEY.
-- The V2.5 migration granted access to `authenticated` for browser reads,
-- but never granted the service_role used by server-side entitlement writes.
-- Safe to run more than once.

grant usage on schema public to service_role;
grant select, insert, update on table public.memberships to service_role;
