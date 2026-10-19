-- 3 Kings: reconcile only fields whose previously acknowledged Web value matches DB,
-- on newer approved Excel source data. Preserve pending Web edits and all override history.
-- Preflight baseline: production trigger defect_web_override_protect, 19 Oct 2026.
-- No UPDATE/DELETE on existing overrides, no change to RBAC/RLS/role grants.
DO $preflight$
BEGIN
  IF pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.defect_web_override_protect()'::pg_catalog.regprocedure),
      'All other rooms keep exactly the old Web-override behavior') = 0 THEN
    RAISE EXCEPTION 'DEFECT_RECONCILE_BASELINE_CHANGED_REVIEW_REQUIRED';
  END IF;
END
$preflight$;

CREATE TABLE IF NOT EXISTS private.defect_reconcile_field_versions (
  room_no text NOT NULL,
  field_name text NOT NULL CHECK (field_name IN (
    'current_status','status_group','next_action','defect_detail'
  )),
  override_revision timestamptz NOT NULL,
  last_source_revision timestamptz NOT NULL,
  last_accepted_value text,
  last_accepted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_no,field_name)
);

CREATE TABLE IF NOT EXISTS private.defect_reconcile_field_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_no text NOT NULL,
  field_name text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('accepted_excel','conflict_kept_db')),
  override_revision timestamptz,
  source_revision timestamptz,
  previous_db_value text,
  proposed_excel_value text,
  web_override_value text,
  observed_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE private.defect_reconcile_field_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.defect_reconcile_field_audit FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE private.defect_reconcile_field_audit_id_seq FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.defect_web_override_protect()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v public.defect_web_overrides%rowtype;
  expected_status text;
  expected_group text;
  approved boolean := false;
  v_field_name text;
  proposed_value text;
  previous_value text;
  override_value text;
  accepted_value text;
  accepted_revision timestamptz;
  accepted_override_revision timestamptz;
  can_accept boolean;
  approved_source boolean;
BEGIN
  IF pg_catalog.current_setting('app.defect_manual_update',true) = '1' THEN
    RETURN new;
  END IF;

  SELECT * INTO v FROM public.defect_web_overrides WHERE room_no=new.room_no;

  -- Keep the five previously approved Hotel Engineer transitions unchanged.
  IF new.room_no IN ('B214','B314','B315','B403','B515') THEN
    CASE new.room_no
      WHEN 'B214' THEN expected_status:='Defect ยังไม่เสร็จ / ต้องปิดงาน'; expected_group:='Hotel - Incomplete';
      WHEN 'B314' THEN expected_status:='Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ'; expected_group:='Hotel - Awaiting Check';
      WHEN 'B315' THEN expected_status:='Defect ยังไม่เสร็จ / ต้องปิดงาน'; expected_group:='Hotel - Incomplete';
      WHEN 'B403' THEN expected_status:='Defect ยังไม่เสร็จ / ต้องปิดงาน'; expected_group:='Hotel - Incomplete';
      WHEN 'B515' THEN expected_status:='Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ'; expected_group:='Hotel - Awaiting Check';
    END CASE;
    approved := new.source_file_id = '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj'
      AND new.source_file_name = 'Handover_Defect_Summary_Updated_28-09-2026.xlsx'
      AND old.current_status IS NOT DISTINCT FROM expected_status
      AND old.status_group IS NOT DISTINCT FROM expected_group
      AND new.current_status = 'Defect เสร็จแล้ว / Hotel Engineer ตรวจแล้ว'
      AND new.status_group = 'Hotel - Checked Complete'
      AND (NOT FOUND OR v.source_sync_state = 'synced')
      AND (NOT FOUND OR new.source_modified_at > greatest(
          coalesce(v.updated_at,'-infinity'::timestamptz),
          coalesce(v.source_synced_at,'-infinity'::timestamptz)));
    IF NOT approved THEN
      new.current_status:=old.current_status;
      new.status_group:=old.status_group;
    END IF;
    new.next_action:=old.next_action;
    new.defect_detail:=old.defect_detail;
    new.latest_source:=CASE WHEN approved THEN new.latest_source ELSE old.latest_source END;
    RETURN new;
  END IF;

  IF NOT FOUND THEN RETURN new; END IF;

  -- Pending Web->Excel writeback must have precedence without exception.
  IF v.source_sync_state <> 'synced' OR v.source_synced_at IS NULL THEN
    new.current_status:=coalesce(v.current_status,new.current_status);
    new.status_group:=coalesce(v.status_group,new.status_group);
    new.next_action:=coalesce(v.next_action,new.next_action);
    new.defect_detail:=coalesce(v.detail_text,new.defect_detail);
    IF (v.current_status IS NOT NULL OR v.status_group IS NOT NULL
        OR v.next_action IS NOT NULL) THEN
      new.latest_source:=old.latest_source;
    END IF;
    RETURN new;
  END IF;

  -- Approved workbook + acknowledged Web revision are prerequisites, not sole
  -- evidence of a new field value.
  approved_source := new.source_file_id = '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj'
    AND new.source_file_name = 'Handover_Defect_Summary_Updated_28-09-2026.xlsx'
    AND v.source_synced_at >= v.updated_at
    AND new.source_modified_at > v.source_synced_at;

  FOREACH v_field_name IN ARRAY ARRAY[
    'current_status','status_group','next_action','defect_detail'
  ] LOOP
    previous_value := pg_catalog.to_jsonb(old)->>v_field_name;
    proposed_value := pg_catalog.to_jsonb(new)->>v_field_name;
    override_value := CASE WHEN v_field_name='defect_detail' THEN v.detail_text
      ELSE pg_catalog.to_jsonb(v)->>v_field_name END;

    -- Already identical to the DB: do not needlessly replace the value or
    -- revive an old Web override. This is essential for no-op 15-min syncs.
    IF proposed_value IS NOT DISTINCT FROM previous_value THEN CONTINUE; END IF;

    SELECT f.last_accepted_value,f.last_source_revision,f.override_revision
      INTO accepted_value,accepted_revision,accepted_override_revision
      FROM private.defect_reconcile_field_versions f
      WHERE f.room_no=new.room_no AND f.field_name=v_field_name;

    IF FOUND AND accepted_override_revision IS NOT DISTINCT FROM v.updated_at THEN
      -- Per-field last accepted value is our optimistic concurrency baseline.
      can_accept := approved_source
        AND previous_value IS NOT DISTINCT FROM accepted_value
        AND new.source_modified_at > accepted_revision;
    ELSE
      -- Legacy synced rows have no baseline yet. Bootstrap only when actual DB
      -- value agrees with the already-acknowledged Web override for this field.
      can_accept := approved_source
        AND previous_value IS NOT DISTINCT FROM override_value;
    END IF;

    IF can_accept THEN
      INSERT INTO private.defect_reconcile_field_versions AS f (
        room_no,field_name,override_revision,last_source_revision,
        last_accepted_value,last_accepted_at
      ) VALUES (
        new.room_no,v_field_name,v.updated_at,new.source_modified_at,
        proposed_value,now()
      ) ON CONFLICT (room_no,field_name) DO UPDATE SET
        override_revision=excluded.override_revision,
        last_source_revision=excluded.last_source_revision,
        last_accepted_value=excluded.last_accepted_value,
        last_accepted_at=excluded.last_accepted_at;
      INSERT INTO private.defect_reconcile_field_audit (
        room_no,field_name,decision,override_revision,source_revision,
        previous_db_value,proposed_excel_value,web_override_value
      ) VALUES (
        new.room_no,v_field_name,'accepted_excel',v.updated_at,
        new.source_modified_at,previous_value,proposed_value,override_value
      );
    ELSE
      -- Keep actual DB field unchanged; never roll back a recent Web edit,
      -- and record which field must be reconciled.
      new := pg_catalog.jsonb_populate_record(new,
        pg_catalog.jsonb_build_object(v_field_name,previous_value));
      IF NOT EXISTS (
        SELECT 1 FROM private.defect_reconcile_field_audit a
        WHERE a.room_no=new.room_no AND a.field_name=v_field_name
          AND a.decision='conflict_kept_db'
          AND a.override_revision IS NOT DISTINCT FROM v.updated_at
          AND a.source_revision IS NOT DISTINCT FROM new.source_modified_at
          AND a.proposed_excel_value IS NOT DISTINCT FROM proposed_value
      ) THEN
        INSERT INTO private.defect_reconcile_field_audit (
          room_no,field_name,decision,override_revision,source_revision,
          previous_db_value,proposed_excel_value,web_override_value
        ) VALUES (
          new.room_no,v_field_name,'conflict_kept_db',v.updated_at,
          new.source_modified_at,previous_value,proposed_value,override_value
        );
      END IF;
    END IF;
  END LOOP;
  RETURN new;
END
$function$;
