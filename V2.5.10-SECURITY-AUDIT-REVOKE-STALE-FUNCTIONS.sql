-- Security audit finding, 2026-08-08. Supabase's own Security Advisor
-- (splinter/Postgres linter) flagged several SECURITY DEFINER functions
-- as publicly/signed-in-user executable that predate this repo's tracked
-- migrations -- leftovers from the earlier pre-Claude-Code build, never
-- referenced anywhere in the current live site's code.
--
-- CRITICAL: public.activate_business_trial(p_promo_code, p_trial_source)
-- never validates p_promo_code at all -- reading its full source confirms
-- it accepts any value (including none, both params are optional) and
-- unconditionally grants the calling user a 60-day Business trial
-- (tier='business', status='trialing') the first time they call it.
-- Since Supabase exposes every function as a directly callable REST RPC
-- endpoint regardless of whether any UI button calls it, any signed-in
-- free user could currently call this directly (e.g. from browser
-- devtools) and grant themselves 60 days of paid access for nothing,
-- bypassing Stripe entirely. Nothing in the current site calls this
-- function -- it's dead from the UI's side, but still fully live at the
-- database level. Revoking EXECUTE closes the hole without touching
-- anything the live site actually uses.
--
-- Also revoking public.handle_new_user() and public.rls_auto_enable():
-- these are RETURNS trigger / RETURNS event_trigger functions, so
-- despite being flagged as anon-executable, they can't actually be
-- invoked via the REST API outside their real trigger context (Postgres
-- invokes triggers with the trigger owner's privileges regardless of
-- EXECUTE grants) -- practical risk is low, but there's no legitimate
-- reason any role needs direct EXECUTE on them either, so this is
-- hygiene, not an urgent fix like the trial function above.
--
-- Safe to run more than once.

revoke execute on function public.activate_business_trial(text, text) from public;
revoke execute on function public.activate_business_trial(text, text) from anon;
revoke execute on function public.activate_business_trial(text, text) from authenticated;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;
