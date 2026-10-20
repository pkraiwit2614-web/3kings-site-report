-- Repair isolated Daily Site Report RPC HTTP400 on Google Apps Script dry-run.
-- Supabase PostgREST assumes the actual database role from a validated JWT;
-- legacy per-claim GUC request.jwt.claim.role may be unset in newer PostgREST.
-- SECURITY INVOKER + strict current_user='service_role' checks the actual DB role.
-- Does not change service_role-only EXECUTE grant, RLS, source data, GAS or triggers.
create or replace function public.daily_site_report_sync_v1(
  p_rows jsonb, p_mode text default 'dry_run', p_expected jsonb default '{}'::jsonb,
  p_source_rows_read integer default 0, p_source_revision text default null
) returns jsonb
language plpgsql security invoker set search_path = pg_catalog, public
as $function$
declare
  r jsonb;
  v_row integer;
  v_date date;
  v_stamp timestamptz;
  v_male integer;
  v_female integer;
  v_total integer;
  v_key text;
  v_fp text;
  v_prior public.site_operations_entries%rowtype;
  v_entry_id uuid;
  v_code text;
  v_code_id uuid;
  v_codes jsonb;
  v_seen integer[] := '{}'::integer[];
  v_expected jsonb := '{}'::jsonb;
  v_problems jsonb := '[]'::jsonb;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_blocked integer := 0;
  v_verified integer := 0;
  v_parsed integer;
  v_latest_date date := (current_timestamp at time zone 'Asia/Bangkok')::date;
  v_fingerprint_data jsonb;
  v_has_locked_finance boolean;
  v_changed boolean;
  v_result jsonb;
begin
  if current_user <> 'service_role'
    then raise exception 'DSR_SERVICE_ROLE_ONLY'; end if;
  if p_mode not in ('dry_run','commit') then raise exception 'DSR_INVALID_MODE'; end if;
  if jsonb_typeof(p_rows) <> 'array'
    or jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 400
    then raise exception 'DSR_INVALID_BATCH_SIZE'; end if;
  if jsonb_typeof(p_expected) <> 'object' then raise exception 'DSR_INVALID_EXPECTED_MAP'; end if;
  v_parsed := jsonb_array_length(p_rows);
  if p_source_rows_read < v_parsed or p_source_rows_read > 50000 then
    raise exception 'DSR_SOURCE_READ_COUNT_INVALID';
  end if;
  -- Serialize across scheduled and manual runs. Never clear or modify existing triggers.
  perform pg_advisory_xact_lock(hashtext('3kings.daily.site.import.v1'));
  for r in select value from jsonb_array_elements(p_rows) as x(value) loop
    if jsonb_typeof(r) <> 'object' or not (r ? 'source_row') then
      raise exception 'DSR_INVALID_SOURCE_RECORD';
    end if;
    v_row := (r->>'source_row')::integer;
    if v_row < 354 or v_row > 50000 or v_row = any(v_seen) then
      raise exception 'DSR_SOURCE_ROW_OUT_OF_SCOPE_OR_DUPLICATE: %',v_row;
    end if;
    v_seen := array_append(v_seen,v_row);
    if r->>'work_date' !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'DSR_DATE_NOT_CANONICAL: %',v_row;
    end if;
    v_date := (r->>'work_date')::date;
    if v_date > v_latest_date or v_date < date '2026-09-01' then
      raise exception 'DSR_WORK_DATE_OUT_OF_RANGE: %',v_row;
    end if;
    v_stamp := (r->>'source_timestamp')::timestamptz;
    if v_stamp is null or v_stamp > now()+interval '10 minutes' then
      raise exception 'DSR_SOURCE_TIMESTAMP_INVALID: %',v_row;
    end if;
    if r->>'supervisor_raw' is null or length(btrim(r->>'supervisor_raw')) = 0 then
      raise exception 'DSR_MISSING_SUPERVISOR: %',v_row;
    end if;
    v_male := nullif(r->>'male_count','')::integer;
    v_female := nullif(r->>'female_count','')::integer;
    v_total := nullif(r->>'total_manpower','')::integer;
    if v_male is null or v_female is null or v_total is null
      or v_male < 0 or v_female < 0 or v_total < 0
      or v_male + v_female <> v_total then
      raise exception 'DSR_HEADCOUNT_MISMATCH: %',v_row;
    end if;
    v_codes := coalesce(r->'project_codes','[]'::jsonb);
    if jsonb_typeof(v_codes)<>'array' then
      raise exception 'DSR_PROJECT_CODES_INVALID: %',v_row;
    end if;
    -- No guessed allocation: links indicate location only and do not change wages.
    for v_code in select value from jsonb_array_elements_text(v_codes) as c(value) loop
      if v_code not in ('AV-P3','AV-P6','AV-P7','AV-P8','AV-P9','AV-COMMON',
                        'CONDO-A','CONDO-B','MIRAGE','HENNESSY') then
        raise exception 'DSR_UNKNOWN_PROJECT_CODE: %',v_row;
      end if;
      if not exists(select 1 from public.projects where code=v_code) then
        raise exception 'DSR_PROJECT_NOT_PRESENT: %',v_code;
      end if;
    end loop;
    v_fingerprint_data := jsonb_build_object(
      'work_date',r->>'work_date',
      'project_name_raw',nullif(r->>'project_name_raw',''),
      'area_raw',nullif(r->>'area_raw',''),
      'supervisor_raw',r->>'supervisor_raw',
      'male_count',v_male,'female_count',v_female,'total_manpower',v_total,
      'work_detail',nullif(r->>'work_detail',''),
      'status_text',nullif(r->>'status_text',''),
      'next_plan',nullif(r->>'next_plan',''),
      'afternoon_detail',nullif(r->>'afternoon_detail',''),
      'specific_area',nullif(r->>'specific_area',''),
      'project_codes',v_codes
    );
    v_fp := 'DSR2|' || encode(sha256(convert_to(v_fingerprint_data::text,'UTF8')),'hex');
    v_key := v_row::text;
    select * into v_prior from public.site_operations_entries
      where source_file_id='1-ZSZXulxaje4vDP1ztvUBXsjlmffjAcDu0w1OHRnpUw'
      and source_sheet='การตอบแบบฟอร์ม 1' and source_row=v_row for update;
    if not found then
      v_expected := v_expected || jsonb_build_object(v_key,'__MISSING__');
      if p_mode = 'commit' and (not p_expected ? v_key or p_expected->>v_key <> '__MISSING__') then
        raise exception 'DSR_STALE_EXPECTED_NEW: %',v_row;
      end if;
      v_inserted := v_inserted + 1;
      if p_mode = 'commit' then
        insert into public.site_operations_entries (
          source_file_id,source_sheet,source_row,source_timestamp,work_date,
          project_name_raw,area_raw,supervisor_raw,male_count,female_count,total_manpower,
          work_detail,status_text,next_plan,afternoon_detail,specific_area,
          source_fingerprint,mapping_status,synced_at
        ) values (
          '1-ZSZXulxaje4vDP1ztvUBXsjlmffjAcDu0w1OHRnpUw','การตอบแบบฟอร์ม 1',
          v_row,v_stamp,v_date,nullif(r->>'project_name_raw',''),
          nullif(r->>'area_raw',''),r->>'supervisor_raw',v_male,v_female,v_total,
          nullif(r->>'work_detail',''),nullif(r->>'status_text',''),
          nullif(r->>'next_plan',''),nullif(r->>'afternoon_detail',''),
          nullif(r->>'specific_area',''),v_fp,'pending',now()
        ) returning id into v_entry_id;
        insert into public.labour_verification_batches
          (site_operations_entry_id,work_date,supervisor_raw,verification_status)
          values(v_entry_id,v_date,r->>'supervisor_raw','pending');
        for v_code in select distinct value from jsonb_array_elements_text(v_codes) as c(value) loop
          select id into v_code_id from public.projects where code=v_code;
          insert into public.site_operations_entry_projects(entry_id,project_id,mapping_method)
            values(v_entry_id,v_code_id,'source_project') on conflict do nothing;
        end loop;
      end if;
    else
      v_expected := v_expected || jsonb_build_object(v_key,v_prior.source_fingerprint);
      if p_mode = 'commit' and (not p_expected ? v_key
        or p_expected->>v_key is distinct from v_prior.source_fingerprint) then
        raise exception 'DSR_CONCURRENT_SOURCE_REVISION: %',v_row;
      end if;
      -- Rows originally imported under AUTO|... contain manual normalization.
      -- Must not rewrite them or invalidate verified labour/payroll.
      if v_prior.source_fingerprint not like 'DSR2|%' then
        v_blocked := v_blocked + 1;
        v_problems := v_problems || jsonb_build_array(jsonb_build_object('row',v_row,'code','LEGACY_ROW_NEEDS_RECONCILIATION'));
      elsif v_prior.source_fingerprint = v_fp then
        v_skipped := v_skipped + 1;
      else
        select exists (
          select 1 from public.labour_verification_batches b
          where b.site_operations_entry_id=v_prior.id and (
            b.verification_status <> 'pending'
            or exists(select 1 from public.labour_daily_assignments a where a.batch_id=b.id)
            or exists(select 1 from public.payroll_verification_records pr where pr.labour_batch_id=b.id)
          )
        ) into v_has_locked_finance;
        if v_has_locked_finance
          or v_prior.supervisor_worker_id is not null
          or exists (
            select 1 from public.site_operations_entry_projects ep
            where ep.entry_id=v_prior.id and ep.mapping_method='manual'
          )
          or exists (
            select 1 from public.site_operations_entry_projects ep
              join public.projects p on p.id=ep.project_id
            where ep.entry_id=v_prior.id and ep.mapping_method='source_project'
              and not exists (
                select 1 from jsonb_array_elements_text(v_codes) c(value)
                where c.value=p.code
              )
          )
          or exists (
            select 1 from jsonb_array_elements_text(v_codes) c(value)
            where not exists (
              select 1 from public.site_operations_entry_projects ep
                join public.projects p on p.id=ep.project_id
              where ep.entry_id=v_prior.id and ep.mapping_method='source_project'
                and p.code=c.value
            )
          )
          or v_prior.project_name_raw is distinct from nullif(r->>'project_name_raw','')
          or v_prior.area_raw is distinct from nullif(r->>'area_raw','')
          or v_prior.supervisor_raw is distinct from r->>'supervisor_raw'
          or v_prior.work_date is distinct from v_date then
          v_blocked := v_blocked+1;
          v_problems := v_problems || jsonb_build_array(jsonb_build_object('row',v_row,'code','LOCKED_SOURCE_REVISION_REQUIRES_REVIEW'));
        else
          v_updated := v_updated+1;
          if p_mode='commit' then
            update public.site_operations_entries set
              source_timestamp=v_stamp,
              male_count=v_male,female_count=v_female,total_manpower=v_total,
              work_detail=nullif(r->>'work_detail',''),
              status_text=nullif(r->>'status_text',''),
              next_plan=nullif(r->>'next_plan',''),
              afternoon_detail=nullif(r->>'afternoon_detail',''),
              specific_area=nullif(r->>'specific_area',''),
              source_fingerprint=v_fp,synced_at=now(),updated_at=now()
            where id=v_prior.id;
          end if;
        end if;
      end if;
    end if;
    if p_mode='commit' and v_blocked>0 then
      raise exception 'DSR_BLOCKED_SOURCE_ROWS: %',v_problems;
    end if;
    if p_mode='commit' then
      perform 1 from public.site_operations_entries e
        where e.source_file_id='1-ZSZXulxaje4vDP1ztvUBXsjlmffjAcDu0w1OHRnpUw'
          and e.source_sheet='การตอบแบบฟอร์ม 1' and e.source_row=v_row
          and e.source_fingerprint=v_fp;
      if not found then raise exception 'DSR_READBACK_MISMATCH: %',v_row; end if;
      v_verified := v_verified + 1;
    end if;
  end loop;
  v_result := jsonb_build_object('mode',p_mode,'rows_read',p_source_rows_read,
    'rows_parsed',v_parsed,'would_insert_or_inserted',v_inserted,
    'would_update_or_updated',v_updated,'skipped',v_skipped,
    'verified',v_verified,'blocked',v_blocked,'problems',v_problems,
    'expected',v_expected);
  if p_mode='commit' and (v_inserted+v_updated)>0 then
    insert into public.daily_site_report_sync_audit
      (source_file_id,source_sheet,source_revision,source_rows_read,rows_parsed,
        rows_inserted,rows_updated,rows_skipped,rows_verified)
    values ('1-ZSZXulxaje4vDP1ztvUBXsjlmffjAcDu0w1OHRnpUw','การตอบแบบฟอร์ม 1',
      p_source_revision,p_source_rows_read,v_parsed,v_inserted,v_updated,v_skipped,v_verified);
  end if;
  return v_result;
end
$function$;
revoke all on function public.daily_site_report_sync_v1(jsonb,text,jsonb,integer,text) from public,anon,authenticated;
grant execute on function public.daily_site_report_sync_v1(jsonb,text,jsonb,integer,text) to service_role;
comment on function public.daily_site_report_sync_v1(jsonb,text,jsonb,integer,text)
is 'Standalone Daily Site Report sync: service-role-only, CAS dry-run->commit, source row>=354, blocks legacy/verified/manual, verified readback';
