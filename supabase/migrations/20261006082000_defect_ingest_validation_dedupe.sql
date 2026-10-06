-- Harden Defect ingest: content validation gate, duplicate protection, and server-only registration.

alter table public.defect_file_uploads
  add column if not exists content_sha256 text,
  add column if not exists validation_status text,
  add column if not exists validation_reason text,
  add column if not exists detected_rooms text[],
  add column if not exists validated_at timestamptz;

alter table public.defect_manual_updates
  add column if not exists detail_fingerprint text;

create unique index if not exists defect_file_uploads_content_sha256_accepted_uq
  on public.defect_file_uploads(content_sha256)
  where content_sha256 is not null and validation_status='accepted';

create unique index if not exists defect_manual_updates_room_fingerprint_uq
  on public.defect_manual_updates(room_no,detail_fingerprint)
  where detail_fingerprint is not null;

create table if not exists private.defect_ingest_config(
  key text primary key,
  token_hash text not null,
  updated_at timestamptz not null default now()
);
revoke all on private.defect_ingest_config from public,anon,authenticated;

create policy defect_flow_staging_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id='defect-flow-staging'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists(
    select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.active=true
      and p.role in ('manager','defect_contributor','defect_editor')
  )
);

create or replace function public.defect_register_file_upload(
  p_file_name text,p_storage_path text,p_mime_type text,p_file_size bigint,
  p_client_session_id uuid,p_user_agent text
) returns uuid
language plpgsql security definer set search_path=''
as $$
begin
  raise exception 'DIRECT_DEFECT_FILE_REGISTER_DISABLED';
end $$;

create or replace function public.defect_register_validated_file(
  p_server_token text,
  p_file_name text,
  p_storage_path text,
  p_mime_type text,
  p_file_size bigint,
  p_content_sha256 text,
  p_detected_rooms text[],
  p_validation_reason text,
  p_client_session_id uuid,
  p_user_agent text
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
  v_existing uuid;
  v_expected_hash text;
  v_token_hash text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(
    select 1 from public.profiles p
    where p.user_id=v_user and p.active=true
      and p.role in ('manager','defect_contributor','defect_editor')
  ) then raise exception 'NOT_AUTHORIZED_FOR_DEFECT_EDIT'; end if;

  select c.token_hash into v_expected_hash
  from private.defect_ingest_config c
  where c.key='server_token';

  v_token_hash:=encode(extensions.digest(coalesce(p_server_token,'')::bytea,'sha256'),'hex');
  if v_expected_hash is null or v_token_hash is distinct from v_expected_hash then
    raise exception 'INVALID_DEFECT_INGEST_SERVER_TOKEN';
  end if;

  if p_mime_type<>'application/pdf' or p_file_size<=0 or p_file_size>20971520 then
    raise exception 'INVALID_PDF_FILE';
  end if;
  if p_storage_path not like v_user::text||'/%' then raise exception 'INVALID_STORAGE_OWNER'; end if;
  if coalesce(p_content_sha256,'') !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_CONTENT_SHA256'; end if;
  if coalesce(cardinality(p_detected_rooms),0)<1 then raise exception 'NO_DEFECT_ROOMS_DETECTED'; end if;
  if exists(
    select 1 from unnest(p_detected_rooms) r
    left join public.condo_room_status c on c.room_no=upper(btrim(r))
    where c.room_no is null
  ) then raise exception 'UNKNOWN_DEFECT_ROOM'; end if;

  select f.id into v_existing
  from public.defect_file_uploads f
  where f.content_sha256=p_content_sha256
    and f.validation_status='accepted'
  limit 1;

  if v_existing is not null then
    insert into public.activity_logs(
      user_id,client_session_id,event_type,path,action,target,metadata,user_agent
    ) values (
      v_user,coalesce(p_client_session_id,gen_random_uuid()),'data_change','/defect-flow',
      'defect_pdf_duplicate_ignored',v_existing::text,
      jsonb_build_object('file_name',left(p_file_name,255),'content_sha256',p_content_sha256),
      left(nullif(btrim(coalesce(p_user_agent,'')),''),500)
    );
    return jsonb_build_object('status','duplicate','id',v_existing);
  end if;

  insert into public.defect_file_uploads(
    file_name,storage_path,mime_type,file_size,status,created_by,
    content_sha256,validation_status,validation_reason,detected_rooms,validated_at
  ) values (
    left(p_file_name,255),p_storage_path,p_mime_type,p_file_size,'pending_drive_sync',v_user,
    p_content_sha256,'accepted',left(coalesce(p_validation_reason,'validated_defect_pdf'),1000),
    p_detected_rooms,now()
  ) returning id into v_id;

  insert into public.activity_logs(
    user_id,client_session_id,event_type,path,action,target,metadata,user_agent
  ) values (
    v_user,coalesce(p_client_session_id,gen_random_uuid()),'data_change','/defect-flow',
    'defect_pdf_validated_upload',v_id::text,
    jsonb_build_object(
      'file_name',left(p_file_name,255),
      'status','pending_drive_sync',
      'rooms',to_jsonb(p_detected_rooms),
      'content_sha256',p_content_sha256
    ),
    left(nullif(btrim(coalesce(p_user_agent,'')),''),500)
  );
  return jsonb_build_object('status','accepted','id',v_id);
end $$;

revoke all on function public.defect_register_file_upload(text,text,text,bigint,uuid,text) from public,anon,authenticated;
revoke all on function public.defect_register_validated_file(text,text,text,text,bigint,text,text[],text,uuid,text) from public,anon;
grant execute on function public.defect_register_validated_file(text,text,text,text,bigint,text,text[],text,uuid,text) to authenticated;

create or replace function public.defect_manual_update_apply(
  p_room_no text,p_detail_text text,p_current_status text,p_status_group text,p_next_action text,
  p_client_session_id uuid,p_user_agent text
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
  v_room text := upper(replace(btrim(coalesce(p_room_no,'')),' ',''));
  v_normalized_detail text := lower(regexp_replace(btrim(coalesce(p_detail_text,'')),'\s+',' ','g'));
  v_fingerprint text;
  v_duplicate uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true and p.role in ('manager','defect_contributor','defect_editor')) then
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
end $$;

create or replace function public.defect_submit_manual_details(
  p_updates jsonb,p_client_session_id uuid,p_user_agent text
) returns integer
language plpgsql security definer set search_path=''
as $$
declare
  v_user uuid := (select auth.uid());
  v_count integer;
  v_inserted integer := 0;
  v_rooms text[];
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(
    select 1 from public.profiles p
    where p.user_id=v_user and p.active=true
      and p.role in ('manager','defect_contributor','defect_editor')
  ) then raise exception 'NOT_AUTHORIZED_FOR_DEFECT_EDIT'; end if;

  if p_updates is null or jsonb_typeof(p_updates)<>'array' then raise exception 'UPDATES_MUST_BE_ARRAY'; end if;

  select count(*),array_agg(upper(btrim(x.room_no)) order by upper(btrim(x.room_no)))
  into v_count,v_rooms
  from jsonb_to_recordset(p_updates) as x(room_no text,detail_text text);

  if v_count<1 or v_count>50 then raise exception 'INVALID_UPDATE_COUNT'; end if;
  if (select count(distinct upper(btrim(x.room_no))||'|'||lower(regexp_replace(btrim(x.detail_text),'\s+',' ','g')))
      from jsonb_to_recordset(p_updates) as x(room_no text,detail_text text))<>v_count then
    raise exception 'DUPLICATE_DEFECT_IN_REQUEST';
  end if;

  if exists(
    select 1 from jsonb_to_recordset(p_updates) as x(room_no text,detail_text text)
    where upper(btrim(x.room_no)) !~ '^[AB][0-9]{3}$'
       or nullif(btrim(coalesce(x.detail_text,'')),'') is null
       or char_length(btrim(x.detail_text))>4000
  ) then raise exception 'INVALID_DEFECT_DETAIL'; end if;

  if exists(
    select 1 from jsonb_to_recordset(p_updates) as x(room_no text,detail_text text)
    left join public.condo_room_status r on r.room_no=upper(btrim(x.room_no))
    where r.room_no is null
  ) then raise exception 'UNKNOWN_ROOM'; end if;

  with incoming as (
    select
      upper(btrim(x.room_no)) room_no,
      btrim(x.detail_text) detail_text,
      lower(regexp_replace(btrim(x.detail_text),'\s+',' ','g')) normalized_detail
    from jsonb_to_recordset(p_updates) as x(room_no text,detail_text text)
  ),
  fresh as (
    select i.*,
      encode(extensions.digest(convert_to(i.room_no||'|'||i.normalized_detail,'UTF8'),'sha256'),'hex') fp
    from incoming i
    where not exists(
      select 1 from public.defect_manual_updates m
      where m.room_no=i.room_no
        and (
          m.detail_fingerprint=encode(extensions.digest(convert_to(i.room_no||'|'||i.normalized_detail,'UTF8'),'sha256'),'hex')
          or lower(regexp_replace(btrim(coalesce(m.detail_text,'')),'\s+',' ','g'))=i.normalized_detail
        )
    )
  )
  insert into public.defect_manual_updates(room_no,detail_text,created_by,detail_fingerprint)
  select room_no,detail_text,v_user,fp from fresh
  on conflict(room_no,detail_fingerprint) where detail_fingerprint is not null do nothing;

  get diagnostics v_inserted = row_count;

  insert into public.activity_logs(
    user_id,client_session_id,event_type,path,action,target,metadata,user_agent
  ) values (
    v_user,coalesce(p_client_session_id,gen_random_uuid()),'data_change','/defect-flow',
    'defect_manual_detail_add',array_to_string(v_rooms,','),
    jsonb_build_object('submitted_count',v_count,'inserted_count',v_inserted,'duplicate_count',v_count-v_inserted,'rooms',to_jsonb(v_rooms)),
    left(nullif(btrim(coalesce(p_user_agent,'')),''),500)
  );

  return v_inserted;
end $$;
