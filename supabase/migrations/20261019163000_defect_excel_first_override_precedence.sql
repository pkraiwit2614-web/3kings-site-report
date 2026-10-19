-- SOP 01 five-room, two-field approval gate. Fail closed for drift.
-- Preserve existing Web overrides and audit. No table/RLS/role changes.
CREATE OR REPLACE FUNCTION public.defect_web_override_protect()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 v public.defect_web_overrides%rowtype;
 expected_status text;
 expected_group text;
 approved boolean := false;
BEGIN
 IF pg_catalog.current_setting('app.defect_manual_update',true) = '1' THEN
   RETURN new;
 END IF;
 SELECT * INTO v FROM public.defect_web_overrides WHERE room_no=new.room_no;
 IF new.room_no IN ('B214','B314','B315','B403','B515') THEN
   -- Approved source must be the exact master; timestamps alone never authorize edits.
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
   -- These fields are NOT approved for Excel-first reconciliation.
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