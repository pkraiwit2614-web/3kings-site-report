-- Prompt 12: confirmed headcount authority without mutating raw Daily Report evidence.
-- Scope is intentionally limited to Site Operations/Labour headcount reconciliation.
-- No RLS/Auth/RBAC, Work Date, pagination or realtime changes.

alter table public.labour_verification_batches
  add column if not exists headcount_source_status text not null default 'unknown'
    check (headcount_source_status in ('matched','mismatch','unknown')),
  add column if not exists headcount_confirmation_status text not null default 'unconfirmed'
    check (headcount_confirmation_status in ('unconfirmed','confirmed')),
  add column if not exists headcount_discrepancy jsonb not null default '{}'::jsonb,
  add column if not exists confirmed_headcount integer
    check (confirmed_headcount is null or confirmed_headcount >= 0),
  add column if not exists confirmed_headcount_basis text
    check (confirmed_headcount_basis is null or confirmed_headcount_basis in (
      'source_total','male_female','daily_report','monthly_report',
      'company_roster','legacy_verified_roster','contractor_only','manual_review'
    )),
  add column if not exists confirmed_headcount_evidence text,
  add column if not exists headcount_confirmed_by uuid references auth.users(id) on delete set null,
  add column if not exists headcount_confirmed_at timestamptz;

comment on column public.labour_verification_batches.expected_headcount is
  'Backward-compatible downstream headcount. Must equal confirmed_headcount; NULL while headcount is unconfirmed.';
comment on column public.labour_verification_batches.confirmed_headcount is
  'Human-confirmed company/Worker Payroll headcount. Raw source counts remain on site_operations_entries.';
comment on column public.labour_verification_batches.headcount_discrepancy is
  'Structured snapshot of raw total vs male/female evidence. Never overwrites source data.';

create or replace function public.labour_headcount_source_status(
  p_total integer,
  p_male integer,
  p_female integer
)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case
    when p_total is null or p_male is null or p_female is null then 'unknown'
    when p_male + p_female = p_total then 'matched'
    else 'mismatch'
  end;
$$;

create or replace function public.labour_headcount_discrepancy(
  p_total integer,
  p_male integer,
  p_female integer
)
returns jsonb
language sql
immutable
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'raw_total', p_total,
    'male_count', p_male,
    'female_count', p_female,
    'male_female_sum', case when p_male is null or p_female is null then null else p_male + p_female end,
    'issues', case
      when p_total is null or p_male is null or p_female is null
        then jsonb_build_array('SOURCE_COMPONENT_UNKNOWN')
      when p_male + p_female <> p_total
        then jsonb_build_array('RAW_TOTAL_VS_MALE_FEMALE')
      else '[]'::jsonb
    end
  );
$$;

-- Replace the downstream assertion before backfill so expected_headcount is no
-- longer required to mirror raw total_manpower.
create or replace function public.labour_payroll_assert_batch(p_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
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

  if b.work_date is distinct from e.work_date then
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
    where batch_id=b.id
      and (b.supervisor_worker_id is null or worker_id<>b.supervisor_worker_id);

    if n<>b.confirmed_headcount then
      raise exception 'HEADCOUNT_MISMATCH_CONFIRMED_%_GOT_%',b.confirmed_headcount,n;
    end if;

    if exists (
      select 1
      from public.labour_daily_assignments a
      where a.batch_id=b.id
        and (a.worker_id=b.supervisor_worker_id or a.work_date<>b.work_date
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
    where batch_id=b.id
      and (b.supervisor_worker_id is null or worker_id<>b.supervisor_worker_id);

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
        and (a.id is null or i.worker_id=b.supervisor_worker_id)
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
$$;

-- Existing human-verified rosters are legitimate confirmation evidence.
-- Everything else becomes unconfirmed; no raw count is promoted automatically.
with roster as (
  select
    b.id,
    count(distinct a.worker_id) filter (
      where b.supervisor_worker_id is null or a.worker_id<>b.supervisor_worker_id
    )::integer as roster_count
  from public.labour_verification_batches b
  left join public.labour_daily_assignments a on a.batch_id=b.id
  group by b.id
)
update public.labour_verification_batches b
set
  headcount_source_status=public.labour_headcount_source_status(e.total_manpower,e.male_count,e.female_count),
  headcount_discrepancy=public.labour_headcount_discrepancy(e.total_manpower,e.male_count,e.female_count),
  confirmed_headcount=case when b.verification_status='verified' then r.roster_count else null end,
  expected_headcount=case when b.verification_status='verified' then r.roster_count else null end,
  confirmed_headcount_basis=case when b.verification_status='verified' then 'legacy_verified_roster' else null end,
  confirmed_headcount_evidence=case
    when b.verification_status='verified' then coalesce(
      nullif(btrim(b.note),''),
      'Backfilled from the existing human-verified roster; raw source counts were not changed.'
    )
    else null
  end,
  headcount_confirmed_by=case when b.verification_status='verified' then b.verified_by else null end,
  headcount_confirmed_at=case when b.verification_status='verified' then b.verified_at else null end,
  headcount_confirmation_status=case when b.verification_status='verified' then 'confirmed' else 'unconfirmed' end,
  updated_at=now()
from public.site_operations_entries e, roster r
where e.id=b.site_operations_entry_id
  and r.id=b.id;

create or replace function public.labour_headcount_batch_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_total integer;
  v_male integer;
  v_female integer;
begin
  select e.total_manpower,e.male_count,e.female_count
    into v_total,v_male,v_female
  from public.site_operations_entries e
  where e.id=new.site_operations_entry_id;

  if not found then raise exception 'SITE_OPERATIONS_ENTRY_NOT_FOUND'; end if;

  new.headcount_source_status:=public.labour_headcount_source_status(v_total,v_male,v_female);
  new.headcount_discrepancy:=public.labour_headcount_discrepancy(v_total,v_male,v_female);

  if new.confirmed_headcount is null then
    new.expected_headcount:=null;
    new.headcount_confirmation_status:='unconfirmed';
    new.confirmed_headcount_basis:=null;
    new.confirmed_headcount_evidence:=null;
    new.headcount_confirmed_by:=null;
    new.headcount_confirmed_at:=null;
  else
    if new.confirmed_headcount_basis is null
       or new.headcount_confirmed_by is null
       or new.headcount_confirmed_at is null then
      raise exception 'CONFIRMED_HEADCOUNT_AUDIT_REQUIRED';
    end if;
    new.expected_headcount:=new.confirmed_headcount;
    new.headcount_confirmation_status:='confirmed';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_labour_headcount_batch_guard on public.labour_verification_batches;
create trigger trg_labour_headcount_batch_guard
before insert or update of
  site_operations_entry_id,expected_headcount,confirmed_headcount,
  confirmed_headcount_basis,confirmed_headcount_evidence,
  headcount_confirmed_by,headcount_confirmed_at
on public.labour_verification_batches
for each row execute function public.labour_headcount_batch_guard();

create or replace function public.labour_headcount_source_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.total_manpower is not distinct from new.total_manpower
     and old.male_count is not distinct from new.male_count
     and old.female_count is not distinct from new.female_count then
    return new;
  end if;

  update public.labour_verification_batches
  set
    headcount_source_status=public.labour_headcount_source_status(new.total_manpower,new.male_count,new.female_count),
    headcount_discrepancy=public.labour_headcount_discrepancy(new.total_manpower,new.male_count,new.female_count),
    confirmed_headcount=null,
    expected_headcount=null,
    confirmed_headcount_basis=null,
    confirmed_headcount_evidence=null,
    headcount_confirmed_by=null,
    headcount_confirmed_at=null,
    headcount_confirmation_status='unconfirmed',
    verification_status=case when verification_status='verified' then 'needs_review' else verification_status end,
    updated_at=now()
  where site_operations_entry_id=new.id;

  return new;
end;
$$;

drop trigger if exists trg_site_operations_headcount_source_change on public.site_operations_entries;
create trigger trg_site_operations_headcount_source_change
after update of total_manpower,male_count,female_count
on public.site_operations_entries
for each row execute function public.labour_headcount_source_change();

create or replace function public.labour_confirm_headcount(
  p_batch_id uuid,
  p_confirmed_headcount integer,
  p_basis text,
  p_evidence_note text
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
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
    where p.user_id=v_user and p.active=true and p.role in ('manager','engineer','payroll')
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
$$;

create or replace function public.labour_verify_batch(
  p_batch_id uuid,
  p_note text,
  p_assignments jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
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
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  if not exists (
    select 1 from public.profiles p
    where p.user_id=v_user and p.active=true and p.role in ('manager','engineer','payroll')
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

revoke all on function public.labour_confirm_headcount(uuid,integer,text,text) from public,anon;
grant execute on function public.labour_confirm_headcount(uuid,integer,text,text) to authenticated;

revoke all on function public.labour_verify_batch(uuid,text,jsonb) from public,anon;
grant execute on function public.labour_verify_batch(uuid,text,jsonb) to authenticated;
