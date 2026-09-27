-- Repair admin-provisioned user profiles and keep future Auth-created profiles aligned with role/username metadata.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_username text;
begin
  v_role := case
    when coalesce(new.raw_app_meta_data ->> 'provisioned_by_admin','false') = 'true'
      and coalesce(new.raw_app_meta_data ->> 'app_role','') in ('manager','engineer','foreman','viewer')
      then new.raw_app_meta_data ->> 'app_role'
    else 'foreman'
  end;
  v_username := nullif(upper(coalesce(new.raw_app_meta_data ->> 'username','')), '');

  insert into public.profiles(user_id, username, email, full_name, role, active)
  values (
    new.id,
    v_username,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email,''), '@', 1)),
    v_role,
    true
  )
  on conflict (user_id) do update set
    username = coalesce(excluded.username, public.profiles.username),
    email = coalesce(excluded.email, public.profiles.email),
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    role = excluded.role,
    active = true,
    updated_at = now();
  return new;
end;
$$;

alter table public.profiles disable trigger trg_profiles_protect_access;

update public.profiles p
set username = upper(split_part(u.email,'@',1)),
    email = u.email,
    role = case
      when u.email ~ '^user(0[1-9]|10)@3kings[.]invalid$' then 'foreman'
      when u.email ~ '^user(1[1-9]|20)@3kings[.]invalid$' then 'viewer'
      when u.email = 'ai-viewer@3kings.invalid' then 'viewer'
      else p.role
    end,
    active = true,
    updated_at = now()
from auth.users u
where p.user_id = u.id
  and (u.email ~ '^user(0[1-9]|1[0-9]|20)@3kings[.]invalid$' or u.email='ai-viewer@3kings.invalid');

alter table public.profiles enable trigger trg_profiles_protect_access;
