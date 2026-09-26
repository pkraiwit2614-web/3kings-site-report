-- V4.0 Reliability — Security hardening stage 1
-- Applied to production Supabase on 2026-09-26.
-- Keep Drive sync / photo archive public RPCs unchanged in this stage because
-- those external integrations currently authenticate with an application-level key.

alter view public.v_schedule_tasks set (security_invoker = true);

revoke all privileges on table public.v_schedule_tasks from anon;
revoke insert, update, delete, truncate, references, trigger on table public.v_schedule_tasks from authenticated;
grant select on table public.v_schedule_tasks to authenticated;

-- Trigger-only function: prevent direct Data API/RPC execution.
revoke execute on function public.capture_schedule_daily_snapshot() from public, anon, authenticated;
