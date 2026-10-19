-- SOP 01: canonical XLSX precedence with existing override/audit record retention.
-- No RLS, grant, table, history, or trigger attachment changes.
CREATE OR REPLACE FUNCTION public.defect_web_override_protect()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v public.defect_web_overrides%rowtype;
BEGIN
 IF pg_catalog.current_setting('app.defect_manual_update',true) IS DISTINCT FROM '1' THEN
   SELECT * INTO v FROM public.defect_web_overrides WHERE room_no=new.room_no;
   IF FOUND AND (
      v.source_sync_state IS DISTINCT FROM 'synced'
      OR new.source_file_id IS DISTINCT FROM '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj'
      OR new.source_file_name IS DISTINCT FROM 'Handover_Defect_Summary_Updated_28-09-2026.xlsx'
      OR new.source_modified_at IS NULL
      OR new.source_modified_at <= pg_catalog.greatest(
           coalesce(v.updated_at, '-infinity'::timestamptz),
           coalesce(v.source_synced_at, '-infinity'::timestamptz))
   ) THEN
      new.current_status=coalesce(v.current_status,new.current_status);
      new.status_group=coalesce(v.status_group,new.status_group);
      new.next_action=coalesce(v.next_action,new.next_action);
      new.defect_detail=coalesce(v.detail_text,new.defect_detail);
      IF v.source_sync_state <> 'synced' AND
         (v.current_status IS NOT NULL OR v.status_group IS NOT NULL OR v.next_action IS NOT NULL)
      THEN new.latest_source=old.latest_source;
      END IF;
   END IF;
 END IF;
 RETURN new;
END
$function$;