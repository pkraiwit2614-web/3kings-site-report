-- Close direct Data API writes to official Payroll tables.
-- Applied to Production as migration 20261005032447.
-- Authenticated writes must go through payroll_save_verification().

revoke all on table public.payroll_verification_records from anon;
revoke all on table public.payroll_verification_items from anon;

revoke insert, update, delete on table public.payroll_verification_records from authenticated;
revoke insert, update, delete on table public.payroll_verification_items from authenticated;
grant select on table public.payroll_verification_records to authenticated;
grant select on table public.payroll_verification_items to authenticated;

alter function public.payroll_save_verification(uuid,text,text,text,text,jsonb)
  security definer;
alter function public.payroll_save_verification(uuid,text,text,text,text,jsonb)
  set search_path = '';

revoke execute on function public.payroll_save_verification(uuid,text,text,text,text,jsonb)
  from public, anon;
grant execute on function public.payroll_save_verification(uuid,text,text,text,text,jsonb)
  to authenticated;
