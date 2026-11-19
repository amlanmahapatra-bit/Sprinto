-- 0004 revoked EXECUTE on public.is_gl() from `authenticated` to keep it off the REST RPC
-- surface, but RLS policy expressions are evaluated as the querying role — so stripping EXECUTE
-- broke every policy that calls is_gl(): authenticated users could no longer read their own
-- profile (role resolved to "viewer") and all gl-only writes would 403.
--
-- Correct fix: move the helper into a `private` schema that PostgREST does not expose, grant
-- EXECUTE to `authenticated` so RLS can evaluate it, and repoint every policy at private.is_gl().
-- The function is SECURITY DEFINER and only reports whether the *current* caller is a gl.

create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.is_gl()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'gl'
  );
$$;

revoke all on function private.is_gl() from public;
grant execute on function private.is_gl() to authenticated;

-- Repoint the per-table write policies from public.is_gl() to private.is_gl().
do $$
declare
  t text;
  tables text[] := array[
    'icp_config','runs','companies','pages','evidence','company_facts',
    'qualifications','research_steps','contacts','pain_points','drafts',
    'reviews','sends','email_events','llm_calls','api_usage'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I on public.%I;', t || '_mod', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (private.is_gl()) with check (private.is_gl());',
      t || '_mod', t
    );
  end loop;
end $$;

-- profiles: owner can read self, gl can read/write all.
drop policy if exists profiles_sel on public.profiles;
drop policy if exists profiles_mod on public.profiles;
create policy profiles_sel on public.profiles for select to authenticated
  using (user_id = auth.uid() or private.is_gl());
create policy profiles_mod on public.profiles for all to authenticated
  using (private.is_gl()) with check (private.is_gl());

-- All policies now reference private.is_gl(); drop the unused, locked-down public copy.
drop function if exists public.is_gl();
