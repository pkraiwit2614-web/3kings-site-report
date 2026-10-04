
create index if not exists idx_payroll_items_assignment
  on public.payroll_verification_items(labour_assignment_id)
  where labour_assignment_id is not null;

create index if not exists idx_payroll_records_timecard_checked_by
  on public.payroll_verification_records(timecard_checked_by)
  where timecard_checked_by is not null;

create index if not exists idx_payroll_records_verified_by
  on public.payroll_verification_records(verified_by)
  where verified_by is not null;
