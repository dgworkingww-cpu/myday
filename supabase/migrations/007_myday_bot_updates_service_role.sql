-- Ensure the Edge Function service role can use the Telegram update idempotency table.
-- RLS remains enabled and no client roles receive access.
grant usage on schema public to service_role;
grant select, insert on table public.myday_bot_updates to service_role;
