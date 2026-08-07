-- Closes the same permission gap fixed for memberships in V2.5.2, but for
-- every other application table. profiles/daily_takings/expenses currently
-- have zero SELECT/INSERT/UPDATE/DELETE grant for service_role -- nothing
-- server-side (Netlify Functions) touches them today, so this hasn't caused
-- a visible bug yet, but any future server-side feature (e.g. MTD/HMRC
-- submission) touching these tables via SUPABASE_SERVICE_ROLE_KEY would hit
-- the exact same "permission denied" failure the Stripe webhook did.
-- Safe to run more than once. Read/write only -- no data or RLS changes.

grant select, insert, update on table public.profiles to service_role;
grant select, insert, update, delete on table public.daily_takings to service_role;
grant select, insert, update, delete on table public.expenses to service_role;
