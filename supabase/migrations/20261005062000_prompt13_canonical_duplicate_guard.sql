-- Prompt 13: canonical duplicate candidate/linkage guard.
-- Hotfix preview retry: no runtime logic change.
-- Preview retrigger: no runtime logic change.
-- Generic, exact-normalized candidate detection only. Never fuzzy auto-merge.
-- Raw Site Operations source rows/IDs/fingerprints are preserved.

alter table public.site_operations_entries
  add column if not exists duplicate_candidate_key text;

create index if not exists idx_site_operations_duplicate_candidate_key
  on public.site_operations_entries(duplicate_candidate_key)
  where duplicate_candidate_key is not null;

create table if not exists public.site_operations_duplicate_groups (
  id uuid primary key default gen_random_uuid(),
  candidate_key text not null unique,
  state text not null default 'suspected'
    check (state in ('suspected','confirmed_duplicate','confirmed_distinct','retired')),
  canonical_entry_id uuid null
    references public.site_operations_entries(id) on delete set null,
  canonical_source_ref text null,
  decision_evidence text null,
  decision_members_fingerprint text null,
  decided_by uuid null,
  decided_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    state <> 'confirmed_duplicate'
    or (canonical_entry_id is not null and nullif(btrim(coalesce(decision_evidence,'')),'') is not null)
  ),
  check (
    state <> 'confirmed_distinct'
    or nullif(btrim(coalesce(decision_evidence,'')),'') is not null
  )
);

create table if not exists public.site_operations_duplicate_members (
  group_id uuid not null
    references public.site_operations_duplicate_groups(id) on delete cascade,
  entry_id uuid not null
    references public.site_operations_entries(id) on delete cascade,
  source_ref text not null,
  source_fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(group_id,entry_id),
  unique(entry_id)
);

create index if not exists idx_site_operations_duplicate_members_group
  on public.site_operations_duplicate_members(group_id,entry_id);

alter table public.site_operations_duplicate_groups enable row level security;
alter table public.site_operations_duplicate_members enable row level security;

drop policy if exists "active users read duplicate groups"
  on public.site_operations_duplicate_groups;
create policy "active users read duplicate groups"
  on public.site_operations_duplicate_groups
  for select to authenticated
  using ((select private.is_active_user()));

drop policy if exists "active users read duplicate members"
  on public.site_operations_duplicate_members;
create policy "active users read duplicate members"
  on public.site_operations_duplicate_members
  for select to authenticated
  using ((select private.is_active_user()));

revoke all on public.site_operations_duplicate_groups from anon;
revoke all on public.site_operations_duplicate_members from anon;
revoke all on public.site_operations_duplicate_groups from authenticated;
revoke all on public.site_operations_duplicate_members from authenticated;
grant select on public.site_operations_duplicate_groups to authenticated;
grant select on public.site_operations_duplicate_members to authenticated;
grant all on public.site_operations_duplicate_groups to service_role;
grant all on public.site_operations_duplicate_members to service_role;

create or replace function private.site_operations_normalize_duplicate_text(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select btrim(regexp_replace(lower(coalesce(p_value,'')),'[[:space:][:punct:]]+',' ','g'))
$$;

create or replace function private.site_operations_duplicate_candidate_key(
  p_work_date date,
  p_supervisor_worker_id text,
  p_supervisor_raw text,
  p_project_name_raw text,
  p_area_raw text,
  p_specific_area text,
  p_work_detail text,
  p_afternoon_detail text
)
returns text
language plpgsql
immutable
set search_path = pg_catalog, private
as $$
declare
  v_identity text := coalesce(
    nullif(lower(btrim(coalesce(p_supervisor_worker_id,''))),''),
    nullif(private.site_operations_normalize_duplicate_text(p_supervisor_raw),'')
  );
  v_project text := private.site_operations_normalize_duplicate_text(p_project_name_raw);
  v_area text := private.site_operations_normalize_duplicate_text(p_area_raw);
  v_specific text := private.site_operations_normalize_duplicate_text(p_specific_area);
  v_work text := private.site_operations_normalize_duplicate_text(p_work_detail);
  v_afternoon text := private.site_operations_normalize_duplicate_text(p_afternoon_detail);
begin
  if p_work_date is null or v_identity is null or v_project='' or v_work='' then
    return null;
  end if;

  return md5(concat_ws('|',
    p_work_date::text,
    v_identity,
    v_project,
    v_area,
    v_specific,
    v_work,
    v_afternoon
  ));
end;
$$;

create or replace function private.site_operations_duplicate_group_fingerprint(p_group_id uuid)
returns text
language sql
stable
set search_path = pg_catalog, public
as $$
  select md5(coalesce(string_agg(
    m.source_ref || '|' || coalesce(m.source_fingerprint,''),
    '||' order by m.source_ref
  ),''))
  from public.site_operations_duplicate_members m
  where m.group_id=p_group_id
$$;

create or replace function private.site_operations_entry_flow_state(p_entry_id uuid)
returns text
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce((
    select case
      when g.state in ('retired','confirmed_distinct') then 'active'
      when g.state='suspected' then 'suspected'
      when g.state='confirmed_duplicate' and g.canonical_entry_id=m.entry_id then 'active'
      when g.state='confirmed_duplicate' then 'suppressed'
      else 'active'
    end
    from public.site_operations_duplicate_members m
    join public.site_operations_duplicate_groups g on g.id=m.group_id
    where m.entry_id=p_entry_id
    limit 1
  ),'active')
$$;

create or replace function private.site_operations_quarantine_duplicate_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.labour_verification_batches b
  set verification_status='needs_review',
      updated_at=now()
  where b.verification_status='verified'
    and b.site_operations_entry_id in (
      select m.entry_id
      from public.site_operations_duplicate_members m
      where m.group_id=p_group_id
    );

  update public.payroll_verification_records r
  set status='needs_review',
      updated_at=now()
  where r.status in ('timecard_checked','verified','external_verified')
    and r.labour_batch_id in (
      select b.id
      from public.labour_verification_batches b
      join public.site_operations_duplicate_members m
        on m.entry_id=b.site_operations_entry_id
      where m.group_id=p_group_id
    );
end;
$$;

revoke all on function private.site_operations_quarantine_duplicate_group(uuid)
  from public,anon,authenticated;

create or replace function private.site_operations_refresh_duplicate_group(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_key text;
  v_group_id uuid;
  v_count integer;
  v_state text;
  v_decision_fp text;
  v_current_fp text;
begin
  select e.duplicate_candidate_key
    into v_key
  from public.site_operations_entries e
  where e.id=p_entry_id;

  if not found then
    return;
  end if;

  delete from public.site_operations_duplicate_members m
  using public.site_operations_duplicate_groups g
  where m.group_id=g.id
    and m.entry_id=p_entry_id
    and g.candidate_key is distinct from v_key;

  update public.site_operations_duplicate_groups g
  set state='retired',
      canonical_entry_id=null,
      canonical_source_ref=null,
      decision_evidence=null,
      decision_members_fingerprint=null,
      decided_by=null,
      decided_at=null,
      updated_at=now()
  where g.state<>'retired'
    and (select count(*) from public.site_operations_duplicate_members m where m.group_id=g.id)<2;

  if v_key is null then
    return;
  end if;

  select count(*)
    into v_count
  from public.site_operations_entries e
  where e.duplicate_candidate_key=v_key;

  if v_count<2 then
    return;
  end if;

  insert into public.site_operations_duplicate_groups(candidate_key,state,updated_at)
  values(v_key,'suspected',now())
  on conflict(candidate_key) do update
  set state=case
      when public.site_operations_duplicate_groups.state='retired' then 'suspected'
      else public.site_operations_duplicate_groups.state
    end,
    updated_at=now()
  returning id into v_group_id;

  insert into public.site_operations_duplicate_members(
    group_id,entry_id,source_ref,source_fingerprint,updated_at
  )
  select
    v_group_id,
    e.id,
    coalesce(e.source_file_id,'') || '|' || coalesce(e.source_sheet,'') || '|' || e.source_row::text,
    coalesce(e.source_fingerprint,''),
    now()
  from public.site_operations_entries e
  where e.duplicate_candidate_key=v_key
  on conflict(entry_id) do update
  set group_id=excluded.group_id,
      source_ref=excluded.source_ref,
      source_fingerprint=excluded.source_fingerprint,
      updated_at=now();

  delete from public.site_operations_duplicate_members m
  where m.group_id=v_group_id
    and not exists (
      select 1
      from public.site_operations_entries e
      where e.id=m.entry_id
        and e.duplicate_candidate_key=v_key
    );

  select g.state,g.decision_members_fingerprint
    into v_state,v_decision_fp
  from public.site_operations_duplicate_groups g
  where g.id=v_group_id
  for update;

  if v_state='confirmed_duplicate'
     and (select g.canonical_entry_id from public.site_operations_duplicate_groups g where g.id=v_group_id) is null then
    update public.site_operations_duplicate_groups g
    set canonical_entry_id=(
          select m.entry_id
          from public.site_operations_duplicate_members m
          where m.group_id=v_group_id
            and m.source_ref=g.canonical_source_ref
          limit 1
        ),
        updated_at=now()
    where g.id=v_group_id
      and g.canonical_source_ref is not null;
  end if;

  v_current_fp:=private.site_operations_duplicate_group_fingerprint(v_group_id);

  if v_state in ('confirmed_duplicate','confirmed_distinct')
     and v_decision_fp is distinct from v_current_fp then
    update public.site_operations_duplicate_groups
    set state='suspected',
        canonical_entry_id=null,
        canonical_source_ref=null,
        decision_evidence=null,
        decision_members_fingerprint=null,
        decided_by=null,
        decided_at=null,
        updated_at=now()
    where id=v_group_id;

    perform private.site_operations_quarantine_duplicate_group(v_group_id);
  elsif v_state='suspected' then
    perform private.site_operations_quarantine_duplicate_group(v_group_id);
  end if;
end;
$$;

revoke all on function private.site_operations_refresh_duplicate_group(uuid)
  from public,anon,authenticated;

create or replace function private.site_operations_set_duplicate_candidate_key()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  new.duplicate_candidate_key:=private.site_operations_duplicate_candidate_key(
    new.work_date,
    new.supervisor_worker_id,
    new.supervisor_raw,
    new.project_name_raw,
    new.area_raw,
    new.specific_area,
    new.work_detail,
    new.afternoon_detail
  );
  return new;
end;
$$;

revoke all on function private.site_operations_set_duplicate_candidate_key()
  from public,anon,authenticated;

create or replace function private.site_operations_refresh_duplicate_candidate_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.site_operations_refresh_duplicate_group(new.id);
  return new;
end;
$$;

revoke all on function private.site_operations_refresh_duplicate_candidate_trigger()
  from public,anon,authenticated;

drop trigger if exists trg_site_operations_duplicate_candidate_key
  on public.site_operations_entries;
create trigger trg_site_operations_duplicate_candidate_key
before insert or update of
  work_date,supervisor_worker_id,supervisor_raw,project_name_raw,area_raw,
  specific_area,work_detail,afternoon_detail
on public.site_operations_entries
for each row execute function private.site_operations_set_duplicate_candidate_key();

drop trigger if exists trg_site_operations_duplicate_candidate_refresh
  on public.site_operations_entries;
create trigger trg_site_operations_duplicate_candidate_refresh
after insert or update of
  work_date,supervisor_worker_id,supervisor_raw,project_name_raw,area_raw,
  specific_area,work_detail,afternoon_detail,source_fingerprint
on public.site_operations_entries
for each row execute function private.site_operations_refresh_duplicate_candidate_trigger();

update public.site_operations_entries e
set duplicate_candidate_key=private.site_operations_duplicate_candidate_key(
  e.work_date,
  e.supervisor_worker_id,
  e.supervisor_raw,
  e.project_name_raw,
  e.area_raw,
  e.specific_area,
  e.work_detail,
  e.afternoon_detail
)
where e.duplicate_candidate_key is distinct from private.site_operations_duplicate_candidate_key(
  e.work_date,
  e.supervisor_worker_id,
  e.supervisor_raw,
  e.project_name_raw,
  e.area_raw,
  e.specific_area,
  e.work_detail,
  e.afternoon_detail
);

insert into public.site_operations_duplicate_groups(candidate_key,state)
select e.duplicate_candidate_key,'suspected'
from public.site_operations_entries e
where e.duplicate_candidate_key is not null
group by e.duplicate_candidate_key
having count(*)>1
on conflict(candidate_key) do nothing;

insert into public.site_operations_duplicate_members(
  group_id,entry_id,source_ref,source_fingerprint
)
select
  g.id,
  e.id,
  coalesce(e.source_file_id,'') || '|' || coalesce(e.source_sheet,'') || '|' || e.source_row::text,
  coalesce(e.source_fingerprint,'')
from public.site_operations_entries e
join public.site_operations_duplicate_groups g
  on g.candidate_key=e.duplicate_candidate_key
where e.duplicate_candidate_key is not null
  and (
    select count(*)
    from public.site_operations_entries x
    where x.duplicate_candidate_key=e.duplicate_candidate_key
  )>1
on conflict(entry_id) do update
set group_id=excluded.group_id,
    source_ref=excluded.source_ref,
    source_fingerprint=excluded.source_fingerprint,
    updated_at=now();

do $$
declare
  r record;
begin
  for r in
    select g.id
    from public.site_operations_duplicate_groups g
    where g.state='suspected'
  loop
    perform private.site_operations_quarantine_duplicate_group(r.id);
  end loop;
end;
$$;

create or replace function public.site_operations_resolve_duplicate(
  p_group_id uuid,
  p_resolution text,
  p_canonical_entry_id uuid,
  p_evidence text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user uuid := (select auth.uid());
  v_evidence text := nullif(btrim(coalesce(p_evidence,'')),'');
  v_member_count integer;
  v_source_ref text;
  v_fp text;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not private.can_manage_labour_payroll() then
    raise exception 'NOT_AUTHORIZED_FOR_DUPLICATE_REVIEW';
  end if;

  if v_evidence is null then
    raise exception 'DUPLICATE_DECISION_EVIDENCE_REQUIRED';
  end if;

  if p_resolution not in ('confirmed_duplicate','confirmed_distinct') then
    raise exception 'INVALID_DUPLICATE_RESOLUTION';
  end if;

  perform 1
  from public.site_operations_duplicate_groups g
  where g.id=p_group_id
  for update;

  if not found then
    raise exception 'DUPLICATE_GROUP_NOT_FOUND';
  end if;

  select count(*)
    into v_member_count
  from public.site_operations_duplicate_members m
  where m.group_id=p_group_id;

  if v_member_count<2 then
    raise exception 'DUPLICATE_GROUP_REQUIRES_AT_LEAST_TWO_MEMBERS';
  end if;

  if p_resolution='confirmed_duplicate' then
    if p_canonical_entry_id is null then
      raise exception 'CANONICAL_ENTRY_REQUIRED';
    end if;

    select m.source_ref
      into v_source_ref
    from public.site_operations_duplicate_members m
    where m.group_id=p_group_id
      and m.entry_id=p_canonical_entry_id;

    if not found then
      raise exception 'CANONICAL_ENTRY_NOT_IN_GROUP';
    end if;
  else
    if p_canonical_entry_id is not null then
      raise exception 'CANONICAL_ENTRY_NOT_ALLOWED_FOR_DISTINCT';
    end if;
    v_source_ref:=null;
  end if;

  v_fp:=private.site_operations_duplicate_group_fingerprint(p_group_id);

  update public.site_operations_duplicate_groups
  set state=p_resolution,
      canonical_entry_id=case when p_resolution='confirmed_duplicate' then p_canonical_entry_id else null end,
      canonical_source_ref=v_source_ref,
      decision_evidence=v_evidence,
      decision_members_fingerprint=v_fp,
      decided_by=v_user,
      decided_at=now(),
      updated_at=now()
  where id=p_group_id;

  if p_resolution='confirmed_duplicate' then
    update public.labour_verification_batches b
    set verification_status='needs_review',
        updated_at=now()
    where b.verification_status='verified'
      and b.site_operations_entry_id in (
        select m.entry_id
        from public.site_operations_duplicate_members m
        where m.group_id=p_group_id
          and m.entry_id<>p_canonical_entry_id
      );

    update public.payroll_verification_records r
    set status='needs_review',
        updated_at=now()
    where r.status in ('timecard_checked','verified','external_verified')
      and r.labour_batch_id in (
        select b.id
        from public.labour_verification_batches b
        join public.site_operations_duplicate_members m
          on m.entry_id=b.site_operations_entry_id
        where m.group_id=p_group_id
          and m.entry_id<>p_canonical_entry_id
      );
  end if;

  return p_group_id;
end;
$$;

revoke all on function public.site_operations_resolve_duplicate(uuid,text,uuid,text)
  from public,anon;
grant execute on function public.site_operations_resolve_duplicate(uuid,text,uuid,text)
  to authenticated;

create or replace function private.labour_duplicate_source_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_flow text;
begin
  if new.verification_status='verified' then
    v_flow:=private.site_operations_entry_flow_state(new.site_operations_entry_id);
    if v_flow<>'active' then
      raise exception 'DUPLICATE_SOURCE_REVIEW_REQUIRED_%',upper(v_flow);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.labour_duplicate_source_guard()
  from public,anon,authenticated;

drop trigger if exists trg_labour_duplicate_source_guard
  on public.labour_verification_batches;
create trigger trg_labour_duplicate_source_guard
before insert or update of verification_status,site_operations_entry_id
on public.labour_verification_batches
for each row execute function private.labour_duplicate_source_guard();

create or replace function private.payroll_duplicate_source_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_entry_id uuid;
  v_flow text;
begin
  if new.status in ('timecard_checked','verified','external_verified') then
    select b.site_operations_entry_id
      into v_entry_id
    from public.labour_verification_batches b
    where b.id=new.labour_batch_id;

    if v_entry_id is null then
      raise exception 'LABOUR_BATCH_NOT_FOUND';
    end if;

    v_flow:=private.site_operations_entry_flow_state(v_entry_id);
    if v_flow<>'active' then
      raise exception 'DUPLICATE_SOURCE_REVIEW_REQUIRED_%',upper(v_flow);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.payroll_duplicate_source_guard()
  from public,anon,authenticated;

drop trigger if exists trg_payroll_duplicate_source_guard
  on public.payroll_verification_records;
create trigger trg_payroll_duplicate_source_guard
before insert or update of status,labour_batch_id
on public.payroll_verification_records
for each row execute function private.payroll_duplicate_source_guard();

create or replace view public.v_site_operations_canonical_state
with (security_invoker=true)
as
select
  e.id as entry_id,
  e.source_row,
  e.source_timestamp,
  e.work_date,
  e.supervisor_raw,
  e.supervisor_worker_id,
  e.project_name_raw,
  e.area_raw,
  e.specific_area,
  e.work_detail,
  e.afternoon_detail,
  e.source_fingerprint,
  e.duplicate_candidate_key,
  g.id as group_id,
  g.state as group_state,
  g.canonical_entry_id,
  g.decision_evidence,
  g.decided_by,
  g.decided_at,
  case
    when g.id is null or g.state in ('retired','confirmed_distinct') then 'active'
    when g.state='suspected' then 'suspected'
    when g.state='confirmed_duplicate' and g.canonical_entry_id=e.id then 'active'
    when g.state='confirmed_duplicate' then 'suppressed'
    else 'active'
  end as flow_state
from public.site_operations_entries e
left join public.site_operations_duplicate_members m on m.entry_id=e.id
left join public.site_operations_duplicate_groups g on g.id=m.group_id;

revoke all on public.v_site_operations_canonical_state from public,anon;
grant select on public.v_site_operations_canonical_state to authenticated,service_role;
