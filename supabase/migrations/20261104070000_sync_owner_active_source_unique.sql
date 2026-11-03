-- 3 Kings Sync Owner: one unresolved incident per canonical source+pipeline.
-- Private schema only. No changes to legacy Daily LINE or application data.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS sync_owner_pending_active_source_unique
  ON line_autopilot.sync_owner_pending_incidents(pipeline,source_file_id)
  WHERE alert_status IN ('pending','overdue_alerted');
COMMIT;
