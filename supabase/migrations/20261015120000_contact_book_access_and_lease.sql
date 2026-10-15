-- Contact Book preview migration. Do not apply before Preview / role / Drive QA.
-- This extends the existing matrix, without modifying any existing permission cell.
begin;

with additions as (
  insert into private.role_permission_matrix(role,module,level,default_level,locked)
  values
    ('owner','contact_book','manage','manage',true),
    ('admin','contact_book','view','view',false),
    ('viewer','contact_book','view','view',false),
    ('viewer_editor','contact_book','view','view',false),
    ('purchase','contact_book','manage','manage',false),
    ('defect_contributor','contact_book','none','none',false),
    ('defect_editor','contact_book','none','none',false)
  on conflict (role,module) do nothing
  returning role
)
update private.role_permission_revision
set revision=revision+1
where id=true and exists(select 1 from additions);

create table if not exists private.contact_book_write_lease (
  id boolean primary key default true check(id),
  lease uuid,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz
);
revoke all on private.contact_book_write_lease from public,anon,authenticated;
insert into private.contact_book_write_lease(id) values (true) on conflict do nothing;

create table if not exists private.contact_book_audit (
  id bigint generated always as identity primary key,
  actor uuid not null,
  contact_id text not null,
  previous_data jsonb,
  new_data jsonb not null,
  drive_version text not null,
  changed_at timestamptz not null default now()
);
revoke all on private.contact_book_audit from public,anon,authenticated;

create or replace function public.contact_book_acquire_write()
returns uuid
language plpgsql security definer set search_path=''
as $$
declare v uuid;
begin
  if not exists (
    select 1 from private.role_permission_matrix m
    where m.role=private.matrix_role() and m.module='contact_book' and m.level='manage'
  ) then raise exception 'CONTACT_BOOK_FORBIDDEN'; end if;
  perform 1 from private.contact_book_write_lease where id=true for update;
  if exists(select 1 from private.contact_book_write_lease where id=true and lease is not null and expires_at>now())
  then raise exception 'CONTACT_BOOK_BUSY'; end if;
  v:=gen_random_uuid();
  update private.contact_book_write_lease set lease=v,expires_at=now()+interval '2 minutes',
    created_by=auth.uid(),created_at=now() where id=true;
  return v;
end $$;

create or replace function public.contact_book_release_write(
  p_lease uuid,
  p_contact_id text default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_drive_version text default null
)
returns boolean
language plpgsql security definer set search_path=''
as $$
declare v_user uuid;
begin
  v_user:=auth.uid();
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  perform 1 from private.contact_book_write_lease where id=true for update;
  if not exists (
    select 1 from private.contact_book_write_lease
    where id=true and lease=p_lease and created_by=v_user
  ) then raise exception 'CONTACT_BOOK_LEASE_MISMATCH'; end if;
  if p_after is not null then
    if nullif(trim(p_contact_id),'') is null or nullif(trim(p_drive_version),'') is null
    then raise exception 'CONTACT_BOOK_AUDIT_REQUIRED'; end if;
    insert into private.contact_book_audit(actor,contact_id,previous_data,new_data,drive_version)
    values (v_user,p_contact_id,p_before,p_after,p_drive_version);
  end if;
  update private.contact_book_write_lease
    set lease=null,expires_at=null,created_by=null,created_at=null where id=true;
  return true;
end $$;

revoke all on function public.contact_book_acquire_write() from public,anon;
revoke all on function public.contact_book_release_write(uuid,text,jsonb,jsonb,text) from public,anon;
grant execute on function public.contact_book_acquire_write() to authenticated;
grant execute on function public.contact_book_release_write(uuid,text,jsonb,jsonb,text) to authenticated;

commit;
