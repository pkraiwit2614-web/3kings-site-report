-- 3 Kings Construction: Retire ONLY the Schedule / Plan vs Actual web edit RPC.
-- The Schedule page remains read-only and continues to use v_schedule_tasks.
-- Preserve historical schedule_task_overrides, v_schedule_tasks, schedule_tasks,
-- drive_sync_apply_schedule and schedule_task_daily_snapshots unchanged.
-- RESTRICT fails closed if a new database dependency has appeared.
DROP FUNCTION IF EXISTS public.schedule_save_web_override(
  uuid, text, text, date, text, text, text, uuid, text
) RESTRICT;
