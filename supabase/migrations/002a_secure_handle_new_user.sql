-- Lock down the handle_new_user trigger function.
--
-- By default, SECURITY DEFINER functions in the public schema are callable as
-- RPC endpoints (`/rest/v1/rpc/handle_new_user`) by both anon and authenticated
-- roles. Supabase's security advisor flags this. The function is only meant to
-- fire as an auth.users INSERT trigger — direct RPC calls have no NEW row and
-- error out, so this is a theoretical risk rather than a real one, but
-- defense-in-depth: revoke EXECUTE from public/anon/authenticated. The trigger
-- still works because triggers run as the table owner regardless of grants.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;
