create or replace function public.drive_sync_apply_condo_defects(
  p_sync_key text,
  p_source_file text,
  p_source_file_id text,
  p_source_modified_at timestamptz,
  p_rows jsonb,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  r jsonb;
  v_room text;
  v_total integer := 0;
  v_unique integer := 0;
  v_a integer := 0;
  v_b integer := 0;
  v_invalid integer := 0;
  v_changed integer := 0;
  v_needs_write boolean := false;
  v_missing text[] := array[]::text[];
  v_extra text[] := array[]::text[];
begin
  if not private.drive_sync_key_valid(p_sync_key) then
    return jsonb_build_object('ok', false, 'error', 'invalid_sync_key');
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'defect_rows_must_be_json_array';
  end if;

  select
    count(*),
    count(distinct upper(coalesce(value->>'room_no',''))),
    count(*) filter (where upper(coalesce(value->>'building','')) = 'A'),
    count(*) filter (where upper(coalesce(value->>'building','')) = 'B'),
    count(*) filter (
      where upper(coalesce(value->>'room_no','')) !~ '^[AB][0-9]{3}$'
         or upper(coalesce(value->>'building','')) not in ('A','B')
         or nullif(value->>'hotel_participation','') is null
         or nullif(value->>'customer_status','') is null
         or nullif(value->>'current_status','') is null
         or nullif(value->>'status_group','') is null
         or nullif(value->>'follow_up','') is null
         or nullif(value->>'priority','') is null
         or nullif(value->>'next_action','') is null
    )
  into v_total, v_unique, v_a, v_b, v_invalid
  from jsonb_array_elements(p_rows);

  if v_total <> 263 or v_unique <> 263 then
    raise exception 'defect_inventory_count_mismatch total=% unique=% expected=263', v_total, v_unique;
  end if;

  if v_a <> 162 or v_b <> 101 then
    raise exception 'defect_building_count_mismatch A=% B=% expected_A=162 expected_B=101', v_a, v_b;
  end if;

  if v_invalid <> 0 then
    raise exception 'defect_invalid_required_rows=%', v_invalid;
  end if;

  select coalesce(array_agg(c.room_no order by c.room_no), array[]::text[])
  into v_missing
  from public.condo_room_status c
  where not exists (
    select 1
    from jsonb_array_elements(p_rows) x
    where upper(x->>'room_no') = c.room_no
  );

  select coalesce(array_agg(upper(x->>'room_no') order by upper(x->>'room_no')), array[]::text[])
  into v_extra
  from jsonb_array_elements(p_rows) x
  where not exists (
    select 1
    from public.condo_room_status c
    where c.room_no = upper(x->>'room_no')
  );

  if cardinality(v_missing) > 0 or cardinality(v_extra) > 0 then
    raise exception 'defect_room_set_mismatch missing=[%] extra=[%]',
      array_to_string(v_missing, ','),
      array_to_string(v_extra, ',');
  end if;

  for r in select value from jsonb_array_elements(p_rows)
  loop
    v_room := upper(r->>'room_no');

    select (
      c.building is distinct from upper(r->>'building')
      or c.floor is distinct from (r->>'floor')::integer
      or c.hotel_participation is distinct from (r->>'hotel_participation')
      or c.customer_status is distinct from (r->>'customer_status')
      or c.current_status is distinct from (r->>'current_status')
      or c.status_group is distinct from (r->>'status_group')
      or c.follow_up is distinct from (r->>'follow_up')
      or c.priority is distinct from (r->>'priority')
      or c.next_action is distinct from (r->>'next_action')
      or c.latest_source is distinct from coalesce(nullif(r->>'latest_source',''), c.latest_source)
      or c.source_note is distinct from coalesce(nullif(r->>'source_note',''), c.source_note)
      or c.hotel_complete_color is distinct from coalesce(nullif(r->>'hotel_complete_color',''), c.hotel_complete_color)
      or c.hotel_remarks is distinct from coalesce(nullif(r->>'hotel_remarks',''), c.hotel_remarks)
    )
    into v_needs_write
    from public.condo_room_status c
    where c.room_no = v_room;

    if coalesce(v_needs_write, false) then
      v_changed := v_changed + 1;

      if not p_dry_run then
        update public.condo_room_status c
        set
          building = upper(r->>'building'),
          floor = (r->>'floor')::integer,
          hotel_participation = r->>'hotel_participation',
          customer_status = r->>'customer_status',
          current_status = r->>'current_status',
          status_group = r->>'status_group',
          follow_up = r->>'follow_up',
          priority = r->>'priority',
          next_action = r->>'next_action',
          latest_source = coalesce(nullif(r->>'latest_source',''), c.latest_source),
          source_note = coalesce(nullif(r->>'source_note',''), c.source_note),
          hotel_complete_color = coalesce(nullif(r->>'hotel_complete_color',''), c.hotel_complete_color),
          hotel_remarks = coalesce(nullif(r->>'hotel_remarks',''), c.hotel_remarks),
          source_file_id = coalesce(nullif(p_source_file_id,''), c.source_file_id),
          source_file_name = coalesce(nullif(p_source_file,''), c.source_file_name),
          source_modified_at = coalesce(p_source_modified_at, c.source_modified_at),
          synced_at = now()
        where c.room_no = v_room;
      end if;
    end if;
  end loop;

  if not p_dry_run then
    insert into public.drive_sync_runs(
      sync_type, project_code, source_file, source_sheet,
      rows_read, rows_written, status, message
    )
    values (
      'defects', null, p_source_file, 'ข้อมูลจำแนก',
      v_total, v_changed, 'success',
      format(
        'Server defect sync validated 263 rooms (A=162, B=101); %s semantic row(s) changed',
        v_changed
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'dry_run', p_dry_run,
    'rooms', v_total,
    'building_a', v_a,
    'building_b', v_b,
    'changed', v_changed,
    'source_file', p_source_file,
    'validation', '263/263 exact room-set match'
  );

exception when others then
  if not coalesce(p_dry_run, false) then
    begin
      insert into public.drive_sync_runs(
        sync_type, project_code, source_file, source_sheet,
        rows_read, rows_written, status, message
      )
      values (
        'defects', null, p_source_file, 'ข้อมูลจำแนก',
        coalesce(v_total, 0), 0, 'error', left(sqlerrm, 1000)
      );
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object(
    'ok', false,
    'error', sqlerrm,
    'rooms', coalesce(v_total, 0),
    'building_a', coalesce(v_a, 0),
    'building_b', coalesce(v_b, 0)
  );
end;
$function$;

revoke all on function public.drive_sync_apply_condo_defects(text,text,text,timestamptz,jsonb,boolean) from public;
grant execute on function public.drive_sync_apply_condo_defects(text,text,text,timestamptz,jsonb,boolean) to anon, service_role;
