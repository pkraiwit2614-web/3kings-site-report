-- Prompt 5 performance follow-up: cover the new contractor confirmation audit FK.
create index if not exists idx_labour_batches_contractor_count_confirmed_by
  on public.labour_verification_batches(contractor_count_confirmed_by);
