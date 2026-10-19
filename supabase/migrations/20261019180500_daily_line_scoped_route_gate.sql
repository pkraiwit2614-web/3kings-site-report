-- Isolated route gate: no modifications to the legacy preview function.
-- Service-role only, gated by per-route, candidate, notification type and site rule.
CREATE OR REPLACE FUNCTION public.line_autopilot_daily_route(p_site_code text)
RETURNS TABLE(
  site_code text,
  group_id text,
  group_name text,
  would_send_line boolean,
  decision text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $function$
SELECT
  r.site_code, c.group_id, c.group_name,
  (c.verified_member IS TRUE
   AND c.approved IS TRUE
   AND r.notifications_enabled IS TRUE
   AND sr.delivery_enabled IS TRUE
   AND nt.delivery_enabled IS TRUE
   AND r.target_scope='site_group'
   AND (
      (r.site_code='above_villa' AND c.group_name='Above Villa progress')
      OR (r.site_code='above_condo_a' AND c.group_name='Above condo ตึก A')
      OR (r.site_code='above_condo_b' AND c.group_name='Above condo ตึก B')
   )
  ) AS would_send_line,
  CASE
    WHEN c.verified_member IS DISTINCT FROM TRUE THEN 'BLOCK_NOT_VERIFIED'
    WHEN c.approved IS DISTINCT FROM TRUE THEN 'BLOCK_UNAPPROVED_GROUP'
    WHEN r.notifications_enabled IS DISTINCT FROM TRUE THEN 'BLOCK_ROUTE_OFF'
    WHEN sr.delivery_enabled IS DISTINCT FROM TRUE THEN 'BLOCK_RULE_OFF'
    WHEN nt.delivery_enabled IS DISTINCT FROM TRUE THEN 'BLOCK_TYPE_OFF'
    ELSE 'ELIGIBLE_PENDING_REPORT_QA'
  END AS decision
FROM line_autopilot.site_group_routes r
JOIN line_autopilot.group_candidates c ON c.group_id=r.group_id
LEFT JOIN line_autopilot.site_notification_rules sr
  ON sr.site_code=r.site_code AND sr.alert_kind='daily_site_report'
LEFT JOIN line_autopilot.notification_types nt ON nt.alert_kind='daily_site_report'
WHERE p_site_code IN ('above_villa','above_condo_a','above_condo_b')
  AND r.site_code=p_site_code
$function$;
REVOKE ALL ON FUNCTION public.line_autopilot_daily_route(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.line_autopilot_daily_route(text) TO service_role;
