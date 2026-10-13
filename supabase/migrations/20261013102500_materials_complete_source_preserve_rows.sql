-- Synchronize database definition with live Materials fix (13 Oct 2026).
-- Keeps Materials IDs and site labels stable; rejects incomplete input.
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS source_location text;
COMMENT ON COLUMN public.materials.source_location IS 'Exact สถานที่/หลัง label from Materials master; project_id remains authoritative where available.';

CREATE OR REPLACE FUNCTION public.drive_sync_replace_materials_tools(p_sync_key text, p_source_file text, p_materials jsonb, p_procurement jsonb, p_tools jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r jsonb;
  v_project_id uuid;
  v_material_id uuid;
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

  -- Replacement is atomic, but empty/malformed arrays would still erase data.
  -- Reject them before the first DELETE; keep the existing signature and grants.
  if jsonb_typeof(p_materials) is distinct from 'array'
     or jsonb_typeof(p_procurement) is distinct from 'array'
     or jsonb_typeof(p_tools) is distinct from 'array' then
    return jsonb_build_object('ok',false,'error','invalid_materials_payload');
  end if;
  if jsonb_array_length(p_materials) = 0
     or jsonb_array_length(p_procurement) = 0
     or jsonb_array_length(p_tools) = 0 then
    return jsonb_build_object('ok',false,'error','incomplete_materials_payload');
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_materials || p_procurement || p_tools) item
    where jsonb_typeof(item) is distinct from 'object'
       or nullif(btrim(item->>'item_name'),'') is null
  ) then
    return jsonb_build_object('ok',false,'error','invalid_materials_row');
  end if;

  -- Block partial or duplicate master imports before any updates or procurement replacement.
  if jsonb_array_length(p_materials) < (
    select count(*) from public.materials where source_sheet='01 รายการทั้งหมด'
  ) or exists (
    select 1 from jsonb_array_elements(p_materials) entry
    where nullif(entry->>'source_row','') is null
  ) or (
    select count(distinct entry->>'source_row')
    from jsonb_array_elements(p_materials) entry
  ) <> jsonb_array_length(p_materials) then
    return jsonb_build_object('ok',false,'error','incomplete_or_duplicate_materials_source');
  end if;

  begin
    -- Stable source-row reconciliation: do not delete materials, their IDs or web-side references.
    for r in select value from jsonb_array_elements(p_materials) loop
      select p.id into v_project_id from public.projects p where p.code=(r->>'project_code');

      select m.id into v_material_id
      from public.materials m
      where m.source_sheet='01 รายการทั้งหมด'
        and m.source_row=(r->>'source_row')::integer;

      if v_material_id is null then
        insert into public.materials (
          project_id,source_location,data_group,source_item_no,category,item_name,status,status_detail,
          brand,model_spec,quantity_unit,contact_name,contact_phone,notes,
          source_sheet,source_row,created_at,updated_at
        ) values (
          v_project_id,
          nullif(r->>'source_location',''),
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
          (r->>'source_row')::integer,now(),now()
        );
      else
        update public.materials m
        set project_id=v_project_id,
            source_location=nullif(r->>'source_location',''),
            data_group=nullif(r->>'data_group',''),
            source_item_no=nullif(r->>'source_item_no',''),
            category=nullif(r->>'category',''),
            item_name=coalesce(nullif(r->>'item_name',''),'Unnamed item'),
            status=nullif(r->>'status',''),
            status_detail=nullif(r->>'status_detail',''),
            brand=nullif(r->>'brand',''),
            model_spec=nullif(r->>'model_spec',''),
            quantity_unit=nullif(r->>'quantity_unit',''),
            contact_name=nullif(r->>'contact_name',''),
            contact_phone=nullif(r->>'contact_phone',''),
            notes=nullif(r->>'notes',''),
            updated_at=now()
        where m.id=v_material_id
          and (
            m.project_id,m.source_location,m.data_group,m.source_item_no,m.category,m.item_name,
            m.status,m.status_detail,m.brand,m.model_spec,m.quantity_unit,m.contact_name,
            m.contact_phone,m.notes
          ) is distinct from (
            v_project_id,nullif(r->>'source_location',''),nullif(r->>'data_group',''),
            nullif(r->>'source_item_no',''),nullif(r->>'category',''),
            coalesce(nullif(r->>'item_name',''),'Unnamed item'),
            nullif(r->>'status',''),nullif(r->>'status_detail',''),
            nullif(r->>'brand',''),nullif(r->>'model_spec',''),
            nullif(r->>'quantity_unit',''),nullif(r->>'contact_name',''),
            nullif(r->>'contact_phone',''),nullif(r->>'notes','')
          );
      end if;
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
$function$
