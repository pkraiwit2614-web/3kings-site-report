-- 3 Kings / PR #167 -- PREPARED ONLY, DO NOT APPLY IN PRODUCTION.
-- Purpose: guarded recovery for the two Express register tables if BOTH are absent.
-- Source schema: PR #167, 20261022220800_express_registry_read_model.sql (exact column contract).
-- IMPORTANT: That earlier migration ALREADY creates these same objects. Review active
-- migration order, linked history and schema diffs before approving this file. If the
-- canonical migration has already created both tables, this file makes NO changes.
-- This does not activate import, write any records, enable a sync flag or grant
-- anonymous write access. Existing XLSX Master remains Source of Truth.
-- DO NOT use as a workaround for broken migration history (PR #213).

DO $express_staging_prepare$
DECLARE
  runs_exist boolean := to_regclass('public.express_register_runs') IS NOT NULL;
  rows_exist boolean := to_regclass('public.express_register_rows') IS NOT NULL;
BEGIN
  IF runs_exist <> rows_exist THEN
    RAISE EXCEPTION 'EXPRESS_STAGING_PARTIAL_SCHEMA: inspect existing objects manually; no changes made';
  END IF;

  IF runs_exist THEN
    -- Never overwrite or change the permissions/policies of an existing table.
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='express_register_runs'
        AND c.relkind='r' AND c.relrowsecurity
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='express_register_rows'
        AND c.relkind='r' AND c.relrowsecurity
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public'
        AND tablename='express_register_runs' AND policyname='express_register_runs_read'
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public'
        AND tablename='express_register_rows' AND policyname='express_register_rows_read'
    ) THEN
      RAISE EXCEPTION 'EXPRESS_STAGING_EXISTING_SCHEMA_MISMATCH: RLS/policy preflight failed; no changes made';
    END IF;
    RAISE NOTICE 'Express registry tables already exist: no-op; compare full schema/ACL to PR #167 source before release';
    RETURN;
  END IF;

  -- Fail closed if the expected existing authorization helpers are absent.
  IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='private' AND p.proname='is_active_user'
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='private' AND p.proname='matrix_allowed'
    ) THEN
    -- Resolve the actual function signatures and policy dependencies in QA.
    -- Do not guess or change live authorization functions to satisfy this guard.
    RAISE EXCEPTION 'EXPRESS_STAGING_AUTH_DEPENDENCY_MISSING: inspect private helper signatures';
  END IF;

  CREATE TABLE public.express_register_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_fingerprint text NOT NULL UNIQUE CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'),
    state text NOT NULL DEFAULT 'importing' CHECK (state IN ('importing','complete','failed')),
    source_files integer NOT NULL CHECK (source_files BETWEEN 1 AND 90),
    document_count integer NOT NULL CHECK (document_count >= 0),
    line_count integer NOT NULL CHECK (line_count >= 0),
    canceled_count integer NOT NULL DEFAULT 0 CHECK (canceled_count >= 0),
    review_count integer NOT NULL DEFAULT 0 CHECK (review_count >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    CONSTRAINT completed_gate CHECK ((state='complete') = (completed_at IS NOT NULL))
  );

  CREATE TABLE public.express_register_rows (
    batch_id uuid NOT NULL REFERENCES public.express_register_runs(id) ON DELETE CASCADE,
    document_group text NOT NULL CHECK (document_group IN ('PO_PL','PR_PC')),
    document_no text NOT NULL CHECK (document_no ~ '^(PO|PL|PR|PC)[0-9]{6,9}[A-Z]?$'),
    line_seq integer NOT NULL CHECK (line_seq >= 0),
    document_date text,
    supplier text,
    plot_codes text[] NOT NULL DEFAULT '{}',
    qa_status text NOT NULL,
    source_file text,
    source_url text,
    item_code text,
    description text,
    quantity numeric(18,4),
    unit text,
    unit_price numeric(18,4),
    line_amount numeric(18,4),
    grand_total numeric(18,4),
    search_text text NOT NULL DEFAULT '',
    PRIMARY KEY (batch_id,document_group,document_no,line_seq),
    CONSTRAINT header_line_shape CHECK (
      (line_seq=0 AND item_code IS NULL AND description IS NULL)
      OR (line_seq>0 AND item_code IS NOT NULL)
    ),
    CONSTRAINT nonnegative_quantity CHECK (quantity IS NULL OR quantity >= 0)
  );

  CREATE INDEX express_registry_complete_runs
    ON public.express_register_runs (completed_at DESC) WHERE state='complete';
  CREATE INDEX express_registry_doc_lookup
    ON public.express_register_rows (batch_id,document_no,line_seq);
  CREATE INDEX express_registry_headers
    ON public.express_register_rows (batch_id,document_group,document_no) WHERE line_seq=0;

  ALTER TABLE public.express_register_runs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.express_register_rows ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.express_register_runs,public.express_register_rows FROM PUBLIC,anon,authenticated;
  GRANT SELECT ON public.express_register_runs,public.express_register_rows TO authenticated;
  GRANT ALL ON public.express_register_runs,public.express_register_rows TO service_role;

  CREATE POLICY express_register_runs_read ON public.express_register_runs
    FOR SELECT TO authenticated USING (
      state='complete' AND
      private.matrix_allowed('procurement','view',(SELECT private.is_active_user()))
    );
  CREATE POLICY express_register_rows_read ON public.express_register_rows
    FOR SELECT TO authenticated USING (
      EXISTS (SELECT 1 FROM public.express_register_runs b
              WHERE b.id=batch_id AND b.state='complete')
      AND private.matrix_allowed('procurement','view',(SELECT private.is_active_user()))
    );
END;
$express_staging_prepare$;
