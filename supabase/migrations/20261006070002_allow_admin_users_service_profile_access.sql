-- 2026-10-06: allow the owner-gated admin-users Edge Function to persist
-- non-owner access changes while keeping the profile privilege trigger enforced.
create or replace function private.enforce_profile_privilege_changes()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_owner constant uuid := 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid;
begin
  if new.role is distinct from old.role or new.active is distinct from old.active then
    if current_user = 'service_role' then
      if old.user_id = v_owner then
        raise exception 'cannot change owner access';
      end if;
      if new.role not in (
        'admin','viewer','viewer_editor','defect_contributor','defect_editor','purchase',
        'engineer','foreman','payroll'
      ) then
        raise exception 'invalid service access role';
      end if;
      return new;
    end if;

    if not (select private.has_app_role(array['manager'])) then
      raise exception 'manager permission required';
    end if;
    if old.user_id = (select auth.uid()) then
      raise exception 'cannot change your own access';
    end if;
  end if;
  return new;
end;
$$;
