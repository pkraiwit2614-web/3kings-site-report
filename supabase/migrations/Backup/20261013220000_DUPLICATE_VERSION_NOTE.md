# Duplicate migration version 20261013220000 — historical reconciliation

Checked on 2026-10-22 against GitHub main and the connected 3 Kings Supabase production migration history (read-only).

- Two root SQL files originally shared version `20261013220000`, but contain unrelated DDL/RLS logic.
- `shared_calendar_procurement_dates.sql` is the original SQL blob now placed under version `20261013152531`, matching the already-recorded remote migration version/name `shared_calendar_procurement_dates_20261013`. Do not treat this rename as a newly applied migration.
- `purchase_calendar_payroll_roles.sql` is archived here verbatim. Its version `20261013220000` was not found in the remote migration history. Its old `ALTER POLICY` statements would override current Payroll Permission Matrix policy predicates if replayed on the current live schema.
- The current remote Payroll read policies use `private.matrix_allowed('payroll','view',...)`; the existing `20261014231301_editable_role_permission_matrix_preserve_defaults.sql` supersedes the old policy semantics.
- No SQL has been executed, no migration history has been repaired, and no Production/role/calendar data has been changed by this repository-only cleanup.

**Important:** This specifically resolves the duplicate version in the root migration folder. It does not certify that all historical root migrations and the live database have a complete 1:1 history or that a full blank-database replay succeeds. Validate any future `db push`, `db reset` or history repair on an isolated DB before Production.
