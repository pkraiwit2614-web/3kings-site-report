-- Read-only timestamp for the existing Defect Report header.
-- Neither Excel writeback completion nor polling counts as a Defect data change.
-- Identical access check to the existing condo_room_status SELECT policy.
CREATE OR REPLACE FUNCTION public.defect_report_latest_change_at()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN (SELECT auth.uid()) IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = (SELECT auth.uid()) AND p.active = true
      )
      AND private.matrix_can_read(
        ARRAY['defect'::text, 'hotel'::text, 'workplan'::text], true
      )
    THEN GREATEST(
      (SELECT MAX(c.source_modified_at) FROM public.condo_room_status c),
      (SELECT MAX(o.updated_at) FROM public.defect_web_overrides o)
    )
    ELSE NULL::timestamptz
  END
$$;

REVOKE ALL ON FUNCTION public.defect_report_latest_change_at() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.defect_report_latest_change_at() TO authenticated;
