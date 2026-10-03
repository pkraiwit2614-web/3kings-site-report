grant insert, update on public.labour_name_map to authenticated;
grant update (supervisor_worker_id, mapping_status) on public.site_operations_entries to authenticated;

drop policy if exists "payroll roles insert labour name map" on public.labour_name_map;
create policy "payroll roles insert labour name map"
on public.labour_name_map for insert to authenticated
with check (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true and p.role in ('manager','engineer')
));

drop policy if exists "payroll roles update labour name map" on public.labour_name_map;
create policy "payroll roles update labour name map"
on public.labour_name_map for update to authenticated
using (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true and p.role in ('manager','engineer')
))
with check (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true and p.role in ('manager','engineer')
));

drop policy if exists "payroll roles update site operation supervisor" on public.site_operations_entries;
create policy "payroll roles update site operation supervisor"
on public.site_operations_entries for update to authenticated
using (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true and p.role in ('manager','engineer')
))
with check (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true and p.role in ('manager','engineer')
));

create or replace function public.labour_confirm_supervisor_mapping(
  p_batch_id uuid,
  p_worker_id text
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_entry_id uuid;
  v_source_name text;
  v_norm text;
  v_worker_name text;
  v_team text;
  v_has_project boolean;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.user_id=v_user and p.active=true and p.role in ('manager','engineer')
  ) then
    raise exception 'NOT_AUTHORIZED_FOR_LABOUR_VERIFICATION';
  end if;

  select b.site_operations_entry_id,e.supervisor_raw
  into v_entry_id,v_source_name
  from public.labour_verification_batches b
  join public.site_operations_entries e on e.id=b.site_operations_entry_id
  where b.id=p_batch_id
  for update of b;

  if not found then raise exception 'LABOUR_BATCH_NOT_FOUND'; end if;

  select w.full_name,w.default_team into v_worker_name,v_team
  from public.labour_workers w where w.worker_id=p_worker_id;

  if not found then raise exception 'UNKNOWN_WORKER_ID'; end if;
  if nullif(btrim(coalesce(v_source_name,'')),'') is null then raise exception 'SOURCE_SUPERVISOR_EMPTY'; end if;

  v_norm:=lower(regexp_replace(v_source_name,'[[:space:]().,_/\\-]+','','g'));
  select exists(select 1 from public.site_operations_entry_projects ep where ep.entry_id=v_entry_id) into v_has_project;

  insert into public.labour_name_map(
    source_name_norm,source_name,worker_id,canonical_name,map_type,status,source_file_id,synced_at
  )
  values(v_norm,v_source_name,p_worker_id,v_worker_name,'WEB_VERIFIED','CONFIRMED','WEB_LABOUR_VERIFICATION',now())
  on conflict(source_name_norm) do update set
    source_name=excluded.source_name,worker_id=excluded.worker_id,canonical_name=excluded.canonical_name,
    map_type='WEB_VERIFIED',status='CONFIRMED',source_file_id='WEB_LABOUR_VERIFICATION',synced_at=now();

  update public.site_operations_entries
  set supervisor_worker_id=p_worker_id,
      mapping_status=case when v_has_project then 'mapped' else 'partial' end,
      updated_at=now()
  where id=v_entry_id;

  update public.labour_verification_batches
  set supervisor_worker_id=p_worker_id,
      home_team=v_team,
      verification_status=case when verification_status='verified' then 'needs_review' else 'pending' end,
      updated_at=now()
  where id=p_batch_id;

  return p_worker_id;
end;
$$;

revoke all on function public.labour_confirm_supervisor_mapping(uuid,text) from public;
grant execute on function public.labour_confirm_supervisor_mapping(uuid,text) to authenticated;
