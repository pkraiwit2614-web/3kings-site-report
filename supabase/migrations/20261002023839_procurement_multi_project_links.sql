create table if not exists public.procurement_item_projects (
  procurement_item_id uuid not null references public.procurement_items(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (procurement_item_id, project_id)
);

create index if not exists procurement_item_projects_project_id_idx
  on public.procurement_item_projects(project_id);

alter table public.procurement_item_projects enable row level security;

grant select, insert, update, delete on table public.procurement_item_projects to authenticated;
grant select, insert, update, delete on table public.procurement_item_projects to service_role;

drop policy if exists procurement_item_projects_select_active on public.procurement_item_projects;
create policy procurement_item_projects_select_active
on public.procurement_item_projects for select
to authenticated
using ((select private.is_active_user()));

drop policy if exists procurement_item_projects_insert_manage on public.procurement_item_projects;
create policy procurement_item_projects_insert_manage
on public.procurement_item_projects for insert
to authenticated
with check ((select private.has_app_role(array['manager','engineer'])));

drop policy if exists procurement_item_projects_update_manage on public.procurement_item_projects;
create policy procurement_item_projects_update_manage
on public.procurement_item_projects for update
to authenticated
using ((select private.has_app_role(array['manager','engineer'])))
with check ((select private.has_app_role(array['manager','engineer'])));

drop policy if exists procurement_item_projects_delete_manage on public.procurement_item_projects;
create policy procurement_item_projects_delete_manage
on public.procurement_item_projects for delete
to authenticated
using ((select private.has_app_role(array['manager','engineer'])));

insert into public.procurement_item_projects(procurement_item_id, project_id)
select pi.id, pi.project_id
from public.procurement_items pi
where pi.project_id is not null
on conflict do nothing;

with target as (
  select id
  from public.procurement_items
  where po_no = 'PL0000915' or item_name ilike '%PL0000915%'
  order by updated_at desc
  limit 1
)
insert into public.procurement_item_projects(procurement_item_id, project_id)
select target.id, p.id
from target
join public.projects p on p.code in ('AV-P6','AV-P7')
on conflict do nothing;

update public.procurement_items
set project_id = null
where po_no = 'PL0000915' or item_name ilike '%PL0000915%';

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
as $function$
declare
  r jsonb;
  v_project_id uuid;
  v_procurement_id uuid;
  v_project_code text;
  v_project_codes jsonb;
  v_project_count integer;
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
      v_project_codes := coalesce(r->'project_codes','[]'::jsonb);
      if jsonb_typeof(v_project_codes) <> 'array' then
        v_project_codes := '[]'::jsonb;
      end if;
      v_project_count := jsonb_array_length(v_project_codes);

      if v_project_count = 1 then
        select p.id into v_project_id
        from public.projects p
        where p.code = (v_project_codes->>0);
      elsif v_project_count = 0 and nullif(r->>'project_code','') is not null then
        select p.id into v_project_id
        from public.projects p
        where p.code=(r->>'project_code');
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
      )
      returning id into v_procurement_id;

      if v_project_count > 0 then
        for v_project_code in
          select value from jsonb_array_elements_text(v_project_codes)
        loop
          insert into public.procurement_item_projects(procurement_item_id,project_id)
          select v_procurement_id,p.id
          from public.projects p
          where p.code=v_project_code
          on conflict do nothing;
        end loop;
      elsif v_project_id is not null then
        insert into public.procurement_item_projects(procurement_item_id,project_id)
        values (v_procurement_id,v_project_id)
        on conflict do nothing;
      end if;

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
$function$;
