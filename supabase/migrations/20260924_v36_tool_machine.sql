create table if not exists public.tool_machine (
  id uuid primary key default gen_random_uuid(),
  item_no integer,
  item_code text not null,
  category text,
  item_name text not null,
  brand text,
  model_spec text,
  quantity numeric,
  unit text,
  status text,
  location text,
  source_updated_at date,
  responsible_person text,
  notes text,
  source_sheet text,
  source_row integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tool_machine_item_code_idx on public.tool_machine(item_code);
create index if not exists tool_machine_category_idx on public.tool_machine(category);
create index if not exists tool_machine_status_idx on public.tool_machine(status);
create index if not exists tool_machine_location_idx on public.tool_machine(location);

alter table public.tool_machine enable row level security;

create policy tool_machine_select_active
on public.tool_machine
for select
to authenticated
using ((select private.is_active_user()));

create policy tool_machine_insert_manage
on public.tool_machine
for insert
to authenticated
with check ((select private.has_app_role(array['manager'::text,'engineer'::text])));

create policy tool_machine_update_manage
on public.tool_machine
for update
to authenticated
using ((select private.has_app_role(array['manager'::text,'engineer'::text])))
with check ((select private.has_app_role(array['manager'::text,'engineer'::text])));

create policy tool_machine_delete_manage
on public.tool_machine
for delete
to authenticated
using ((select private.has_app_role(array['manager'::text,'engineer'::text])));

grant select, insert, update, delete on table public.tool_machine to authenticated;
grant all on table public.tool_machine to service_role;

create or replace function public.drive_sync_replace_materials_tools(
  p_sync_key text,
  p_source_file text,
  p_materials jsonb,
  p_procurement jsonb,
  p_tools jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  r jsonb;
  v_project_id uuid;
  v_mat_count integer := 0;
  v_proc_count integer := 0;
  v_tool_count integer := 0;
begin
  if not private.drive_sync_key_valid(p_sync_key) then
    return jsonb_build_object('ok',false,'error','invalid_sync_key');
  end if;

  begin
    delete from public.materials
    where source_sheet in ('03 Villa Plot 6','04 Villa Plot 7','05 Villa Plot 8','06 Villa Plot 9','01 รายการทั้งหมด');

    for r in select value from jsonb_array_elements(coalesce(p_materials,'[]'::jsonb)) loop
      select p.id into v_project_id from public.projects p where p.code=(r->>'project_code');
      insert into public.materials(
        project_id,data_group,source_item_no,category,item_name,status,status_detail,
        brand,model_spec,quantity_unit,contact_name,contact_phone,notes,
        source_sheet,source_row,created_at,updated_at
      ) values (
        v_project_id,
        nullif(r->>'data_group',''),
        nullif(r->>'source_item_no',''),
        nullif(r->>'category',''),
        coalesce(nullif(r->>'item_name',''),'Unnamed item'),
        nullif(r->>'status',''),
        nullif(r->>'status_detail',''),
        nullif(r->>'brand',''),
        nullif(r->>'model_spec',''),
        nullif(r->>'quantity_unit',''),
        nullif(r->>'contact_name',''),
        nullif(r->>'contact_phone',''),
        nullif(r->>'notes',''),
        coalesce(nullif(r->>'source_sheet',''),'01 รายการทั้งหมด'),
        nullif(r->>'source_row','')::integer,
        now(),now()
      );
      v_mat_count := v_mat_count + 1;
    end loop;

    delete from public.procurement_items
    where source_sheet in ('12 Purchasing ค้างส่ง','04 Purchasing ค้างส่ง');

    for r in select value from jsonb_array_elements(coalesce(p_procurement,'[]'::jsonb)) loop
      v_project_id := null;
      if nullif(r->>'project_code','') is not null then
        select p.id into v_project_id from public.projects p where p.code=(r->>'project_code');
      end if;
      insert into public.procurement_items(
        project_id,vendor,item_name,procurement_status,payment_status,current_status,
        expected_delivery_text,expected_delivery,condition_note,source_updated_at,
        source_sheet,source_row,created_at,updated_at
      ) values (
        v_project_id,
        nullif(r->>'vendor',''),
        coalesce(nullif(r->>'item_name',''),'Unnamed procurement item'),
        nullif(r->>'procurement_status',''),
        nullif(r->>'payment_status',''),
        nullif(r->>'current_status',''),
        nullif(r->>'expected_delivery_text',''),
        nullif(r->>'expected_delivery','')::date,
        nullif(r->>'condition_note',''),
        nullif(r->>'source_updated_at','')::date,
        coalesce(nullif(r->>'source_sheet',''),'04 Purchasing ค้างส่ง'),
        nullif(r->>'source_row','')::integer,
        now(),now()
      );
      v_proc_count := v_proc_count + 1;
    end loop;

    delete from public.tool_machine
    where source_sheet='06-Tools & Machine';

    for r in select value from jsonb_array_elements(coalesce(p_tools,'[]'::jsonb)) loop
      insert into public.tool_machine(
        item_no,item_code,category,item_name,brand,model_spec,quantity,unit,status,location,
        source_updated_at,responsible_person,notes,source_sheet,source_row,created_at,updated_at
      ) values (
        nullif(r->>'item_no','')::integer,
        coalesce(nullif(r->>'item_code',''),'TM-UNKNOWN'),
        nullif(r->>'category',''),
        coalesce(nullif(r->>'item_name',''),'Unnamed tool'),
        nullif(r->>'brand',''),
        nullif(r->>'model_spec',''),
        nullif(r->>'quantity','')::numeric,
        nullif(r->>'unit',''),
        nullif(r->>'status',''),
        nullif(r->>'location',''),
        nullif(r->>'source_updated_at','')::date,
        nullif(r->>'responsible_person',''),
        nullif(r->>'notes',''),
        coalesce(nullif(r->>'source_sheet',''),'06-Tools & Machine'),
        nullif(r->>'source_row','')::integer,
        now(),now()
      );
      v_tool_count := v_tool_count + 1;
    end loop;

    insert into public.drive_sync_runs(sync_type,project_code,source_file,source_sheet,rows_read,rows_written,status,message)
    values (
      'materials',null,p_source_file,
      '01 รายการทั้งหมด + 04 Purchasing ค้างส่ง + 06-Tools & Machine',
      v_mat_count+v_proc_count+v_tool_count,
      v_mat_count+v_proc_count+v_tool_count,
      'success',
      'Drive materials + tool & machine sync completed'
    );

    return jsonb_build_object('ok',true,'materials',v_mat_count,'procurement',v_proc_count,'tools',v_tool_count);
  exception when others then
    insert into public.drive_sync_runs(sync_type,project_code,source_file,source_sheet,rows_read,rows_written,status,message)
    values ('materials',null,p_source_file,null,v_mat_count+v_proc_count+v_tool_count,0,'error',sqlerrm);
    return jsonb_build_object('ok',false,'error',sqlerrm);
  end;
end;
$$;

revoke all on function public.drive_sync_replace_materials_tools(text,text,jsonb,jsonb,jsonb) from public;
grant execute on function public.drive_sync_replace_materials_tools(text,text,jsonb,jsonb,jsonb) to anon, service_role;
