-- 2026-10-06: persist User & Access role/status changes through an owner-only RPC.
-- Direct service-role updates hit trg_profiles_protect_access because auth.uid() is null.
create or replace function public.owner_set_profile_access(
  p_user_id uuid,
  p_role text,
  p_active boolean
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_owner constant uuid := 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid;
begin
  if auth.uid() is distinct from v_owner
     or not exists (
       select 1
       from public.profiles p
       where p.user_id=v_owner
         and p.active=true
         and p.role='manager'
     ) then
    raise exception 'OWNER_ONLY';
  end if;

  if p_user_id=v_owner then
    raise exception 'OWNER_ACCESS_IMMUTABLE';
  end if;

  if p_role not in (
    'admin','viewer','viewer_editor','defect_contributor','defect_editor','purchase',
    'engineer','foreman','payroll'
  ) then
    raise exception 'INVALID_ROLE';
  end if;

  update public.profiles
  set role=p_role,
      active=p_active,
      updated_at=now()
  where user_id=p_user_id;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  return p_role;
end;
$$;

revoke all on function public.owner_set_profile_access(uuid,text,boolean) from public,anon;
grant execute on function public.owner_set_profile_access(uuid,text,boolean) to authenticated;
