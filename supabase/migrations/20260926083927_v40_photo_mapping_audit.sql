-- V4.0 Photo Mapping audit fields
-- Additive change: existing sync and presentation queries continue to work.

alter table public.drive_photo_index
  add column if not exists verified_by uuid references auth.users(id) on delete set null,
  add column if not exists verified_at timestamptz,
  add column if not exists mapping_note text;

create index if not exists drive_photo_index_verified_at_idx
  on public.drive_photo_index (verified_at)
  where is_active = true;
