-- Supabase-provisioned helper; it should not be callable through the REST API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
