-- Atomic claim for the worker: queued -> running with FOR UPDATE SKIP LOCKED.
create or replace function public.claim_companies(p_run uuid, p_limit int)
returns setof public.companies
language sql
volatile
as $$
  update public.companies c
    set stage = 'running', started_at = coalesce(c.started_at, now()), updated_at = now()
  where c.id in (
    select id from public.companies
    where run_id = p_run and stage = 'queued'
    order by updated_at
    for update skip locked
    limit p_limit
  )
  returning c.*;
$$;

revoke execute on function public.claim_companies(uuid, int) from public, anon, authenticated;
