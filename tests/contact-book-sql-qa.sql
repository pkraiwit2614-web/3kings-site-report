\set ON_ERROR_STOP on
create role authenticated;
create role anon;
create schema private;
create schema auth;
create table private.role_permission_matrix(role text,module text,level text);
insert into private.role_permission_matrix values
 ('owner','contact_book','manage'),('purchase','contact_book','manage'),
 ('viewer','contact_book','view'),('defect_editor','contact_book','none');
create function private.matrix_role() returns text language sql stable security definer
 set search_path='' as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
create function auth.uid() returns uuid language sql stable
 as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table private.contact_book_audit(
 actor uuid not null,contact_id text not null,previous_data jsonb,
 new_data jsonb not null,drive_version text not null
);
\i supabase/migrations/20261021235000_contact_book_directory.sql
insert into public.contact_book_directory(entries)
 select jsonb_agg(jsonb_build_object(
  'contact_id','3KC-'||lpad(n::text,4,'0'),
  'category','ร้านค้า','service_group','วัสดุ','organization','ร้าน'||n,
  'contact_name','ผู้ติดต่อ'||n,'phone','081'||lpad(n::text,7,'0'),
  'work_scope','ทดสอบ','project_area','Above Villa',
  'verified_status','รอตรวจ','review_note','','source_file','synthetic',
  'source_url','','source_reference_date','21/10/2026',
  'secondary_phone','','active','ใช่','aliases',''
 )) from generate_series(1,41) n;
do $$begin
 if has_table_privilege('authenticated','public.contact_book_directory','UPDATE')
 then raise exception 'direct update leaked';end if;
 if has_table_privilege('anon','public.contact_book_directory','SELECT')
 then raise exception 'anonymous directory read leaked';end if;
end$$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select set_config('request.jwt.claim.role','viewer',false);
do $$begin
 if not public.contact_book_can('view') or public.contact_book_can('manage')
 then raise exception 'viewer matrix incorrect';end if;
 if (select count(*) from public.contact_book_directory)<>1
 then raise exception 'viewer read denied';end if;
end$$;
select set_config('request.jwt.claim.role','defect_editor',false);
do $$begin
 if public.contact_book_can('view') or (select count(*) from public.contact_book_directory)<>0
 then raise exception 'defect role data leaked';end if;
end$$;
select set_config('request.jwt.claim.role','owner',false);
do $$
declare result jsonb;
begin
 result:=public.contact_book_save(1,null,jsonb_build_object(
  'category','ภายใน','service_group','ประสานงาน','organization','3 Kings',
  'contact_name','ผู้ทดสอบ','phone','089-999-0001','work_scope','งานทดสอบ',
  'project_area','Above Condo','review_note','','secondary_phone','',
  'active','ใช่','aliases',''
 ));
 if result->>'sourceVersion'<>'2' or result->'record'->>'contact_id'<>'3KC-0042'
 then raise exception 'initial insert result invalid';end if;
end$$;
do $$
declare succeeded boolean:=false;
begin
 begin
  perform public.contact_book_save(1,null,jsonb_build_object(
   'category','ภายใน','service_group','ประสานงาน','organization','3 Kings',
   'contact_name','ผู้ทดสอบ','phone','089-999-0002','work_scope','งานทดสอบ',
   'project_area','Above Condo','review_note','','secondary_phone','',
   'active','ใช่','aliases',''
  ));
 exception when others then
  if position('contact_book_version_conflict' in sqlerrm)>0 then succeeded:=true;end if;
 end;
 if not succeeded then raise exception 'stale revision should fail';end if;
end$$;
do $$
declare succeeded boolean:=false;
begin
 begin
  perform public.contact_book_save(2,null,jsonb_build_object(
   'category','ภายใน','service_group','ประสานงาน','organization','3 Kings',
   'contact_name','ผู้ทดสอบ','phone','0810000001','work_scope','งานทดสอบ',
   'project_area','Above Condo','review_note','','secondary_phone','',
   'active','ใช่','aliases',''
  ));
 exception when others then
  if position('duplicate_contact_phone' in sqlerrm)>0 then succeeded:=true;end if;
 end;
 if not succeeded then raise exception 'duplicate phone should fail';end if;
end$$;
reset role;
do $$begin
 if (select jsonb_array_length(entries) from public.contact_book_directory where id=1)<>42
 then raise exception 'contacts changed unexpectedly';end if;
 if (select count(*) from private.contact_book_audit)<>1
 then raise exception 'audit missing';end if;
end$$;
