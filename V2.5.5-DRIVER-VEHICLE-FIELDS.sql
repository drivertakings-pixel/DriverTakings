-- Driver & Vehicle page fields, plus identity/compliance additions to Account.
-- Safe to run more than once. No new grants needed -- public.profiles
-- already has select/insert/update granted to authenticated and service_role
-- from V2.5-DATABASE-MIGRATION.sql and V2.5.3-SERVICE-ROLE-GRANTS-ALL-TABLES.sql.

-- Vehicle setup card (app/driver/)
alter table public.profiles add column if not exists vehicle_registration text;
alter table public.profiles add column if not exists vehicle_arrangement text; -- 'owned' | 'rental' | 'finance'
alter table public.profiles add column if not exists vehicle_cost_amount numeric(10,2);
alter table public.profiles add column if not exists vehicle_cost_frequency text; -- 'weekly' | 'monthly'
alter table public.profiles add column if not exists operator_fee_amount numeric(10,2);
alter table public.profiles add column if not exists operator_fee_frequency text; -- 'weekly' | 'monthly'

-- Driver reminders card (app/driver/)
alter table public.profiles add column if not exists insurance_renewal_date date;
alter table public.profiles add column if not exists mot_expiry_date date;
alter table public.profiles add column if not exists mot_expiry_source text default 'manual'; -- 'manual' | 'dvsa'
alter table public.profiles add column if not exists mot_last_checked_at timestamptz;
alter table public.profiles add column if not exists driver_badge_expiry_date date;
alter table public.profiles add column if not exists vehicle_licence_number text; -- PHV/hackney carriage plate, distinct from vehicle_registration
alter table public.profiles add column if not exists vehicle_licence_expiry_date date;
alter table public.profiles add column if not exists inspection_due_date date;

-- Identity/compliance (app/account/): first_name/last_name remain the legal
-- name (matches HMRC's individualDetails.firstName/lastName) -- preferred_name
-- is purely for greetings/display, distinct from the legal record.
alter table public.profiles add column if not exists preferred_name text;
alter table public.profiles add column if not exists address_line1 text;
alter table public.profiles add column if not exists address_line2 text;
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists postcode text;
alter table public.profiles add column if not exists country text default 'GB';
