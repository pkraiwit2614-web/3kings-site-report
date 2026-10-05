-- Prompt 3: source revision invalidation.
-- Baseline: main 80ea814, preserving Prompt 1/2, direct-write/RBAC payroll guards,
-- and Prompt 12 confirmed-headcount reconciliation.
--
-- History is preserved. This migration only changes current verification state
-- to needs_review when its canonical source revision or project links change.

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

create or replace function public.labour_invalidate_source_revision()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- No-op writes must not invalidate an otherwise current verification.
  if old.source_fingerprint is not distinct from new.source_fingerprint
     and old.work_date is not distinct from new.work_date
     and old.project_name_raw is not distinct from new.project_name_raw
     and old.area_raw is not distinct from new.area_raw
     and old.supervisor_raw is not distinct from new.supervisor_raw
     and old.supervisor_worker_id is not distinct from new.supervisor_worker_id
     and old.male_count is not distinct from new.male_count
     and old.female_count is not distinct from new.female_count
     and old.total_manpower is not distinct from new.total_manpower
     and old.work_detail is not distinct from new.work_detail
     and old.afternoon_detail is not distinct from new.afternoon_detail
     and old.specific_area is not distinct from new.specific_area then
    return new;
  end if;

  update public.labour_verification_batches
  set verification_status='needs_review',
      updated_at=now()
  where site_operations_entry_id=new.id
    and verification_status='verified';

  -- Defense-in-depth for any checked/final Payroll record linked to this source.
  -- The existing payroll row guard clears final verifier stamps on needs_review.
  update public.payroll_verification_records r
  set status='needs_review',
      updated_at=now()
  where r.labour_batch_id in (
    select b.id
    from public.labour_verification_batches b
    where b.site_operations_entry_id=new.id
  )
    and r.status in ('timecard_checked','verified','external_verified');

  return new;
end;
$$;

drop trigger if exists trg_site_operations_source_revision_invalidate
on public.site_operations_entries;

create trigger trg_site_operations_source_revision_invalidate
after update of
  source_fingerprint,work_date,project_name_raw,area_raw,supervisor_raw,
  supervisor_worker_id,male_count,female_count,total_manpower,work_detail,
  afternoon_detail,specific_area
on public.site_operations_entries
for each row execute function public.labour_invalidate_source_revision();

create or replace function public.labour_invalidate_project_link_revision()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entry_ids uuid[];
begin
  if tg_op='INSERT' then
    v_entry_ids:=array[new.entry_id];
  elsif tg_op='DELETE' then
    v_entry_ids:=array[old.entry_id];
  else
    if old.entry_id is not distinct from new.entry_id
       and old.project_id is not distinct from new.project_id then
      return new;
    end if;
    v_entry_ids:=array[old.entry_id,new.entry_id];
  end if;

  update public.labour_verification_batches
  set verification_status='needs_review',
      updated_at=now()
  where site_operations_entry_id=any(v_entry_ids)
    and verification_status='verified';

  update public.payroll_verification_records r
  set status='needs_review',
      updated_at=now()
  where r.labour_batch_id in (
    select b.id
    from public.labour_verification_batches b
    where b.site_operations_entry_id=any(v_entry_ids)
  )
    and r.status in ('timecard_checked','verified','external_verified');

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_site_operations_project_revision_invalidate
on public.site_operations_entry_projects;

create trigger trg_site_operations_project_revision_invalidate
after insert or delete or update of entry_id,project_id
on public.site_operations_entry_projects
for each row execute function public.labour_invalidate_project_link_revision();

-- Reconcile any already-current-looking verified batch against the source
-- fingerprint/work date/supervisor after the trigger is installed.
update public.labour_verification_batches b
set verification_status='needs_review',
    updated_at=now()
from public.site_operations_entries e
where e.id=b.site_operations_entry_id
  and b.verification_status='verified'
  and (
    b.verified_source_fingerprint is distinct from e.source_fingerprint
    or b.work_date is distinct from e.work_date
    or b.supervisor_worker_id is distinct from e.supervisor_worker_id
  );
