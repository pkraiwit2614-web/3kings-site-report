-- Phase 1 preflight only. SELECT statements; NEVER apply GRANT/REVOKE
-- directly to Production based solely on linter counts.
-- Review EACH result against actual callers, API routes, role matrix and
-- Supabase Local negative tests before proposing any ACL migration.
select
  p.oid::regprocedure::text as rpc_signature,
  p.prosecdef as security_definer,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') as service_role_can_execute,
  case
    when p.prosecdef and has_function_privilege('anon',p.oid,'EXECUTE') then 'REVIEW_ANON_DEFINER'
    when p.prosecdef and has_function_privilege('authenticated',p.oid,'EXECUTE') then 'REVIEW_AUTH_DEFINER'
    else 'NO_DEFINER_PUBLIC_WARNING'
  end as audit_category
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
order by audit_category, rpc_signature;
