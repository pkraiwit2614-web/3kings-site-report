-- Validate any existing Supabase service-role API key without storing or
-- logging its value. Server-only: not executable by anon or authenticated.
CREATE OR REPLACE FUNCTION public.daily_line_verify_server_access()
RETURNS boolean LANGUAGE sql SECURITY INVOKER STABLE SET search_path TO ''
AS $function$
SELECT current_user='service_role';
$function$;
REVOKE ALL ON FUNCTION public.daily_line_verify_server_access() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.daily_line_verify_server_access() TO service_role;
