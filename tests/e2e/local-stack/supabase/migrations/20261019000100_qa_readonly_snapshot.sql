-- Disposable CI-only approximation of the live five-table SELECT policies,
-- captured read-only from Supabase on 2026-10-19.
-- Production migrations are intentionally not replayed: they lack a base schema.
-- Do NOT link this local project, run remote migrations or seed real user data.
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE public.profiles (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 email text, username text, full_name text, role text NOT NULL,
 active boolean NOT NULL DEFAULT false, updated_at timestamptz DEFAULT now()
);
CREATE TABLE private.role_permission_matrix (
 role text NOT NULL, module text NOT NULL,
 level text NOT NULL DEFAULT 'none',
 default_level text NOT NULL DEFAULT 'none',
 locked boolean NOT NULL DEFAULT false,
 PRIMARY KEY(role,module)
);
CREATE TABLE private.role_permission_revision (id boolean PRIMARY KEY DEFAULT true,revision int NOT NULL DEFAULT 1);
INSERT INTO private.role_permission_revision(id,revision) VALUES (true,1);
CREATE TABLE public.projects (
 id uuid PRIMARY KEY, code text, name text, site_group text, target_handover date,
 active boolean, sort_order integer
);
CREATE TABLE public.materials (
 id uuid PRIMARY KEY, project_id uuid, source_row integer,
 item_name text, status text, category text, source_location text,
 source_item_no text, status_detail text, data_group text, synced_at timestamptz
);
CREATE TABLE public.condo_room_status (
 room_no text PRIMARY KEY, building text, floor integer, owner_name text,
 hotel_participation text, customer_status text, current_status text, status_group text,
 follow_up text, priority text, next_action text, defect_detail text,
 latest_source text, source_note text, source_modified_at timestamptz, synced_at timestamptz
);
CREATE TABLE public.site_operations_entries (
 id uuid PRIMARY KEY, work_date date, project_name_raw text, area_raw text,
 total_manpower int, work_detail text, status_text text, next_plan text,
 mapping_status text, synced_at timestamptz, work_date_validation_status text, source_row int,
 supervisor_raw text
);
CREATE TABLE public.payroll_verification_records (id uuid PRIMARY KEY, note text);
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT SELECT ON public.profiles, public.projects, public.materials,
 public.condo_room_status,public.site_operations_entries,
 public.payroll_verification_records TO authenticated;
GRANT SELECT ON private.role_permission_matrix,private.role_permission_revision TO authenticated;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condo_room_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_operations_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_verification_records ENABLE ROW LEVEL SECURITY;
-- Function logic copied exactly for this restricted role set from live private schema.
CREATE OR REPLACE FUNCTION private.has_app_role(allowed_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$ SELECT EXISTS (SELECT 1 FROM public.profiles p
 WHERE p.user_id = (SELECT auth.uid()) AND p.active=true AND p.role=ANY(allowed_roles)); $function$;
CREATE OR REPLACE FUNCTION private.is_active_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$ SELECT EXISTS(SELECT 1 FROM public.profiles p
 WHERE p.user_id=(SELECT auth.uid()) AND p.active=true
 AND p.role NOT IN ('defect_contributor','defect_editor')); $function$;
CREATE OR REPLACE FUNCTION private.matrix_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$ SELECT CASE WHEN p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid
 AND p.role='manager' THEN 'owner'
 WHEN p.role IN ('manager','admin','engineer','payroll') THEN 'admin'
 WHEN p.role IN ('foreman','viewer') THEN 'viewer' ELSE p.role END
 FROM public.profiles p WHERE p.user_id=(SELECT auth.uid()) AND p.active=true; $function$;
CREATE OR REPLACE FUNCTION private.matrix_allowed(p_module text,p_action text,p_legacy boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$ DECLARE cell private.role_permission_matrix%ROWTYPE; r text:=private.matrix_role();
BEGIN IF r IS NULL THEN RETURN false; END IF;
SELECT * INTO cell FROM private.role_permission_matrix WHERE role=r AND module=p_module;
IF NOT FOUND OR cell.level=cell.default_level OR cell.locked THEN RETURN coalesce(p_legacy,false); END IF;
IF p_action='view' THEN RETURN cell.level<>'none'; END IF;
IF p_action='manage' THEN RETURN cell.level='manage'; END IF;
RETURN false; END $function$;
CREATE OR REPLACE FUNCTION private.matrix_can_read(p_modules text[],p_legacy boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$ DECLARE r text:=private.matrix_role();
BEGIN IF r IS NULL THEN RETURN false; END IF;
IF NOT EXISTS(SELECT 1 FROM private.role_permission_matrix m
 WHERE m.role=r AND m.module=ANY(p_modules) AND m.level<>m.default_level AND NOT m.locked)
THEN RETURN coalesce(p_legacy,false); END IF;
RETURN EXISTS(SELECT 1 FROM private.role_permission_matrix m
 WHERE m.role=r AND m.module=ANY(p_modules) AND m.level<>'none'); END $function$;
REVOKE ALL ON FUNCTION private.has_app_role(text[]),private.is_active_user(),
private.matrix_role(),private.matrix_allowed(text,text,boolean),
private.matrix_can_read(text[],boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.has_app_role(text[]),private.is_active_user(),
private.matrix_role(),private.matrix_allowed(text,text,boolean),
private.matrix_can_read(text[],boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.role_permission_matrix_read()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$ DECLARE result jsonb;
BEGIN IF private.matrix_role() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
SELECT jsonb_build_object('revision',(SELECT revision FROM private.role_permission_revision WHERE id),
'rows',jsonb_agg(to_jsonb(m) ORDER BY m.role,m.module))
INTO result FROM private.role_permission_matrix m;
RETURN result; END $function$;
GRANT EXECUTE ON FUNCTION public.role_permission_matrix_read() TO authenticated;
CREATE OR REPLACE FUNCTION public.defect_report_latest_change_at()
RETURNS timestamptz LANGUAGE sql STABLE AS $$ SELECT max(source_modified_at) FROM public.condo_room_status $$;
GRANT EXECUTE ON FUNCTION public.defect_report_latest_change_at() TO authenticated;

-- These are actual policy expressions read from pg_policies, limited to five fixture tables.
CREATE POLICY profiles_select_self_or_manager ON public.profiles FOR SELECT TO authenticated
 USING ((user_id = (SELECT auth.uid())) OR (SELECT private.has_app_role(ARRAY['manager'::text])));
CREATE POLICY projects_select_active ON public.projects FOR SELECT TO authenticated
 USING (private.matrix_can_read(ARRAY['dashboard'::text,'presentation'::text], (SELECT private.is_active_user())));
CREATE POLICY materials_select_active ON public.materials FOR SELECT TO authenticated
 USING (private.matrix_allowed('materials'::text,'view'::text,(SELECT private.is_active_user())));
CREATE POLICY "active users can view condo room status" ON public.condo_room_status FOR SELECT TO authenticated
 USING (private.matrix_can_read(ARRAY['defect'::text,'hotel'::text,'workplan'::text],
 (EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=(SELECT auth.uid()) AND p.active=true))));
CREATE POLICY "active users read site operations" ON public.site_operations_entries FOR SELECT TO authenticated
 USING (private.matrix_can_read(ARRAY['reports'::text,'payroll'::text],(SELECT private.is_active_user())));
CREATE POLICY "payroll roles read payroll records" ON public.payroll_verification_records FOR SELECT TO authenticated
 USING (private.matrix_allowed('payroll'::text,'view'::text,
 ((SELECT private.is_active_user()) AND (SELECT private.has_app_role(ARRAY['manager'::text,'admin'::text,'engineer'::text,'payroll'::text])))));
