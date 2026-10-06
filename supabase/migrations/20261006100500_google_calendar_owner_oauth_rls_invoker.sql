grant usage on schema app_private to authenticated;
grant select, insert, update on table app_private.google_calendar_owner_token to authenticated;

drop policy if exists google_calendar_owner_token_select on app_private.google_calendar_owner_token;
create policy google_calendar_owner_token_select
on app_private.google_calendar_owner_token
for select
to authenticated
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.active = true
      and lower(coalesce(p.role,'')) in (
        'manager','admin','engineer','payroll','viewer','foreman',
        'viewer_editor','defect_editor','purchase'
      )
  )
);

drop policy if exists google_calendar_owner_token_insert on app_private.google_calendar_owner_token;
create policy google_calendar_owner_token_insert
on app_private.google_calendar_owner_token
for insert
to authenticated
with check (
  auth.uid() = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid
  and id = 'owner'
);

drop policy if exists google_calendar_owner_token_update on app_private.google_calendar_owner_token;
create policy google_calendar_owner_token_update
on app_private.google_calendar_owner_token
for update
to authenticated
using (
  auth.uid() = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid
  and id = 'owner'
)
with check (
  auth.uid() = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid
  and id = 'owner'
);

create or replace function public.google_calendar_owner_token_upsert(p_ciphertext text)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private
as $$
begin
  if auth.uid() is null or auth.uid() <> 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_ciphertext is null or length(p_ciphertext) < 40 or length(p_ciphertext) > 12000 then
    raise exception 'invalid_ciphertext' using errcode = '22023';
  end if;

  insert into app_private.google_calendar_owner_token(id, encrypted_refresh_token, updated_by, updated_at)
  values ('owner', p_ciphertext, auth.uid(), now())
  on conflict (id) do update
    set encrypted_refresh_token = excluded.encrypted_refresh_token,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
end;
$$;

create or replace function public.google_calendar_owner_token_get()
returns text
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private
as $$
declare
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select encrypted_refresh_token
    into v_token
  from app_private.google_calendar_owner_token
  where id = 'owner';

  return v_token;
end;
$$;

revoke all on function public.google_calendar_owner_token_upsert(text) from public;
revoke all on function public.google_calendar_owner_token_upsert(text) from anon;
grant execute on function public.google_calendar_owner_token_upsert(text) to authenticated;

revoke all on function public.google_calendar_owner_token_get() from public;
revoke all on function public.google_calendar_owner_token_get() from anon;
grant execute on function public.google_calendar_owner_token_get() to authenticated;
