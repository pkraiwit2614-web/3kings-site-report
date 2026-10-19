-- Synthetic fixtures only. No production/customer rows or service credentials.
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE public.defect_web_overrides(
  room_no text PRIMARY KEY,
  current_status text,status_group text,next_action text,detail_text text,
  source_sync_state text NOT NULL,updated_at timestamptz NOT NULL,
  source_synced_at timestamptz
);
CREATE TABLE public.condo_room_status(
  room_no text PRIMARY KEY, current_status text,status_group text,
  next_action text,defect_detail text,latest_source text,
  source_file_id text,source_file_name text,
  source_modified_at timestamptz,
  synced_at timestamptz DEFAULT now()
);

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
CREATE TRIGGER defect_web_override_before_sync BEFORE UPDATE ON
  public.condo_room_status FOR EACH ROW EXECUTE FUNCTION public.defect_web_override_protect();

INSERT INTO public.defect_web_overrides (
  room_no,current_status,status_group,next_action,detail_text,source_sync_state,updated_at,source_synced_at
) VALUES
('A212','Hotel checked','Hotel - Checked Complete','Web acknowledged','Retained history','synced','2026-10-17 08:00+07','2026-10-17 08:05+07'),
('A313','Checked','Hotel - Checked Complete','Pending web edit','Web edited details','pending','2026-10-19 08:00+07',null),
('B208','Hotel awaiting','Hotel - Awaiting Check','Web old','Keep exact note','synced','2026-10-14 08:00+07','2026-10-14 08:05+07'),
('B314','Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ','Hotel - Awaiting Check','Protected special','History special','synced','2026-10-17 08:00+07','2026-10-17 08:05+07');

INSERT INTO public.condo_room_status (
  room_no,current_status,status_group,next_action,defect_detail,latest_source,
  source_file_id,source_file_name,source_modified_at
) VALUES
('A212','Hotel checked','Hotel - Checked Complete','Web acknowledged','Retained history','Prior',
  '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj','Handover_Defect_Summary_Updated_28-09-2026.xlsx','2026-10-17 08:05+07'),
('A313','Checked','Hotel - Checked Complete','Pending web edit','Web edited details','Web App manual update',
  '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj','Handover_Defect_Summary_Updated_28-09-2026.xlsx','2026-10-17 08:05+07'),
('B208','Hotel awaiting','Hotel - Awaiting Check','Web old','Keep exact note','Prior',
  '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj','Handover_Defect_Summary_Updated_28-09-2026.xlsx','2026-10-14 08:05+07'),
('B314','Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ','Hotel - Awaiting Check','Protected special','History special','Prior',
  '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj','Handover_Defect_Summary_Updated_28-09-2026.xlsx','2026-10-17 08:05+07'),
('A401','Pending Handover','Non-Hotel','Original no override',null,'Prior',
  '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj','Handover_Defect_Summary_Updated_28-09-2026.xlsx','2026-10-17 08:05+07');
