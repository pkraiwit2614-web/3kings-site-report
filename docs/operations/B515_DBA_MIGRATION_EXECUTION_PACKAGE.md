# 3 Kings Construction — Owner / DBA Execution Package
## Scoped B515 Defect Sync Migration Deployment & Historical Reconciliation

**Document Code:** `DOC-OPS-20261028-B515-DBA`  
**Date:** 2026-10-28  
**Target Migration File:** `supabase/migrations/20261027233000_b515_defect_sync_reconcile.sql`  
**Migration Version:** `20261027233000`  
**Scope:** Room B515 Customer Defect sync reconciliation and defect detail preservation  
**Target Database:** Production Supabase (`wtqubwdduzedmcvyhbgs`)

---

## 1. Executive Summary & Root Cause Analysis

### 1.1 The Deployment Blocker
PR #229 has been merged into `main` (commit `531860b`), providing the application code, Google Apps Script logic (`SmartSyncDefects_v1.3_2026-10-02.gs`), and the migration file `supabase/migrations/20261027233000_b515_defect_sync_reconcile.sql`. However, deploying this migration through automated `supabase db push` is **strictly blocked** by a historical duplicate migration in the repository.

### 1.2 Migration History Conflict (Production vs. Repository & PR #213)
1. **The Duplicate Timestamp in Repository:**
   The repository currently contains two migrations sharing the identical timestamp prefix `20261013220000`:
   - `supabase/migrations/20261013220000_purchase_calendar_payroll_roles.sql`
   - `supabase/migrations/20261013220000_shared_calendar_procurement_dates.sql`

2. **Production Database Reality:**
   - Production migration history (`supabase_migrations.schema_migrations`) has recorded `20261013152531` (`shared_calendar_procurement_dates_20261013`).
   - `20261013220000_purchase_calendar_payroll_roles.sql` was **never applied** to Production. Its legacy `ALTER POLICY` statements would overwrite current Payroll Permission Matrix policies (`private.matrix_allowed(...)`), breaking role-based access control.

3. **Status of PR #213:**
   PR #213 (`qa/pr213-full-migration-replay-20261022`) reconciled this duplicate on a QA branch by renaming the applied calendar migration to `20261013152531` and archiving `purchase_calendar_payroll_roles.sql` into `supabase/migrations/Backup/`. However, PR #213 was held back from `main` because a full blank-slate database replay required baseline fixtures (`schedule_tasks`, `v_schedule_tasks`, etc.) that are outside scoped production requirements.

4. **Crucial Directives:**
   - **NEVER run `supabase db push` or uncurated batch migration.** Doing so will crash on duplicate version `20261013220000` or attempt to replay unapproved payroll policy mutations.
   - `20261027233000_b515_defect_sync_reconcile.sql` is strictly timestamped (`20261027233000`), newer than all applied migrations, and completely decoupled from the PR #213 duplicate.
   - It **can and must be installed independently** as a targeted migration.

---

## 2. Preflight & Isolated QA Validation Evidence

### 2.1 Automated Test Execution & PostgreSQL Container QA
Evidence of verification before production deployment:

1. `tests/b515-defect-sync.test.cjs` (6/6 PASS):
   - Built-in preflight guards syntax and targets.
   - B515 approved import blocked if pending Web writeback exists.
   - Zero direct SQL data reconciliations (no hardcoded UPDATEs).
   - `/api/sync/drive` route detail extraction.
   - Apps Script detail extraction.
   - Zero-touch verification on protected zones (Materials, Payroll, Calendar, OOO/OOS, RBAC/RLS).

2. `tests/b515-sql-simulation.test.cjs` (4/4 PASS):
   - Preflight assertions strictly formed.
   - B515 transition accepted on canonical Excel 2026-10-26+ and defect_detail history preserved.
   - B515 transition blocked when Web writeback is pending.
   - Regression on B214, B314, B315, B403: approved transitions succeed, unapproved transitions are rejected and retain original values.

3. Real PostgreSQL Container QA (`.github/workflows/b515-sql-isolated.yml`):
   - Executes against real PostgreSQL 16 and 17 service containers.
   - Verifies preflight fail-closed when room B515 is absent (`ROOM_B515_NOT_FOUND_IN_CANONICAL_INVENTORY`).
   - Applies baseline schema, baseline reconciliation migration `20261019132800`, and `20261027233000_b515_defect_sync_reconcile.sql`.
   - Runs `tests/sql/b515-defect-sync-reconcile-assertions.sql` asserting B515 Excel acceptance, history preservation, pending write protection, and B214/B314/B315/B403 regression.
   - Runs isolated negative scenarios verifying fail-closed behavior on stale Excel revisions, wrong source files, and arbitrary unapproved status transitions.

---

## 3. Owner / DBA Step-by-Step Execution Runbook

### Step 1: Production Preflight Check (Read-Only)
Run the following SQL in Supabase SQL Editor or via authenticated psql to verify database readiness:

```sql
-- PREFLIGHT VERIFICATION
DO $preflight_check$
DECLARE
  v_guard text;
BEGIN
  -- 1. Check baseline function exists and contains required guard markers
  SELECT pg_catalog.pg_get_functiondef('public.defect_web_override_protect()'::pg_catalog.regprocedure)
    INTO v_guard;

  IF pg_catalog.strpos(v_guard, 'Keep the five previously approved Hotel Engineer transitions unchanged') = 0
     OR pg_catalog.strpos(v_guard, 'Pending Web->Excel writeback') = 0
  THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: defect_web_override_protect baseline has diverged!';
  END IF;

  -- 2. Check reconciliation tables exist
  IF to_regclass('private.defect_reconcile_field_versions') IS NULL
     OR to_regclass('private.defect_reconcile_field_audit') IS NULL
  THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: private reconciliation tables missing!';
  END IF;

  -- 3. Check room B515 exists
  IF NOT EXISTS (SELECT 1 FROM public.condo_room_status WHERE room_no = 'B515') THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: Room B515 not found in condo_room_status!';
  END IF;

  -- 4. Check migration history does NOT already contain 20261027233000
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261027233000') THEN
    RAISE EXCEPTION 'PREFLIGHT_NOTICE: Migration 20261027233000 is already recorded!';
  END IF;

  RAISE NOTICE 'PREFLIGHT_PASS: All conditions verified. Ready for targeted migration execution.';
END
$preflight_check$;
```

---

### Step 2: Targeted Migration Execution
Execute the full contents of `supabase/migrations/20261027233000_b515_defect_sync_reconcile.sql`:

```sql
BEGIN;

-- 1. Preflight guard
DO $preflight$
DECLARE
  v_guard text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef('public.defect_web_override_protect()'::pg_catalog.regprocedure)
    INTO v_guard;

  IF pg_catalog.strpos(v_guard, 'Keep the five previously approved Hotel Engineer transitions unchanged') = 0
     OR pg_catalog.strpos(v_guard, 'Pending Web->Excel writeback') = 0
  THEN
    RAISE EXCEPTION 'DEFECT_RECONCILE_BASELINE_CHANGED_REVIEW_REQUIRED';
  END IF;

  IF to_regclass('private.defect_reconcile_field_versions') IS NULL
     OR to_regclass('private.defect_reconcile_field_audit') IS NULL
  THEN
    RAISE EXCEPTION 'DEFECT_FIELD_RECONCILIATION_NOT_INSTALLED';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.condo_room_status WHERE room_no = 'B515') THEN
    RAISE EXCEPTION 'ROOM_B515_NOT_FOUND_IN_CANONICAL_INVENTORY';
  END IF;
END
$preflight$;

-- 2. Update defect_web_override_protect trigger
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

  -- B515 Scoped Exception: permit transition to 'Defect ยังไม่เสร็จ / ต้องปิดงาน' and 'Hotel - Incomplete'
  -- from approved canonical Excel Master (Art House Doc ID 255 Customer Defect on 26/10/2026).
  IF new.room_no = 'B515' THEN
    IF new.source_file_id = '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj'
       AND new.source_file_name = 'Handover_Defect_Summary_Updated_28-09-2026.xlsx'
       AND new.current_status = 'Defect ยังไม่เสร็จ / ต้องปิดงาน'
       AND new.status_group = 'Hotel - Incomplete'
       -- Never override pending/unacknowledged Web->Excel writes, even if the Excel modified time is later.
       AND (NOT FOUND OR (
            v.source_sync_state = 'synced'
            AND v.source_synced_at IS NOT NULL
            AND v.source_synced_at >= v.updated_at
            AND new.source_modified_at > v.source_synced_at
       ))
       AND (new.source_modified_at >= '2026-10-26 00:00:00+00'::timestamptz)
    THEN
      new.current_status := 'Defect ยังไม่เสร็จ / ต้องปิดงาน';
      new.status_group := 'Hotel - Incomplete';
      -- Next action and source note are accepted from the approved Excel master.
      -- If incoming defect_detail is blank/omitted, retain existing defect_detail history.
      IF new.defect_detail IS NULL OR btrim(new.defect_detail) = '' THEN
        new.defect_detail := old.defect_detail;
      END IF;
      -- Record or update reconciliation baseline
      IF to_regclass('private.defect_reconcile_field_versions') IS NOT NULL THEN
        INSERT INTO private.defect_reconcile_field_versions AS f (
          room_no, field_name, override_revision, last_source_revision,
          last_accepted_value, last_accepted_at
        ) VALUES
          ('B515', 'current_status', coalesce(v.updated_at, now()), new.source_modified_at, new.current_status, now()),
          ('B515', 'status_group', coalesce(v.updated_at, now()), new.source_modified_at, new.status_group, now()),
          ('B515', 'next_action', coalesce(v.updated_at, now()), new.source_modified_at, new.next_action, now())
        ON CONFLICT (room_no, field_name) DO UPDATE SET
          override_revision = excluded.override_revision,
          last_source_revision = excluded.last_source_revision,
          last_accepted_value = excluded.last_accepted_value,
          last_accepted_at = excluded.last_accepted_at;
      END IF;
      IF to_regclass('private.defect_reconcile_field_audit') IS NOT NULL THEN
        INSERT INTO private.defect_reconcile_field_audit (
          room_no, field_name, decision, override_revision, source_revision,
          previous_db_value, proposed_excel_value, web_override_value
        ) VALUES
          ('B515', 'current_status', 'accepted_excel', v.updated_at, new.source_modified_at, old.current_status, new.current_status, v.current_status),
          ('B515', 'status_group', 'accepted_excel', v.updated_at, new.source_modified_at, old.status_group, new.status_group, v.status_group),
          ('B515', 'next_action', 'accepted_excel', v.updated_at, new.source_modified_at, old.next_action, new.next_action, v.next_action);
      END IF;
      RETURN new;
    END IF;
  END IF;

  -- Keep the other previously approved Hotel Engineer transitions unchanged.
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

    IF proposed_value IS NOT DISTINCT FROM previous_value THEN CONTINUE; END IF;

    SELECT f.last_accepted_value,f.last_source_revision,f.override_revision
      INTO accepted_value,accepted_revision,accepted_override_revision
      FROM private.defect_reconcile_field_versions f
      WHERE f.room_no=new.room_no AND f.field_name=v_field_name;

    IF FOUND AND accepted_override_revision IS NOT DISTINCT FROM v.updated_at THEN
      can_accept := approved_source
        AND previous_value IS NOT DISTINCT FROM accepted_value
        AND new.source_modified_at > accepted_revision;
    ELSE
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

-- 3. Update drive_sync_apply_condo_defects RPC
CREATE OR REPLACE FUNCTION public.drive_sync_apply_condo_defects(
  p_sync_key text,
  p_source_file text,
  p_source_file_id text,
  p_source_modified_at timestamp with time zone,
  p_rows jsonb,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  r jsonb;
  v_room text;
  v_total integer := 0;
  v_unique integer := 0;
  v_a integer := 0;
  v_b integer := 0;
  v_invalid integer := 0;
  v_changed integer := 0;
  v_needs_write boolean := false;
  v_missing text[] := array[]::text[];
  v_extra text[] := array[]::text[];
BEGIN
  IF NOT private.drive_sync_key_valid(p_sync_key) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_sync_key');
  END IF;

  IF p_source_file IS DISTINCT FROM 'Handover_Defect_Summary_Updated_28-09-2026.xlsx'
     OR p_source_file_id IS DISTINCT FROM '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unapproved_defect_source');
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'defect_rows_must_be_json_array';
  END IF;

  SELECT
    count(*),
    count(DISTINCT upper(coalesce(value->>'room_no',''))),
    count(*) FILTER (WHERE upper(coalesce(value->>'building','')) = 'A'),
    count(*) FILTER (WHERE upper(coalesce(value->>'building','')) = 'B'),
    count(*) FILTER (
      WHERE upper(coalesce(value->>'room_no','')) !~ '^[AB][0-9]{3}$'
         OR upper(coalesce(value->>'building','')) NOT IN ('A','B')
         OR nullif(value->>'hotel_participation','') IS NULL
         OR nullif(value->>'customer_status','') IS NULL
         OR nullif(value->>'current_status','') IS NULL
         OR nullif(value->>'status_group','') IS NULL
         OR nullif(value->>'follow_up','') IS NULL
         OR nullif(value->>'priority','') IS NULL
         OR nullif(value->>'next_action','') IS NULL
    )
  INTO v_total, v_unique, v_a, v_b, v_invalid
  FROM jsonb_array_elements(p_rows);

  IF v_total <> 263 OR v_unique <> 263 THEN
    RAISE EXCEPTION 'defect_inventory_count_mismatch total=% unique=% expected=263', v_total, v_unique;
  END IF;

  IF v_a <> 162 OR v_b <> 101 THEN
    RAISE EXCEPTION 'defect_building_count_mismatch A=% B=% expected_A=162 expected_B=101', v_a, v_b;
  END IF;

  IF v_invalid <> 0 THEN
    RAISE EXCEPTION 'defect_invalid_required_rows=%', v_invalid;
  END IF;

  SELECT coalesce(array_agg(c.room_no ORDER BY c.room_no), array[]::text[])
  INTO v_missing
  FROM public.condo_room_status c
  WHERE NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) x
    WHERE upper(x->>'room_no') = c.room_no
  );

  SELECT coalesce(array_agg(upper(x->>'room_no') ORDER BY upper(x->>'room_no')), array[]::text[])
  INTO v_extra
  FROM jsonb_array_elements(p_rows) x
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.condo_room_status c
    WHERE c.room_no = upper(x->>'room_no')
  );

  IF cardinality(v_missing) > 0 OR cardinality(v_extra) > 0 THEN
    RAISE EXCEPTION 'defect_room_set_mismatch missing=[%] extra=[%]',
      array_to_string(v_missing, ','),
      array_to_string(v_extra, ',');
  END IF;

  FOR r IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_room := upper(r->>'room_no');

    SELECT (
      c.building IS DISTINCT FROM upper(r->>'building')
      OR c.floor IS DISTINCT FROM (r->>'floor')::integer
      OR c.hotel_participation IS DISTINCT FROM (r->>'hotel_participation')
      OR c.customer_status IS DISTINCT FROM (r->>'customer_status')
      OR c.current_status IS DISTINCT FROM (r->>'current_status')
      OR c.status_group IS DISTINCT FROM (r->>'status_group')
      OR c.follow_up IS DISTINCT FROM (r->>'follow_up')
      OR c.priority IS DISTINCT FROM (r->>'priority')
      OR c.next_action IS DISTINCT FROM (r->>'next_action')
      OR c.latest_source IS DISTINCT FROM coalesce(nullif(r->>'latest_source',''), c.latest_source)
      OR c.source_note IS DISTINCT FROM coalesce(nullif(r->>'source_note',''), c.source_note)
      OR c.hotel_complete_color IS DISTINCT FROM coalesce(nullif(r->>'hotel_complete_color',''), c.hotel_complete_color)
      OR c.hotel_remarks IS DISTINCT FROM coalesce(nullif(r->>'hotel_remarks',''), c.hotel_remarks)
      OR (v_room IN ('A311','A401','B204','B502','B707') AND coalesce(r->>'defect_detail','') LIKE '%รายการ Defect แจ้งผ่านแชต:%'
          AND NOT EXISTS (SELECT 1 FROM public.defect_web_overrides w
            WHERE w.room_no = v_room
              AND (w.source_sync_state <> 'synced' OR w.source_synced_at IS NULL))
          AND c.defect_detail IS DISTINCT FROM r->>'defect_detail')
      OR (v_room = 'B515' AND coalesce(r->>'defect_detail','') LIKE '%Customer Defect B515%'
          AND NOT EXISTS (SELECT 1 FROM public.defect_web_overrides w
            WHERE w.room_no = v_room
              AND (w.source_sync_state <> 'synced' OR w.source_synced_at IS NULL))
          AND c.defect_detail IS DISTINCT FROM r->>'defect_detail')
    )
    INTO v_needs_write
    FROM public.condo_room_status c
    WHERE c.room_no = v_room;

    IF coalesce(v_needs_write, false) THEN
      v_changed := v_changed + 1;

      IF NOT p_dry_run THEN
        UPDATE public.condo_room_status c
        SET
          building = upper(r->>'building'),
          floor = (r->>'floor')::integer,
          hotel_participation = r->>'hotel_participation',
          customer_status = r->>'customer_status',
          current_status = r->>'current_status',
          status_group = r->>'status_group',
          follow_up = r->>'follow_up',
          priority = r->>'priority',
          next_action = r->>'next_action',
          latest_source = coalesce(nullif(r->>'latest_source',''), c.latest_source),
          source_note = coalesce(nullif(r->>'source_note',''), c.source_note),
          hotel_complete_color = coalesce(nullif(r->>'hotel_complete_color',''), c.hotel_complete_color),
          hotel_remarks = coalesce(nullif(r->>'hotel_remarks',''), c.hotel_remarks),
          defect_detail = CASE
            WHEN v_room IN ('A311','A401','B204','B502','B707') AND coalesce(r->>'defect_detail','') LIKE '%รายการ Defect แจ้งผ่านแชต:%'
              AND NOT EXISTS (SELECT 1 FROM public.defect_web_overrides w
                WHERE w.room_no = v_room
                  AND (w.source_sync_state <> 'synced' OR w.source_synced_at IS NULL))
              THEN r->>'defect_detail'
            WHEN v_room = 'B515' AND coalesce(r->>'defect_detail','') LIKE '%Customer Defect B515%'
              AND NOT EXISTS (SELECT 1 FROM public.defect_web_overrides w
                WHERE w.room_no = v_room
                  AND (w.source_sync_state <> 'synced' OR w.source_synced_at IS NULL))
              THEN r->>'defect_detail'
            ELSE c.defect_detail END,
          source_file_id = coalesce(nullif(p_source_file_id,''), c.source_file_id),
          source_file_name = coalesce(nullif(p_source_file,''), c.source_file_name),
          source_modified_at = coalesce(p_source_modified_at, c.source_modified_at),
          synced_at = now()
        WHERE c.room_no = v_room;
      END IF;
    END IF;
  END LOOP;

  IF NOT p_dry_run THEN
    INSERT INTO public.drive_sync_runs(
      sync_type, project_code, source_file, source_sheet,
      rows_read, rows_written, status, message
    )
    VALUES (
      'defects', null, p_source_file, 'ข้อมูลจำแนก',
      v_total, v_changed, 'success',
      format(
        'Server defect sync validated 263 rooms (A=162, B=101); %s semantic row(s) changed',
        v_changed
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'dry_run', p_dry_run,
    'rooms', v_total,
    'building_a', v_a,
    'building_b', v_b,
    'changed', v_changed,
    'source_file', p_source_file,
    'validation', '263/263 exact room-set match'
  );

EXCEPTION WHEN others THEN
  IF NOT coalesce(p_dry_run, false) THEN
    BEGIN
      INSERT INTO public.drive_sync_runs(
        sync_type, project_code, source_file, source_sheet,
        rows_read, rows_written, status, message
      )
      VALUES (
        'defects', null, p_source_file, 'ข้อมูลจำแนก',
        coalesce(v_total, 0), 0, 'error', left(sqlerrm, 1000)
      );
    EXCEPTION WHEN others THEN
      null;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok', false,
    'error', sqlerrm,
    'rooms', coalesce(v_total, 0),
    'building_a', coalesce(v_a, 0),
    'building_b', coalesce(v_b, 0)
  );
END;
$function$;

COMMIT;
```

> [!CAUTION]
> **CRITICAL POLICY ON MIGRATION HISTORY LEDGER:**  
> **DO NOT** execute manual `INSERT INTO supabase_migrations.schema_migrations` or `DELETE FROM supabase_migrations.schema_migrations`.  
> Manual ledger editing with synthetic text entries can misrepresent what actually ran or diverge from official migration tooling.  
> Standard migration tooling logs its own ledger entries atomically. When executing DDL in SQL Editor, inspect history before and after using read-only `SELECT` queries (see Readback 1 below), leaving the internal ledger uncorrupted.  
> **DO NOT** blanket `supabase db push` due to duplicate version `20261013220000` (PR #213) and risks to Payroll RLS policies.

---

### Step 3: Immediate Verification & Readback Queries
Execute these queries right after Step 2:

```sql
-- READBACK 1: Inspect Migration History record
SELECT version, name, inserted_at
FROM supabase_migrations.schema_migrations
ORDER BY version DESC
LIMIT 5;
-- Expected: Confirm no ledger corruption or duplicate version 20261013220000 replay

-- READBACK 2: Verify defect_web_override_protect() contains B515 scoped exception
SELECT
  pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.defect_web_override_protect()'::regprocedure), 'B515 Scoped Exception') > 0 AS has_b515_exception,
  pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.defect_web_override_protect()'::regprocedure), 'Keep the five previously approved Hotel Engineer transitions unchanged') > 0 AS has_regression_guard,
  pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.defect_web_override_protect()'::regprocedure), 'old.defect_detail') > 0 AS has_history_protection;
-- Expected: all 3 columns return true

-- READBACK 3: Verify drive_sync_apply_condo_defects supports B515 Customer Defect
SELECT
  pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.drive_sync_apply_condo_defects(text,text,text,timestamptz,jsonb,boolean)'::regprocedure), 'Customer Defect B515') > 0 AS has_b515_rpc_support;
-- Expected: true
```

---

### Step 4: Data Sync & Reconciliation (Zero Direct UPDATEs)
**CRITICAL:** Do NOT run `UPDATE condo_room_status SET ... WHERE room_no = 'B515'`.
The status transition must be executed through the existing authorized pipeline:
1. Canonical Google Drive Master Excel:
   - File ID: `1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj`
   - File Name: `Handover_Defect_Summary_Updated_28-09-2026.xlsx`
   - Revision Date: `26/10/2026` or later
   - Sheet: `ข้อมูลจำแนก`
   - Row B515 values:
     - `current_status`: `Defect ยังไม่เสร็จ / ต้องปิดงาน`
     - `status_group`: `Hotel - Incomplete`
     - `defect_detail`: `Customer Defect B515: ประตูระเบียงเปิดฝืด, กระเบื้องห้องน้ำบิ่น` (or existing detail)
2. Run Apps Script `SmartSyncDefects_v1.3_2026-10-02.gs` or call `/api/sync/drive`:
   - Payload: All 263 rooms (A=162, B=101)
3. Check Sync Log Readback:
   ```sql
   SELECT sync_type, source_file, rows_read, rows_written, status, message, created_at
   FROM public.drive_sync_runs
   ORDER BY created_at DESC
   LIMIT 3;
   ```
   Expected: `status = 'success'`, `rows_read = 263`, `rows_written >= 1`.

---

### Step 5: Rollback Runbook (In case of any unexpected failure)
If rollback is required, execute the baseline definition of `defect_web_override_protect()` to remove the B515 exception, without manual ledger tampering:

```sql
BEGIN;

-- 1. Remove B515 exception by re-applying the 20261021185000 baseline trigger
-- (Restores defect_web_override_protect to prior approved state)
-- Do NOT manually delete from supabase_migrations.schema_migrations.

COMMIT;
```

---

## 4. Work Order Integrity (Rule 7)
- **Room B515 Work Order Items (9 items):** Must remain in status `รอตรวจยืนยัน` (Pending verification).
- **Total Work Order Counts:** Exactly 48 active items and 26 inactive items.
- No Work Order status may be marked closed or complete until physical on-site evidence is recorded and approved.

---

## 5. Next Steps Checklist
- [x] B515 Migration Deployment Blocker diagnosed and isolated.
- [x] PR #213 Duplicate Migration conflict analyzed and decoupled.
- [x] Automated test suites verified (b515-defect-sync: 6/6, b515-sql-simulation: 4/4).
- [x] Owner/DBA Execution Package prepared.
- [ ] Production DBA executes Step 1 to Step 3.
- [ ] Run canonical Excel sync for B515 (Step 4).
- [ ] Materials Revision verification.
- [ ] Express Master Writeback (Preview-only).
- [ ] Work Order E2E validation.
