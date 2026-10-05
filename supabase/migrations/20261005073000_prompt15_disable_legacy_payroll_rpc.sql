-- Prompt 15 closure: disable the obsolete 6-argument payroll RPC for client roles.
-- Current web clients use the 9-argument optimistic-concurrency signature from Prompt 4.
-- Keep owner/service_role access for controlled backend compatibility only.
REVOKE EXECUTE ON FUNCTION public.payroll_save_verification(uuid,text,text,text,text,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.payroll_save_verification(uuid,text,text,text,text,jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.payroll_save_verification(uuid,text,text,text,text,jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_save_verification(uuid,text,text,text,text,jsonb) TO service_role;
