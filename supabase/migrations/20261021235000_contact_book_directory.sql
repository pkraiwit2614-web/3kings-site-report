-- Contact Book only: replace Drive key/CSV writeback with the existing Supabase Auth + Role Matrix.
-- No source contacts are committed to the public GitHub repository.
begin;

create table if not exists public.contact_book_directory (
  id smallint primary key default 1 check (id=1),
  entries jsonb not null check (jsonb_typeof(entries)='array' and jsonb_array_length(entries)>=41),
  revision bigint not null default 1 check (revision>0),
  updated_at timestamptz not null default now()
);
alter table public.contact_book_directory enable row level security;
revoke all on public.contact_book_directory from public, anon, authenticated;
grant select on public.contact_book_directory to authenticated;

create or replace function public.contact_book_can(p_action text)
returns boolean language sql stable security definer set search_path=''
as $$
  select coalesce((
    select case when p_action='view' then m.level<>'none'
                when p_action='manage' then m.level='manage'
                else false end
    from private.role_permission_matrix m
    where m.module='contact_book' and m.role=private.matrix_role()
  ), false);
$$;
revoke all on function public.contact_book_can(text) from public, anon, authenticated;
grant execute on function public.contact_book_can(text) to authenticated;

drop policy if exists contact_book_directory_read on public.contact_book_directory;
create policy contact_book_directory_read on public.contact_book_directory
  for select to authenticated using (public.contact_book_can('view'));

create or replace function public.contact_book_save(
  p_expected_revision bigint, p_existing_id text, p_contact jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_entries jsonb;
  v_revision bigint;
  v_before jsonb;
  v_after jsonb;
  v_idx int;
  v_next_id text;
  v_key text;
  v_phone text;
  v_secondary text;
  v_user uuid := auth.uid();
  v_duplicate boolean;
  v_updated timestamptz;
  v_allowed text[] := array['category','service_group','organization','contact_name','phone','work_scope','project_area','review_note','secondary_phone','active','aliases'];
begin
  if v_user is null or not public.contact_book_can('manage') then
    raise exception 'CONTACT_BOOK_FORBIDDEN';
  end if;
  if p_expected_revision is null or p_expected_revision<1 then
    raise exception 'contact_book_version_required';
  end if;
  if p_contact is null or jsonb_typeof(p_contact)<>'object' then
    raise exception 'contact_required_fields';
  end if;
  for v_key in select jsonb_object_keys(p_contact) loop
    if not (v_key=any(v_allowed)) or jsonb_typeof(p_contact->v_key)<>'string' then
      raise exception 'contact_invalid_fields';
    end if;
    if length(p_contact->>v_key)>case v_key
      when 'category' then 40 when 'service_group' then 140
      when 'organization' then 220 when 'contact_name' then 140
      when 'phone' then 35 when 'work_scope' then 500
      when 'project_area' then 220 when 'review_note' then 1200
      when 'secondary_phone' then 35 when 'active' then 10
      else 220 end then raise exception 'contact_field_too_long'; end if;
  end loop;
  if p_contact->>'category' not in ('ผู้รับเหมา','ร้านค้า','ภายใน')
    or p_contact->>'active' not in ('ใช่','ไม่ใช่')
    or nullif(btrim(p_contact->>'organization'),'') is null
    or nullif(btrim(p_contact->>'contact_name'),'') is null
    or nullif(btrim(p_contact->>'work_scope'),'') is null
    or nullif(btrim(p_contact->>'project_area'),'') is null then
    raise exception 'contact_required_fields';
  end if;
  v_phone := regexp_replace(coalesce(p_contact->>'phone',''),'[^0-9]','','g');
  v_secondary := regexp_replace(coalesce(p_contact->>'secondary_phone',''),'[^0-9]','','g');
  if length(v_phone) not between 9 and 15
    or left(v_phone,1)<>'0' or coalesce(p_contact->>'phone','') !~ '^[0-9 +()\-]+$'
    or (v_secondary<>'' and (length(v_secondary) not between 9 and 15
       or coalesce(p_contact->>'secondary_phone','') !~ '^[0-9 +()\-]+$')) then
    raise exception 'invalid_contact_phone';
  end if;
  select entries, revision into v_entries,v_revision
    from public.contact_book_directory where id=1 for update;
  if not found then raise exception 'contact_book_not_initialized'; end if;
  if v_revision<>p_expected_revision then raise exception 'contact_book_version_conflict'; end if;
  if p_existing_id is not null then
    if p_existing_id !~ '^3KC-[0-9]{4,}$' then raise exception 'invalid_contact_id'; end if;
    select e.value,e.ordinality::int-1 into v_before,v_idx
      from jsonb_array_elements(v_entries) with ordinality e(value,ordinality)
      where e.value->>'contact_id'=p_existing_id limit 1;
    if v_before is null then raise exception 'contact_not_found'; end if;
    v_after := v_before || p_contact;
    v_entries := jsonb_set(v_entries,array[v_idx::text],v_after);
  else
    select '3KC-'||lpad((coalesce(max(substring(e.value->>'contact_id' from '[0-9]+$')::int),0)+1)::text,4,'0')
      into v_next_id from jsonb_array_elements(v_entries) e(value);
    v_after := jsonb_build_object(
      'contact_id',v_next_id,'verified_status','เพิ่มผ่านเว็บไซต์ รอตรวจสอบ',
      'source_file','Contact Book Web App','source_url','',
      'source_reference_date',to_char(now() at time zone 'Asia/Bangkok','DD/MM/YYYY')
    ) || p_contact;
    v_entries := v_entries || jsonb_build_array(v_after);
  end if;
  select exists (
    select 1 from (
      select regexp_replace(p.phone,'[^0-9]','','g') as phone,p.contact_id
      from jsonb_array_elements(v_entries) e(value)
      cross join lateral (values
        (e.value->>'contact_id',coalesce(e.value->>'phone','')),
        (e.value->>'contact_id',coalesce(e.value->>'secondary_phone',''))
      ) p(contact_id,phone)
    ) d where phone<>'' group by phone having count(distinct contact_id)>1
  ) into v_duplicate;
  if v_duplicate then raise exception 'duplicate_contact_phone'; end if;
  update public.contact_book_directory
    set entries=v_entries,revision=v_revision+1,updated_at=now()
    where id=1 returning updated_at into v_updated;
  insert into private.contact_book_audit(actor,contact_id,previous_data,new_data,drive_version)
    values(v_user,v_after->>'contact_id',v_before,v_after,(v_revision+1)::text);
  return jsonb_build_object('record',v_after,'sourceVersion',(v_revision+1)::text,'updatedAt',v_updated,'saveVerified',true);
end;
$$;
revoke all on function public.contact_book_save(bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.contact_book_save(bigint,text,jsonb) to authenticated;
commit;
