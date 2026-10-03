create index if not exists idx_labour_name_map_worker
  on public.labour_name_map(worker_id);
create index if not exists idx_labour_batches_supervisor
  on public.labour_verification_batches(supervisor_worker_id);
create index if not exists idx_labour_batches_verified_by
  on public.labour_verification_batches(verified_by);
create index if not exists idx_labour_assignments_verified_by
  on public.labour_daily_assignments(verified_by);
