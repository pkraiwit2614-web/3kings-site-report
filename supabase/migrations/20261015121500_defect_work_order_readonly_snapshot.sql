-- Phase 1: 3 Kings internal Work Order Viewer + Print. Isolated read-only source snapshot.
-- This table does NOT write into condo_room_status or any Excel workbook.
CREATE TABLE IF NOT EXISTS public.defect_work_order_snapshot (
  work_id text PRIMARY KEY,
  room_group text NOT NULL,
  building text NOT NULL CHECK (building IN ('A','B')),
  contractor text NOT NULL,
  defect_item text NOT NULL,
  next_action text,
  supervisor text,
  received_date date,
  due_date date,
  work_status text,
  evidence_url text,
  qa_status text,
  conflict_note text,
  source_sync_note text,
  source_modified_at timestamptz NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS defect_work_order_snapshot_building_idx ON public.defect_work_order_snapshot(building,contractor);
ALTER TABLE public.defect_work_order_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defect_work_order_snapshot FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.defect_work_order_snapshot FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.defect_work_order_snapshot TO authenticated;
DROP POLICY IF EXISTS defect_work_order_internal_read ON public.defect_work_order_snapshot;
CREATE POLICY defect_work_order_internal_read ON public.defect_work_order_snapshot
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = (SELECT auth.uid())
        AND p.active IS TRUE
        AND p.role IN ('manager','admin','engineer','payroll','viewer_editor')
    )
    AND COALESCE(public.role_permission_override('defect'),'view') <> 'none'
  );
-- Data is loaded privately after schema migration, never committed to this public repository.
