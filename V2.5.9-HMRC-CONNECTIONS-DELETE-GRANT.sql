-- Fixes: "permission denied for table hmrc_connections" from
-- netlify/functions/hmrc-disconnect.js. V2.5.4-HMRC-CONNECTIONS.sql granted
-- service_role select/insert/update on hmrc_connections, but Phase 1 (when
-- that migration ran) had no disconnect feature yet, so delete was never
-- granted. Same recurring pattern as V2.5.2/V2.5.3 -- a new capability
-- needing a new grant that's easy to miss until it's actually exercised.
-- Safe to run more than once.

grant delete on table public.hmrc_connections to service_role;
