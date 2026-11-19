-- RLS: gl = full access, viewer = select only. The worker + pixel use the service role (bypasses RLS).

create or replace function public.is_gl()
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
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_sel', t);
    execute format('drop policy if exists %I on public.%I;', t || '_mod', t);
    -- read: any authenticated user (gl or viewer)
    execute format(
      'create policy %I on public.%I for select to authenticated using (true);',
      t || '_sel', t
    );
    -- write: gl only (service role bypasses RLS entirely)
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_gl()) with check (public.is_gl());',
      t || '_mod', t
    );
  end loop;
end $$;

-- profiles: readable by the owner + gl; writable by gl only.
alter table public.profiles enable row level security;
drop policy if exists profiles_sel on public.profiles;
drop policy if exists profiles_mod on public.profiles;
create policy profiles_sel on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.is_gl());
create policy profiles_mod on public.profiles for all to authenticated
  using (public.is_gl()) with check (public.is_gl());
