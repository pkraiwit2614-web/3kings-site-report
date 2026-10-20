-- 3 Kings Daily LINE: one owner-only morning delivery summary per report date.
-- No historical rows changed. Existing sender and sync_failure rules remain.
BEGIN;

-- Preserve the pre-existing target-scope policy; additionally allow only the
-- daily_site_report kind to write a single owner-scoped audit record.
ALTER TABLE line_autopilot.deliveries
  DROP CONSTRAINT operating_group_only;
ALTER TABLE line_autopilot.deliveries
  ADD CONSTRAINT operating_group_only CHECK (
    alert_kind='sync_failure'
    OR (alert_kind='daily_site_report' AND target_scope='owner')
    OR target_scope IN ('main_group','site_group')
  );

CREATE OR REPLACE FUNCTION public.line_autopilot_claim(
 p_event_key text,p_alert_kind text,p_target_scope text,p_summary text)
RETURNS TABLE(claim_status text,retry_key uuid)
LANGUAGE plpgsql SET search_path TO ''
AS $function$
declare v_key uuid;
declare v_status text;
begin
  if p_event_key is null or p_event_key !~ '^[0-9a-f]{64}$'
    or p_alert_kind not in ('sync_failure','defect_overdue','po_materials','daily_site_report','weekly_recap')
    or p_target_scope not in ('owner','main_group','site_group')
    or p_summary is null or char_length(p_summary) not between 4 and 400
    or (p_alert_kind='sync_failure' and p_target_scope<>'owner')
    or (p_target_scope='owner' and p_alert_kind not in ('sync_failure','daily_site_report')) then
    raise exception 'Invalid LINE AutoPilot claim' using errcode='22023';
  end if;
  insert into line_autopilot.deliveries(event_key,alert_kind,target_scope,summary)
    values(p_event_key,p_alert_kind,p_target_scope,p_summary)
    on conflict (event_key) do nothing
    returning line_autopilot.deliveries.retry_key into v_key;
  if v_key is not null then
    return query select 'new'::text,v_key;
    return;
  end if;
  select d.delivery_status,d.retry_key into v_status,v_key
    from line_autopilot.deliveries d where d.event_key=p_event_key;
  if v_key is null then
    raise exception 'LINE AutoPilot claim conflict' using errcode='40001';
  end if;
  return query select
    (case when v_status='delivered' then 'already_sent' else 'in_flight' end)::text,v_key;
end
$function$;

-- Readback is service-role only. Deliberately excludes LINE group/user IDs,
-- token fields, work-report content, and any raw data.
CREATE OR REPLACE FUNCTION public.line_autopilot_daily_owner_summary(p_report_date date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path TO ''
AS $function$
DECLARE v_routes jsonb;
BEGIN
 IF current_user <> 'service_role' THEN
   RAISE EXCEPTION 'SERVICE_ROLE_ONLY' USING ERRCODE='42501';
 END IF;
 IF p_report_date IS NULL OR p_report_date < '2026-10-20'::date THEN
   RAISE EXCEPTION 'BLOCK_REPORT_DATE' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(jsonb_agg(
   jsonb_build_object(
     'site_code',r.site_code,
     'form_status',coalesce(form_delivery.delivery_status,'missing'),
     'form_http',form_delivery.last_http_status,
     'image_status',coalesce(image_delivery.delivery_status,'missing'),
     'image_http',image_delivery.last_http_status
   ) ORDER BY r.site_code), '[]'::jsonb)
 INTO v_routes
 FROM line_autopilot.daily_live_routes r
 LEFT JOIN LATERAL (
   SELECT k.delivery_status,k.last_http_status
   FROM line_autopilot.daily_delivery_detail d
   JOIN line_autopilot.deliveries k ON k.event_key=d.event_key
   WHERE d.report_date=p_report_date
     AND d.site_code=r.site_code AND d.stage='form_text'
   ORDER BY d.created_at DESC LIMIT 1
 ) form_delivery ON true
 LEFT JOIN LATERAL (
   SELECT k.delivery_status,k.last_http_status
   FROM line_autopilot.daily_delivery_detail d
   JOIN line_autopilot.deliveries k ON k.event_key=d.event_key
   WHERE d.report_date=p_report_date
     AND d.site_code=r.site_code AND d.stage='image'
   ORDER BY d.created_at DESC LIMIT 1
 ) image_delivery ON true
 WHERE r.site_code IN ('above_villa','above_condo_a','above_condo_b');
 RETURN jsonb_build_object(
  'report_date',p_report_date,
  'sites',v_routes,
  'qa_published',EXISTS(
    SELECT 1 FROM line_autopilot.daily_report_runs v
    WHERE v.report_date=p_report_date
    AND (v.completed_at AT TIME ZONE 'Asia/Bangkok')::date =
       (now() AT TIME ZONE 'Asia/Bangkok')::date
    AND v.qa @> '{"png4Verified":true}'::jsonb)
 );
END
$function$;

REVOKE ALL ON FUNCTION public.line_autopilot_daily_owner_summary(date)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.line_autopilot_daily_owner_summary(date)
 TO service_role;
COMMIT;
