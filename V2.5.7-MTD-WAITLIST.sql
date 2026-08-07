-- MTD checkout is closed until HMRC grants production access (see the
-- MTD_SALES_OPEN env var gating create-checkout-session.js). Drivers who
-- click "Join the MTD waitlist" get a row here instead of a Stripe session.
-- The browser reads its own row directly on page load (same pattern as
-- DT.load() already reading profiles/memberships) so the UI can show
-- "you're on the list" with no extra round trip -- but joining always goes
-- through join-mtd-waitlist.js (service role) so the bearer token is
-- verified server-side before any write.
-- Safe to run more than once.

create table if not exists public.mtd_waitlist (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  joined_at  timestamptz not null default now()
);

alter table public.mtd_waitlist enable row level security;

drop policy if exists "Users can view own waitlist row" on public.mtd_waitlist;
create policy "Users can view own waitlist row" on public.mtd_waitlist
  for select using (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select on table public.mtd_waitlist to authenticated;

grant usage on schema public to service_role;
grant select, insert on table public.mtd_waitlist to service_role;
