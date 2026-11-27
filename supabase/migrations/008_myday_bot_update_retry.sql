-- Allow the Telegram webhook to release an update after a failed processing attempt.
-- This lets Telegram redeliver the update instead of permanently deduplicating a failed request.
grant delete on table public.myday_bot_updates to service_role;
