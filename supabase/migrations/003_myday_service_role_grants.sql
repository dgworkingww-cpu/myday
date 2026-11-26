-- Ensure the Edge Function's service role can use the private profile table.
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.myday_profiles to service_role;
grant execute on function public.myday_sync_profile(bigint, jsonb, bigint) to service_role;
