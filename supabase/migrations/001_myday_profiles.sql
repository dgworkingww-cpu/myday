-- MYDAY stores one private JSON document per Telegram account.
create table if not exists public.myday_profiles (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.myday_profiles enable row level security;

-- Browser clients never access this table directly. Only the Edge Function,
-- after validating Telegram initData, uses the server-side service-role key.
revoke all on table public.myday_profiles from anon, authenticated;
