-- The first user to sign up becomes the GL; everyone after is a viewer.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, role)
  values (
    new.id,
    case when (select count(*) from public.profiles) = 0 then 'gl' else 'viewer' end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
