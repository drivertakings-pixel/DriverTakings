-- DriverTakings V2.5 profile fields.
-- Safe to run more than once.
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists national_insurance_number text;

-- Keep authenticated profile access available; RLS remains the row-security boundary.
grant usage on schema public to authenticated;
grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update on table public.memberships to authenticated;
grant select, insert, update, delete on table public.daily_takings to authenticated;
grant select, insert, update, delete on table public.expenses to authenticated;
