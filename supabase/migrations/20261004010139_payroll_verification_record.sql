
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role = any (array['manager'::text,'engineer'::text,'foreman'::text,'viewer'::text,'payroll'::text]));

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text;
  v_username text;
begin
  v_role := case
    when coalesce(new.raw_app_meta_data ->> 'provisioned_by_admin','false') = 'true'
      and coalesce(new.raw_app_meta_data ->> 'app_role','') in ('manager','engineer','foreman','viewer','payroll')
      then new.raw_app_meta_data ->> 'app_role'
    else 'foreman'
  end;
  v_username := nullif(upper(coalesce(new.raw_app_meta_data ->> 'username','')), '');

  insert into public.profiles(user_id, username, email, full_name, role, active)
  values (
    new.id,
    v_username,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email,''), '@', 1)),
    v_role,
    true
  )
  on conflict (user_id) do update set
    username = coalesce(excluded.username, public.profiles.username),
    email = coalesce(excluded.email, public.profiles.email),
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    role = excluded.role,
    active = true,
    updated_at = now();
  return new;
end;
$$;

create table if not exists public.payroll_verification_records (
  id uuid primary key default gen_random_uuid(),
  labour_batch_id uuid not null unique references public.labour_verification_batches(id) on delete cascade,
  verification_method text not null default 'web'
    check (verification_method in ('web','legacy_excel')),
  status text not null default 'draft'
    check (status in ('draft','timecard_checked','verified','external_verified','needs_review')),
  source_labour_verified_at timestamptz,
  external_reference text,
  note text,
  timecard_checked_by uuid references auth.users(id) on delete set null,
  timecard_checked_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payroll_verification_items (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.payroll_verification_records(id) on delete cascade,
  labour_assignment_id uuid references public.labour_daily_assignments(id) on delete set null,
  worker_id text not null references public.labour_workers(worker_id) on delete restrict,
  attendance_status text not null default 'present'
    check (attendance_status in ('present','absent','leave','half_day','other')),
  clock_in time,
  clock_out time,
  work_units numeric(4,2) not null default 1
    check (work_units >= 0 and work_units <= 1),
  ot_hours numeric(5,2) not null default 0
    check (ot_hours >= 0 and ot_hours <= 24),
  timecard_match boolean not null default false,
  regular_rate numeric(12,2),
  ot_rate numeric(12,2),
  regular_pay numeric(12,2),
  ot_pay numeric(12,2),
  adjustment numeric(12,2) not null default 0,
  total_pay numeric(12,2),
  calculation_status text not null default 'rate_pending'
    check (calculation_status in ('rate_pending','calculated','manual','excluded')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(record_id, worker_id)
);

create index if not exists idx_payroll_verification_records_status
  on public.payroll_verification_records(status, updated_at desc);
create index if not exists idx_payroll_verification_items_record
  on public.payroll_verification_items(record_id);
create index if not exists idx_payroll_verification_items_worker
  on public.payroll_verification_items(worker_id, updated_at desc);

alter table public.payroll_verification_records enable row level security;
alter table public.payroll_verification_items enable row level security;

grant select, insert, update, delete on public.payroll_verification_records to authenticated;
grant select, insert, update, delete on public.payroll_verification_items to authenticated;

drop policy if exists "payroll roles read payroll records" on public.payroll_verification_records;
create policy "payroll roles read payroll records"
on public.payroll_verification_records for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true
    and p.role in ('manager','engineer','payroll')
));

drop policy if exists "payroll roles insert payroll records" on public.payroll_verification_records;
create policy "payroll roles insert payroll records"
on public.payroll_verification_records for insert to authenticated
with check (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true
    and p.role in ('manager','engineer','payroll')
));

drop policy if exists "payroll roles update payroll records" on public.payroll_verification_records;
create policy "payroll roles update payroll records"
on public.payroll_verification_records for update to authenticated
using (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true
    and p.role in ('manager','engineer','payroll')
))
with check (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true
    and p.role in ('manager','engineer','payroll')
));

drop policy if exists "payroll roles delete payroll records" on public.payroll_verification_records;
create policy "payroll roles delete payroll records"
on public.payroll_verification_records for delete to authenticated
using (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true
    and p.role in ('manager','engineer','payroll')
));

drop policy if exists "payroll roles read payroll items" on public.payroll_verification_items;
create policy "payroll roles read payroll items"
on public.payroll_verification_items for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true
    and p.role in ('manager','engineer','payroll')
));

drop policy if exists "payroll roles insert payroll items" on public.payroll_verification_items;
create policy "payroll roles insert payroll items"
on public.payroll_verification_items for insert to authenticated
with check (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true
    and p.role in ('manager','engineer','payroll')
));

drop policy if exists "payroll roles update payroll items" on public.payroll_verification_items;
create policy "payroll roles update payroll items"
on public.payroll_verification_items for update to authenticated
using (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true
    and p.role in ('manager','engineer','payroll')
))
with check (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true
    and p.role in ('manager','engineer','payroll')
));

drop policy if exists "payroll roles delete payroll items" on public.payroll_verification_items;
create policy "payroll roles delete payroll items"
on public.payroll_verification_items for delete to authenticated
using (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true
    and p.role in ('manager','engineer','payroll')
));

drop policy if exists "payroll roles insert labour batches" on public.labour_verification_batches;
create policy "payroll roles insert labour batches"
on public.labour_verification_batches for insert to authenticated
with check (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true
    and p.role in ('manager','engineer','payroll')
));
drop policy if exists "payroll roles update labour batches" on public.labour_verification_batches;
create policy "payroll roles update labour batches"
on public.labour_verification_batches for update to authenticated
using (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true
    and p.role in ('manager','engineer','payroll')
))
with check (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true
    and p.role in ('manager','engineer','payroll')
));
drop policy if exists "payroll roles delete labour batches" on public.labour_verification_batches;
create policy "payroll roles delete labour batches"
on public.labour_verification_batches for delete to authenticated
using (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true
    and p.role in ('manager','engineer','payroll')
));

drop policy if exists "payroll roles insert labour assignments" on public.labour_daily_assignments;
create policy "payroll roles insert labour assignments"
on public.labour_daily_assignments for insert to authenticated
with check (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true
    and p.role in ('manager','engineer','payroll')
));
drop policy if exists "payroll roles update labour assignments" on public.labour_daily_assignments;
create policy "payroll roles update labour assignments"
on public.labour_daily_assignments for update to authenticated
using (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true
    and p.role in ('manager','engineer','payroll')
))
with check (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true
    and p.role in ('manager','engineer','payroll')
));
drop policy if exists "payroll roles delete labour assignments" on public.labour_daily_assignments;
create policy "payroll roles delete labour assignments"
on public.labour_daily_assignments for delete to authenticated
using (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true
    and p.role in ('manager','engineer','payroll')
));

drop policy if exists "payroll roles insert labour name map" on public.labour_name_map;
create policy "payroll roles insert labour name map"
on public.labour_name_map for insert to authenticated
with check (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true
    and p.role in ('manager','engineer','payroll')
));
drop policy if exists "payroll roles update labour name map" on public.labour_name_map;
create policy "payroll roles update labour name map"
on public.labour_name_map for update to authenticated
using (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true
    and p.role in ('manager','engineer','payroll')
))
with check (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true
    and p.role in ('manager','engineer','payroll')
));

drop policy if exists "payroll roles update site operation supervisor" on public.site_operations_entries;
create policy "payroll roles update site operation supervisor"
on public.site_operations_entries for update to authenticated
using (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true
    and p.role in ('manager','engineer','payroll')
))
with check (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.active=true
    and p.role in ('manager','engineer','payroll')
));

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

  if v_supervisor_worker_id is not null and exists (
    select 1
    from jsonb_to_recordset(p_assignments) as x(
      worker_id text, project_id uuid, working_team text, movement_status text,
      allocation_hours numeric, allocation_share numeric, notes text
    )
    where x.worker_id=v_supervisor_worker_id
  ) then
    raise exception 'SUPERVISOR_MUST_BE_SEPARATE_FROM_WORKERS';
  end if;

  select count(distinct x.worker_id)
  into v_distinct_workers
  from jsonb_to_recordset(p_assignments) as x(
    worker_id text, project_id uuid, working_team text, movement_status text,
    allocation_hours numeric, allocation_share numeric, notes text
  );

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
  join public.site_operations_entries e on e.id=v_entry_id;

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
  where labour_batch_id=p_batch_id
    and source_labour_verified_at is distinct from now();

  return v_distinct_workers;
end;
$$;

revoke all on function public.labour_verify_batch(uuid,text,jsonb) from public,anon;
grant execute on function public.labour_verify_batch(uuid,text,jsonb) to authenticated;

create or replace function public.labour_confirm_supervisor_mapping(
  p_batch_id uuid,
  p_worker_id text
)
returns text
language plpgsql
security invoker
set search_path=public
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
    where p.user_id=v_user and p.active=true and p.role in ('manager','engineer','payroll')
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
$$;

revoke all on function public.labour_confirm_supervisor_mapping(uuid,text) from public,anon;
grant execute on function public.labour_confirm_supervisor_mapping(uuid,text) to authenticated;

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
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.user_id=v_user and p.active=true and p.role in ('manager','engineer','payroll')
  ) then
    raise exception 'NOT_AUTHORIZED_FOR_PAYROLL_VERIFICATION';
  end if;

  if p_method not in ('web','legacy_excel') then raise exception 'INVALID_VERIFICATION_METHOD'; end if;
  if p_status not in ('draft','timecard_checked','verified','external_verified','needs_review') then raise exception 'INVALID_PAYROLL_STATUS'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'ITEMS_MUST_BE_ARRAY'; end if;

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
      greatest(0::numeric,least(1::numeric,coalesce(x.work_units,1))),
      greatest(0::numeric,least(24::numeric,coalesce(x.ot_hours,0))),
      coalesce(x.timecard_match,false),
      x.regular_rate,x.ot_rate,x.regular_pay,x.ot_pay,coalesce(x.adjustment,0),x.total_pay,
      case when x.calculation_status in ('rate_pending','calculated','manual','excluded') then x.calculation_status else 'rate_pending' end,
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

revoke all on function public.payroll_save_verification(uuid,text,text,text,text,jsonb) from public,anon;
grant execute on function public.payroll_save_verification(uuid,text,text,text,text,jsonb) to authenticated;
