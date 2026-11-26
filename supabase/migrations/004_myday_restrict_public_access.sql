-- Ensure no inherited PUBLIC privileges can expose private MYDAY profiles.
revoke all on table public.myday_profiles from public, anon, authenticated;
grant select, insert, update, delete on table public.myday_profiles to service_role;
grant execute on function public.myday_sync_profile(bigint, jsonb, bigint) to service_role;
