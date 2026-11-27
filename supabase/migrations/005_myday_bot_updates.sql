-- Idempotency for Telegram webhook retries.
-- Telegram may redeliver updates; the primary key prevents duplicate task creation.
create table if not exists public.myday_bot_updates (
  update_id bigint primary key,
  received_at timestamptz not null default now()
);

alter table public.myday_bot_updates enable row level security;
revoke all on table public.myday_bot_updates from public, anon, authenticated;
