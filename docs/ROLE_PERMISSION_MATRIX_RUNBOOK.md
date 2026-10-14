# Editable Role Permission Matrix

The Owner opens System & Access → Permission Matrix. Changes are staged, reviewed and explicitly confirmed before saving. A save applies only the changed cells, atomically, with a revision check. Conflicts require reloading. Restore defaults is also staged and requires confirmation.

## Baseline and scope

- Seven existing roles, fourteen modules, 98 cells. Work Plan is separate from Room Status.
- No profile assignments, business records, formulas, source data or sync credentials are changed by the migration.
- Owner and System & Access / Activity History / Data Reconciliation cells remain locked.
- Unchanged database cells delegate to the exact previous authorization predicate. Existing legacy role aliases, ownership and business validation remain in place.
- Shared display data remains available through other authorized modules. Revoking one page does not revoke data needed by another permitted page.
- New database requests use current permissions immediately; open pages refresh on focus or within 30 seconds. Previously downloaded data cannot be recalled.
- Server routes use request-local permission snapshots. Browser state is never trusted as server authorization.

## Release sequence

1. Confirm main and production SHA, then run the current regression suite and build.
2. Run `tests/editable-role-matrix-db.sql` through psql (it includes the migration and always rolls back). The migration fails if any captured function or policy has drifted.
3. Verify browser behavior using synthetic sessions and intercepted services: `tests/role-matrix-browser.cjs` and `tests/editable-role-matrix-browser.cjs`. These tests never write live data.
4. Apply `20261014190000_editable_role_permission_matrix.sql` once through the Supabase migration API, before releasing the application that reads its RPCs.
5. Verify 98 cells, revision 1, zero overrides and empty history; confirm profile assignments are unchanged.
6. Release the application and verify the production deployment SHA and health.

The database regression covers baseline visibility for seven actual role profiles and 26 tables, owner-only edits, locked cells, optimistic concurrency, audit and restore, plus 198 grant/deny cases across six non-owner roles and eleven existing write RPCs. Invalid payloads stop before business writes.

## Rollback

First revert the application deployment. If authorization rollback is needed, inspect and execute `supabase/Backup/role-matrix-authorization-rollback.sql`. It restores the captured functions/policies and preserves Matrix/history tables for investigation. Do not execute this snapshot over newer unrelated database changes without comparing definitions first. Restore-defaults through the UI is the preferred way to undo permission edits.

Same-folder Backup copies and captured database definitions are included for review. Browser tests use mocked service boundaries; database tests separately exercise real authenticated database authorization in rolled-back transactions. This is not a claim of an authenticated live-browser save test.
