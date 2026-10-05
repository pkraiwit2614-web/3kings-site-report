-- Prompt 4 cutover: remove legacy write RPCs that do not carry optimistic-concurrency expectations.
-- Apply only after the Prompt 4 UI using the new signatures is live in Production.

drop function if exists public.labour_verify_batch(uuid,text,jsonb);
drop function if exists public.payroll_save_verification(uuid,text,text,text,text,jsonb);
