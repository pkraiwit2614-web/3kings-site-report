-- Daily LINE dedicated limited scope bridge; no project service key in Worker.
CREATE TABLE IF NOT EXISTS line_autopilot.daily_bridge_keys(
 name text PRIMARY KEY CHECK(name='line_daily'),
 secret_hash bytea NOT NULL,
 active boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE line_autopilot.daily_bridge_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON line_autopilot.daily_bridge_keys FROM PUBLIC,anon,authenticated;
GRANT SELECT ON line_autopilot.daily_bridge_keys TO service_role;
CREATE OR REPLACE FUNCTION public.daily_line_bridge_validate(p_token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $function$
 SELECT current_user='service_role'
   AND p_token ~ '^[0-9a-f]{96}$'
   AND EXISTS(
     SELECT 1 FROM line_autopilot.daily_bridge_keys k
     WHERE k.name='line_daily' AND k.active IS TRUE
      AND k.secret_hash=extensions.digest(convert_to(p_token,'UTF8'),'sha256')
   );
$function$;
REVOKE ALL ON FUNCTION public.daily_line_bridge_validate(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.daily_line_bridge_validate(text) TO service_role;
