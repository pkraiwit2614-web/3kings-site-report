-- Prompt 02: containment only. BLOCKED for monetary verification.
-- Integrated against live Prompt 01 migration 20261004141943. Never replace its triggers.
begin;
set local lock_timeout='5s';
do $$ begin
  if to_regprocedure('public.labour_payroll_assert_batch(uuid)') is null then
    raise exception 'PROMPT01_REQUIRED';
  end if;
  if md5(pg_get_functiondef('public.payroll_save_verification(uuid,text,text,text,text,jsonb)'::regprocedure))
     <> '2516bc0f000de03c7d79608cb0d4c366' then
    raise exception 'PROMPT01_REBASE_REQUIRED_RPC_CHANGED';
  end if;
end $$;

-- Remove typmod coercion so direct writes cannot silently round input either.
alter table public.payroll_verification_items
  alter column work_units type numeric,
  alter column ot_hours type numeric,
  alter column adjustment type numeric;
alter table public.payroll_verification_items
  add constraint payroll_input_precision_check check (
    work_units=trunc(work_units,2) and ot_hours=trunc(ot_hours,2)
    and adjustment=trunc(adjustment,2) and abs(adjustment)<=9999999999.99
  ) not valid;

-- NOT VALID preserves historical evidence; all new/updated rows are checked.
-- These guards cover direct table writes as well as the RPC, without changing RLS.
alter table public.payroll_verification_records
  add constraint payroll_rules_pending_record_check
  check (status not in ('verified','external_verified')) not valid;
alter table public.payroll_verification_items
  add constraint payroll_rules_pending_item_check
  check (calculation_status='rate_pending' and regular_rate is null and ot_rate is null
    and regular_pay is null and ot_pay is null and total_pay is null
    and adjustment::text not in ('NaN','Infinity','-Infinity')) not valid;

create or replace function public.payroll_save_verification(
  p_labour_batch_id uuid,
  p_method text,
  p_status text,
  p_note text,
  p_external_reference text,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_user uuid := (select auth.uid());
  v_batch public.labour_verification_batches%rowtype;
  v_record_id uuid;
  v_expected_items integer := 0;
  v_received_items integer := 0;
  v_item jsonb;
  v_key text;
  v_value numeric;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.user_id=v_user and p.active=true and p.role in ('manager','engineer','payroll')
  ) then
    raise exception 'NOT_AUTHORIZED_FOR_PAYROLL_VERIFICATION';
  end if;

  if p_method is null or p_method not in ('web','legacy_excel') then raise exception 'INVALID_VERIFICATION_METHOD'; end if;
  if p_status is null or p_status not in ('draft','timecard_checked','verified','external_verified','needs_review') then raise exception 'INVALID_PAYROLL_STATUS'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'ITEMS_MUST_BE_ARRAY'; end if;

  -- No approved effective-dated rate/formula/rounding source exists yet.
  -- Neither manual labels nor an Excel reference constitute approval.
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

  select * into v_batch
  from public.labour_verification_batches
  where id=p_labour_batch_id
  for update;

  if not found then raise exception 'LABOUR_BATCH_NOT_FOUND'; end if;

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
    verified_by,verified_at,updated_at
  )
  values(
    p_labour_batch_id,p_method,p_status,v_batch.verified_at,
    nullif(btrim(coalesce(p_external_reference,'')),''),
    nullif(btrim(coalesce(p_note,'')),''),
    case when p_status in ('timecard_checked','verified') then v_user else null end,
    case when p_status in ('timecard_checked','verified') then now() else null end,
    case when p_status in ('verified','external_verified') then v_user else null end,
    case when p_status in ('verified','external_verified') then now() else null end,
    now()
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

-- Fail atomically if existing rows changed since the read-only preflight.
-- Never silently leave previously verified money outside the new rules.
alter table public.payroll_verification_records validate constraint payroll_rules_pending_record_check;
alter table public.payroll_verification_items validate constraint payroll_rules_pending_item_check;
alter table public.payroll_verification_items validate constraint payroll_input_precision_check;
commit;
