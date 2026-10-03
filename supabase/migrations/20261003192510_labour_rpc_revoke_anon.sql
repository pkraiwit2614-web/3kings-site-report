revoke execute on function public.labour_verify_batch(uuid,text,jsonb) from anon;
revoke execute on function public.labour_confirm_supervisor_mapping(uuid,text) from anon;
grant execute on function public.labour_verify_batch(uuid,text,jsonb) to authenticated;
grant execute on function public.labour_confirm_supervisor_mapping(uuid,text) to authenticated;
