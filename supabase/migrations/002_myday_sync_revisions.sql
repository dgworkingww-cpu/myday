-- Optimistic concurrency for multi-device MYDAY sync.
alter table public.myday_profiles
  add column if not exists revision bigint not null default 0;

create or replace function public.myday_sync_profile(
  p_telegram_id bigint,
  p_data jsonb,
  p_expected_revision bigint
)
returns table(data jsonb, revision bigint, conflict boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_row public.myday_profiles%rowtype;
begin
  if p_telegram_id is null or p_telegram_id <= 0
     or p_expected_revision is null or p_expected_revision < 0
     or p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Invalid sync arguments';
  end if;

  insert into public.myday_profiles (telegram_id, data, revision)
  values (p_telegram_id, '{}'::jsonb, 0)
  on conflict (telegram_id) do nothing;

  select * into current_row
  from public.myday_profiles
  where telegram_id = p_telegram_id
  for update;

  if current_row.revision <> p_expected_revision then
    return query select current_row.data, current_row.revision, true;
    return;
  end if;

  update public.myday_profiles
  set data = p_data,
      revision = current_row.revision + 1,
      updated_at = now()
  where telegram_id = p_telegram_id
  returning * into current_row;

  return query select current_row.data, current_row.revision, false;
end;
$$;

revoke all on function public.myday_sync_profile(bigint, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.myday_sync_profile(bigint, jsonb, bigint) to service_role;
