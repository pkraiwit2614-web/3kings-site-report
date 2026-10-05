-- Allow only the internal Labour trigger to invalidate Payroll after direct client DML was revoked.
alter function public.labour_payroll_guard_row() security definer;
alter function public.labour_payroll_guard_row() set search_path='';
revoke execute on function public.labour_payroll_guard_row() from public,anon,authenticated;
