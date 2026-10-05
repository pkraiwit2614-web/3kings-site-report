-- Prompt 5: explicit manpower/payroll classification.
-- Extends Prompt 12 confirmed-headcount authority without mutating raw Daily Report evidence.
-- Preserves Prompt 1/2/3/4/12/16/17 guards and both Prompt 4 optimistic-concurrency RPC overloads.

alter table public.labour_workers
  add column if not exists worker_class text not null default 'company'
    check (worker_class in ('company','contractor','non_person')),
  add column if not exists payroll_eligible boolean not null default true,
  add column if not exists payroll_eligibility_source text not null default 'worker_master_default',
  add column if not exists payroll_eligibility_evidence text;

comment on column public.labour_workers.worker_class is
  'Person/entity classification for payroll authority. Supervisor is a role, not a worker class.';
comment on column public.labour_workers.payroll_eligible is
  'Whether this worker can appear in Worker Payroll. A supervisor may be true or false; never exclude solely by supervisor role.';
comment on column public.labour_workers.payroll_eligibility_source is
  'Structured source/rule that determined Worker Payroll eligibility.';

-- Prompt 1: these four team leaders remain separate from Worker Payroll.
update public.labour_workers
set worker_class='company',
    payroll_eligible=false,
    payroll_eligibility_source='prompt01_team_leader_separate_pay',
    payroll_eligibility_evidence='Team leader remains in team/supervisor identity; leader pay is handled separately from Worker Payroll.'
where worker_id in ('W001','W002','W004','W005');

-- DC-supplied workers are contractor people, not Worker Payroll.
-- W012 (ลุงทอง) is explicitly distinct from the DC-supplied workers.
update public.labour_workers
set worker_class='contractor',
    payroll_eligible=false,
    payroll_eligibility_source='labour_master_dc_contractor',
    payroll_eligibility_evidence='Labour master trade_skill is งานทั่วไป / DC; DC-supplied worker is excluded from Worker Payroll.'
where worker_id in ('W031','W032','W064','W067','W094');

update public.labour_workers
set worker_class='company',
    payroll_eligible=true,
    payroll_eligibility_source='labour_master_distinct_supervisor',
    payroll_eligibility_evidence='ลุงทอง is a distinct worker/supervisor identity; not the DC contractor entity.'
where worker_id='W012';

create or replace function public.labour_worker_classification_guard()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  v_name_norm text;
begin
  v_name_norm:=lower(regexp_replace(
    coalesce(nullif(new.nickname,''),nullif(new.display_label,''),new.full_name,''),
    '[[:space:]().,_/\\-]+','','g'
  ));

  if new.worker_id in ('W001','W002','W004','W005') then
    new.worker_class:='company';
    new.payroll_eligible:=false;
    new.payroll_eligibility_source:='prompt01_team_leader_separate_pay';
    new.payroll_eligibility_evidence:='Team leader remains in team/supervisor identity; leader pay is handled separately from Worker Payroll.';
  elsif new.worker_id<>'W012' and lower(coalesce(new.trade_skill,'')) like '%/ dc%' then
    new.worker_class:='contractor';
    new.payroll_eligible:=false;
    new.payroll_eligibility_source:='labour_master_dc_contractor';
    new.payroll_eligibility_evidence:='Labour master trade_skill is งานทั่วไป / DC; DC-supplied worker is excluded from Worker Payroll.';
  elsif exists (
    select 1
    from public.labour_name_map m
    where m.source_name_norm=v_name_norm
      and (m.map_type in ('NON_PERSON_CONTRACTOR','NON_PERSON_GROUP') or m.status='NON-PERSON')
  ) then
    new.worker_class:='non_person';
    new.payroll_eligible:=false;
    new.payroll_eligibility_source:='labour_name_map_non_person';
    new.payroll_eligibility_evidence:='Source identity is classified as contractor/group/non-person and cannot enter Worker Payroll.';
  elsif new.worker_id='W012' then
    new.worker_class:='company';
    new.payroll_eligible:=true;
    new.payroll_eligibility_source:='labour_master_distinct_supervisor';
    new.payroll_eligibility_evidence:='ลุงทอง is a distinct worker/supervisor identity; not the DC contractor entity.';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_labour_worker_classification_guard on public.labour_workers;
create trigger trg_labour_worker_classification_guard
before insert or update of worker_id,full_name,nickname,trade_skill,display_label
on public.labour_workers
for each row execute function public.labour_worker_classification_guard();

create or replace function public.labour_is_company_payroll_worker(p_worker_id text)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select coalesce((
    select w.worker_class='company' and w.payroll_eligible
    from public.labour_workers w
    where w.worker_id=p_worker_id
  ),false);
$function$;

alter table public.labour_verification_batches
  add column if not exists contractor_person_count integer
    check (contractor_person_count is null or contractor_person_count>=0),
  add column if not exists contractor_count_basis text
    check (contractor_count_basis is null or contractor_count_basis in (
      'daily_report','monthly_report','contractor_roster','manual_review'
    )),
  add column if not exists contractor_count_evidence text,
  add column if not exists contractor_count_confirmed_by uuid references auth.users(id) on delete set null,
  add column if not exists contractor_count_confirmed_at timestamptz;

comment on column public.labour_verification_batches.contractor_person_count is
  'Confirmed contractor/non-payroll PERSON count only. Excludes supervisor-role overlap and non-person/group labels. NULL means unresolved; never derive as raw_total-confirmed_headcount.';
comment on column public.labour_verification_batches.contractor_count_evidence is
  'Structured source evidence for contractor_person_count; separate from general batch note.';

create or replace function public.labour_contractor_count_guard()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if new.contractor_person_count is null then
    new.contractor_count_basis:=null;
    new.contractor_count_evidence:=null;
    new.contractor_count_confirmed_by:=null;
    new.contractor_count_confirmed_at:=null;
  elsif new.contractor_count_basis is null
     or nullif(btrim(coalesce(new.contractor_count_evidence,'')),'') is null
     or new.contractor_count_confirmed_by is null
     or new.contractor_count_confirmed_at is null then
    raise exception 'CONTRACTOR_COUNT_AUDIT_REQUIRED';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_labour_contractor_count_guard on public.labour_verification_batches;
create trigger trg_labour_contractor_count_guard
before insert or update of contractor_person_count,contractor_count_basis,contractor_count_evidence,
  contractor_count_confirmed_by,contractor_count_confirmed_at
on public.labour_verification_batches
for each row execute function public.labour_contractor_count_guard();

create or replace function public.labour_confirm_contractor_count(
  p_batch_id uuid,
  p_count integer,
  p_basis text,
  p_evidence text,
  p_expected_source_fingerprint text,
  p_expected_batch_revision bigint
)
returns integer
language plpgsql
security invoker
set search_path = public
as $function$
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
$function$;

revoke all on function public.labour_confirm_contractor_count(uuid,integer,text,text,text,bigint) from public,anon;
grant execute on function public.labour_confirm_contractor_count(uuid,integer,text,text,text,bigint) to authenticated;

CREATE OR REPLACE FUNCTION public.labour_payroll_assert_batch(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  b public.labour_verification_batches%rowtype;
  e public.site_operations_entries%rowtype;
  r public.payroll_verification_records%rowtype;
  n integer;
begin
  select * into b from public.labour_verification_batches where id=p_id for update;
  if not found then return; end if;

  select * into e from public.site_operations_entries where id=b.site_operations_entry_id;
  if not found then raise exception 'LABOUR_SOURCE_NOT_VISIBLE'; end if;

  if exists (
    select 1
    from public.labour_name_map m
    where m.source_name_norm=lower(regexp_replace(e.supervisor_raw,'[[:space:]().,_/\\\\-]+','','g'))
      and (m.map_type in ('NON_PERSON_CONTRACTOR','NON_PERSON_GROUP') or m.status='NON-PERSON')
  ) then
    raise exception 'CONTRACTOR_EXCLUDED_FROM_LABOUR';
  end if;

  if b.verification_status='verified'
     and b.work_date is distinct from e.work_date then
    raise exception 'LABOUR_SOURCE_FIELDS_MISMATCH';
  end if;

  if b.expected_headcount is distinct from b.confirmed_headcount then
    raise exception 'LABOUR_CONFIRMED_HEADCOUNT_MISMATCH';
  end if;

  if b.verification_status='verified' then
    if b.headcount_confirmation_status<>'confirmed'
       or b.confirmed_headcount is null
       or b.headcount_confirmed_by is null
       or b.headcount_confirmed_at is null then
      raise exception 'HEADCOUNT_CONFIRMATION_REQUIRED';
    end if;

    if coalesce(to_jsonb(e)->>'work_date_validation_status','valid')<>'valid'
       or e.work_date>(current_timestamp at time zone 'Asia/Bangkok')::date then
      raise exception 'WORK_DATE_REVIEW_REQUIRED';
    end if;

    if b.supervisor_worker_id is distinct from e.supervisor_worker_id then
      raise exception 'LABOUR_SUPERVISOR_MISMATCH';
    end if;

    if b.verified_by is null or b.verified_at is null
       or b.verified_source_fingerprint is distinct from e.source_fingerprint then
      raise exception 'LABOUR_VERIFICATION_SOURCE_REQUIRED';
    end if;

    select count(distinct worker_id)
      into n
    from public.labour_daily_assignments
    where batch_id=b.id;

    if n<>b.confirmed_headcount then
      raise exception 'HEADCOUNT_MISMATCH_CONFIRMED_%_GOT_%',b.confirmed_headcount,n;
    end if;

    if exists (
      select 1
      from public.labour_daily_assignments a
      where a.batch_id=b.id
        and (not public.labour_is_company_payroll_worker(a.worker_id) or a.work_date<>b.work_date
          or a.verified_by is null or a.verified_at is null)
    ) then
      raise exception 'INVALID_VERIFIED_LABOUR_ASSIGNMENT';
    end if;
  end if;

  select * into r from public.payroll_verification_records where labour_batch_id=b.id;
  if not found then return; end if;

  if r.status in ('timecard_checked','verified','external_verified')
     and (b.headcount_confirmation_status<>'confirmed' or b.confirmed_headcount is null) then
    raise exception 'HEADCOUNT_CONFIRMATION_REQUIRED_FOR_PAYROLL';
  end if;

  if r.status in ('timecard_checked','verified','external_verified')
     and b.confirmed_headcount_basis='contractor_only' then
    raise exception 'CONTRACTOR_ONLY_BATCH_EXCLUDED_FROM_WORKER_PAYROLL';
  end if;

  if r.verification_method='legacy_excel' then
    if r.status not in ('external_verified','needs_review') or nullif(btrim(r.external_reference),'') is null then
      raise exception 'EXTERNAL_REFERENCE_AND_STATUS_REQUIRED';
    end if;
  elsif r.status='external_verified' then
    raise exception 'WEB_METHOD_CANNOT_USE_EXTERNAL_VERIFIED';
  end if;

  if r.status in ('verified','external_verified') and (r.verified_by is null or r.verified_at is null) then
    raise exception 'PAYROLL_VERIFIER_REQUIRED';
  end if;

  if r.verification_method='web' and r.status in ('timecard_checked','verified') then
    if b.verification_status<>'verified' or r.source_labour_verified_at is distinct from b.verified_at then
      raise exception 'LABOUR_TEAM_MUST_BE_VERIFIED_FIRST';
    end if;

    if r.timecard_checked_by is null or r.timecard_checked_at is null then
      raise exception 'TIMECARD_CHECKER_REQUIRED';
    end if;

    select count(*)
      into n
    from public.labour_daily_assignments
    where batch_id=b.id;

    if (select count(*) from public.payroll_verification_items where record_id=r.id)<>n then
      raise exception 'PAYROLL_ITEM_COUNT_MISMATCH';
    end if;

    if exists (
      select 1
      from public.payroll_verification_items i
      left join public.labour_daily_assignments a
        on a.id=i.labour_assignment_id
       and a.batch_id=b.id
       and a.worker_id=i.worker_id
      where i.record_id=r.id
        and (a.id is null or not public.labour_is_company_payroll_worker(i.worker_id))
    ) then
      raise exception 'PAYROLL_ITEM_NOT_IN_VERIFIED_TEAM';
    end if;

    if exists (
      select 1
      from public.payroll_verification_items
      where record_id=r.id and not timecard_match
    ) then
      raise exception 'ALL_TIMECARDS_MUST_BE_MATCHED';
    end if;

    if r.status='verified' and exists (
      select 1
      from public.payroll_verification_items
      where record_id=r.id
        and (calculation_status not in ('calculated','manual','excluded')
          or (calculation_status<>'excluded' and total_pay is null))
    ) then
      raise exception 'PAYROLL_TOTALS_REQUIRED_FOR_VERIFIED';
    end if;
  end if;
end;
$function$;

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
$function$;

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
$function$;

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
       or not public.labour_is_company_payroll_worker(x.worker_id)
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
       or not public.labour_is_company_payroll_worker(x.worker_id)
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
$function$;

-- Keep non-person source identities blocked from Worker Payroll even if a future import creates a worker row.
update public.labour_workers w
set worker_class='non_person',
    payroll_eligible=false,
    payroll_eligibility_source='labour_name_map_non_person',
    payroll_eligibility_evidence='Source identity is classified as contractor/group/non-person and cannot enter Worker Payroll.'
from public.labour_name_map m
where m.source_name_norm=lower(regexp_replace(
    coalesce(nullif(w.nickname,''),nullif(w.display_label,''),w.full_name,''),
    '[[:space:]().,_/\\-]+','','g'
  ))
  and (m.map_type in ('NON_PERSON_CONTRACTOR','NON_PERSON_GROUP') or m.status='NON-PERSON');

-- Preserve access model: no new direct table-write grants/policies are introduced.
revoke all on function public.labour_is_company_payroll_worker(text) from public,anon;
grant execute on function public.labour_is_company_payroll_worker(text) to authenticated;
