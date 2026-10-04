
create or replace function public.labour_verify_batch(
  p_batch_id uuid,
  p_note text,
  p_assignments jsonb
)
returns integer
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_user uuid := (select auth.uid());
  v_expected integer;
  v_work_date date;
  v_entry_id uuid;
  v_supervisor_worker_id text;
  v_source_fingerprint text;
  v_distinct_workers integer := 0;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.user_id=v_user and p.active=true and p.role in ('manager','engineer','payroll')
  ) then
    raise exception 'NOT_AUTHORIZED_FOR_LABOUR_VERIFICATION';
  end if;
  if p_assignments is null or jsonb_typeof(p_assignments) <> 'array' then
    raise exception 'ASSIGNMENTS_MUST_BE_ARRAY';
  end if;

  select b.expected_headcount,b.work_date,b.site_operations_entry_id,b.supervisor_worker_id,e.source_fingerprint
  into v_expected,v_work_date,v_entry_id,v_supervisor_worker_id,v_source_fingerprint
  from public.labour_verification_batches b
  join public.site_operations_entries e on e.id=b.site_operations_entry_id
  where b.id=p_batch_id
  for update of b;

  if not found then raise exception 'LABOUR_BATCH_NOT_FOUND'; end if;

  select count(distinct x.worker_id)
  into v_distinct_workers
  from jsonb_to_recordset(p_assignments) as x(
    worker_id text, project_id uuid, working_team text, movement_status text,
    allocation_hours numeric, allocation_share numeric, notes text
  )
  where v_supervisor_worker_id is null or x.worker_id<>v_supervisor_worker_id;

  if coalesce(v_expected,0)>0
    and v_distinct_workers<>v_expected
    and nullif(btrim(coalesce(p_note,'')),'') is null then
    raise exception 'HEADCOUNT_MISMATCH_EXPECTED_%_GOT_%_NOTE_REQUIRED',v_expected,v_distinct_workers;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_assignments) as x(
      worker_id text, project_id uuid, working_team text, movement_status text,
      allocation_hours numeric, allocation_share numeric, notes text
    )
    left join public.labour_workers w on w.worker_id=x.worker_id
    where w.worker_id is null
  ) then
    raise exception 'UNKNOWN_WORKER_ID';
  end if;

  delete from public.labour_daily_assignments where batch_id=p_batch_id;

  insert into public.labour_daily_assignments(
    batch_id,worker_id,work_date,project_id,home_team,working_team,movement_status,
    allocation_hours,allocation_share,work_detail,notes,verified_by,verified_at
  )
  select
    p_batch_id,x.worker_id,v_work_date,x.project_id,w.default_team,
    coalesce(nullif(btrim(x.working_team),''),w.default_team),
    case
      when x.movement_status in ('same_team','borrowed','returned','other') then x.movement_status
      else case when coalesce(nullif(btrim(x.working_team),''),w.default_team) is distinct from w.default_team then 'borrowed' else 'same_team' end
    end,
    x.allocation_hours,x.allocation_share,e.work_detail,x.notes,v_user,now()
  from jsonb_to_recordset(p_assignments) as x(
    worker_id text, project_id uuid, working_team text, movement_status text,
    allocation_hours numeric, allocation_share numeric, notes text
  )
  join public.labour_workers w on w.worker_id=x.worker_id
  join public.site_operations_entries e on e.id=v_entry_id
  where v_supervisor_worker_id is null or x.worker_id<>v_supervisor_worker_id;

  update public.labour_verification_batches
  set verification_status='verified',
      verified_by=v_user,
      verified_at=now(),
      verified_source_fingerprint=v_source_fingerprint,
      note=nullif(btrim(coalesce(p_note,'')),''),
      updated_at=now()
  where id=p_batch_id;

  update public.payroll_verification_records
  set status=case when status in ('verified','external_verified') then 'needs_review' else status end,
      updated_at=now()
  where labour_batch_id=p_batch_id;

  return v_distinct_workers;
end;
$$;

revoke all on function public.labour_verify_batch(uuid,text,jsonb) from public,anon;
grant execute on function public.labour_verify_batch(uuid,text,jsonb) to authenticated;
