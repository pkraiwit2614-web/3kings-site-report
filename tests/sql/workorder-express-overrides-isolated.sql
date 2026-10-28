\set ON_ERROR_STOP on
-- Ephemeral PostgreSQL fixture; no Production credentials or writes.
create role anon; create role authenticated; create role service_role;
create schema private;
grant usage on schema private to authenticated;
create function private.is_active_user() returns boolean language sql as $$select true$$;
create function private.matrix_allowed(text,text,boolean) returns boolean language sql as $$select true$$;
create function private.drive_sync_key_valid(text) returns boolean language sql as $$select $1='isolated-only-test-key'$$;

create table public.condo_room_status(room_no text primary key);
insert into public.condo_room_status values('A101'),('B603');
create table public.defect_work_order_snapshot
(work_id text primary key, source_active boolean not null, work_status text, source_modified_at timestamptz);
insert into public.defect_work_order_snapshot
select 'DF-B603-LIVE'||i::text,(i<=48),'ยังไม่เริ่ม',now()-interval '1 day'
from generate_series(1,74) i;

create table public.express_register_rows (
 batch_id uuid not null,document_group text not null,document_no text not null,line_seq int not null,
 document_date text,supplier text,plot_codes text[] not null default '{}',qa_status text not null,
 source_file text,source_url text,item_code text,description text,quantity numeric,unit text,
 unit_price numeric,line_amount numeric,grand_total numeric,search_text text not null default '',
 primary key(batch_id,document_group,document_no,line_seq)
);
alter table public.express_register_rows enable row level security;
grant select on public.express_register_rows to authenticated;
create policy express_read_test on public.express_register_rows for select to authenticated using(true);
insert into public.express_register_rows
(batch_id,document_group,document_no,line_seq,supplier,plot_codes,qa_status,grand_total,search_text)
values
('00000000-0000-4000-8000-000000000001','PO_PL','PL0000976',0,
 'พี เฟอร์ จำกัด /AP-0159',array[]::text[],'HOLD_UNASSIGNED_PLOT',4387,'PL0000976'),
('00000000-0000-4000-8000-000000000001','PO_PL','PL0000850',0,
 'เอ. ออโต้เกทภูเก็ต /AP-0038',array[]::text[],'HOLD_UNASSIGNED_PLOT',12091,'PL0000850'),
('00000000-0000-4000-8000-000000000001','PO_PL','PL0000973',0,
 'พิชญะ /AP-2379',array[]::text[],'HOLD_UNASSIGNED_PLOT',12000,'PL0000973'),
('00000000-0000-4000-8000-000000000001','PO_PL','PO691027002',0,
 'เกาะแก้วค้าไม้ /AP-0075',array[]::text[],'HOLD_UNASSIGNED_PLOT',9758.40,'PO691027002'),
('00000000-0000-4000-8000-000000000002','PO_PL','PL0000976',0,
 'พี เฟอร์ จำกัด /AP-0159',array[]::text[],'HOLD_UNASSIGNED_PLOT',4387,'new batch'),
('00000000-0000-4000-8000-000000000002','PO_PL','PL0000850',0,
 'เอ. ออโต้เกทภูเก็ต /AP-0038',array[]::text[],'HOLD_UNASSIGNED_PLOT',12091,'new batch'),
('00000000-0000-4000-8000-000000000002','PO_PL','PL0000976',1,
 'พี เฟอร์ จำกัด /AP-0159',array[]::text[],'HOLD_UNASSIGNED_PLOT',null,'line');
-- This file is run from repo root in CI.
\i supabase/migrations/20261029024500_express_project_override_read_view.sql
\i supabase/migrations/20261029025000_nonretiring_work_order_stage.sql

do $$
declare c integer; v jsonb; r jsonb; b jsonb;
begin
 select count(*) into c from public.express_register_rows where cardinality(plot_codes)=0;
 if c<>7 then raise exception 'raw registry mutated: %',c;end if;
 select count(*) into c from public.express_register_effective_rows
  where document_no='PL0000976' and plot_codes=array['CONDO-B']
    and qa_status='VERIFIED_PROJECT_OVERRIDE' and project_evidence_url is not null;
 if c<>3 then raise exception 'PL0000976 overlay missing (including new batch and line): %',c;end if;
 select count(*) into c from public.express_register_effective_rows
  where document_no='PL0000850' and plot_codes=array['PROUD-KARON'];
 if c<>2 then raise exception 'PL0000850 overlay missing on new batch';end if;
 select count(*) into c from public.express_register_effective_rows
  where document_no in ('PL0000973','PO691027002') and qa_status='HOLD_UNASSIGNED_PLOT'
    and cardinality(plot_codes)=0;
 if c<>2 then raise exception 'unverified project auto-mapped';end if;
 -- Simulate one actor's import for 82 source-only IDs, none previously present.
 select jsonb_agg(jsonb_build_object(
  'work_id','DF-A101-Q'||lpad(i::text,3,'0'),
  'room_group','A101','building','A','contractor','3 Kings',
  'defect_item','Fixtures for isolated test',
  'source_work_status','ยังไม่เริ่ม',
  'stage_decision',case when i<=63 then 'STAGE_REVERIFY_NO_DB_WRITE'
    when i<=75 then 'STAGE_HISTORY_ONLY' when i<=81 then 'HOLD_MISSING_EVIDENCE'
    else 'DENY_DISPATCH' end,
  'source_master_row',i+1,
  'payload',jsonb_build_object('fixture_id',i)
  )) into v from generate_series(1,82) i;
 select public.defect_work_order_nonretiring_stage_import(
   'bad-key','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',now(),v,true) into b;
 if b->>'error'<>'invalid_sync_key' then raise exception 'key security gate failed';end if;
 select public.defect_work_order_nonretiring_stage_import(
   'isolated-only-test-key','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',now(),v,true) into r;
 if not (r->>'ok')::boolean or (r->>'production_mutation')<>'0' then
  raise exception 'dry-run failed %',r;end if;
 if (select count(*) from public.defect_work_order_import_staging)<>0 then
  raise exception 'dry-run wrote staging';end if;
 select public.defect_work_order_nonretiring_stage_import(
   'isolated-only-test-key','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',now(),v,false) into r;
 if (r->>'staged')<>'82' then raise exception 'stage failed %',r;end if;
 if (select count(*) from public.defect_work_order_import_staging)<>82 then
  raise exception 'not all staged';end if;
 if (select count(*) from public.defect_work_order_snapshot)<>74 or
    (select count(*) from public.defect_work_order_snapshot where source_active)<>48 then
  raise exception 'PRODUCTION baseline changed';end if;
 -- Same source replay must be idempotent, no duplicated dispatch.
 select public.defect_work_order_nonretiring_stage_import(
   'isolated-only-test-key','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',now(),v,false) into r;
 if (r->>'changed')<>'0' then raise exception 'retry not idempotent %',r;end if;
 raise notice 'ALL ISOLATED WORK ORDER & EXPRESS QA CHECKS PASSED';
end $$;

-- Simulate authenticated procurement reader; verify security_invoker RLS wiring.
set role authenticated;
do $$ begin
 if (select count(*) from public.express_register_effective_rows where has_verified_project_override)<>5
 then raise exception 'authenticated RLS view overlay unavailable';end if;
 if (select count(*) from public.express_register_effective_rows
      where document_no in ('PL0000973','PO691027002') and qa_status='HOLD_UNASSIGNED_PLOT')<>2
 then raise exception 'RLS view released unassigned project';end if;
end $$;
reset role;
do $$ begin
 if has_table_privilege('anon','public.express_project_overrides','SELECT') or
    has_table_privilege('anon','public.express_register_effective_rows','SELECT') or
    has_table_privilege('authenticated','public.defect_work_order_import_staging','SELECT') or
    has_function_privilege('authenticated',
       'public.defect_work_order_nonretiring_stage_import(text,text,timestamptz,jsonb,boolean)','EXECUTE')
 then raise exception 'RBAC/RLS boundary regression';end if;
 raise notice 'AUTHENTICATED/ANON/RPC AUTHORIZATION CHECKS PASSED';
end $$;
