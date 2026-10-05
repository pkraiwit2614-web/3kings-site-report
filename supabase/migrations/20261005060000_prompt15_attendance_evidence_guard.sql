-- Prompt 15: attendance/timecard evidence guard.
-- Draft saves remain permissive; timecard_checked/verified require evidence and consistency.
ALTER TABLE public.payroll_verification_items
  ADD COLUMN IF NOT EXISTS clock_spans_next_day boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attendance_exception_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attendance_exception_reason text,
  ADD COLUMN IF NOT EXISTS attendance_exception_evidence text,
  ADD COLUMN IF NOT EXISTS attendance_exception_approved_by uuid,
  ADD COLUMN IF NOT EXISTS attendance_exception_approved_at timestamptz;

CREATE OR REPLACE FUNCTION public.payroll_save_verification(p_labour_batch_id uuid, p_method text, p_status text, p_note text, p_external_reference text, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    where p.user_id=v_user and p.active=true and p.role in ('manager','admin','engineer','payroll')
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
  where a.batch_id=p_labour_batch_id;

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
      clock_in time, clock_out time, clock_spans_next_day boolean,
      attendance_exception_requested boolean, attendance_exception_reason text, attendance_exception_evidence text,
      work_units numeric, ot_hours numeric,
      timecard_match boolean, regular_rate numeric, ot_rate numeric,
      regular_pay numeric, ot_pay numeric, adjustment numeric, total_pay numeric,
      calculation_status text, note text
    )
    left join public.labour_daily_assignments a
      on a.id=x.labour_assignment_id
     and a.batch_id=p_labour_batch_id
     and a.worker_id=x.worker_id
    where a.id is null
       or not public.labour_is_company_payroll_worker(x.worker_id)
  ) then
    raise exception 'PAYROLL_ITEM_NOT_IN_VERIFIED_TEAM';
  end if;

  if p_method='web' and p_status in ('timecard_checked','verified') and exists (
    select 1
    from jsonb_to_recordset(p_items) as x(
      labour_assignment_id uuid, worker_id text, attendance_status text,
      clock_in time, clock_out time, clock_spans_next_day boolean,
      attendance_exception_requested boolean, attendance_exception_reason text, attendance_exception_evidence text,
      work_units numeric, ot_hours numeric,
      timecard_match boolean, regular_rate numeric, ot_rate numeric,
      regular_pay numeric, ot_pay numeric, adjustment numeric, total_pay numeric,
      calculation_status text, note text
    )
    where coalesce(x.timecard_match,false)=false
  ) then
    raise exception 'ALL_TIMECARDS_MUST_BE_MATCHED';
  end if;


  if p_method='web' and p_status in ('timecard_checked','verified') then
    if exists (
      select 1 from jsonb_to_recordset(p_items) as x(
        labour_assignment_id uuid, worker_id text, attendance_status text,
        clock_in time, clock_out time, clock_spans_next_day boolean,
        attendance_exception_requested boolean, attendance_exception_reason text, attendance_exception_evidence text,
        work_units numeric, ot_hours numeric, timecard_match boolean,
        regular_rate numeric, ot_rate numeric, regular_pay numeric, ot_pay numeric,
        adjustment numeric, total_pay numeric, calculation_status text, note text
      )
      where coalesce(x.attendance_exception_requested,false)
        and (nullif(btrim(coalesce(x.attendance_exception_reason,'')),'') is null
          or nullif(btrim(coalesce(x.attendance_exception_evidence,'')),'') is null)
    ) then raise exception 'ATTENDANCE_EXCEPTION_EVIDENCE_REQUIRED'; end if;

    if exists (
      select 1 from jsonb_to_recordset(p_items) as x(
        labour_assignment_id uuid, worker_id text, attendance_status text,
        clock_in time, clock_out time, clock_spans_next_day boolean,
        attendance_exception_requested boolean, attendance_exception_reason text, attendance_exception_evidence text,
        work_units numeric, ot_hours numeric, timecard_match boolean,
        regular_rate numeric, ot_rate numeric, regular_pay numeric, ot_pay numeric,
        adjustment numeric, total_pay numeric, calculation_status text, note text
      )
      where not coalesce(x.attendance_exception_requested,false)
        and (nullif(btrim(coalesce(x.attendance_exception_reason,'')),'') is not null
          or nullif(btrim(coalesce(x.attendance_exception_evidence,'')),'') is not null)
    ) then raise exception 'ATTENDANCE_EXCEPTION_NOT_EXPLICIT'; end if;

    if exists (
      select 1 from jsonb_to_recordset(p_items) as x(
        labour_assignment_id uuid, worker_id text, attendance_status text,
        clock_in time, clock_out time, clock_spans_next_day boolean,
        attendance_exception_requested boolean, attendance_exception_reason text, attendance_exception_evidence text,
        work_units numeric, ot_hours numeric, timecard_match boolean,
        regular_rate numeric, ot_rate numeric, regular_pay numeric, ot_pay numeric,
        adjustment numeric, total_pay numeric, calculation_status text, note text
      )
      where x.attendance_status='present'
        and not (
          (x.clock_in is not null and x.clock_out is not null)
          or (
            coalesce(x.attendance_exception_requested,false)
            and nullif(btrim(coalesce(x.attendance_exception_reason,'')),'') is not null
            and nullif(btrim(coalesce(x.attendance_exception_evidence,'')),'') is not null
          )
        )
    ) then raise exception 'ATTENDANCE_EVIDENCE_REQUIRED_PRESENT'; end if;

    if exists (
      select 1 from jsonb_to_recordset(p_items) as x(
        labour_assignment_id uuid, worker_id text, attendance_status text,
        clock_in time, clock_out time, clock_spans_next_day boolean,
        attendance_exception_requested boolean, attendance_exception_reason text, attendance_exception_evidence text,
        work_units numeric, ot_hours numeric, timecard_match boolean,
        regular_rate numeric, ot_rate numeric, regular_pay numeric, ot_pay numeric,
        adjustment numeric, total_pay numeric, calculation_status text, note text
      )
      where x.attendance_status='other'
        and not (
          coalesce(x.attendance_exception_requested,false)
          and nullif(btrim(coalesce(x.attendance_exception_reason,'')),'') is not null
          and nullif(btrim(coalesce(x.attendance_exception_evidence,'')),'') is not null
        )
    ) then raise exception 'ATTENDANCE_EXCEPTION_REQUIRED_FOR_OTHER'; end if;

    if exists (
      select 1 from jsonb_to_recordset(p_items) as x(
        labour_assignment_id uuid, worker_id text, attendance_status text,
        clock_in time, clock_out time, clock_spans_next_day boolean,
        attendance_exception_requested boolean, attendance_exception_reason text, attendance_exception_evidence text,
        work_units numeric, ot_hours numeric, timecard_match boolean,
        regular_rate numeric, ot_rate numeric, regular_pay numeric, ot_pay numeric,
        adjustment numeric, total_pay numeric, calculation_status text, note text
      )
      where (x.attendance_status='absent' and (x.work_units<>0 or x.ot_hours<>0))
         or (x.attendance_status='leave' and (x.work_units<>0 or x.ot_hours<>0))
         or (x.attendance_status='half_day' and x.work_units<>0.5)
         or (x.attendance_status='present' and x.work_units<=0)
    ) then raise exception 'ATTENDANCE_WORK_UNITS_OT_MISMATCH'; end if;

    if exists (
      select 1 from jsonb_to_recordset(p_items) as x(
        labour_assignment_id uuid, worker_id text, attendance_status text,
        clock_in time, clock_out time, clock_spans_next_day boolean,
        attendance_exception_requested boolean, attendance_exception_reason text, attendance_exception_evidence text,
        work_units numeric, ot_hours numeric, timecard_match boolean,
        regular_rate numeric, ot_rate numeric, regular_pay numeric, ot_pay numeric,
        adjustment numeric, total_pay numeric, calculation_status text, note text
      )
      where (x.clock_in is null) <> (x.clock_out is null)
        and not (
          coalesce(x.attendance_exception_requested,false)
          and nullif(btrim(coalesce(x.attendance_exception_reason,'')),'') is not null
          and nullif(btrim(coalesce(x.attendance_exception_evidence,'')),'') is not null
        )
    ) then raise exception 'TIMECARD_MISSING_PUNCH'; end if;

    if exists (
      select 1 from jsonb_to_recordset(p_items) as x(
        labour_assignment_id uuid, worker_id text, attendance_status text,
        clock_in time, clock_out time, clock_spans_next_day boolean,
        attendance_exception_requested boolean, attendance_exception_reason text, attendance_exception_evidence text,
        work_units numeric, ot_hours numeric, timecard_match boolean,
        regular_rate numeric, ot_rate numeric, regular_pay numeric, ot_pay numeric,
        adjustment numeric, total_pay numeric, calculation_status text, note text
      )
      where coalesce(x.clock_spans_next_day,false) and (x.clock_in is null or x.clock_out is null)
    ) then raise exception 'OVERNIGHT_FLAG_REQUIRES_COMPLETE_PUNCH'; end if;

    if exists (
      select 1 from jsonb_to_recordset(p_items) as x(
        labour_assignment_id uuid, worker_id text, attendance_status text,
        clock_in time, clock_out time, clock_spans_next_day boolean,
        attendance_exception_requested boolean, attendance_exception_reason text, attendance_exception_evidence text,
        work_units numeric, ot_hours numeric, timecard_match boolean,
        regular_rate numeric, ot_rate numeric, regular_pay numeric, ot_pay numeric,
        adjustment numeric, total_pay numeric, calculation_status text, note text
      )
      where x.clock_in is not null and x.clock_out is not null
        and (
          x.clock_in=x.clock_out
          or (not coalesce(x.clock_spans_next_day,false) and x.clock_out<x.clock_in)
          or (coalesce(x.clock_spans_next_day,false) and x.clock_out>=x.clock_in)
        )
    ) then raise exception 'CLOCK_SEQUENCE_INVALID_OR_OVERNIGHT_NOT_EXPLICIT'; end if;
  end if;


  if p_method='web' and p_status='verified' and exists (
    select 1
    from jsonb_to_recordset(p_items) as x(
      labour_assignment_id uuid, worker_id text, attendance_status text,
      clock_in time, clock_out time, clock_spans_next_day boolean,
      attendance_exception_requested boolean, attendance_exception_reason text, attendance_exception_evidence text,
      work_units numeric, ot_hours numeric,
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
      clock_spans_next_day,attendance_exception_requested,attendance_exception_reason,attendance_exception_evidence,
      attendance_exception_approved_by,attendance_exception_approved_at,
      work_units,ot_hours,timecard_match,regular_rate,ot_rate,regular_pay,ot_pay,
      adjustment,total_pay,calculation_status,note,updated_at
    )
    select
      v_record_id,x.labour_assignment_id,x.worker_id,
      case when x.attendance_status in ('present','absent','leave','half_day','other') then x.attendance_status else 'present' end,
      x.clock_in,x.clock_out,
      coalesce(x.clock_spans_next_day,false),
      coalesce(x.attendance_exception_requested,false),
      nullif(btrim(coalesce(x.attendance_exception_reason,'')),''),
      nullif(btrim(coalesce(x.attendance_exception_evidence,'')),''),
      case when p_status in ('timecard_checked','verified') and coalesce(x.attendance_exception_requested,false) then v_user else null end,
      case when p_status in ('timecard_checked','verified') and coalesce(x.attendance_exception_requested,false) then now() else null end,
      x.work_units,
      x.ot_hours,
      coalesce(x.timecard_match,false),
      null,null,null,null,coalesce(x.adjustment,0),null,
      'rate_pending',
      nullif(btrim(coalesce(x.note,'')),''),
      now()
    from jsonb_to_recordset(p_items) as x(
      labour_assignment_id uuid, worker_id text, attendance_status text,
      clock_in time, clock_out time, clock_spans_next_day boolean,
      attendance_exception_requested boolean, attendance_exception_reason text, attendance_exception_evidence text,
      work_units numeric, ot_hours numeric,
      timecard_match boolean, regular_rate numeric, ot_rate numeric,
      regular_pay numeric, ot_pay numeric, adjustment numeric, total_pay numeric,
      calculation_status text, note text
    );
  end if;

  return v_record_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.payroll_save_verification(p_labour_batch_id uuid, p_method text, p_status text, p_note text, p_external_reference text, p_items jsonb, p_expected_source_fingerprint text, p_expected_batch_revision bigint, p_expected_payroll_revision bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_source_fingerprint text;
  v_batch_revision bigint;
  v_batch_supervisor_worker_id text;
  v_batch_verification_status text;
  v_batch_verified_at timestamptz;
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
  select
    b.concurrency_revision,b.supervisor_worker_id,b.verification_status,b.verified_at,
    e.source_fingerprint
  into
    v_batch_revision,v_batch_supervisor_worker_id,v_batch_verification_status,v_batch_verified_at,
    v_source_fingerprint
  from public.labour_verification_batches b
  join public.site_operations_entries e on e.id=b.site_operations_entry_id
  where b.id=p_labour_batch_id
  for update of b,e;

  if not found then raise exception 'LABOUR_BATCH_NOT_FOUND'; end if;

  if v_source_fingerprint is distinct from p_expected_source_fingerprint then
    raise exception 'STALE_PAYROLL_SAVE_RELOAD_REQUIRED source_changed';
  end if;
  if v_batch_revision is distinct from p_expected_batch_revision then
    raise exception 'STALE_PAYROLL_SAVE_RELOAD_REQUIRED expected_batch_revision_%_current_%',
      p_expected_batch_revision,v_batch_revision;
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
    if v_batch_verification_status<>'verified' and p_status in ('timecard_checked','verified') then
      raise exception 'LABOUR_TEAM_MUST_BE_VERIFIED_FIRST';
    end if;
  end if;

  select count(*) into v_expected_items
  from public.labour_daily_assignments a
  where a.batch_id=p_labour_batch_id;

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
      clock_in time, clock_out time, clock_spans_next_day boolean,
      attendance_exception_requested boolean, attendance_exception_reason text, attendance_exception_evidence text,
      work_units numeric, ot_hours numeric,
      timecard_match boolean, regular_rate numeric, ot_rate numeric,
      regular_pay numeric, ot_pay numeric, adjustment numeric, total_pay numeric,
      calculation_status text, note text
    )
    left join public.labour_daily_assignments a
      on a.id=x.labour_assignment_id
     and a.batch_id=p_labour_batch_id
     and a.worker_id=x.worker_id
    where a.id is null
       or not public.labour_is_company_payroll_worker(x.worker_id)
  ) then
    raise exception 'PAYROLL_ITEM_NOT_IN_VERIFIED_TEAM';
  end if;

  if p_method='web' and p_status in ('timecard_checked','verified') and exists (
    select 1
    from jsonb_to_recordset(p_items) as x(
      labour_assignment_id uuid, worker_id text, attendance_status text,
      clock_in time, clock_out time, clock_spans_next_day boolean,
      attendance_exception_requested boolean, attendance_exception_reason text, attendance_exception_evidence text,
      work_units numeric, ot_hours numeric,
      timecard_match boolean, regular_rate numeric, ot_rate numeric,
      regular_pay numeric, ot_pay numeric, adjustment numeric, total_pay numeric,
      calculation_status text, note text
    )
    where coalesce(x.timecard_match,false)=false
  ) then
    raise exception 'ALL_TIMECARDS_MUST_BE_MATCHED';
  end if;


  if p_method='web' and p_status in ('timecard_checked','verified') then
    if exists (
      select 1 from jsonb_to_recordset(p_items) as x(
        labour_assignment_id uuid, worker_id text, attendance_status text,
        clock_in time, clock_out time, clock_spans_next_day boolean,
        attendance_exception_requested boolean, attendance_exception_reason text, attendance_exception_evidence text,
        work_units numeric, ot_hours numeric, timecard_match boolean,
        regular_rate numeric, ot_rate numeric, regular_pay numeric, ot_pay numeric,
        adjustment numeric, total_pay numeric, calculation_status text, note text
      )
      where coalesce(x.attendance_exception_requested,false)
        and (nullif(btrim(coalesce(x.attendance_exception_reason,'')),'') is null
          or nullif(btrim(coalesce(x.attendance_exception_evidence,'')),'') is null)
    ) then raise exception 'ATTENDANCE_EXCEPTION_EVIDENCE_REQUIRED'; end if;

    if exists (
      select 1 from jsonb_to_recordset(p_items) as x(
        labour_assignment_id uuid, worker_id text, attendance_status text,
        clock_in time, clock_out time, clock_spans_next_day boolean,
        attendance_exception_requested boolean, attendance_exception_reason text, attendance_exception_evidence text,
        work_units numeric, ot_hours numeric, timecard_match boolean,
        regular_rate numeric, ot_rate numeric, regular_pay numeric, ot_pay numeric,
        adjustment numeric, total_pay numeric, calculation_status text, note text
      )
      where not coalesce(x.attendance_exception_requested,false)
        and (nullif(btrim(coalesce(x.attendance_exception_reason,'')),'') is not null
          or nullif(btrim(coalesce(x.attendance_exception_evidence,'')),'') is not null)
    ) then raise exception 'ATTENDANCE_EXCEPTION_NOT_EXPLICIT'; end if;

    if exists (
      select 1 from jsonb_to_recordset(p_items) as x(
        labour_assignment_id uuid, worker_id text, attendance_status text,
        clock_in time, clock_out time, clock_spans_next_day boolean,
        attendance_exception_requested boolean, attendance_exception_reason text, attendance_exception_evidence text,
        work_units numeric, ot_hours numeric, timecard_match boolean,
        regular_rate numeric, ot_rate numeric, regular_pay numeric, ot_pay numeric,
        adjustment numeric, total_pay numeric, calculation_status text, note text
      )
      where x.attendance_status='present'
        and not (
          (x.clock_in is not null and x.clock_out is not null)
          or (
            coalesce(x.attendance_exception_requested,false)
            and nullif(btrim(coalesce(x.attendance_exception_reason,'')),'') is not null
            and nullif(btrim(coalesce(x.attendance_exception_evidence,'')),'') is not null
          )
        )
    ) then raise exception 'ATTENDANCE_EVIDENCE_REQUIRED_PRESENT'; end if;

    if exists (
      select 1 from jsonb_to_recordset(p_items) as x(
        labour_assignment_id uuid, worker_id text, attendance_status text,
        clock_in time, clock_out time, clock_spans_next_day boolean,
        attendance_exception_requested boolean, attendance_exception_reason text, attendance_exception_evidence text,
        work_units numeric, ot_hours numeric, timecard_match boolean,
        regular_rate numeric, ot_rate numeric, regular_pay numeric, ot_pay numeric,
        adjustment numeric, total_pay numeric, calculation_status text, note text
      )
      where x.attendance_status='other'
        and not (
          coalesce(x.attendance_exception_requested,false)
          and nullif(btrim(coalesce(x.attendance_exception_reason,'')),'') is not null
          and nullif(btrim(coalesce(x.attendance_exception_evidence,'')),'') is not null
        )
    ) then raise exception 'ATTENDANCE_EXCEPTION_REQUIRED_FOR_OTHER'; end if;

    if exists (
      select 1 from jsonb_to_recordset(p_items) as x(
        labour_assignment_id uuid, worker_id text, attendance_status text,
        clock_in time, clock_out time, clock_spans_next_day boolean,
        attendance_exception_requested boolean, attendance_exception_reason text, attendance_exception_evidence text,
        work_units numeric, ot_hours numeric, timecard_match boolean,
        regular_rate numeric, ot_rate numeric, regular_pay numeric, ot_pay numeric,
        adjustment numeric, total_pay numeric, calculation_status text, note text
      )
      where (x.attendance_status='absent' and (x.work_units<>0 or x.ot_hours<>0))
         or (x.attendance_status='leave' and (x.work_units<>0 or x.ot_hours<>0))
         or (x.attendance_status='half_day' and x.work_units<>0.5)
         or (x.attendance_status='present' and x.work_units<=0)
    ) then raise exception 'ATTENDANCE_WORK_UNITS_OT_MISMATCH'; end if;

    if exists (
      select 1 from jsonb_to_recordset(p_items) as x(
        labour_assignment_id uuid, worker_id text, attendance_status text,
        clock_in time, clock_out time, clock_spans_next_day boolean,
        attendance_exception_requested boolean, attendance_exception_reason text, attendance_exception_evidence text,
        work_units numeric, ot_hours numeric, timecard_match boolean,
        regular_rate numeric, ot_rate numeric, regular_pay numeric, ot_pay numeric,
        adjustment numeric, total_pay numeric, calculation_status text, note text
      )
      where (x.clock_in is null) <> (x.clock_out is null)
        and not (
          coalesce(x.attendance_exception_requested,false)
          and nullif(btrim(coalesce(x.attendance_exception_reason,'')),'') is not null
          and nullif(btrim(coalesce(x.attendance_exception_evidence,'')),'') is not null
        )
    ) then raise exception 'TIMECARD_MISSING_PUNCH'; end if;

    if exists (
      select 1 from jsonb_to_recordset(p_items) as x(
        labour_assignment_id uuid, worker_id text, attendance_status text,
        clock_in time, clock_out time, clock_spans_next_day boolean,
        attendance_exception_requested boolean, attendance_exception_reason text, attendance_exception_evidence text,
        work_units numeric, ot_hours numeric, timecard_match boolean,
        regular_rate numeric, ot_rate numeric, regular_pay numeric, ot_pay numeric,
        adjustment numeric, total_pay numeric, calculation_status text, note text
      )
      where coalesce(x.clock_spans_next_day,false) and (x.clock_in is null or x.clock_out is null)
    ) then raise exception 'OVERNIGHT_FLAG_REQUIRES_COMPLETE_PUNCH'; end if;

    if exists (
      select 1 from jsonb_to_recordset(p_items) as x(
        labour_assignment_id uuid, worker_id text, attendance_status text,
        clock_in time, clock_out time, clock_spans_next_day boolean,
        attendance_exception_requested boolean, attendance_exception_reason text, attendance_exception_evidence text,
        work_units numeric, ot_hours numeric, timecard_match boolean,
        regular_rate numeric, ot_rate numeric, regular_pay numeric, ot_pay numeric,
        adjustment numeric, total_pay numeric, calculation_status text, note text
      )
      where x.clock_in is not null and x.clock_out is not null
        and (
          x.clock_in=x.clock_out
          or (not coalesce(x.clock_spans_next_day,false) and x.clock_out<x.clock_in)
          or (coalesce(x.clock_spans_next_day,false) and x.clock_out>=x.clock_in)
        )
    ) then raise exception 'CLOCK_SEQUENCE_INVALID_OR_OVERNIGHT_NOT_EXPLICIT'; end if;
  end if;


  if p_method='web' and p_status='verified' and exists (
    select 1
    from jsonb_to_recordset(p_items) as x(
      labour_assignment_id uuid, worker_id text, attendance_status text,
      clock_in time, clock_out time, clock_spans_next_day boolean,
      attendance_exception_requested boolean, attendance_exception_reason text, attendance_exception_evidence text,
      work_units numeric, ot_hours numeric,
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
    p_labour_batch_id,p_method,p_status,v_batch_verified_at,
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
      clock_spans_next_day,attendance_exception_requested,attendance_exception_reason,attendance_exception_evidence,
      attendance_exception_approved_by,attendance_exception_approved_at,
      work_units,ot_hours,timecard_match,regular_rate,ot_rate,regular_pay,ot_pay,
      adjustment,total_pay,calculation_status,note,updated_at
    )
    select
      v_record_id,x.labour_assignment_id,x.worker_id,
      case when x.attendance_status in ('present','absent','leave','half_day','other') then x.attendance_status else 'present' end,
      x.clock_in,x.clock_out,
      coalesce(x.clock_spans_next_day,false),
      coalesce(x.attendance_exception_requested,false),
      nullif(btrim(coalesce(x.attendance_exception_reason,'')),''),
      nullif(btrim(coalesce(x.attendance_exception_evidence,'')),''),
      case when p_status in ('timecard_checked','verified') and coalesce(x.attendance_exception_requested,false) then v_user else null end,
      case when p_status in ('timecard_checked','verified') and coalesce(x.attendance_exception_requested,false) then now() else null end,
      x.work_units,
      x.ot_hours,
      coalesce(x.timecard_match,false),
      null,null,null,null,coalesce(x.adjustment,0),null,
      'rate_pending',
      nullif(btrim(coalesce(x.note,'')),''),
      now()
    from jsonb_to_recordset(p_items) as x(
      labour_assignment_id uuid, worker_id text, attendance_status text,
      clock_in time, clock_out time, clock_spans_next_day boolean,
      attendance_exception_requested boolean, attendance_exception_reason text, attendance_exception_evidence text,
      work_units numeric, ot_hours numeric,
      timecard_match boolean, regular_rate numeric, ot_rate numeric,
      regular_pay numeric, ot_pay numeric, adjustment numeric, total_pay numeric,
      calculation_status text, note text
    );
  end if;

  return v_record_id;
end;
$function$;
