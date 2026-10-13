-- 2026-10-13: Restrict payroll read access for Viewer and Viewer & Editor.
-- Preserve owner/admin and existing Purchase payroll visibility.
-- Do not change Defect, procurement, site operations, schedules, account assignments or OOO/OOS.
-- Defect-only roles are already excluded by private.is_active_user(); this adds
-- explicit role allowlists to the only two payroll verification tables.
ALTER POLICY "payroll roles read payroll records"
ON public.payroll_verification_records
USING ((select private.is_active_user()) AND (select private.has_app_role(ARRAY['manager','admin','purchase','engineer','payroll'])));

ALTER POLICY "payroll roles read payroll items"
ON public.payroll_verification_items
USING ((select private.is_active_user()) AND (select private.has_app_role(ARRAY['manager','admin','purchase','engineer','payroll'])));
