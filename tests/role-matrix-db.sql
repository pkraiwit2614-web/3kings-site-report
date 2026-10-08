-- Run in a transaction and always ROLLBACK; no user/business data changes.
begin;
create temp table matrix_cases as select distinct on(role) role,user_id from public.profiles where active and role in ('manager','admin','viewer','viewer_editor','purchase','defect_contributor','defect_editor') order by role,user_id;
create temp table matrix_rpc as
select p.proname, 'select public.'||p.proname||'('||(select string_agg('null::'||format_type(t,null),',') from unnest(p.proargtypes::oid[]) t)||')' as call
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
and p.proname in ('schedule_save_web_override','work_calendar_create','work_calendar_save_event','work_calendar_update','work_calendar_delete','work_calendar_delete_event','defect_submit_manual_details','defect_manual_update_apply','defect_register_validated_file','defect_forget_rejected_upload','procurement_save_web_override','site_operations_save_management_review','labour_verify_batch','labour_confirm_headcount','payroll_save_verification')
and has_function_privilege('authenticated',p.oid,'EXECUTE');
create temp table matrix_baseline as select count(*) as payroll_count from public.payroll_verification_records;
grant select on matrix_baseline to authenticated;
create temp table matrix_results(role text,checks integer);
grant select on matrix_cases,matrix_rpc to authenticated;
grant insert,select on matrix_results to authenticated;
set local role authenticated;
do $$
declare c record;r record;v_error text; expected boolean; n integer; checks integer;
begin
 for c in select * from matrix_cases loop
  perform set_config('request.jwt.claim.sub',c.user_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',c.user_id,'role','authenticated')::text,true);
  checks:=0;
  select count(*) into n from public.projects;
  if (n>0) is distinct from (c.role not in ('defect_contributor','defect_editor')) then raise exception 'project leak/denial %',c.role; end if;
  select count(*) into n from public.condo_room_status;
  if n=0 then raise exception 'defect read denied %',c.role; end if;
  select count(*) into n from public.site_operations_entries;
  if (n>0) is distinct from (c.role not in ('defect_contributor','defect_editor')) then raise exception 'site ops leak/denial %',c.role; end if;
  select count(*) into n from public.payroll_verification_records;
  if n <> (case when c.role in ('defect_contributor','defect_editor') then 0 else (select payroll_count from matrix_baseline) end) then raise exception 'payroll leak/denial %',c.role; end if;
  checks:=checks+4;
  for r in select * from matrix_rpc loop
   expected:= c.role='manager' or
    (r.proname like 'defect_%' and c.role='defect_editor') or
    ((r.proname like 'schedule_%' or r.proname like 'work_calendar_%') and c.role='viewer_editor') or
    (r.proname like 'procurement_%' and c.role='purchase') or
    ((r.proname like 'site_operations_%' or r.proname like 'labour_%' or r.proname like 'payroll_%') and c.role='admin');
   v_error:=null;
   begin execute r.call; exception when others then v_error:=sqlerrm; end;
   if not expected and coalesce(v_error,'') not like 'NOT_AUTHORIZED%' then raise exception 'RPC allowed unexpectedly: % % %',c.role,r.proname,v_error; end if;
   if expected and (coalesce(v_error,'') like 'NOT_AUTHORIZED%' or coalesce(v_error,'') like 'permission denied%') then raise exception 'RPC denied unexpectedly: % % %',c.role,r.proname,v_error; end if;
   checks:=checks+1;
  end loop;
  insert into matrix_results values(c.role,checks);
 end loop;
end $$;
reset role;
select * from matrix_results order by role;
rollback;
