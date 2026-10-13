-- Defect Web App -> approved Excel files durable outbound queue.
-- Existing defect_web_overrides is populated by the verified manual-edit trigger.
-- The queue is not a second room-status source and cannot overwrite other files.
ALTER TABLE public.defect_web_overrides
  ADD COLUMN IF NOT EXISTS writeback_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS writeback_last_error text,
  ADD COLUMN IF NOT EXISTS writeback_attempt_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.defect_writeback_pull(
  p_sync_key text,
  p_limit integer DEFAULT 12
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT private.drive_sync_key_valid(p_sync_key) THEN
    RAISE EXCEPTION 'INVALID_SYNC_KEY';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'room_no', x.room_no,
    'revision', x.updated_at,
    'current_status', x.current_status,
    'status_group', x.status_group,
    'next_action', x.next_action,
    'defect_detail', x.defect_detail,
    'latest_source', x.latest_source,
    'source_note', x.source_note,
    'hotel_participation', x.hotel_participation,
    'customer_status', x.customer_status,
    'attempts', x.attempts
  ) ORDER BY x.updated_at, x.room_no), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT c.room_no, ov.updated_at, c.current_status, c.status_group,
           c.next_action, c.defect_detail, c.latest_source, c.source_note,
           c.hotel_participation, c.customer_status,
           ov.writeback_attempt_count as attempts
    FROM public.defect_web_overrides ov
    JOIN public.condo_room_status c ON c.room_no = ov.room_no
    WHERE ov.source_sync_state = 'pending'
    ORDER BY ov.updated_at, ov.room_no
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 12), 1), 25)
  ) x;
  RETURN jsonb_build_object('ok', true, 'rows', v_result);
END; $$;

CREATE OR REPLACE FUNCTION public.defect_writeback_ack(
  p_sync_key text,
  p_room_no text,
  p_revision timestamptz,
  p_master_file_id text,
  p_overview_file_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_updated int := 0;
BEGIN
  IF NOT private.drive_sync_key_valid(p_sync_key) THEN
    RAISE EXCEPTION 'INVALID_SYNC_KEY';
  END IF;
  IF p_master_file_id IS DISTINCT FROM '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj'
     OR p_overview_file_id IS DISTINCT FROM '16JuK26rn7HGPDtSlnMMS2aljYGWyn0Y3' THEN
    RAISE EXCEPTION 'INVALID_WRITEBACK_TARGET';
  END IF;
  UPDATE public.defect_web_overrides
  SET source_sync_state = 'synced',
      source_synced_at = now(),
      writeback_last_attempt_at = now(),
      writeback_last_error = NULL
  WHERE room_no = upper(btrim(p_room_no))
    AND updated_at = p_revision
    AND source_sync_state = 'pending';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  -- If a newer edit happened while Excel was being written, do NOT acknowledge.
  RETURN jsonb_build_object('ok', v_updated = 1,
    'result', CASE WHEN v_updated = 1 THEN 'both_excel_files_verified' ELSE 'stale_revision_retry' END);
END; $$;

CREATE OR REPLACE FUNCTION public.defect_writeback_failure(
  p_sync_key text,
  p_room_no text,
  p_revision timestamptz,
  p_error text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_updated int := 0;
BEGIN
  IF NOT private.drive_sync_key_valid(p_sync_key) THEN
    RAISE EXCEPTION 'INVALID_SYNC_KEY';
  END IF;
  UPDATE public.defect_web_overrides
  SET writeback_last_attempt_at = now(),
      writeback_attempt_count = writeback_attempt_count + 1,
      writeback_last_error = left(coalesce(p_error, 'unknown'), 500)
  WHERE room_no = upper(btrim(p_room_no)) AND updated_at = p_revision
    AND source_sync_state = 'pending';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_updated = 1);
END; $$;

CREATE OR REPLACE FUNCTION public.defect_writeback_status(p_room_no text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_user uuid := (SELECT auth.uid());
DECLARE v_row public.defect_web_overrides%ROWTYPE;
BEGIN
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = v_user AND p.active = true
      AND ((p.user_id = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid AND p.role='manager')
           OR p.role IN ('defect_editor','viewer_editor'))
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_DEFECT_EDIT';
  END IF;
  SELECT * INTO v_row FROM public.defect_web_overrides
  WHERE room_no = upper(btrim(p_room_no));
  IF NOT FOUND THEN RETURN jsonb_build_object('state', 'not_queued'); END IF;
  RETURN jsonb_build_object(
    'state', v_row.source_sync_state,
    'room_no', v_row.room_no,
    'revision', v_row.updated_at,
    'verified_at', v_row.source_synced_at,
    'attempts', v_row.writeback_attempt_count,
    'last_error', v_row.writeback_last_error);
END; $$;

REVOKE ALL ON FUNCTION public.defect_writeback_pull(text,integer) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.defect_writeback_ack(text,text,timestamptz,text,text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.defect_writeback_failure(text,text,timestamptz,text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.defect_writeback_status(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.defect_writeback_pull(text,integer) TO anon,service_role;
GRANT EXECUTE ON FUNCTION public.defect_writeback_ack(text,text,timestamptz,text,text) TO anon,service_role;
GRANT EXECUTE ON FUNCTION public.defect_writeback_failure(text,text,timestamptz,text) TO anon,service_role;
GRANT EXECUTE ON FUNCTION public.defect_writeback_status(text) TO authenticated;

-- Inbound Excel Sync must not create new outbound Web-manual events.
CREATE OR REPLACE FUNCTION public.defect_manual_update_apply(p_room_no text, p_detail_text text, p_current_status text, p_status_group text, p_next_action text, p_client_session_id uuid, p_user_agent text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
  v_room text := upper(replace(btrim(coalesce(p_room_no,'')),' ',''));
  v_normalized_detail text := lower(regexp_replace(btrim(coalesce(p_detail_text,'')),'\s+',' ','g'));
  v_fingerprint text;
  v_duplicate uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true and ((p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid and p.role='manager') or p.role in ('defect_editor','viewer_editor'))) then
    raise exception 'NOT_AUTHORIZED_FOR_DEFECT_EDIT';
  end if;
  if v_room !~ '^[AB][0-9]{3}$' then raise exception 'INVALID_ROOM_NO'; end if;
  if v_normalized_detail='' then raise exception 'DETAIL_REQUIRED'; end if;
  if char_length(p_detail_text)>4000 or char_length(coalesce(p_current_status,''))>1000 or char_length(coalesce(p_next_action,''))>4000 then raise exception 'TEXT_TOO_LONG'; end if;
  if nullif(btrim(coalesce(p_status_group,'')),'') is not null and p_status_group not in ('Hotel - Incomplete','Hotel - Awaiting Check','Hotel - Checked Complete','Non-Hotel - Pending Handover','Non-Hotel - Handover Complete','Non-Hotel - Awaiting Sale') then raise exception 'INVALID_STATUS_GROUP'; end if;
  if not exists(select 1 from public.condo_room_status r where r.room_no=v_room) then raise exception 'ROOM_NOT_FOUND'; end if;

  v_fingerprint:=encode(extensions.digest(convert_to(v_room||'|'||v_normalized_detail,'UTF8'),'sha256'),'hex');

  select m.id into v_duplicate
  from public.defect_manual_updates m
  where m.room_no=v_room
    and (
      m.detail_fingerprint=v_fingerprint
      or lower(regexp_replace(btrim(coalesce(m.detail_text,'')),'\s+',' ','g'))=v_normalized_detail
    )
  order by m.created_at desc
  limit 1;

  if v_duplicate is null then
    insert into public.defect_manual_updates(room_no,detail_text,created_by,detail_fingerprint)
    values(v_room,btrim(p_detail_text),v_user,v_fingerprint)
    returning id into v_id;
  else
    v_id:=v_duplicate;
  end if;

  -- Mark the authenticated Web save, not an inbound Excel update.
  perform pg_catalog.set_config('app.defect_manual_update','1',true);

  update public.condo_room_status set
    defect_detail=btrim(p_detail_text),
    current_status=coalesce(nullif(btrim(coalesce(p_current_status,'')),''),current_status),
    status_group=coalesce(nullif(btrim(coalesce(p_status_group,'')),''),status_group),
    next_action=coalesce(nullif(btrim(coalesce(p_next_action,'')),''),next_action),
    latest_source='Web App manual update',
    source_note=case when v_duplicate is null
      then 'Manual Defect update from authorized Web App user'
      else 'Duplicate Defect detail ignored; current status fields reconciled'
    end,
    source_modified_at=now(),
    synced_at=now()
  where room_no=v_room;

  insert into public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata,user_agent)
  values(
    v_user,coalesce(p_client_session_id,gen_random_uuid()),'data_change','/defect-flow',
    case when v_duplicate is null then 'defect_manual_update' else 'defect_manual_duplicate_ignored' end,
    v_room,
    jsonb_build_object('manual_update_id',v_id,'duplicate',v_duplicate is not null,'detail_fingerprint',v_fingerprint),
    left(nullif(btrim(coalesce(p_user_agent,'')),''),500)
  );
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.defect_web_override_capture()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.latest_source = 'Web App manual update'
   and pg_catalog.current_setting('app.defect_manual_update',true) = '1' then
   insert into public.defect_web_overrides as ov
       (room_no,current_status,status_group,next_action,detail_text,updated_at,source_sync_state,source_synced_at)
   values (
       new.room_no,
       case when old.current_status is distinct from new.current_status then new.current_status end,
       case when old.status_group is distinct from new.status_group then new.status_group end,
       case when old.next_action is distinct from new.next_action then new.next_action end,
       new.defect_detail,now(),'pending',null
   )
   on conflict(room_no) do update set
       current_status=coalesce(excluded.current_status,ov.current_status),
       status_group=coalesce(excluded.status_group,ov.status_group),
       next_action=coalesce(excluded.next_action,ov.next_action),
       detail_text=excluded.detail_text,
       updated_at=now(),source_sync_state='pending',source_synced_at=null;
 end if;
 return null;
end $function$;

CREATE OR REPLACE FUNCTION public.defect_web_override_protect()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.defect_web_overrides%rowtype;
begin
 if pg_catalog.current_setting('app.defect_manual_update',true) is distinct from '1' then
    select * into v from public.defect_web_overrides where room_no=new.room_no;
    if found then
       new.current_status=coalesce(v.current_status,new.current_status);
       new.status_group=coalesce(v.status_group,new.status_group);
       new.next_action=coalesce(v.next_action,new.next_action);
       new.defect_detail=coalesce(v.detail_text,new.defect_detail);
       if v.source_sync_state <> 'synced' and
           (v.current_status is not null or v.status_group is not null or v.next_action is not null) then
         new.latest_source=old.latest_source;
       end if;
    end if;
 end if;
 return new;
end $function$;
