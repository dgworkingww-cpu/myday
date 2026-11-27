-- Per-user daily quota for AI features to prevent accidental or abusive API spend.
create table if not exists public.myday_bot_ai_usage (
  telegram_id bigint not null,
  usage_date date not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (telegram_id, usage_date)
);

alter table public.myday_bot_ai_usage enable row level security;
revoke all on table public.myday_bot_ai_usage from public, anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update on table public.myday_bot_ai_usage to service_role;

create or replace function public.myday_consume_bot_ai(
  p_telegram_id bigint,
  p_usage_date date,
  p_limit integer default 100
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  allowed boolean := false;
begin
  if p_telegram_id is null or p_telegram_id <= 0
     or p_usage_date is null
     or p_limit is null or p_limit < 1 or p_limit > 10000 then
    raise exception 'Invalid AI quota arguments';
  end if;

  insert into public.myday_bot_ai_usage (telegram_id, usage_date, request_count)
  values (p_telegram_id, p_usage_date, 1)
  on conflict (telegram_id, usage_date)
  do update set
    request_count = public.myday_bot_ai_usage.request_count + 1,
    updated_at = now()
  where public.myday_bot_ai_usage.request_count < p_limit
  returning true into allowed;

  return coalesce(allowed, false);
end;
$$;

revoke all on function public.myday_consume_bot_ai(bigint, date, integer) from public, anon, authenticated;
grant execute on function public.myday_consume_bot_ai(bigint, date, integer) to service_role;
