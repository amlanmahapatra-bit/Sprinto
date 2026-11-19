-- is_gl() is only used inside RLS policies; it must not be callable directly via the REST RPC API.
revoke execute on function public.is_gl() from public, anon, authenticated;
