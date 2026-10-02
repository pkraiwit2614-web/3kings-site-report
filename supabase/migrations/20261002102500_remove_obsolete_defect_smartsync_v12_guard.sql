-- SmartSync v1.2 compatibility guard from 2026-09-28 is obsolete after the
-- 2026-09-30 Rental Pool classification update and the v1.3 defect sync hardening.
-- Keeping it could overwrite current non-hotel classifications on future syncs.

drop trigger if exists condo_defect_smartsync_v12_compat_guard_trg
on public.condo_room_status;

drop function if exists public.condo_defect_smartsync_v12_compat_guard();
