-- Match the application's existing active-account rule. No write policy, key,
-- function contract or business row is changed; sync workers retain their access.
ALTER POLICY drive_photo_index_select_authenticated ON public.drive_photo_index
  USING ((SELECT private.is_active_user()));
ALTER POLICY drive_sync_runs_select_authenticated ON public.drive_sync_runs
  USING ((SELECT private.is_active_user()));
ALTER POLICY photo_ai_task_scores_select_authenticated ON public.photo_ai_task_scores
  USING ((SELECT private.is_active_user()));
ALTER POLICY photo_task_feedback_select_authenticated ON public.photo_task_feedback
  USING ((SELECT private.is_active_user()));
ALTER POLICY schedule_snapshots_select_authenticated ON public.schedule_task_daily_snapshots
  USING ((SELECT private.is_active_user()));

-- Return one latest image per project, rather than truncating all projects to
-- the newest 180 images. Invoker security preserves underlying photo RLS.
CREATE VIEW public.v_latest_site_photos WITH (security_invoker = true) AS
SELECT DISTINCT ON (project_id)
  project_id, drive_file_id, drive_folder_id, drive_folder_name, photo_date, file_name
FROM public.drive_photo_index
WHERE is_active = true
ORDER BY project_id, photo_date DESC, indexed_at DESC, id DESC;
REVOKE ALL ON public.v_latest_site_photos FROM PUBLIC, anon;
GRANT SELECT ON public.v_latest_site_photos TO authenticated;
