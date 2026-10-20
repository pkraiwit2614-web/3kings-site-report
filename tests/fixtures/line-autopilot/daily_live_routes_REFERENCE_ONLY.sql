-- Isolated LIVE route choices for Daily Site Report only.
-- Do not weaken staged-only constraints on legacy LINE auto-pilot tables.
CREATE TABLE IF NOT EXISTS line_autopilot.daily_live_routes (
  site_code text PRIMARY KEY CHECK(site_code IN ('above_villa','above_condo_a','above_condo_b')),
  group_id text NOT NULL UNIQUE REFERENCES line_autopilot.group_candidates(group_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  expected_group_name text NOT NULL,
  report_site text NOT NULL CHECK(report_site IN ('above_villa','above_condo')),
  enabled boolean NOT NULL DEFAULT false,
  owner_approved_at timestamptz,
  staged_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_route_mapping CHECK(
    (site_code='above_villa' AND report_site='above_villa' AND expected_group_name='Above Villa progress')
    OR (site_code='above_condo_a' AND report_site='above_condo' AND expected_group_name='Above condo ตึก A')
    OR (site_code='above_condo_b' AND report_site='above_condo' AND expected_group_name='Above condo ตึก B')
  ),
  CONSTRAINT daily_route_approval CHECK(NOT enabled OR owner_approved_at IS NOT NULL)
);
ALTER TABLE line_autopilot.daily_live_routes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON line_autopilot.daily_live_routes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON line_autopilot.daily_live_routes TO service_role;
INSERT INTO line_autopilot.daily_live_routes(site_code,group_id,expected_group_name,report_site)
SELECT r.site_code,r.group_id,c.group_name,
  CASE WHEN r.site_code='above_villa' THEN 'above_villa' ELSE 'above_condo' END
FROM line_autopilot.site_group_routes r
JOIN line_autopilot.group_candidates c ON c.group_id=r.group_id
WHERE r.site_code IN ('above_villa','above_condo_a','above_condo_b')
  AND c.verified_member IS TRUE
  AND (
   (r.site_code='above_villa' AND c.group_name='Above Villa progress')
   OR (r.site_code='above_condo_a' AND c.group_name='Above condo ตึก A')
   OR (r.site_code='above_condo_b' AND c.group_name='Above condo ตึก B')
  )
ON CONFLICT(site_code) DO NOTHING;
CREATE OR REPLACE FUNCTION public.line_autopilot_daily_route(p_site_code text)
RETURNS TABLE(site_code text, group_id text, group_name text, would_send_line boolean, decision text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $function$
 SELECT r.site_code,c.group_id,c.group_name,
   (r.enabled IS TRUE AND r.owner_approved_at IS NOT NULL
      AND c.verified_member IS TRUE AND c.group_name=r.expected_group_name
      AND ((r.site_code='above_villa' AND r.report_site='above_villa')
        OR (r.site_code IN ('above_condo_a','above_condo_b') AND r.report_site='above_condo'))
   ) AS would_send_line,
   CASE
    WHEN c.verified_member IS DISTINCT FROM TRUE THEN 'BLOCK_GROUP_NOT_VERIFIED'
    WHEN c.group_name<>r.expected_group_name THEN 'BLOCK_GROUP_NAME_CHANGED'
    WHEN r.owner_approved_at IS NULL THEN 'BLOCK_OWNER_APPROVAL_REQUIRED'
    WHEN r.enabled IS DISTINCT FROM TRUE THEN 'BLOCK_DAILY_ROUTE_OFF'
    ELSE 'ELIGIBLE_SUBJECT_TO_MANUAL_REPORT_QA'
   END AS decision
 FROM line_autopilot.daily_live_routes r
 JOIN line_autopilot.group_candidates c ON c.group_id=r.group_id
 WHERE p_site_code IN ('above_villa','above_condo_a','above_condo_b')
   AND r.site_code=p_site_code
$function$;
REVOKE ALL ON FUNCTION public.line_autopilot_daily_route(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.line_autopilot_daily_route(text) TO service_role;
