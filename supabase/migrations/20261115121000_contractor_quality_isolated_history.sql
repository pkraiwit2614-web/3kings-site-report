-- Contractor Quality: isolated historical read model. Does not alter any Defect, dispatch or Sync table.
-- Existing Defect/Work Order writers and triggers remain unchanged.
CREATE TABLE IF NOT EXISTS public.contractor_quality_history (
  work_id text PRIMARY KEY CHECK (work_id ~ '^DF-[A-Za-z0-9()_-]+$'),
  room_group text NOT NULL,
  building text NOT NULL CHECK (building IN ('A','B')),
  contractor text NOT NULL,
  defect_item text NOT NULL,
  work_status text,
  evidence_url text,
  source_file_id text,
  source_modified_at timestamptz,
  source_confirmed boolean NOT NULL DEFAULT false,
  source_origin text NOT NULL CHECK (source_origin IN ('master_register','db_only_pending')),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contractor_quality_history_building_contractor_idx
  ON public.contractor_quality_history (building, contractor)
  WHERE source_confirmed;
ALTER TABLE public.contractor_quality_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.contractor_quality_history FROM anon, authenticated;
GRANT SELECT ON TABLE public.contractor_quality_history TO authenticated;
CREATE POLICY contractor_quality_internal_select ON public.contractor_quality_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = (SELECT auth.uid())
        AND p.active IS TRUE
        AND p.role = ANY (ARRAY['manager','admin','engineer','payroll','viewer_editor'])
    )
    AND COALESCE(public.role_permission_override('defect'), 'view') <> 'none'
  );
COMMENT ON TABLE public.contractor_quality_history IS
  'Read-only-to-app historical contractor defect assessment. Master-register Work IDs remain counted after repair completion. Excludes 3 Kings from original-contractor ranking. Does not write Work Order/Defect.';
