-- Authorization rollback only. Preserve Matrix audit history and existing business data.
-- Run as a single transaction before reverting the UI release; then confirm default-role checks.
BEGIN;
SET LOCAL lock_timeout='3s';
CREATE OR REPLACE FUNCTION private.can_write_reports()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.active=true
      and p.role in ('manager','admin','engineer')
  );
$function$
;
CREATE OR REPLACE FUNCTION private.can_manage_labour_payroll()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.active=true
      and p.role in ('manager','admin','engineer','payroll')
  );
$function$
;
CREATE OR REPLACE FUNCTION public.labour_confirm_supervisor_mapping(p_batch_id uuid, p_worker_id text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
    where p.user_id=v_user and p.active=true and p.role in ('manager','admin','engineer','payroll')
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

  update public.payroll_verification_records
  set status=case when status in ('verified','external_verified') then 'needs_review' else status end,
      updated_at=now()
  where labour_batch_id=p_batch_id;

  return p_worker_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.labour_confirm_headcount(p_batch_id uuid, p_confirmed_headcount integer, p_basis text, p_evidence_note text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_source_status text;
  v_old_confirmed integer;
  v_total integer;
  v_male integer;
  v_female integer;
  v_note text := nullif(btrim(coalesce(p_evidence_note,'')),'');
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  if not exists (
    select 1 from public.profiles p
    where p.user_id=v_user and p.active=true and p.role in ('manager','admin','engineer','payroll')
  ) then
    raise exception 'NOT_AUTHORIZED_FOR_LABOUR_VERIFICATION';
  end if;

  if p_confirmed_headcount is null or p_confirmed_headcount<0 then
    raise exception 'INVALID_CONFIRMED_HEADCOUNT';
  end if;

  if p_basis not in (
    'source_total','male_female','daily_report','monthly_report',
    'company_roster','contractor_only','manual_review'
  ) then
    raise exception 'INVALID_HEADCOUNT_BASIS';
  end if;

  select
    b.headcount_source_status,b.confirmed_headcount,
    e.total_manpower,e.male_count,e.female_count
  into v_source_status,v_old_confirmed,v_total,v_male,v_female
  from public.labour_verification_batches b
  join public.site_operations_entries e on e.id=b.site_operations_entry_id
  where b.id=p_batch_id
  for update of b;

  if not found then raise exception 'LABOUR_BATCH_NOT_FOUND'; end if;

  if p_basis='source_total' then
    if v_total is null then raise exception 'SOURCE_TOTAL_UNKNOWN'; end if;
    if p_confirmed_headcount<>v_total then raise exception 'CONFIRMED_HEADCOUNT_MUST_MATCH_SOURCE_TOTAL'; end if;
  elsif p_basis='male_female' then
    if v_male is null or v_female is null then raise exception 'MALE_FEMALE_UNKNOWN'; end if;
    if p_confirmed_headcount<>v_male+v_female then raise exception 'CONFIRMED_HEADCOUNT_MUST_MATCH_MALE_FEMALE'; end if;
  elsif p_basis='contractor_only' and p_confirmed_headcount<>0 then
    raise exception 'CONTRACTOR_ONLY_WORKER_PAYROLL_HEADCOUNT_MUST_BE_ZERO';
  end if;

  if (v_source_status<>'matched'
      or p_basis in ('daily_report','monthly_report','company_roster','contractor_only','manual_review'))
     and v_note is null then
    raise exception 'HEADCOUNT_EVIDENCE_NOTE_REQUIRED';
  end if;

  update public.labour_verification_batches
  set
    confirmed_headcount=p_confirmed_headcount,
    expected_headcount=p_confirmed_headcount,
    confirmed_headcount_basis=p_basis,
    confirmed_headcount_evidence=v_note,
    headcount_confirmed_by=v_user,
    headcount_confirmed_at=now(),
    headcount_confirmation_status='confirmed',
    verification_status=case
      when verification_status='verified' and v_old_confirmed is distinct from p_confirmed_headcount
        then 'needs_review'
      else verification_status
    end,
    updated_at=now()
  where id=p_batch_id;

  return p_confirmed_headcount;
end;
$function$
;
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
$function$
;
CREATE OR REPLACE FUNCTION public.labour_payroll_guard_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 b public.labour_verification_batches%rowtype;
 r public.payroll_verification_records%rowtype;
 w public.labour_workers%rowtype;
 v_id uuid;
 v_user uuid := auth.uid();
begin
 if tg_op='UPDATE' and new.id is distinct from old.id then raise exception 'IMMUTABLE_ID'; end if;
 if tg_table_name='labour_verification_batches' then
   if tg_op='UPDATE' and new.site_operations_entry_id is distinct from old.site_operations_entry_id then
     raise exception 'IMMUTABLE_LABOUR_SOURCE';
   end if;
   if tg_op<>'DELETE' and new.verification_status='verified'
     and (tg_op='INSERT' or old.verification_status is distinct from new.verification_status
       or old.verified_by is distinct from new.verified_by
       or old.verified_at is distinct from new.verified_at
       or old.verified_source_fingerprint is distinct from new.verified_source_fingerprint) then
     if v_user is null or not exists(select 1 from public.profiles where user_id=v_user and active and role in ('manager','admin','engineer','payroll')) then
       raise exception 'AUTH_REQUIRED_FOR_VERIFICATION';
     end if;
     new.verified_by:=v_user;
     new.verified_at:=now();
     -- Source fingerprint is asserted, never silently accept a stale revision.
   end if;
   if tg_op='UPDATE' and (new.verification_status is distinct from old.verification_status
     or new.verified_at is distinct from old.verified_at
     or new.verified_source_fingerprint is distinct from old.verified_source_fingerprint
     or new.supervisor_worker_id is distinct from old.supervisor_worker_id
     or new.work_date is distinct from old.work_date or new.expected_headcount is distinct from old.expected_headcount) then
     update public.payroll_verification_records set status='needs_review',updated_at=now()
       where labour_batch_id=old.id and status in ('timecard_checked','verified','external_verified');
   end if;
 elsif tg_table_name='labour_daily_assignments' then
   if tg_op='UPDATE' and (new.batch_id is distinct from old.batch_id or new.worker_id is distinct from old.worker_id) then
     raise exception 'IMMUTABLE_ASSIGNMENT_IDENTITY';
   end if;
   v_id:=case when tg_op='DELETE' then old.batch_id else new.batch_id end;
   select * into b from public.labour_verification_batches where id=v_id for update;
   update public.payroll_verification_records set status='needs_review',updated_at=now()
     where labour_batch_id=v_id and status in ('timecard_checked','verified','external_verified');
   if tg_op<>'DELETE' then
     if v_user is null or not exists(select 1 from public.profiles where user_id=v_user and active and role in ('manager','admin','engineer','payroll')) then
       raise exception 'AUTH_REQUIRED_FOR_VERIFICATION';
     end if;
     if new.work_date is distinct from b.work_date or new.worker_id=b.supervisor_worker_id then
       raise exception 'INVALID_LABOUR_ASSIGNMENT';
     end if;
     select * into w from public.labour_workers where worker_id=new.worker_id;
     if not found then raise exception 'UNKNOWN_WORKER_ID'; end if;
     if new.home_team is distinct from w.default_team then raise exception 'HOME_TEAM_MUST_MATCH_WORKER'; end if;
     new.verified_by:=v_user; new.verified_at:=now();
   end if;
 elsif tg_table_name='payroll_verification_records' then
   if tg_op='UPDATE' and new.labour_batch_id is distinct from old.labour_batch_id then raise exception 'IMMUTABLE_PAYROLL_BATCH'; end if;
   v_id:=case when tg_op='DELETE' then old.labour_batch_id else new.labour_batch_id end;
   perform 1 from public.labour_verification_batches where id=v_id for update;
   if tg_op<>'DELETE' then
     if new.status in ('timecard_checked','verified','external_verified') then
       if v_user is null or not exists(select 1 from public.profiles where user_id=v_user and active and role in ('manager','admin','engineer','payroll')) then
         raise exception 'AUTH_REQUIRED_FOR_VERIFICATION';
       end if;
       if new.status in ('timecard_checked','verified') then
         new.timecard_checked_by:=v_user; new.timecard_checked_at:=now();
       end if;
       if new.status in ('verified','external_verified') then new.verified_by:=v_user; new.verified_at:=now(); end if;
     else
       new.verified_by:=null; new.verified_at:=null;
     end if;
   end if;
 else -- payroll items
   if tg_op='UPDATE' and (new.record_id is distinct from old.record_id or new.worker_id is distinct from old.worker_id) then
     raise exception 'IMMUTABLE_PAYROLL_ITEM_IDENTITY';
   end if;
   v_id:=case when tg_op='DELETE' then old.record_id else new.record_id end;
   select * into r from public.payroll_verification_records where id=v_id;
   select * into b from public.labour_verification_batches where id=r.labour_batch_id for update;
   if r.status in ('timecard_checked','verified') and r.timecard_checked_at is distinct from now() then
     raise exception 'PAYROLL_REVERIFICATION_REQUIRED';
   end if;
   if tg_op<>'DELETE' and r.verification_method='web' then
     -- FK SET NULL during re-verification preserves historical items, but never a checked state.
     if not (tg_op='UPDATE' and new.labour_assignment_id is null and old.labour_assignment_id is not null
       and r.status in ('draft','needs_review')
       and not exists(select 1 from public.labour_daily_assignments where id=old.labour_assignment_id)) and not exists(select 1 from public.labour_daily_assignments a
         where a.id=new.labour_assignment_id and a.batch_id=b.id and a.worker_id=new.worker_id
           and (b.supervisor_worker_id is null or a.worker_id<>b.supervisor_worker_id)) then
       raise exception 'PAYROLL_ITEM_NOT_IN_VERIFIED_TEAM';
     end if;
   end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.labour_verify_batch(p_batch_id uuid, p_note text, p_assignments jsonb, p_expected_source_fingerprint text, p_expected_batch_revision bigint)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_expected integer;
  v_confirmed integer;
  v_headcount_confirmation_status text;
  v_work_date date;
  v_entry_id uuid;
  v_entry_work_date date;
  v_work_date_validation_status text;
  v_supervisor_worker_id text;
  v_source_fingerprint text;
  v_batch_revision bigint;
  v_last_save_fingerprint text;
  v_last_save_base_revision bigint;
  v_distinct_workers integer:=0;
  v_nonpayroll_worker_id text;
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

  select
    b.expected_headcount,b.confirmed_headcount,b.headcount_confirmation_status,
    b.work_date,b.site_operations_entry_id,b.supervisor_worker_id,
    b.concurrency_revision,b.last_save_fingerprint,b.last_save_base_revision,
    e.source_fingerprint,e.work_date,e.work_date_validation_status
  into
    v_expected,v_confirmed,v_headcount_confirmation_status,
    v_work_date,v_entry_id,v_supervisor_worker_id,
    v_batch_revision,v_last_save_fingerprint,v_last_save_base_revision,
    v_source_fingerprint,v_entry_work_date,v_work_date_validation_status
  from public.labour_verification_batches b
  join public.site_operations_entries e on e.id=b.site_operations_entry_id
  where b.id=p_batch_id
  for update of b,e;

  if not found then raise exception 'LABOUR_BATCH_NOT_FOUND'; end if;

  if v_source_fingerprint is distinct from p_expected_source_fingerprint then
    raise exception 'STALE_LABOUR_SAVE_RELOAD_REQUIRED source_changed';
  end if;

  if v_batch_revision is distinct from p_expected_batch_revision then
    if v_batch_revision=p_expected_batch_revision+1
       and v_last_save_base_revision=p_expected_batch_revision
       and v_last_save_fingerprint=v_request_fingerprint then
      select count(distinct a.worker_id)
        into v_distinct_workers
      from public.labour_daily_assignments a
      where a.batch_id=p_batch_id;
      return v_distinct_workers;
    end if;
    raise exception 'STALE_LABOUR_SAVE_RELOAD_REQUIRED expected_batch_revision_%_current_%',
      p_expected_batch_revision,v_batch_revision;
  end if;

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
  );

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

  select x.worker_id
    into v_nonpayroll_worker_id
  from jsonb_to_recordset(p_assignments) as x(
    worker_id text,project_id uuid,working_team text,movement_status text,
    allocation_hours numeric,allocation_share numeric,notes text
  )
  join public.labour_workers w on w.worker_id=x.worker_id
  where not public.labour_is_company_payroll_worker(w.worker_id)
  order by x.worker_id
  limit 1;

  if v_nonpayroll_worker_id is not null then
    raise exception 'NON_PAYROLL_WORKER_NOT_ALLOWED_%',v_nonpayroll_worker_id;
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
  where public.labour_is_company_payroll_worker(w.worker_id);

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
$function$
;
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
$function$
;
CREATE OR REPLACE FUNCTION public.labour_confirm_contractor_count(p_batch_id uuid, p_count integer, p_basis text, p_evidence text, p_expected_source_fingerprint text, p_expected_batch_revision bigint)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_entry_work_date date;
  v_work_date_validation_status text;
  v_source_fingerprint text;
  v_batch_revision bigint;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.user_id=v_user and p.active=true and p.role in ('manager','admin','engineer','payroll')
  ) then
    raise exception 'NOT_AUTHORIZED_FOR_LABOUR_VERIFICATION';
  end if;
  if p_count is null or p_count<0 then raise exception 'INVALID_CONTRACTOR_COUNT'; end if;
  if p_basis not in ('daily_report','monthly_report','contractor_roster','manual_review') then
    raise exception 'INVALID_CONTRACTOR_COUNT_BASIS';
  end if;
  if nullif(btrim(coalesce(p_evidence,'')),'') is null then
    raise exception 'CONTRACTOR_COUNT_EVIDENCE_REQUIRED';
  end if;
  if p_expected_source_fingerprint is null or p_expected_source_fingerprint='' then
    raise exception 'EXPECTED_SOURCE_FINGERPRINT_REQUIRED';
  end if;
  if p_expected_batch_revision is null or p_expected_batch_revision<1 then
    raise exception 'EXPECTED_BATCH_REVISION_REQUIRED';
  end if;

  select e.work_date,e.work_date_validation_status,e.source_fingerprint,b.concurrency_revision
    into v_entry_work_date,v_work_date_validation_status,v_source_fingerprint,v_batch_revision
  from public.labour_verification_batches b
  join public.site_operations_entries e on e.id=b.site_operations_entry_id
  where b.id=p_batch_id
  for update of b;

  if not found then raise exception 'LABOUR_BATCH_NOT_FOUND'; end if;
  if coalesce(v_work_date_validation_status,'valid')<>'valid'
     or v_entry_work_date>(current_timestamp at time zone 'Asia/Bangkok')::date then
    raise exception 'WORK_DATE_REVIEW_REQUIRED';
  end if;
  if v_source_fingerprint is distinct from p_expected_source_fingerprint then
    raise exception 'STALE_CONTRACTOR_COUNT_RELOAD_REQUIRED source_changed';
  end if;
  if v_batch_revision is distinct from p_expected_batch_revision then
    raise exception 'STALE_CONTRACTOR_COUNT_RELOAD_REQUIRED expected_batch_revision_%_current_%',
      p_expected_batch_revision,v_batch_revision;
  end if;

  update public.labour_verification_batches
  set contractor_person_count=p_count,
      contractor_count_basis=p_basis,
      contractor_count_evidence=btrim(p_evidence),
      contractor_count_confirmed_by=v_user,
      contractor_count_confirmed_at=now(),
      updated_at=now()
  where id=p_batch_id;

  return p_count;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.labour_verify_batch(p_batch_id uuid, p_note text, p_assignments jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := (select auth.uid());
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
  v_nonpayroll_worker_id text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  if not exists (
    select 1 from public.profiles p
    where p.user_id=v_user and p.active=true and p.role in ('manager','admin','engineer','payroll')
  ) then
    raise exception 'NOT_AUTHORIZED_FOR_LABOUR_VERIFICATION';
  end if;

  if p_assignments is null or jsonb_typeof(p_assignments)<>'array' then
    raise exception 'ASSIGNMENTS_MUST_BE_ARRAY';
  end if;

  select
    b.expected_headcount,b.confirmed_headcount,b.headcount_confirmation_status,
    b.work_date,b.site_operations_entry_id,b.supervisor_worker_id,
    e.source_fingerprint,e.work_date,e.work_date_validation_status
  into
    v_expected,v_confirmed,v_headcount_confirmation_status,
    v_work_date,v_entry_id,v_supervisor_worker_id,
    v_source_fingerprint,v_entry_work_date,v_work_date_validation_status
  from public.labour_verification_batches b
  join public.site_operations_entries e on e.id=b.site_operations_entry_id
  where b.id=p_batch_id
  for update of b;

  if not found then raise exception 'LABOUR_BATCH_NOT_FOUND'; end if;

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
  );

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

  select x.worker_id
    into v_nonpayroll_worker_id
  from jsonb_to_recordset(p_assignments) as x(
    worker_id text,project_id uuid,working_team text,movement_status text,
    allocation_hours numeric,allocation_share numeric,notes text
  )
  join public.labour_workers w on w.worker_id=x.worker_id
  where not public.labour_is_company_payroll_worker(w.worker_id)
  order by x.worker_id
  limit 1;

  if v_nonpayroll_worker_id is not null then
    raise exception 'NON_PAYROLL_WORKER_NOT_ALLOWED_%',v_nonpayroll_worker_id;
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
  where public.labour_is_company_payroll_worker(w.worker_id);

  update public.labour_verification_batches
  set
    verification_status='verified',
    verified_by=v_user,
    verified_at=now(),
    verified_source_fingerprint=v_source_fingerprint,
    note=nullif(btrim(coalesce(p_note,'')),''),
    updated_at=now()
  where id=p_batch_id;

  update public.payroll_verification_records
  set
    status=case when status in ('verified','external_verified') then 'needs_review' else status end,
    updated_at=now()
  where labour_batch_id=p_batch_id;

  return v_distinct_workers;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.schedule_save_web_override(p_task_id uuid, p_site_status text, p_next_action text, p_target_close date, p_blocker text, p_notes text, p_review_status text, p_client_session_id uuid, p_user_agent text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(
    select 1 from public.profiles p
    where p.user_id=v_user and p.active=true and p.role in ('manager','viewer_editor')
  ) then
    raise exception 'NOT_AUTHORIZED_FOR_SCHEDULE_EDIT';
  end if;
  if p_review_status not in ('pending','confirmed','needs_review') then
    raise exception 'INVALID_REVIEW_STATUS';
  end if;
  if not exists(select 1 from public.schedule_tasks s where s.id=p_task_id and s.is_active=true) then
    raise exception 'TASK_NOT_FOUND';
  end if;
  if char_length(coalesce(p_site_status,''))>500
     or char_length(coalesce(p_next_action,''))>4000
     or char_length(coalesce(p_blocker,''))>4000
     or char_length(coalesce(p_notes,''))>4000 then
    raise exception 'TEXT_TOO_LONG';
  end if;

  insert into public.schedule_task_overrides(
    task_id,site_status,next_action,target_close,blocker,notes,review_status,updated_by,updated_at
  )
  values(
    p_task_id,nullif(btrim(coalesce(p_site_status,'')),''),
    nullif(btrim(coalesce(p_next_action,'')),''),
    p_target_close,
    nullif(btrim(coalesce(p_blocker,'')),''),
    nullif(btrim(coalesce(p_notes,'')),''),
    p_review_status,v_user,now()
  )
  on conflict(task_id) do update set
    site_status=excluded.site_status,
    next_action=excluded.next_action,
    target_close=excluded.target_close,
    blocker=excluded.blocker,
    notes=excluded.notes,
    review_status=excluded.review_status,
    updated_by=v_user,
    updated_at=now();

  insert into public.activity_logs(
    user_id,client_session_id,event_type,path,action,target,metadata,user_agent
  ) values (
    v_user,coalesce(p_client_session_id,gen_random_uuid()),
    'data_change','/schedule','schedule_web_override_save',p_task_id::text,
    jsonb_build_object('review_status',p_review_status),
    left(nullif(btrim(coalesce(p_user_agent,'')),''),500)
  );

  return p_task_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.defect_writeback_status(p_room_no text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_user uuid := (SELECT auth.uid());
DECLARE v_row public.defect_web_overrides%ROWTYPE;
BEGIN
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = v_user AND p.active = true
      AND ((p.user_id = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid AND p.role='manager')
           OR p.role IN ('defect_editor','viewer_editor'))
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_DEFECT_EDIT';
  END IF;
  SELECT * INTO v_row FROM public.defect_web_overrides
  WHERE room_no = upper(btrim(p_room_no));
  IF NOT FOUND THEN RETURN jsonb_build_object('state', 'not_queued'); END IF;
  RETURN jsonb_build_object(
    'state', v_row.source_sync_state,
    'room_no', v_row.room_no,
    'revision', v_row.updated_at,
    'verified_at', v_row.source_synced_at,
    'attempts', v_row.writeback_attempt_count,
    'last_error', v_row.writeback_last_error);
END; $function$
;
CREATE OR REPLACE FUNCTION public.procurement_save_web_override(p_item_id uuid, p_current_status text, p_expected_delivery_text text, p_expected_delivery date, p_condition_note text, p_review_status text, p_client_session_id uuid, p_user_agent text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      and (
        p.role='purchase'
        or (p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid and p.role='manager')
      )
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
$function$
;
CREATE OR REPLACE FUNCTION public.site_operations_save_management_review(p_entry_id uuid, p_review_status text, p_management_note text, p_client_session_id uuid, p_user_agent text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(
    select 1 from public.profiles p
    where p.user_id=v_user and p.active=true and p.role in ('manager','admin','engineer','payroll')
  ) then
    raise exception 'NOT_AUTHORIZED_FOR_SITE_OPERATIONS_EDIT';
  end if;
  if p_review_status not in ('pending','confirmed','needs_review') then
    raise exception 'INVALID_REVIEW_STATUS';
  end if;
  if not exists(select 1 from public.site_operations_entries e where e.id=p_entry_id) then
    raise exception 'SITE_OPERATIONS_ENTRY_NOT_FOUND';
  end if;
  if char_length(coalesce(p_management_note,''))>4000 then raise exception 'TEXT_TOO_LONG'; end if;

  insert into public.site_operations_management_reviews(
    entry_id,review_status,management_note,updated_by,updated_at
  )
  values(
    p_entry_id,p_review_status,nullif(btrim(coalesce(p_management_note,'')),''),
    v_user,now()
  )
  on conflict(entry_id) do update set
    review_status=excluded.review_status,
    management_note=excluded.management_note,
    updated_by=v_user,
    updated_at=now();

  insert into public.activity_logs(
    user_id,client_session_id,event_type,path,action,target,metadata,user_agent
  ) values (
    v_user,coalesce(p_client_session_id,gen_random_uuid()),
    'data_change','/reports','site_operations_management_review_save',p_entry_id::text,
    jsonb_build_object('review_status',p_review_status),
    left(nullif(btrim(coalesce(p_user_agent,'')),''),500)
  );

  return p_entry_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.defect_submit_manual_details(p_updates jsonb, p_client_session_id uuid, p_user_agent text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_count integer;
  v_inserted integer := 0;
  v_rooms text[];
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(
    select 1 from public.profiles p
    where p.user_id=v_user and p.active=true
      and ((p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid and p.role='manager') or p.role in ('defect_editor','viewer_editor'))
  ) then raise exception 'NOT_AUTHORIZED_FOR_DEFECT_EDIT'; end if;

  if p_updates is null or jsonb_typeof(p_updates)<>'array' then raise exception 'UPDATES_MUST_BE_ARRAY'; end if;

  select count(*),array_agg(upper(btrim(x.room_no)) order by upper(btrim(x.room_no)))
  into v_count,v_rooms
  from jsonb_to_recordset(p_updates) as x(room_no text,detail_text text);

  if v_count<1 or v_count>50 then raise exception 'INVALID_UPDATE_COUNT'; end if;
  if (select count(distinct upper(btrim(x.room_no))||'|'||lower(regexp_replace(btrim(x.detail_text),'\s+',' ','g')))
      from jsonb_to_recordset(p_updates) as x(room_no text,detail_text text))<>v_count then
    raise exception 'DUPLICATE_DEFECT_IN_REQUEST';
  end if;

  if exists(
    select 1 from jsonb_to_recordset(p_updates) as x(room_no text,detail_text text)
    where upper(btrim(x.room_no)) !~ '^[AB][0-9]{3}$'
       or nullif(btrim(coalesce(x.detail_text,'')),'') is null
       or char_length(btrim(x.detail_text))>4000
  ) then raise exception 'INVALID_DEFECT_DETAIL'; end if;

  if exists(
    select 1 from jsonb_to_recordset(p_updates) as x(room_no text,detail_text text)
    left join public.condo_room_status r on r.room_no=upper(btrim(x.room_no))
    where r.room_no is null
  ) then raise exception 'UNKNOWN_ROOM'; end if;

  with incoming as (
    select
      upper(btrim(x.room_no)) room_no,
      btrim(x.detail_text) detail_text,
      lower(regexp_replace(btrim(x.detail_text),'\s+',' ','g')) normalized_detail
    from jsonb_to_recordset(p_updates) as x(room_no text,detail_text text)
  ),
  fresh as (
    select i.*,
      encode(extensions.digest(convert_to(i.room_no||'|'||i.normalized_detail,'UTF8'),'sha256'),'hex') fp
    from incoming i
    where not exists(
      select 1 from public.defect_manual_updates m
      where m.room_no=i.room_no
        and (
          m.detail_fingerprint=encode(extensions.digest(convert_to(i.room_no||'|'||i.normalized_detail,'UTF8'),'sha256'),'hex')
          or lower(regexp_replace(btrim(coalesce(m.detail_text,'')),'\s+',' ','g'))=i.normalized_detail
        )
    )
  )
  insert into public.defect_manual_updates(room_no,detail_text,created_by,detail_fingerprint)
  select room_no,detail_text,v_user,fp from fresh
  on conflict(room_no,detail_fingerprint) where detail_fingerprint is not null do nothing;

  get diagnostics v_inserted = row_count;

  insert into public.activity_logs(
    user_id,client_session_id,event_type,path,action,target,metadata,user_agent
  ) values (
    v_user,coalesce(p_client_session_id,gen_random_uuid()),'data_change','/defect-flow',
    'defect_manual_detail_add',array_to_string(v_rooms,','),
    jsonb_build_object('submitted_count',v_count,'inserted_count',v_inserted,'duplicate_count',v_count-v_inserted,'rooms',to_jsonb(v_rooms)),
    left(nullif(btrim(coalesce(p_user_agent,'')),''),500)
  );

  return v_inserted;
end $function$
;
CREATE OR REPLACE FUNCTION public.work_calendar_create(p_name text, p_color text, p_client_session_id uuid, p_user_agent text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select auth.uid()); v_id uuid; v_today date:=(now() at time zone 'Asia/Bangkok')::date; v_count integer;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true and p.role in ('manager','viewer_editor','purchase')) then
    raise exception 'NOT_AUTHORIZED_FOR_CALENDAR_EDIT';
  end if;
  select count(*) into v_count from public.work_calendars c
   where c.created_by=v_user and (c.created_at at time zone 'Asia/Bangkok')::date=v_today;
  if v_count>=3 then raise exception 'CALENDAR_DAILY_CREATE_LIMIT_3'; end if;
  if nullif(btrim(coalesce(p_name,'')),'') is null or char_length(btrim(p_name))>120 then raise exception 'INVALID_CALENDAR_NAME'; end if;
  if coalesce(p_color,'') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'INVALID_CALENDAR_COLOR'; end if;
  insert into public.work_calendars(name,color,created_by) values(btrim(p_name),p_color,v_user) returning id into v_id;
  insert into public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata,user_agent)
  values(v_user,coalesce(p_client_session_id,gen_random_uuid()),'data_change','/calendar','calendar_create',v_id::text,jsonb_build_object('name',btrim(p_name)),left(nullif(btrim(coalesce(p_user_agent,'')),''),500));
  return v_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.work_calendar_save_event(p_event_id uuid, p_calendar_id uuid, p_event_date date, p_title text, p_detail text, p_client_session_id uuid, p_user_agent text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select auth.uid()); v_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true and p.role in ('manager','viewer_editor','purchase')) then
    raise exception 'NOT_AUTHORIZED_FOR_CALENDAR_EDIT';
  end if;
  if not exists(select 1 from public.work_calendars c where c.id=p_calendar_id and c.active=true) then raise exception 'CALENDAR_NOT_FOUND'; end if;
  if p_event_date is null or nullif(btrim(coalesce(p_title,'')),'') is null then raise exception 'EVENT_DATE_TITLE_REQUIRED'; end if;
  if char_length(btrim(p_title))>200 or char_length(coalesce(p_detail,''))>4000 then raise exception 'TEXT_TOO_LONG'; end if;

  if p_event_id is null then
    insert into public.work_calendar_events(calendar_id,event_date,title,detail,created_by,updated_by)
    values(p_calendar_id,p_event_date,btrim(p_title),nullif(btrim(coalesce(p_detail,'')),''),v_user,v_user)
    returning id into v_id;
  else
    update public.work_calendar_events set calendar_id=p_calendar_id,event_date=p_event_date,title=btrim(p_title),
      detail=nullif(btrim(coalesce(p_detail,'')),''),updated_by=v_user,updated_at=now()
    where id=p_event_id returning id into v_id;
    if v_id is null then raise exception 'EVENT_NOT_FOUND'; end if;
  end if;

  insert into public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata,user_agent)
  values(v_user,coalesce(p_client_session_id,gen_random_uuid()),'data_change','/calendar',
    case when p_event_id is null then 'calendar_event_create' else 'calendar_event_update' end,
    v_id::text,jsonb_build_object('calendar_id',p_calendar_id,'event_date',p_event_date),left(nullif(btrim(coalesce(p_user_agent,'')),''),500));
  return v_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.defect_register_validated_file(p_server_token text, p_file_name text, p_storage_path text, p_mime_type text, p_file_size bigint, p_content_sha256 text, p_detected_rooms text[], p_validation_reason text, p_client_session_id uuid, p_user_agent text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
  v_existing uuid;
  v_expected_hash text;
  v_token_hash text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(
    select 1 from public.profiles p
    where p.user_id=v_user and p.active=true
      and ((p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid and p.role='manager') or p.role in ('defect_editor','viewer_editor'))
  ) then raise exception 'NOT_AUTHORIZED_FOR_DEFECT_EDIT'; end if;

  select c.token_hash into v_expected_hash
  from private.defect_ingest_config c
  where c.key='server_token';

  v_token_hash:=encode(extensions.digest(convert_to(coalesce(p_server_token,''),'UTF8'),'sha256'),'hex');
  if v_expected_hash is null or v_token_hash is distinct from v_expected_hash then
    raise exception 'INVALID_DEFECT_INGEST_SERVER_TOKEN';
  end if;

  if p_mime_type<>'application/pdf' or p_file_size<=0 or p_file_size>20971520 then
    raise exception 'INVALID_PDF_FILE';
  end if;
  if p_storage_path not like v_user::text||'/%' then raise exception 'INVALID_STORAGE_OWNER'; end if;
  if coalesce(p_content_sha256,'') !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_CONTENT_SHA256'; end if;
  if coalesce(cardinality(p_detected_rooms),0)<1 then raise exception 'NO_DEFECT_ROOMS_DETECTED'; end if;
  if exists(
    select 1 from unnest(p_detected_rooms) r
    left join public.condo_room_status c on c.room_no=upper(btrim(r))
    where c.room_no is null
  ) then raise exception 'UNKNOWN_DEFECT_ROOM'; end if;

  select f.id into v_existing
  from public.defect_file_uploads f
  where f.content_sha256=p_content_sha256
    and f.validation_status='accepted'
  limit 1;

  if v_existing is not null then
    insert into public.activity_logs(
      user_id,client_session_id,event_type,path,action,target,metadata,user_agent
    ) values (
      v_user,coalesce(p_client_session_id,gen_random_uuid()),'data_change','/defect-flow',
      'defect_pdf_duplicate_ignored',v_existing::text,
      jsonb_build_object('file_name',left(p_file_name,255),'content_sha256',p_content_sha256),
      left(nullif(btrim(coalesce(p_user_agent,'')),''),500)
    );
    return jsonb_build_object('status','duplicate','id',v_existing);
  end if;

  insert into public.defect_file_uploads(
    file_name,storage_path,mime_type,file_size,status,created_by,
    content_sha256,validation_status,validation_reason,detected_rooms,validated_at
  ) values (
    left(p_file_name,255),p_storage_path,p_mime_type,p_file_size,'pending_drive_sync',v_user,
    p_content_sha256,'accepted',left(coalesce(p_validation_reason,'validated_defect_pdf'),1000),
    p_detected_rooms,now()
  ) returning id into v_id;

  insert into public.activity_logs(
    user_id,client_session_id,event_type,path,action,target,metadata,user_agent
  ) values (
    v_user,coalesce(p_client_session_id,gen_random_uuid()),'data_change','/defect-flow',
    'defect_pdf_validated_upload',v_id::text,
    jsonb_build_object(
      'file_name',left(p_file_name,255),
      'status','pending_drive_sync',
      'rooms',to_jsonb(p_detected_rooms),
      'content_sha256',p_content_sha256
    ),
    left(nullif(btrim(coalesce(p_user_agent,'')),''),500)
  );
  return jsonb_build_object('status','accepted','id',v_id);
end $function$
;
CREATE OR REPLACE FUNCTION public.defect_forget_rejected_upload(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true and ((p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid and p.role='manager') or p.role='defect_editor')) then raise exception 'NOT_AUTHORIZED_FOR_DEFECT_EDIT'; end if;
  delete from public.defect_file_uploads f
  where f.id=p_id
    and f.created_by=v_user
    and f.validation_status='rejected';
  return found;
end $function$
;
CREATE OR REPLACE FUNCTION public.defect_manual_update_apply(p_room_no text, p_detail_text text, p_current_status text, p_status_group text, p_next_action text, p_client_session_id uuid, p_user_agent text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
  v_room text := upper(replace(btrim(coalesce(p_room_no,'')),' ',''));
  v_normalized_detail text := lower(regexp_replace(btrim(coalesce(p_detail_text,'')),'\s+',' ','g'));
  v_fingerprint text;
  v_duplicate uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true and ((p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid and p.role='manager') or p.role in ('defect_editor','viewer_editor'))) then
    raise exception 'NOT_AUTHORIZED_FOR_DEFECT_EDIT';
  end if;
  if v_room !~ '^[AB][0-9]{3}$' then raise exception 'INVALID_ROOM_NO'; end if;
  if v_normalized_detail='' then raise exception 'DETAIL_REQUIRED'; end if;
  if char_length(p_detail_text)>4000 or char_length(coalesce(p_current_status,''))>1000 or char_length(coalesce(p_next_action,''))>4000 then raise exception 'TEXT_TOO_LONG'; end if;
  if nullif(btrim(coalesce(p_status_group,'')),'') is not null and p_status_group not in ('Hotel - Incomplete','Hotel - Awaiting Check','Hotel - Checked Complete','Non-Hotel - Pending Handover','Non-Hotel - Handover Complete','Non-Hotel - Awaiting Sale') then raise exception 'INVALID_STATUS_GROUP'; end if;
  if not exists(select 1 from public.condo_room_status r where r.room_no=v_room) then raise exception 'ROOM_NOT_FOUND'; end if;

  v_fingerprint:=encode(extensions.digest(convert_to(v_room||'|'||v_normalized_detail,'UTF8'),'sha256'),'hex');

  select m.id into v_duplicate
  from public.defect_manual_updates m
  where m.room_no=v_room
    and (
      m.detail_fingerprint=v_fingerprint
      or lower(regexp_replace(btrim(coalesce(m.detail_text,'')),'\s+',' ','g'))=v_normalized_detail
    )
  order by m.created_at desc
  limit 1;

  if v_duplicate is null then
    insert into public.defect_manual_updates(room_no,detail_text,created_by,detail_fingerprint)
    values(v_room,btrim(p_detail_text),v_user,v_fingerprint)
    returning id into v_id;
  else
    v_id:=v_duplicate;
  end if;

  -- Mark the authenticated Web save, not an inbound Excel update.
  perform pg_catalog.set_config('app.defect_manual_update','1',true);

  update public.condo_room_status set
    defect_detail=btrim(p_detail_text),
    current_status=coalesce(nullif(btrim(coalesce(p_current_status,'')),''),current_status),
    status_group=coalesce(nullif(btrim(coalesce(p_status_group,'')),''),status_group),
    next_action=coalesce(nullif(btrim(coalesce(p_next_action,'')),''),next_action),
    latest_source='Web App manual update',
    source_note=case when v_duplicate is null
      then 'Manual Defect update from authorized Web App user'
      else 'Duplicate Defect detail ignored; current status fields reconciled'
    end,
    source_modified_at=now(),
    synced_at=now()
  where room_no=v_room;

  insert into public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata,user_agent)
  values(
    v_user,coalesce(p_client_session_id,gen_random_uuid()),'data_change','/defect-flow',
    case when v_duplicate is null then 'defect_manual_update' else 'defect_manual_duplicate_ignored' end,
    v_room,
    jsonb_build_object('manual_update_id',v_id,'duplicate',v_duplicate is not null,'detail_fingerprint',v_fingerprint),
    left(nullif(btrim(coalesce(p_user_agent,'')),''),500)
  );
  return v_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.work_calendar_delete(p_calendar_id uuid, p_client_session_id uuid, p_user_agent text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select auth.uid()); v_id uuid; v_name text; v_event_count integer;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true and p.role in ('manager','viewer_editor','purchase')) then
    raise exception 'NOT_AUTHORIZED_FOR_CALENDAR_EDIT';
  end if;

  select c.name,(select count(*) from public.work_calendar_events e where e.calendar_id=c.id)
  into v_name,v_event_count
  from public.work_calendars c
  where c.id=p_calendar_id and c.active=true;

  if v_name is null then raise exception 'CALENDAR_NOT_FOUND'; end if;

  delete from public.work_calendars where id=p_calendar_id returning id into v_id;

  insert into public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata,user_agent)
  values(v_user,coalesce(p_client_session_id,gen_random_uuid()),'data_change','/calendar','calendar_delete',v_id::text,
    jsonb_build_object('name',v_name,'deleted_event_count',v_event_count),left(nullif(btrim(coalesce(p_user_agent,'')),''),500));
  return v_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.work_calendar_update(p_calendar_id uuid, p_name text, p_color text, p_client_session_id uuid, p_user_agent text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select auth.uid()); v_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true and p.role in ('manager','viewer_editor','purchase')) then
    raise exception 'NOT_AUTHORIZED_FOR_CALENDAR_EDIT';
  end if;
  if nullif(btrim(coalesce(p_name,'')),'') is null or char_length(btrim(p_name))>120 then raise exception 'INVALID_CALENDAR_NAME'; end if;
  if coalesce(p_color,'') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'INVALID_CALENDAR_COLOR'; end if;

  update public.work_calendars
  set name=btrim(p_name),color=p_color,updated_at=now()
  where id=p_calendar_id and active=true
  returning id into v_id;

  if v_id is null then raise exception 'CALENDAR_NOT_FOUND'; end if;

  insert into public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata,user_agent)
  values(v_user,coalesce(p_client_session_id,gen_random_uuid()),'data_change','/calendar','calendar_update',v_id::text,
    jsonb_build_object('name',btrim(p_name),'color',p_color),left(nullif(btrim(coalesce(p_user_agent,'')),''),500));
  return v_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.hotel_room_availability_save(p_room_no text, p_status text, p_start_date date, p_end_date date, p_reason text, p_expected_revision integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_room text := upper(regexp_replace(btrim(coalesce(p_room_no,'')),'[[:space:]-]','','g'));
  v_group text;
  v_rooms text[];
  v_member text;
  v_prev integer;
  v_rev integer;
  v_name text;
  v_result jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id=v_uid AND p.active=true
      AND ((p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid AND p.role='manager') OR p.role='defect_editor')
  ) THEN RAISE EXCEPTION 'ROOM_AVAILABILITY_EDIT_DENIED'; END IF;
  IF v_room ~ '^GOOD0?[1-5]$' THEN v_room:='B10'||right(v_room,1); END IF;
  IF v_room !~ '^[AB][0-9]{3}$' THEN RAISE EXCEPTION 'INVALID_ROOM'; END IF;
  SELECT coalesce(m.group_key,r.room_no) INTO v_group
  FROM public.condo_room_status r LEFT JOIN public.hotel_room_group_members m ON m.room_no=r.room_no
  WHERE r.room_no=v_room;
  IF v_group IS NULL THEN RAISE EXCEPTION 'ROOM_NOT_FOUND'; END IF;
  IF p_status NOT IN ('AVAILABLE','OOO','OOS','UNKNOWN') THEN RAISE EXCEPTION 'INVALID_AVAILABILITY_STATUS'; END IF;
  IF p_status IN ('OOO','OOS') AND p_start_date IS NULL
    THEN RAISE EXCEPTION 'START_DATE_REQUIRED'; END IF;
  IF p_end_date IS NOT NULL AND (p_start_date IS NULL OR p_end_date<p_start_date)
    THEN RAISE EXCEPTION 'INVALID_DATE_RANGE'; END IF;
  IF char_length(coalesce(p_reason,''))>2000 THEN RAISE EXCEPTION 'REASON_TOO_LONG'; END IF;

  SELECT array_agg(r.room_no ORDER BY r.room_no) INTO v_rooms FROM public.condo_room_status r
  WHERE r.room_no=v_group OR EXISTS (
    SELECT 1 FROM public.hotel_room_group_members m WHERE m.room_no=r.room_no AND m.group_key=v_group);
  IF coalesce(array_length(v_rooms,1),0)=0 OR NOT v_room=ANY(v_rooms) THEN RAISE EXCEPTION 'ROOM_GROUP_NOT_FOUND'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(v_rooms) AS v(room_no)
    WHERE NOT EXISTS(SELECT 1 FROM public.hotel_room_source_map sm WHERE sm.room_no=v.room_no))
    THEN RAISE EXCEPTION 'ROOM_GROUP_EXCEL_MAPPING_MISSING'; END IF;
  -- Lock physical identities in stable order even when an availability row does not exist yet.
  PERFORM 1 FROM public.condo_room_status r WHERE r.room_no=ANY(v_rooms) ORDER BY r.room_no FOR UPDATE;
  SELECT h.revision INTO v_prev FROM public.hotel_room_availability h
  WHERE h.room_no=v_room FOR UPDATE;
  IF v_prev IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT_RELOAD'; END IF;
  SELECT coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.username),''),'ผู้ใช้')
    INTO v_name FROM public.profiles p WHERE p.user_id=v_uid AND p.active=true;

  FOREACH v_member IN ARRAY v_rooms LOOP
    INSERT INTO public.hotel_room_availability(
      room_no,availability_status,start_date,end_date,reason,updated_by,updated_by_name,
      updated_at,revision,source_sync_state,source_writeback_last_error
    ) VALUES (
      v_member,p_status,p_start_date,p_end_date,
      nullif(btrim(coalesce(p_reason,'')),''),v_uid,coalesce(v_name,'ผู้ใช้'),
      now(),1,'pending',null
    )
    ON CONFLICT(room_no) DO UPDATE SET
      availability_status=EXCLUDED.availability_status,start_date=EXCLUDED.start_date,
      end_date=EXCLUDED.end_date,reason=coalesce(nullif(btrim(p_reason),''),public.hotel_room_availability.reason),
      updated_by=EXCLUDED.updated_by,updated_by_name=EXCLUDED.updated_by_name,
      updated_at=now(),revision=public.hotel_room_availability.revision+1,
      source_sync_state='pending',source_writeback_last_error=null
    RETURNING revision INTO v_rev;
    v_result:=v_result||jsonb_build_array(jsonb_build_object('room_no',v_member,'revision',v_rev));
  END LOOP;
  INSERT INTO public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata)
  VALUES(v_uid,gen_random_uuid(),'data_change','/hotel-room-status',
    'hotel_room_availability_save',v_room,
    jsonb_build_object('status',p_status,'group_key',v_group,'members',v_rooms,
      'updated_revisions',v_result));
  RETURN jsonb_build_object('room_no',v_room,'group_key',v_group,'members',v_result,'status',p_status);
END $function$
;
CREATE OR REPLACE FUNCTION public.procurement_calendar_link_delivery(p_item_id uuid, p_event_key text, p_expected_delivery date, p_client_session_id uuid, p_user_agent text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select auth.uid()); v_identity text; v_delivered date;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true
    and (p.role='purchase' or (p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid and p.role='manager')))
    then raise exception 'NOT_AUTHORIZED_FOR_PROCUREMENT_EDIT'; end if;
  if nullif(btrim(coalesce(p_event_key,'')),'') is null or char_length(p_event_key)>1200
    or p_event_key !~ '^g:[^[:space:]]+:[A-Za-z0-9_-]{4,1024}$'
    then raise exception 'INVALID_CALENDAR_EVENT'; end if;
  if p_expected_delivery is null or p_expected_delivery<'2020-01-01'::date
    or p_expected_delivery>'2100-12-31'::date then raise exception 'INVALID_DELIVERY_DATE'; end if;
  select p.source_identity,p.actual_delivery into v_identity,v_delivered
  from public.v_procurement_source_rows p where p.id=p_item_id;
  if v_identity is null then raise exception 'PROCUREMENT_ITEM_NOT_FOUND'; end if;
  if v_delivered is not null then raise exception 'ITEM_ALREADY_DELIVERED'; end if;
  insert into public.procurement_calendar_delivery(source_identity,last_item_id,event_key,expected_delivery,updated_by,updated_at)
    values(v_identity,p_item_id,p_event_key,p_expected_delivery,v_user,now())
  on conflict(source_identity) do update
    set last_item_id=excluded.last_item_id,event_key=excluded.event_key,
      expected_delivery=excluded.expected_delivery,updated_by=v_user,updated_at=now();
  insert into public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata,user_agent)
  values(v_user,coalesce(p_client_session_id,gen_random_uuid()),'data_change','/calendar',
   'calendar_procurement_expected_delivery',p_item_id::text,
   jsonb_build_object('source_identity',v_identity,'event_key',p_event_key,'expected_delivery',p_expected_delivery),
   left(nullif(btrim(coalesce(p_user_agent,'')),''),500));
  return p_item_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.procurement_calendar_unlink_delivery(p_event_key text, p_client_session_id uuid, p_user_agent text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select auth.uid()); v_identity text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true
    and (p.role='purchase' or (p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid and p.role='manager')))
    then raise exception 'NOT_AUTHORIZED_FOR_PROCUREMENT_EDIT'; end if;
  delete from public.procurement_calendar_delivery where event_key=p_event_key returning source_identity into v_identity;
  if v_identity is not null then
    insert into public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata,user_agent)
    values(v_user,coalesce(p_client_session_id,gen_random_uuid()),'data_change','/calendar',
      'calendar_procurement_unlink',v_identity,jsonb_build_object('event_key',p_event_key),
      left(nullif(btrim(coalesce(p_user_agent,'')),''),500));
  end if;
  return v_identity is not null;
end $function$
;
CREATE OR REPLACE FUNCTION public.work_calendar_delete_event(p_event_id uuid, p_client_session_id uuid, p_user_agent text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select auth.uid()); v_id uuid; v_calendar_id uuid; v_event_date date; v_title text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true and p.role in ('manager','viewer_editor','purchase')) then
    raise exception 'NOT_AUTHORIZED_FOR_CALENDAR_EDIT';
  end if;

  delete from public.work_calendar_events
  where id=p_event_id
  returning id,calendar_id,event_date,title into v_id,v_calendar_id,v_event_date,v_title;

  if v_id is null then raise exception 'EVENT_NOT_FOUND'; end if;

  insert into public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata,user_agent)
  values(v_user,coalesce(p_client_session_id,gen_random_uuid()),'data_change','/calendar','calendar_event_delete',v_id::text,
    jsonb_build_object('calendar_id',v_calendar_id,'event_date',v_event_date,'title',v_title),left(nullif(btrim(coalesce(p_user_agent,'')),''),500));
  return v_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.material_tool_override_save(p_item_type text, p_item_id uuid, p_status text, p_status_detail text, p_notes text, p_location text, p_responsible_person text, p_expected_updated_at timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 u uuid:=(SELECT auth.uid());s text;d text;n text;l text;r text;
 prev_stamp timestamptz;present boolean;new_stamp timestamptz;
BEGIN
 IF u IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=u AND p.active=true
  AND (p.role='purchase' OR (p.role='manager' AND p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid)))
 THEN RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_MATERIAL_TOOL_EDIT'; END IF;
 IF p_item_id IS NULL OR p_item_type NOT IN ('material','tool') THEN RAISE EXCEPTION 'INVALID_ITEM'; END IF;
 IF nullif(btrim(coalesce(p_status,'')),'') IS NULL OR char_length(p_status)>120 OR
  char_length(coalesce(p_status_detail,''))>4000 OR char_length(coalesce(p_notes,''))>4000 OR
  char_length(coalesce(p_location,''))>500 OR char_length(coalesce(p_responsible_person,''))>500
 THEN RAISE EXCEPTION 'INVALID_FIELD_LENGTH'; END IF;
 IF p_item_type='material' THEN
   SELECT m.status,m.status_detail,m.notes INTO s,d,n FROM public.materials m WHERE m.id=p_item_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'MATERIAL_NOT_FOUND'; END IF;
   IF p_status NOT IN ('สั่งแล้ว','ยังไม่สั่ง','สั่งมาไม่พอ','เจ้าของจัดหา','ต้องติดตาม','รอตรวจสอบ','ไม่เกี่ยวข้อง','ไม่ระบุ')
     THEN RAISE EXCEPTION 'INVALID_MATERIAL_STATUS'; END IF;
 ELSE
   SELECT t.status,t.location,t.responsible_person,t.notes INTO s,l,r,n FROM public.tool_machine t WHERE t.id=p_item_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'TOOL_NOT_FOUND'; END IF;
 END IF;
 SELECT o.updated_at INTO prev_stamp FROM public.material_tool_web_overrides o
   WHERE o.item_type=p_item_type AND o.item_id=p_item_id FOR UPDATE;
 present:=FOUND;
 IF (present AND prev_stamp IS DISTINCT FROM p_expected_updated_at) OR
  (NOT present AND p_expected_updated_at IS NOT NULL) THEN RAISE EXCEPTION 'REVISION_CONFLICT_RELOAD'; END IF;
 INSERT INTO public.material_tool_web_overrides(item_type,item_id,status,status_detail,notes,location,responsible_person,updated_by,updated_at)
 VALUES(p_item_type,p_item_id,NULLIF(NULLIF(btrim(p_status),''),s),
 CASE WHEN p_item_type='material' THEN NULLIF(NULLIF(btrim(coalesce(p_status_detail,'')),''),d) END,
 NULLIF(NULLIF(btrim(coalesce(p_notes,'')),''),n),
 CASE WHEN p_item_type='tool' THEN NULLIF(NULLIF(btrim(coalesce(p_location,'')),''),l) END,
 CASE WHEN p_item_type='tool' THEN NULLIF(NULLIF(btrim(coalesce(p_responsible_person,'')),''),r) END,
 u,clock_timestamp())
 ON CONFLICT(item_type,item_id) DO UPDATE SET
 status=EXCLUDED.status,status_detail=EXCLUDED.status_detail,notes=EXCLUDED.notes,
 location=EXCLUDED.location,responsible_person=EXCLUDED.responsible_person,
 updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at
 RETURNING updated_at INTO new_stamp;
 INSERT INTO public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata)
 VALUES(u,gen_random_uuid(),'data_change','/materials','material_tool_override_save',
  p_item_type||':'||p_item_id::text,jsonb_build_object('item_type',p_item_type,'item_id',p_item_id,'status',p_status));
 RETURN new_stamp;
END $function$
;
ALTER POLICY "schedule_select_active" ON "public"."schedule_tasks" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "daily_select_active" ON "public"."daily_reports" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "report_items_select_active" ON "public"."report_items" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "active users read duplicate groups" ON "public"."site_operations_duplicate_groups" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "active users read duplicate members" ON "public"."site_operations_duplicate_members" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "report_photos_select_active" ON "public"."report_photos" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "materials_select_active" ON "public"."materials" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "procurement_select_active" ON "public"."procurement_items" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "schedule_task_overrides_read_active" ON "public"."schedule_task_overrides" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "procurement_item_overrides_read_active" ON "public"."procurement_item_overrides" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "site_operations_management_reviews_read_active" ON "public"."site_operations_management_reviews" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "defect_manual_updates_read_active" ON "public"."defect_manual_updates" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true)))));
ALTER POLICY "report_drafts_select_own" ON "public"."report_drafts" USING ((( SELECT private.is_active_user() AS is_active_user) AND (user_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "daily_report_revisions_select_active" ON "public"."daily_report_revisions" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "drive_photo_index_select_authenticated" ON "public"."drive_photo_index" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "schedule_snapshots_select_authenticated" ON "public"."schedule_task_daily_snapshots" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "tool_machine_select_active" ON "public"."tool_machine" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "active users can view condo room status" ON "public"."condo_room_status" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true)))));
ALTER POLICY "photo_task_feedback_select_authenticated" ON "public"."photo_task_feedback" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "work_calendars_read_active" ON "public"."work_calendars" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "work_calendar_events_read_active" ON "public"."work_calendar_events" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "active users read labour name map" ON "public"."labour_name_map" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "payroll roles read payroll items" ON "public"."payroll_verification_items" USING ((( SELECT private.is_active_user() AS is_active_user) AND ( SELECT private.has_app_role(ARRAY['manager'::text, 'admin'::text, 'engineer'::text, 'payroll'::text]) AS has_app_role)));
ALTER POLICY "procurement_item_projects_select_active" ON "public"."procurement_item_projects" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "photo_ai_task_scores_select_authenticated" ON "public"."photo_ai_task_scores" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "defect_flow_staging_insert" ON "storage"."objects" WITH CHECK (((bucket_id = 'defect-flow-staging'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true) AND (((p.user_id = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid) AND (p.role = 'manager'::text)) OR (p.role = ANY (ARRAY['defect_editor'::text, 'viewer_editor'::text]))))))));
ALTER POLICY "defect_flow_staging_delete_own" ON "storage"."objects" USING (((bucket_id = 'defect-flow-staging'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true) AND (((p.user_id = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid) AND (p.role = 'manager'::text)) OR (p.role = ANY (ARRAY['defect_editor'::text, 'viewer_editor'::text]))))))));
ALTER POLICY "hotel_group_read_active" ON "public"."hotel_room_group_members" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true)))));
ALTER POLICY "hotel_availability_read_active" ON "public"."hotel_room_availability" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true)))));
ALTER POLICY "payroll roles insert payroll records" ON "public"."payroll_verification_records" WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true) AND (p.role = ANY (ARRAY['manager'::text, 'engineer'::text, 'payroll'::text]))))));
ALTER POLICY "payroll roles update payroll records" ON "public"."payroll_verification_records" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true) AND (p.role = ANY (ARRAY['manager'::text, 'engineer'::text, 'payroll'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true) AND (p.role = ANY (ARRAY['manager'::text, 'engineer'::text, 'payroll'::text]))))));
ALTER POLICY "payroll roles delete payroll records" ON "public"."payroll_verification_records" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true) AND (p.role = ANY (ARRAY['manager'::text, 'engineer'::text, 'payroll'::text]))))));
ALTER POLICY "active users read labour assignments" ON "public"."labour_daily_assignments" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "payroll roles insert payroll items" ON "public"."payroll_verification_items" WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true) AND (p.role = ANY (ARRAY['manager'::text, 'engineer'::text, 'payroll'::text]))))));
ALTER POLICY "payroll roles update payroll items" ON "public"."payroll_verification_items" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true) AND (p.role = ANY (ARRAY['manager'::text, 'engineer'::text, 'payroll'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true) AND (p.role = ANY (ARRAY['manager'::text, 'engineer'::text, 'payroll'::text]))))));
ALTER POLICY "payroll roles delete payroll items" ON "public"."payroll_verification_items" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true) AND (p.role = ANY (ARRAY['manager'::text, 'engineer'::text, 'payroll'::text]))))));
ALTER POLICY "payroll roles read payroll records" ON "public"."payroll_verification_records" USING ((( SELECT private.is_active_user() AS is_active_user) AND ( SELECT private.has_app_role(ARRAY['manager'::text, 'admin'::text, 'engineer'::text, 'payroll'::text]) AS has_app_role)));
ALTER POLICY "active users read labour batches" ON "public"."labour_verification_batches" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "material_tool_overrides_read_active" ON "public"."material_tool_web_overrides" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "active users read labour workers" ON "public"."labour_workers" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "procurement_calendar_delivery_read" ON "public"."procurement_calendar_delivery" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "procurement_item_projects_insert_manage" ON "public"."procurement_item_projects" WITH CHECK (((( SELECT auth.uid() AS uid) = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid) OR ( SELECT private.has_app_role(ARRAY['purchase'::text]) AS has_app_role)));
ALTER POLICY "procurement_item_projects_update_manage" ON "public"."procurement_item_projects" USING (((( SELECT auth.uid() AS uid) = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid) OR ( SELECT private.has_app_role(ARRAY['purchase'::text]) AS has_app_role))) WITH CHECK (((( SELECT auth.uid() AS uid) = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid) OR ( SELECT private.has_app_role(ARRAY['purchase'::text]) AS has_app_role)));
ALTER POLICY "procurement_item_projects_delete_manage" ON "public"."procurement_item_projects" USING (((( SELECT auth.uid() AS uid) = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid) OR ( SELECT private.has_app_role(ARRAY['purchase'::text]) AS has_app_role)));
ALTER POLICY "active users read site operations" ON "public"."site_operations_entries" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "active users read site operations projects" ON "public"."site_operations_entry_projects" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "projects_select_active" ON public."projects" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "weekly_select_active" ON public."weekly_snapshots" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "site_photos_select" ON storage."objects" USING (((bucket_id = 'site-photos'::text) AND ( SELECT private.is_active_user() AS is_active_user)));
ALTER POLICY "photo_archive_staging_select_own" ON storage."objects" USING (((bucket_id = 'photo-archive-staging'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND ( SELECT private.is_active_user() AS is_active_user)));
ALTER POLICY "photo_archive_staging_select_archived" ON storage."objects" USING (((bucket_id = 'photo-archive-staging'::text) AND ( SELECT private.is_active_user() AS is_active_user) AND photo_archive_staging_deletable(name)));
ALTER POLICY "drive_sync_runs_select_authenticated" ON public."drive_sync_runs" USING (( SELECT private.is_active_user() AS is_active_user));

-- Work Plan and shared display policies captured before Matrix changes.
CREATE OR REPLACE FUNCTION public.hotel_work_plan_save_combine_room(p_seq integer, p_day integer, p_override_date date, p_actual_date date, p_status text, p_note text, p_expected_revision integer, p_group_expected jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_uid uuid := auth.uid();
 v_name text;
 v_anchor public.hotel_work_plan_rooms%ROWTYPE;
 v_before public.hotel_work_plan_rooms%ROWTYPE;
 v_after public.hotel_work_plan_rooms%ROWTYPE;
 v_group_key text;
 v_expected_revision integer;
 v_expected_matches integer;
 v_expected_count integer;
 v_changed integer := 0;
 v_anchor_revision integer;
BEGIN
 IF v_uid IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.profiles p
  WHERE p.user_id=v_uid AND p.active=true
  AND ((p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid AND p.role='manager') OR p.role='defect_editor')
 ) THEN RAISE EXCEPTION 'HOTEL_WORK_PLAN_EDIT_DENIED'; END IF;
 IF p_day NOT BETWEEN 1 AND 9
    OR p_status NOT IN ('pending','confirmed','in_progress','completed','postponed')
    OR length(coalesce(p_note,''))>2000
    OR p_group_expected IS NULL OR jsonb_typeof(p_group_expected)<>'array'
 THEN RAISE EXCEPTION 'INVALID_WORK_PLAN'; END IF;
 SELECT * INTO v_anchor FROM public.hotel_work_plan_rooms WHERE seq_no=p_seq;
 IF NOT FOUND THEN RAISE EXCEPTION 'UNKNOWN_WORK_PLAN_SEQ'; END IF;
 SELECT group_key INTO v_group_key FROM public.hotel_room_group_members WHERE room_no=v_anchor.room_no;
 IF v_group_key IS NULL THEN RAISE EXCEPTION 'UNKNOWN_COMBINE_GROUP'; END IF;
 SELECT count(*) INTO v_expected_count
 FROM public.hotel_work_plan_rooms r
 JOIN public.hotel_room_group_members m ON m.room_no=r.room_no
 WHERE m.group_key=v_group_key;
 IF v_expected_count<2 OR v_expected_count<>jsonb_array_length(p_group_expected)
 THEN RAISE EXCEPTION 'COMBINE_ROOM_SET_CHANGED_RELOAD'; END IF;
 -- Lock in deterministic Seq. order so simultaneous edits of opposite room members
 -- cannot overwrite one another. Verify *every* peer revision before any mutation.
 FOR v_before IN
  SELECT r.* FROM public.hotel_work_plan_rooms r
  JOIN public.hotel_room_group_members m ON m.room_no=r.room_no
  WHERE m.group_key=v_group_key ORDER BY r.seq_no FOR UPDATE OF r
 LOOP
  SELECT count(*),max((e->>'revision')::integer)
  INTO v_expected_matches,v_expected_revision
  FROM jsonb_array_elements(p_group_expected) e
  WHERE e->>'seq'=v_before.seq_no::text;
  IF v_expected_matches<>1 OR v_before.revision IS DISTINCT FROM v_expected_revision
   OR (v_before.seq_no=p_seq AND v_before.revision IS DISTINCT FROM p_expected_revision)
  THEN RAISE EXCEPTION 'REVISION_CONFLICT_RELOAD'; END IF;
  IF v_before.sync_state='conflict' THEN RAISE EXCEPTION 'WORK_PLAN_GROUP_SYNC_CONFLICT_RELOAD'; END IF;
 END LOOP;
 SELECT coalesce(nullif(p.full_name,''),nullif(p.username,''),'ผู้ใช้')
 INTO v_name FROM public.profiles p WHERE p.user_id=v_uid;
 FOR v_before IN
  SELECT r.* FROM public.hotel_work_plan_rooms r
  JOIN public.hotel_room_group_members m ON m.room_no=r.room_no
  WHERE m.group_key=v_group_key ORDER BY r.seq_no
 LOOP
  UPDATE public.hotel_work_plan_rooms
  SET day_no=p_day,planned_date_override=p_override_date,actual_date=p_actual_date,
      work_status=p_status,note=nullif(btrim(coalesce(p_note,'')),''),
      revision=revision+1,sync_state='pending',
      updated_by=v_uid,updated_by_name=v_name,updated_at=now()
  WHERE seq_no=v_before.seq_no RETURNING * INTO v_after;
  IF v_before.seq_no=p_seq THEN v_anchor_revision:=v_after.revision; END IF;
  INSERT INTO public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata)
  VALUES(v_uid,gen_random_uuid(),'data_change','/hotel-work-plan',
         'hotel_work_plan_save_combine_room',v_before.room_no,
         jsonb_build_object(
          'combine_group',v_group_key,'seq',v_before.seq_no,
          'previous_day',v_before.day_no,'new_day',v_after.day_no,
          'previous_date',v_before.planned_date_override,'new_date',v_after.planned_date_override,
          'previous_actual',v_before.actual_date,'new_actual',v_after.actual_date,
          'previous_status',v_before.work_status,'new_status',v_after.work_status,
          'previous_note',v_before.note,'new_note',v_after.note,
          'revision',v_after.revision));
  v_changed:=v_changed+1;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'revision',v_anchor_revision,'updated_rows',v_changed,'combine_group',v_group_key);
END $function$
;
CREATE OR REPLACE FUNCTION public.hotel_work_plan_save_day(p_day integer, p_planned_date date, p_note text, p_expected_revision integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid:=auth.uid();v_before public.hotel_work_plan_days%ROWTYPE;v_after public.hotel_work_plan_days%ROWTYPE;v_name text;
BEGIN
 IF v_uid IS NULL OR NOT EXISTS (
 SELECT 1 FROM public.profiles p WHERE p.user_id=v_uid AND p.active=true
 AND ((p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid AND p.role='manager') OR p.role='defect_editor')
 ) THEN RAISE EXCEPTION 'HOTEL_WORK_PLAN_EDIT_DENIED'; END IF;
 IF p_day NOT BETWEEN 1 AND 9 OR length(coalesce(p_note,''))>2000 THEN RAISE EXCEPTION 'INVALID_WORK_PLAN'; END IF;
 SELECT * INTO v_before FROM public.hotel_work_plan_days WHERE day_no=p_day FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'UNKNOWN_WORK_PLAN_DAY'; END IF;
 IF v_before.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT_RELOAD'; END IF;
 SELECT coalesce(nullif(p.full_name,''),nullif(p.username,''),'ผู้ใช้') INTO v_name FROM public.profiles p WHERE p.user_id=v_uid;
 UPDATE public.hotel_work_plan_days SET planned_date=p_planned_date,note=nullif(btrim(coalesce(p_note,'')),''),
 revision=revision+1,sync_state='pending',updated_by=v_uid,updated_by_name=v_name,updated_at=now()
 WHERE day_no=p_day RETURNING * INTO v_after;
 INSERT INTO public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata)
 VALUES(v_uid,gen_random_uuid(),'data_change','/hotel-work-plan','hotel_work_plan_save_day','Day '||p_day,
 jsonb_build_object('previous_date',v_before.planned_date,'new_date',v_after.planned_date,
 'previous_note',v_before.note,'new_note',v_after.note,'revision',v_after.revision));
 RETURN jsonb_build_object('ok',true,'revision',v_after.revision);
END $function$
;
CREATE OR REPLACE FUNCTION public.hotel_work_plan_save_room(p_seq integer, p_day integer, p_override_date date, p_actual_date date, p_status text, p_note text, p_expected_revision integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid:=auth.uid();v_before public.hotel_work_plan_rooms%ROWTYPE;v_after public.hotel_work_plan_rooms%ROWTYPE;v_name text;
BEGIN
 IF v_uid IS NULL OR NOT EXISTS (
 SELECT 1 FROM public.profiles p WHERE p.user_id=v_uid AND p.active=true
 AND ((p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid AND p.role='manager') OR p.role='defect_editor')
 ) THEN RAISE EXCEPTION 'HOTEL_WORK_PLAN_EDIT_DENIED'; END IF;
 IF p_day NOT BETWEEN 1 AND 9 OR p_status NOT IN ('pending','confirmed','in_progress','completed','postponed')
 OR length(coalesce(p_note,''))>2000 THEN RAISE EXCEPTION 'INVALID_WORK_PLAN'; END IF;
 SELECT * INTO v_before FROM public.hotel_work_plan_rooms WHERE seq_no=p_seq FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'UNKNOWN_WORK_PLAN_SEQ'; END IF;
 IF v_before.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT_RELOAD'; END IF;
 SELECT coalesce(nullif(p.full_name,''),nullif(p.username,''),'ผู้ใช้') INTO v_name FROM public.profiles p WHERE p.user_id=v_uid;
 UPDATE public.hotel_work_plan_rooms SET day_no=p_day,planned_date_override=p_override_date,actual_date=p_actual_date,
 work_status=p_status,note=nullif(btrim(coalesce(p_note,'')),''),revision=revision+1,sync_state='pending',
 updated_by=v_uid,updated_by_name=v_name,updated_at=now()
 WHERE seq_no=p_seq RETURNING * INTO v_after;
 INSERT INTO public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata)
 VALUES(v_uid,gen_random_uuid(),'data_change','/hotel-work-plan','hotel_work_plan_save_room',v_before.room_no,
 jsonb_build_object('seq',p_seq,'previous_day',v_before.day_no,'new_day',p_day,
 'previous_date',v_before.planned_date_override,'new_date',p_override_date,
 'previous_actual',v_before.actual_date,'new_actual',p_actual_date,
 'previous_status',v_before.work_status,'new_status',p_status,
 'previous_note',v_before.note,'new_note',v_after.note,'revision',v_after.revision));
 RETURN jsonb_build_object('ok',true,'revision',v_after.revision);
END $function$
;
ALTER POLICY "active users can view condo room status" ON public."condo_room_status" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true)))));
ALTER POLICY "hotel_availability_read_active" ON public."hotel_room_availability" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true)))));
ALTER POLICY "hotel_group_read_active" ON public."hotel_room_group_members" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true)))));
ALTER POLICY "hotel_work_plan_day_read" ON public."hotel_work_plan_days" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "hotel_work_plan_room_read" ON public."hotel_work_plan_rooms" USING (( SELECT private.is_active_user() AS is_active_user));
ALTER POLICY "hotel_work_plan_sync_status_read" ON public."hotel_work_plan_sync_control" USING (( SELECT private.is_active_user() AS is_active_user));

COMMIT;
