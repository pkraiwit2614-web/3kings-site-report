-- Synthetic fixture for B515 Isolated PostgreSQL QA.
-- No production credentials or customer data.
SET client_min_messages = warning;

CREATE SCHEMA IF NOT EXISTS private;

DO $role_setup$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
END
$role_setup$;

CREATE TABLE IF NOT EXISTS public.defect_web_overrides (
  room_no text PRIMARY KEY,
  current_status text,
  status_group text,
  next_action text,
  detail_text text,
  source_sync_state text NOT NULL DEFAULT 'synced',
  updated_at timestamptz NOT NULL DEFAULT now(),
  source_synced_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.condo_room_status (
  room_no text PRIMARY KEY,
  building text,
  floor integer,
  hotel_participation text,
  customer_status text,
  current_status text,
  status_group text,
  follow_up text,
  priority text,
  next_action text,
  defect_detail text,
  latest_source text,
  source_note text,
  hotel_complete_color text,
  hotel_remarks text,
  source_file_id text,
  source_file_name text,
  source_modified_at timestamptz,
  synced_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.drive_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type text,
  project_code text,
  source_file text,
  source_sheet text,
  rows_read integer,
  rows_written integer,
  status text,
  message text,
  created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION private.drive_sync_key_valid(p_key text)
RETURNS boolean
LANGUAGE sql
AS 'SELECT p_key = ''test_sync_key_only''';

-- Baseline defect_web_override_protect (prior to 20261019132800)
CREATE OR REPLACE FUNCTION public.defect_web_override_protect()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 v public.defect_web_overrides%rowtype;
 expected_status text;
 expected_group text;
 approved boolean := false;
BEGIN
 IF pg_catalog.current_setting('app.defect_manual_update',true) = '1' THEN RETURN new; END IF;
 SELECT * INTO v FROM public.defect_web_overrides WHERE room_no=new.room_no;
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
   IF NOT approved THEN new.current_status:=old.current_status; new.status_group:=old.status_group; END IF;
   new.next_action:=old.next_action;
   new.defect_detail:=old.defect_detail;
   new.latest_source:=CASE WHEN approved THEN new.latest_source ELSE old.latest_source END;
   RETURN new;
 END IF;
 -- All other rooms keep exactly the old Web-override behavior.
 IF FOUND THEN
   new.current_status=coalesce(v.current_status,new.current_status);
   new.status_group=coalesce(v.status_group,new.status_group);
   new.next_action=coalesce(v.next_action,new.next_action);
   new.defect_detail=coalesce(v.detail_text,new.defect_detail);
   IF v.source_sync_state <> 'synced' AND
      (v.current_status IS NOT NULL OR v.status_group IS NOT NULL OR v.next_action IS NOT NULL)
   THEN new.latest_source=old.latest_source; END IF;
 END IF;
 RETURN new;
END
$function$;

DROP TRIGGER IF EXISTS defect_web_override_before_sync ON public.condo_room_status;
CREATE TRIGGER defect_web_override_before_sync BEFORE UPDATE ON
  public.condo_room_status FOR EACH ROW EXECUTE FUNCTION public.defect_web_override_protect();

-- Pre-seed B515 baseline so the migration preflight passes
INSERT INTO public.condo_room_status (
  room_no, building, floor, hotel_participation, customer_status,
  current_status, status_group, follow_up, priority, next_action,
  defect_detail, latest_source, source_file_id, source_file_name, source_modified_at
) VALUES
  ('B515', 'B', 5, 'ร่วมโรงแรม', 'มีลูกค้า',
   'Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ', 'Hotel - Awaiting Check', 'รอติดตาม', 'normal', 'รอตรวจยืนยัน',
   'Customer Defect B515: 9 customer defect items awaiting inspection [SYNTHETIC TEST]', 'Prior sync',
   '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj', 'Handover_Defect_Summary_Updated_28-09-2026.xlsx', '2026-10-25 08:00:00+00')
ON CONFLICT (room_no) DO NOTHING;
