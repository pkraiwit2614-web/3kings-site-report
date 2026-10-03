create table if not exists public.site_operations_entries (
  id uuid primary key default gen_random_uuid(),
  source_file_id text not null,
  source_sheet text not null,
  source_row integer not null check (source_row > 0),
  source_timestamp timestamptz,
  work_date date not null,
  project_name_raw text,
  area_raw text,
  supervisor_raw text,
  male_count integer check (male_count is null or male_count >= 0),
  female_count integer check (female_count is null or female_count >= 0),
  total_manpower integer check (total_manpower is null or total_manpower >= 0),
  work_detail text,
  status_text text,
  next_plan text,
  afternoon_detail text,
  specific_area text,
  source_fingerprint text not null,
  supervisor_worker_id text,
  mapping_status text not null default 'pending'
    check (mapping_status in ('mapped','partial','pending','needs_review')),
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_file_id, source_sheet, source_row)
);

create table if not exists public.site_operations_entry_projects (
  entry_id uuid not null references public.site_operations_entries(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  mapping_method text not null default 'explicit_token'
    check (mapping_method in ('explicit_token','manual','source_project')),
  created_at timestamptz not null default now(),
  primary key (entry_id, project_id)
);

create table if not exists public.labour_workers (
  worker_id text primary key,
  full_name text not null,
  nickname text,
  trade_skill text,
  default_team text,
  status text,
  display_label text,
  source_file_id text,
  source_row integer,
  synced_at timestamptz not null default now()
);

create table if not exists public.labour_name_map (
  source_name_norm text primary key,
  source_name text not null,
  worker_id text references public.labour_workers(worker_id) on delete set null,
  canonical_name text,
  map_type text,
  status text,
  occurrences integer,
  first_date date,
  last_date date,
  source_file_id text,
  synced_at timestamptz not null default now()
);

alter table public.site_operations_entries
  drop constraint if exists site_operations_entries_supervisor_worker_id_fkey;
alter table public.site_operations_entries
  add constraint site_operations_entries_supervisor_worker_id_fkey
  foreign key (supervisor_worker_id) references public.labour_workers(worker_id) on delete set null;

create table if not exists public.labour_verification_batches (
  id uuid primary key default gen_random_uuid(),
  site_operations_entry_id uuid not null unique references public.site_operations_entries(id) on delete cascade,
  work_date date not null,
  expected_headcount integer check (expected_headcount is null or expected_headcount >= 0),
  supervisor_worker_id text references public.labour_workers(worker_id) on delete set null,
  supervisor_raw text,
  home_team text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','verified','needs_review')),
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.labour_daily_assignments (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.labour_verification_batches(id) on delete cascade,
  worker_id text not null references public.labour_workers(worker_id) on delete restrict,
  work_date date not null,
  project_id uuid references public.projects(id) on delete restrict,
  home_team text,
  working_team text,
  movement_status text not null default 'same_team'
    check (movement_status in ('same_team','borrowed','returned','other')),
  allocation_hours numeric(5,2) check (allocation_hours is null or (allocation_hours >= 0 and allocation_hours <= 24)),
  allocation_share numeric(6,5) check (allocation_share is null or (allocation_share > 0 and allocation_share <= 1)),
  work_detail text,
  notes text,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, worker_id, project_id)
);

create index if not exists idx_site_operations_entries_work_date on public.site_operations_entries(work_date desc);
create index if not exists idx_site_operations_entries_supervisor on public.site_operations_entries(supervisor_worker_id, work_date desc);
create index if not exists idx_site_operations_entry_projects_project on public.site_operations_entry_projects(project_id, entry_id);
create index if not exists idx_labour_workers_default_team on public.labour_workers(default_team);
create index if not exists idx_labour_batches_work_date on public.labour_verification_batches(work_date desc, verification_status);
create index if not exists idx_labour_assignments_worker_date on public.labour_daily_assignments(worker_id, work_date desc);
create index if not exists idx_labour_assignments_project_date on public.labour_daily_assignments(project_id, work_date desc);

alter table public.site_operations_entries enable row level security;
alter table public.site_operations_entry_projects enable row level security;
alter table public.labour_workers enable row level security;
alter table public.labour_name_map enable row level security;
alter table public.labour_verification_batches enable row level security;
alter table public.labour_daily_assignments enable row level security;

grant select on public.site_operations_entries, public.site_operations_entry_projects, public.labour_workers, public.labour_name_map to authenticated;
grant select, insert, update, delete on public.labour_verification_batches, public.labour_daily_assignments to authenticated;

drop policy if exists "active users read site operations" on public.site_operations_entries;
create policy "active users read site operations" on public.site_operations_entries for select to authenticated
using (exists (select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.active=true));

drop policy if exists "active users read site operations projects" on public.site_operations_entry_projects;
create policy "active users read site operations projects" on public.site_operations_entry_projects for select to authenticated
using (exists (select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.active=true));

drop policy if exists "active users read labour workers" on public.labour_workers;
create policy "active users read labour workers" on public.labour_workers for select to authenticated
using (exists (select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.active=true));

drop policy if exists "active users read labour name map" on public.labour_name_map;
create policy "active users read labour name map" on public.labour_name_map for select to authenticated
using (exists (select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.active=true));

drop policy if exists "active users read labour batches" on public.labour_verification_batches;
create policy "active users read labour batches" on public.labour_verification_batches for select to authenticated
using (exists (select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.active=true));

drop policy if exists "payroll roles insert labour batches" on public.labour_verification_batches;
create policy "payroll roles insert labour batches" on public.labour_verification_batches for insert to authenticated
with check (exists (select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.active=true and p.role in ('manager','engineer')));

drop policy if exists "payroll roles update labour batches" on public.labour_verification_batches;
create policy "payroll roles update labour batches" on public.labour_verification_batches for update to authenticated
using (exists (select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.active=true and p.role in ('manager','engineer')))
with check (exists (select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.active=true and p.role in ('manager','engineer')));

drop policy if exists "payroll roles delete labour batches" on public.labour_verification_batches;
create policy "payroll roles delete labour batches" on public.labour_verification_batches for delete to authenticated
using (exists (select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.active=true and p.role in ('manager','engineer')));

drop policy if exists "active users read labour assignments" on public.labour_daily_assignments;
create policy "active users read labour assignments" on public.labour_daily_assignments for select to authenticated
using (exists (select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.active=true));

drop policy if exists "payroll roles insert labour assignments" on public.labour_daily_assignments;
create policy "payroll roles insert labour assignments" on public.labour_daily_assignments for insert to authenticated
with check (exists (select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.active=true and p.role in ('manager','engineer')));

drop policy if exists "payroll roles update labour assignments" on public.labour_daily_assignments;
create policy "payroll roles update labour assignments" on public.labour_daily_assignments for update to authenticated
using (exists (select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.active=true and p.role in ('manager','engineer')))
with check (exists (select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.active=true and p.role in ('manager','engineer')));

drop policy if exists "payroll roles delete labour assignments" on public.labour_daily_assignments;
create policy "payroll roles delete labour assignments" on public.labour_daily_assignments for delete to authenticated
using (exists (select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.active=true and p.role in ('manager','engineer')));
