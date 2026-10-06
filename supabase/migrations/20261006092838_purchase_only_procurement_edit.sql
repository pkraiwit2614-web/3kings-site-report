create or replace function public.procurement_save_web_override(
  p_item_id uuid,
  p_current_status text,
  p_expected_delivery_text text,
  p_expected_delivery date,
  p_condition_note text,
  p_review_status text,
  p_client_session_id uuid,
  p_user_agent text
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := (select auth.uid());
  v_identity text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  if not exists(
    select 1
    from public.profiles p
    where p.user_id=v_user
      and p.active=true
      and p.role='purchase'
  ) then
    raise exception 'NOT_AUTHORIZED_FOR_PROCUREMENT_EDIT';
  end if;

  if p_review_status not in ('pending','confirmed','needs_review') then
    raise exception 'INVALID_REVIEW_STATUS';
  end if;

  select p.source_identity into v_identity
  from public.v_procurement_source_rows p
  where p.id=p_item_id;

  if v_identity is null then raise exception 'PROCUREMENT_ITEM_NOT_FOUND'; end if;

  if char_length(coalesce(p_current_status,''))>1000
     or char_length(coalesce(p_expected_delivery_text,''))>1000
     or char_length(coalesce(p_condition_note,''))>4000 then
    raise exception 'TEXT_TOO_LONG';
  end if;

  insert into public.procurement_item_overrides(
    source_identity,last_item_id,current_status,expected_delivery_text,expected_delivery,condition_note,
    review_status,updated_by,updated_at
  )
  values(
    v_identity,p_item_id,
    nullif(btrim(coalesce(p_current_status,'')),''),
    nullif(btrim(coalesce(p_expected_delivery_text,'')),''),
    p_expected_delivery,
    nullif(btrim(coalesce(p_condition_note,'')),''),
    p_review_status,v_user,now()
  )
  on conflict(source_identity) do update set
    last_item_id=excluded.last_item_id,
    current_status=excluded.current_status,
    expected_delivery_text=excluded.expected_delivery_text,
    expected_delivery=excluded.expected_delivery,
    condition_note=excluded.condition_note,
    review_status=excluded.review_status,
    updated_by=v_user,
    updated_at=now();

  insert into public.activity_logs(
    user_id,client_session_id,event_type,path,action,target,metadata,user_agent
  ) values (
    v_user,coalesce(p_client_session_id,gen_random_uuid()),
    'data_change','/procurement','procurement_web_override_save',p_item_id::text,
    jsonb_build_object('review_status',p_review_status,'source_identity',v_identity),
    left(nullif(btrim(coalesce(p_user_agent,'')),''),500)
  );

  return p_item_id;
end;
$$;

revoke all on function public.procurement_save_web_override(uuid,text,text,date,text,text,uuid,text) from public,anon;
grant execute on function public.procurement_save_web_override(uuid,text,text,date,text,text,uuid,text) to authenticated;

drop policy if exists procurement_item_projects_insert_manage on public.procurement_item_projects;
create policy procurement_item_projects_insert_manage
on public.procurement_item_projects
for insert
to authenticated
with check ((select private.has_app_role(array['purchase'])));

drop policy if exists procurement_item_projects_update_manage on public.procurement_item_projects;
create policy procurement_item_projects_update_manage
on public.procurement_item_projects
for update
to authenticated
using ((select private.has_app_role(array['purchase'])))
with check ((select private.has_app_role(array['purchase'])));

drop policy if exists procurement_item_projects_delete_manage on public.procurement_item_projects;
create policy procurement_item_projects_delete_manage
on public.procurement_item_projects
for delete
to authenticated
using ((select private.has_app_role(array['purchase'])));