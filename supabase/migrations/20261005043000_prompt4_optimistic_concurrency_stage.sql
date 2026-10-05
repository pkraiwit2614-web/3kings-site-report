-- Prompt 4 stage: optimistic concurrency for Labour/Payroll saves.
-- Additive first stage so current Production callers keep working during Preview verification.
-- Legacy RPC signatures are removed only by the separate cutover migration after the new UI is live.

alter table public.labour_verification_batches
  add column if not exists concurrency_revision bigint not null default 1,
  add column if not exists last_save_fingerprint text,
  add column if not exists last_save_base_revision bigint;

alter table public.payroll_verification_records
  add column if not exists concurrency_revision bigint not null default 1,
  add column if not exists last_save_fingerprint text,
  add column if not exists last_save_base_revision bigint;

create or replace function public.labour_payroll_bump_concurrency_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.concurrency_revision := old.concurrency_revision + 1;
  return new;
end;
$$;

drop trigger if exists trg_labour_batch_concurrency_revision
on public.labour_verification_batches;
create trigger trg_labour_batch_concurrency_revision
before update on public.labour_verification_batches
for each row execute function public.labour_payroll_bump_concurrency_revision();

drop trigger if exists trg_payroll_record_concurrency_revision
on public.payroll_verification_records;
create trigger trg_payroll_record_concurrency_revision
before update on public.payroll_verification_records
for each row execute function public.labour_payroll_bump_concurrency_revision();

create or replace function public.labour_verify_batch(
  p_batch_id uuid,
  p_note text,
  p_assignments jsonb,
  p_expected_source_fingerprint text,
  p_expected_batch_revision bigint
)
returns integer
language plpgsql
set search_path to 'public'
as $$
declare
  v_user uuid := (select auth.uid());
  v_batch public.labour_verification_batches%rowtype;
  v_expected integer;
  v_confirmed integer;
  v_headcount_confirmation_status text;
  v_work_date date;
  v_entry_id uuid;
  v_entry_work_date date;
  v_work_date_validation_status text;
  v_supervisor_worker_id text;
  v_source_fingerprint text;
  v_distinct_workers integer:=0;
  v_request_fingerprint text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  if not exists (
    select 1 from public.profiles p
    where p.user_id=v_user and p.active=true and p.role in ('manager','admin','engineer','payroll')
  ) then
    raise exception 'NOT_AUTHORIZED_FOR_LABOUR_VERIFICATION';
  end if;

  if p_expected_source_fingerprint is null or p_expected_source_fingerprint='' then
    raise exception 'EXPECTED_SOURCE_FINGERPRINT_REQUIRED';
  end if;
  if p_expected_batch_revision is null or p_expected_batch_revision<1 then
    raise exception 'EXPECTED_BATCH_REVISION_REQUIRED';
  end if;
  if p_assignments is null or jsonb_typeof(p_assignments)<>'array' then
    raise exception 'ASSIGNMENTS_MUST_BE_ARRAY';
  end if;

  v_request_fingerprint := md5(
    concat_ws('|',
      'labour_verify_batch',
      p_batch_id::text,
      p_expected_source_fingerprint,
      p_expected_batch_revision::text,
      coalesce(p_note,''),
      p_assignments::text
    )
  );

  select b,
    e.source_fingerprint,e.work_date,e.work_date_validation_status
  into
    v_batch,
    v_source_fingerprint,v_entry_work_date,v_work_date_validation_status
  from public.labour_verification_batches b
  join public.site_operations_entries e on e.id=b.site_operations_entry_id
  where b.id=p_batch_id
  for update of b,e;

  if not found then raise exception 'LABOUR_BATCH_NOT_FOUND'; end if;

  if v_source_fingerprint is distinct from p_expected_source_fingerprint then
    raise exception 'STALE_LABOUR_SAVE_RELOAD_REQUIRED source_changed';
  end if;

  if v_batch.concurrency_revision is distinct from p_expected_batch_revision then
    if v_batch.concurrency_revision=p_expected_batch_revision+1
       and v_batch.last_save_base_revision=p_expected_batch_revision
       and v_batch.last_save_fingerprint=v_request_fingerprint then
      select count(distinct a.worker_id)
        into v_distinct_workers
      from public.labour_daily_assignments a
      where a.batch_id=p_batch_id
        and (v_batch.supervisor_worker_id is null or a.worker_id<>v_batch.supervisor_worker_id);
      return v_distinct_workers;
    end if;
    raise exception 'STALE_LABOUR_SAVE_RELOAD_REQUIRED expected_batch_revision_%_current_%',
      p_expected_batch_revision,v_batch.concurrency_revision;
  end if;

  v_expected := v_batch.expected_headcount;
  v_confirmed := v_batch.confirmed_headcount;
  v_headcount_confirmation_status := v_batch.headcount_confirmation_status;
  v_work_date := v_batch.work_date;
  v_entry_id := v_batch.site_operations_entry_id;
  v_supervisor_worker_id := v_batch.supervisor_worker_id;

  if v_work_date is distinct from v_entry_work_date then
    raise exception 'LABOUR_BATCH_WORK_DATE_MISMATCH';
  end if;

  if coalesce(v_work_date_validation_status,'valid')<>'valid'
     or v_entry_work_date>(current_timestamp at time zone 'Asia/Bangkok')::date then
    raise exception 'WORK_DATE_REVIEW_REQUIRED';
  end if;

  if v_headcount_confirmation_status<>'confirmed'
     or v_confirmed is null
     or v_expected is distinct from v_confirmed then
    raise exception 'HEADCOUNT_CONFIRMATION_REQUIRED';
  end if;

  select count(distinct x.worker_id)
    into v_distinct_workers
  from jsonb_to_recordset(p_assignments) as x(
    worker_id text,project_id uuid,working_team text,movement_status text,
    allocation_hours numeric,allocation_share numeric,notes text
  )
  where v_supervisor_worker_id is null or x.worker_id<>v_supervisor_worker_id;

  if v_distinct_workers<>v_confirmed then
    raise exception 'HEADCOUNT_MISMATCH_CONFIRMED_%_GOT_%',v_confirmed,v_distinct_workers;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_assignments) as x(
      worker_id text,project_id uuid,working_team text,movement_status text,
      allocation_hours numeric,allocation_share numeric,notes text
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
      else case
        when coalesce(nullif(btrim(x.working_team),''),w.default_team) is distinct from w.default_team
          then 'borrowed'
        else 'same_team'
      end
    end,
    x.allocation_hours,x.allocation_share,e.work_detail,x.notes,v_user,now()
  from jsonb_to_recordset(p_assignments) as x(
    worker_id text,project_id uuid,working_team text,movement_status text,
    allocation_hours numeric,allocation_share numeric,notes text
  )
  join public.labour_workers w on w.worker_id=x.worker_id
  join public.site_operations_entries e on e.id=v_entry_id
  where v_supervisor_worker_id is null or x.worker_id<>v_supervisor_worker_id;

  update public.labour_verification_batches
  set
    verification_status='verified',
    verified_by=v_user,
    verified_at=now(),
    verified_source_fingerprint=v_source_fingerprint,
    note=nullif(btrim(coalesce(p_note,'')),''),
    last_save_fingerprint=v_request_fingerprint,
    last_save_base_revision=p_expected_batch_revision,
    updated_at=now()
  where id=p_batch_id;

  update public.payroll_verification_records
  set
    status=case when status in ('verified','external_verified') then 'needs_review' else status end,
    updated_at=now()
  where labour_batch_id=p_batch_id;

  return v_distinct_workers;
end;
$$;

revoke execute on function public.labour_verify_batch(uuid,text,jsonb,text,bigint) from public, anon;
grant execute on function public.labour_verify_batch(uuid,text,jsonb,text,bigint) to authenticated, service_role;

create or replace function public.payroll_save_verification(
  p_labour_batch_id uuid,
  p_method text,
  p_status text,
  p_note text,
  p_external_reference text,
  p_items jsonb,
  p_expected_source_fingerprint text,
  p_expected_batch_revision bigint,
  p_expected_payroll_revision bigint
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_batch public.labour_verification_batches%rowtype;
  v_source_fingerprint text;
  v_record public.payroll_verification_records%rowtype;
  v_record_id uuid;
  v_expected_items integer := 0;
  v_received_items integer := 0;
  v_item jsonb;
  v_key text;
  v_value numeric;
  v_request_fingerprint text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.user_id=v_user and p.active=true and p.role in ('manager','admin','engineer','payroll')
  ) then
    raise exception 'NOT_AUTHORIZED_FOR_PAYROLL_VERIFICATION';
  end if;

  if p_expected_source_fingerprint is null or p_expected_source_fingerprint='' then
    raise exception 'EXPECTED_SOURCE_FINGERPRINT_REQUIRED';
  end if;
  if p_expected_batch_revision is null or p_expected_batch_revision<1 then
    raise exception 'EXPECTED_BATCH_REVISION_REQUIRED';
  end if;
  if p_expected_payroll_revision is null or p_expected_payroll_revision<0 then
    raise exception 'EXPECTED_PAYROLL_REVISION_REQUIRED';
  end if;

  if p_method is null or p_method not in ('web','legacy_excel') then raise exception 'INVALID_VERIFICATION_METHOD'; end if;
  if p_status is null or p_status not in ('draft','timecard_checked','verified','external_verified','needs_review') then raise exception 'INVALID_PAYROLL_STATUS'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'ITEMS_MUST_BE_ARRAY'; end if;

  v_request_fingerprint := md5(
    concat_ws('|',
      'payroll_save_verification',
      p_labour_batch_id::text,
      p_method,
      p_status,
      coalesce(p_note,''),
      coalesce(p_external_reference,''),
      p_items::text,
      p_expected_source_fingerprint,
      p_expected_batch_revision::text,
      p_expected_payroll_revision::text
    )
  );

  -- Lock the batch and canonical source first. This serializes all saves for one batch
  -- and prevents a source update from slipping between the comparison and write.
  select b, e.source_fingerprint
    into v_batch, v_source_fingerprint
  from public.labour_verification_batches b
  join public.site_operations_entries e on e.id=b.site_operations_entry_id
  where b.id=p_labour_batch_id
  for update of b,e;

  if not found then raise exception 'LABOUR_BATCH_NOT_FOUND'; end if;

  if v_source_fingerprint is distinct from p_expected_source_fingerprint then
    raise exception 'STALE_PAYROLL_SAVE_RELOAD_REQUIRED source_changed';
  end if;
  if v_batch.concurrency_revision is distinct from p_expected_batch_revision then
    raise exception 'STALE_PAYROLL_SAVE_RELOAD_REQUIRED expected_batch_revision_%_current_%',
      p_expected_batch_revision,v_batch.concurrency_revision;
  end if;

  select * into v_record
  from public.payroll_verification_records
  where labour_batch_id=p_labour_batch_id
  for update;

  if found then
    if v_record.concurrency_revision is distinct from p_expected_payroll_revision then
      if v_record.concurrency_revision=p_expected_payroll_revision+1
         and v_record.last_save_base_revision=p_expected_payroll_revision
         and v_record.last_save_fingerprint=v_request_fingerprint then
        return v_record.id;
      end if;
      raise exception 'STALE_PAYROLL_SAVE_RELOAD_REQUIRED expected_payroll_revision_%_current_%',
        p_expected_payroll_revision,v_record.concurrency_revision;
    end if;
    v_record_id := v_record.id;
  elsif p_expected_payroll_revision<>0 then
    raise exception 'STALE_PAYROLL_SAVE_RELOAD_REQUIRED expected_existing_payroll_revision_%',p_expected_payroll_revision;
  end if;

  -- Preserve Prompt 1/2: no approved money formula/rate source yet and client money is never trusted.
  if p_status in ('verified','external_verified') or p_method='legacy_excel' then
    raise exception 'PAYROLL_RULES_NOT_APPROVED';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item)<>'object' then raise exception 'INVALID_PAYROLL_ITEM'; end if;
    if (v_item->>'attendance_status') is null or
       (v_item->>'attendance_status') not in ('present','absent','leave','half_day','other') then
      raise exception 'INVALID_ATTENDANCE_STATUS';
    end if;
    foreach v_key in array array['work_units','ot_hours','adjustment'] loop
      if v_key='adjustment' and not (v_item ? v_key) then continue; end if;
      if jsonb_typeof(v_item->v_key) is distinct from 'number' then
        raise exception 'INVALID_PAYROLL_NUMBER_%',v_key;
      end if;
      v_value := (v_item->>v_key)::numeric;
      if v_value::text in ('NaN','Infinity','-Infinity') or v_value<>trunc(v_value,2) then
        raise exception 'INVALID_PAYROLL_PRECISION_%',v_key;
      end if;
      if (v_key='work_units' and (v_value<0 or v_value>1)) or
         (v_key='ot_hours' and (v_value<0 or v_value>24)) or
         (v_key='adjustment' and abs(v_value)>9999999999.99) then
        raise exception 'INVALID_PAYROLL_RANGE_%',v_key;
      end if;
    end loop;
    foreach v_key in array array['regular_rate','ot_rate','regular_pay','ot_pay','total_pay'] loop
      if v_item ? v_key and v_item->v_key <> 'null'::jsonb then
        raise exception 'CLIENT_PAYROLL_MONEY_NOT_ALLOWED';
      end if;
    end loop;
    if v_item ? 'calculation_status' and
       v_item->>'calculation_status' is distinct from 'rate_pending' then
      raise exception 'CLIENT_CALCULATION_STATUS_NOT_ALLOWED';
    end if;
  end loop;

  if p_method='legacy_excel' then
    if p_status<>'external_verified' then raise exception 'LEGACY_EXCEL_REQUIRES_EXTERNAL_VERIFIED'; end if;
    if nullif(btrim(coalesce(p_external_reference,'')),'') is null then raise exception 'EXTERNAL_REFERENCE_REQUIRED'; end if;
  else
    if p_status='external_verified' then raise exception 'WEB_METHOD_CANNOT_USE_EXTERNAL_VERIFIED'; end if;
    if v_batch.verification_status<>'verified' and p_status in ('timecard_checked','verified') then
      raise exception 'LABOUR_TEAM_MUST_BE_VERIFIED_FIRST';
    end if;
  end if;

  select count(*) into v_expected_items
  from public.labour_daily_assignments a
  where a.batch_id=p_labour_batch_id
    and (v_batch.supervisor_worker_id is null or a.worker_id<>v_batch.supervisor_worker_id);

  select count(distinct x.worker_id) into v_received_items
  from jsonb_to_recordset(p_items) as x(
    labour_assignment_id uuid, worker_id text, attendance_status text,
    clock_in time, clock_out time, work_units numeric, ot_hours numeric,
    timecard_match boolean, regular_rate numeric, ot_rate numeric,
    regular_pay numeric, ot_pay numeric, adjustment numeric, total_pay numeric,
    calculation_status text, note text
  );

  if p_method='web' and p_status in ('timecard_checked','verified') and v_received_items<>v_expected_items then
    raise exception 'PAYROLL_ITEM_COUNT_MISMATCH_EXPECTED_%_GOT_%',v_expected_items,v_received_items;
  end if;

  if p_method='web' and exists (
    select 1
    from jsonb_to_recordset(p_items) as x(
      labour_assignment_id uuid, worker_id text, attendance_status text,
      clock_in time, clock_out time, work_units numeric, ot_hours numeric,
      timecard_match boolean, regular_rate numeric, ot_rate numeric,
      regular_pay numeric, ot_pay numeric, adjustment numeric, total_pay numeric,
      calculation_status text, note text
    )
    left join public.labour_daily_assignments a
      on a.id=x.labour_assignment_id
     and a.batch_id=p_labour_batch_id
     and a.worker_id=x.worker_id
    where a.id is null
       or (v_batch.supervisor_worker_id is not null and x.worker_id=v_batch.supervisor_worker_id)
  ) then
    raise exception 'PAYROLL_ITEM_NOT_IN_VERIFIED_TEAM';
  end if;

  if p_method='web' and p_status in ('timecard_checked','verified') and exists (
    select 1
    from jsonb_to_recordset(p_items) as x(
      labour_assignment_id uuid, worker_id text, attendance_status text,
      clock_in time, clock_out time, work_units numeric, ot_hours numeric,
      timecard_match boolean, regular_rate numeric, ot_rate numeric,
      regular_pay numeric, ot_pay numeric, adjustment numeric, total_pay numeric,
      calculation_status text, note text
    )
    where coalesce(x.timecard_match,false)=false
  ) then
    raise exception 'ALL_TIMECARDS_MUST_BE_MATCHED';
  end if;

  if p_method='web' and p_status='verified' and exists (
    select 1
    from jsonb_to_recordset(p_items) as x(
      labour_assignment_id uuid, worker_id text, attendance_status text,
      clock_in time, clock_out time, work_units numeric, ot_hours numeric,
      timecard_match boolean, regular_rate numeric, ot_rate numeric,
      regular_pay numeric, ot_pay numeric, adjustment numeric, total_pay numeric,
      calculation_status text, note text
    )
    where coalesce(x.calculation_status,'rate_pending') not in ('calculated','manual','excluded')
       or (coalesce(x.calculation_status,'rate_pending')<>'excluded' and x.total_pay is null)
  ) then
    raise exception 'PAYROLL_TOTALS_REQUIRED_FOR_VERIFIED';
  end if;

  insert into public.payroll_verification_records(
    labour_batch_id,verification_method,status,source_labour_verified_at,
    external_reference,note,timecard_checked_by,timecard_checked_at,
    verified_by,verified_at,last_save_fingerprint,last_save_base_revision,updated_at
  )
  values(
    p_labour_batch_id,p_method,p_status,v_batch.verified_at,
    nullif(btrim(coalesce(p_external_reference,'')),''),
    nullif(btrim(coalesce(p_note,'')),''),
    case when p_status in ('timecard_checked','verified') then v_user else null end,
    case when p_status in ('timecard_checked','verified') then now() else null end,
    case when p_status in ('verified','external_verified') then v_user else null end,
    case when p_status in ('verified','external_verified') then now() else null end,
    v_request_fingerprint,p_expected_payroll_revision,now()
  )
  on conflict(labour_batch_id) do update set
    verification_method=excluded.verification_method,
    status=excluded.status,
    source_labour_verified_at=excluded.source_labour_verified_at,
    external_reference=excluded.external_reference,
    note=excluded.note,
    timecard_checked_by=case when excluded.timecard_checked_by is not null then excluded.timecard_checked_by else public.payroll_verification_records.timecard_checked_by end,
    timecard_checked_at=case when excluded.timecard_checked_at is not null then excluded.timecard_checked_at else public.payroll_verification_records.timecard_checked_at end,
    verified_by=excluded.verified_by,
    verified_at=excluded.verified_at,
    last_save_fingerprint=excluded.last_save_fingerprint,
    last_save_base_revision=excluded.last_save_base_revision,
    updated_at=now()
  returning id into v_record_id;

  if p_method='web' then
    delete from public.payroll_verification_items where record_id=v_record_id;

    insert into public.payroll_verification_items(
      record_id,labour_assignment_id,worker_id,attendance_status,clock_in,clock_out,
      work_units,ot_hours,timecard_match,regular_rate,ot_rate,regular_pay,ot_pay,
      adjustment,total_pay,calculation_status,note,updated_at
    )
    select
      v_record_id,x.labour_assignment_id,x.worker_id,
      case when x.attendance_status in ('present','absent','leave','half_day','other') then x.attendance_status else 'present' end,
      x.clock_in,x.clock_out,
      x.work_units,
      x.ot_hours,
      coalesce(x.timecard_match,false),
      null,null,null,null,coalesce(x.adjustment,0),null,
      'rate_pending',
      nullif(btrim(coalesce(x.note,'')),''),
      now()
    from jsonb_to_recordset(p_items) as x(
      labour_assignment_id uuid, worker_id text, attendance_status text,
      clock_in time, clock_out time, work_units numeric, ot_hours numeric,
      timecard_match boolean, regular_rate numeric, ot_rate numeric,
      regular_pay numeric, ot_pay numeric, adjustment numeric, total_pay numeric,
      calculation_status text, note text
    );
  end if;

  return v_record_id;
end;
$$;

revoke execute on function public.payroll_save_verification(uuid,text,text,text,text,jsonb,text,bigint,bigint) from public, anon;
grant execute on function public.payroll_save_verification(uuid,text,text,text,text,jsonb,text,bigint,bigint) to authenticated, service_role;
