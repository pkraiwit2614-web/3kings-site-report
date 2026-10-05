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
     or not exists(select 1 from public.profiles p where p.user_id=v_owner and p.active=true and p.role='manager') then
    raise exception 'OWNER_ONLY';
  end if;
  if p_user_id=v_owner then raise exception 'OWNER_ROLE_IMMUTABLE'; end if;
  if p_role not in ('admin','viewer','defect_contributor') then raise exception 'INVALID_ROLE'; end if;
  update public.profiles set role=p_role,updated_at=now() where user_id=p_user_id;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  return p_role;
end;
$$;
revoke all on function public.owner_set_profile_role(uuid,text) from public,anon;
grant execute on function public.owner_set_profile_role(uuid,text) to authenticated;
