-- Lock the search_path on set_updated_at to prevent search_path hijacking.
-- Supabase security advisor flags functions with a mutable search_path; the
-- handle_new_user function in 002_profiles.sql already had `set search_path = public`,
-- but set_updated_at was missed. Re-create with the fixed search_path.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Re-revoke EXECUTE (CREATE OR REPLACE re-grants default).
revoke execute on function public.set_updated_at() from public;
revoke execute on function public.set_updated_at() from anon;
revoke execute on function public.set_updated_at() from authenticated;
