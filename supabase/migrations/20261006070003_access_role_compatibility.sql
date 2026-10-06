-- 2026-10-06: keep current User & Access UI compatible with canonical + legacy roles.
create or replace function public.owner_set_profile_role(p_user_id uuid,p_role text)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_owner constant uuid := 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid;
begin
  if auth.uid() is distinct from v_owner
     or not exists(
       select 1 from public.profiles p
       where p.user_id=v_owner and p.active=true and p.role='manager'
     ) then
    raise exception 'OWNER_ONLY';
  end if;
  if p_user_id=v_owner then raise exception 'OWNER_ROLE_IMMUTABLE'; end if;
  if p_role not in (
    'admin','viewer','viewer_editor','defect_contributor','defect_editor','purchase',
    'engineer','foreman','payroll'
  ) then raise exception 'INVALID_ROLE'; end if;
  update public.profiles set role=p_role,updated_at=now() where user_id=p_user_id;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  return p_role;
end;
$$;

revoke all on function public.owner_set_profile_role(uuid,text) from public,anon;
grant execute on function public.owner_set_profile_role(uuid,text) to authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_admin_provisioned boolean := coalesce((new.raw_app_meta_data ->> 'provisioned_by_admin')::boolean,false);
  v_requested_role text := lower(coalesce(new.raw_app_meta_data ->> 'app_role',''));
  v_role text;
  v_username text;
  v_active boolean;
begin
  if v_admin_provisioned and v_requested_role in (
    'admin','viewer','viewer_editor','defect_contributor','defect_editor','purchase',
    'engineer','foreman','payroll'
  ) then
    v_role:=v_requested_role; v_active:=true;
  else
    v_role:='viewer'; v_active:=false;
  end if;
  v_username:=case when v_admin_provisioned then nullif(upper(btrim(new.raw_app_meta_data ->> 'username')),'') else null end;
  insert into public.profiles(user_id,username,email,full_name,role,active)
  values(new.id,v_username,new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name',v_username,split_part(coalesce(new.email,''),'@',1)),
    v_role,v_active)
  on conflict(user_id) do update set
    username=coalesce(excluded.username,public.profiles.username),
    email=coalesce(excluded.email,public.profiles.email),
    full_name=coalesce(excluded.full_name,public.profiles.full_name),
    role=case when v_admin_provisioned then excluded.role else public.profiles.role end,
    active=case when v_admin_provisioned then true else public.profiles.active end,
    updated_at=now();
  return new;
end;
$$;
