# Verification — 14 October 2026

## Refresh — 15 October 2026 Bangkok

Merged current main `f76831ae24487fdaf6da7be1bac0ee46c526b6fd` (optional password changes and shared Viewer Auth lock), confirmed READY in production. Preserved its account-route restrictions and password-change helper while integrating dynamic permissions. Build passed (38 pages); regression suite passed 138 tests, including password and shared Viewer tests. Repeated the rolled-back database tests: zero baseline differences. The previous Chromium results below predate this merge.

Push remained blocked by automatic approval review: the user's continuation was not accepted as explicit authorization for uploading source and database definitions to the repository. No alternate upload or production change was attempted. Explicit authorization to push the feature branch to `pkraiwit2614-web/3kings-site-report` is required before PR/Preview work can proceed.

Base: main `0563f7d6b4fa9c094c907092b9612774ff79aedf`, confirmed as the READY production deployment before this work was released.

- Production build: passed (37 pages).
- Regression suite: 119 passed, zero failures.
- Original role matrix: 198 allow/deny assertions passed.
- Database: 182 baseline visibility comparisons across seven actual role profiles and 26 tables, zero differences. All test changes rolled back.
- Database: owner-only access, locked cells, revision conflict, audit, restore and 198 grant/deny cases across eleven existing write RPCs passed.
- Chromium owner workflow: passed staged edits, explicit confirmation, minimal RPC payload, reload persistence, restore and cancel. No page errors. Service calls were intercepted; this did not modify production.
- Chromium role regression: all six non-owner roles passed editor visibility, navigation and direct-route restrictions, with no page errors.

The migration and application have not been released. A final read confirmed the Matrix table is absent and 23 active profiles remain. Git push was rejected by automatic approval review because explicit authorization to upload source and captured database definitions to the remote was not established. No alternate upload was attempted.

Review the release and rollback sequence in `ROLE_PERMISSION_MATRIX_RUNBOOK.md` before rollout. Successful isolated tests do not replace the remaining Preview/CI and production verification gates.

## Database installation — 15 October 2026 Bangkok

Explicit user approval received for GitHub upload, PR/Preview and Supabase installation while preserving all existing permissions. PR #110 is open, CI run 38652218723 passed, Preview dpl_96NkspZykwapFwnk6FG4Q62r7yny is READY. The final password-integrated local build passed Chromium Owner workflow and six non-owner role checks with intercepted services.

Applied Supabase migration `20261014231301_editable_role_permission_matrix_preserve_defaults` to `wtqubwdduzedmcvyhbgs`. Installation included 182 before/after visibility comparisons and an exact profile-role fingerprint guard in the same transaction. Post-install results: 98 cells, zero changed defaults, revision 1, zero history, 23 active profiles, identical profile fingerprint, zero unlocked Owner cells and zero anonymous executable Matrix functions. The 198 grant/deny cases and owner/concurrency/audit/restore tests passed again after installation, with all test mutations rolled back.

Advisor changes are the three intentionally private RLS tables with no client policies, and four explicitly authenticated security-definer RPCs. Anonymous function warnings did not increase. Owner-only save/history and active-profile read guards were tested.

The application PR is not merged and the production frontend remains unchanged. The database prerequisite for authenticated Preview testing is now installed. A real authenticated Preview session/save has not been tested; do not confuse isolated Chromium/database checks with that gate.
