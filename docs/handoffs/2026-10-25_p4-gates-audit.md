# 3 Kings P4 execution-gates handoff — 2026-10-25

Scope: six existing DRAFT PRs only. This is a documentation-only handoff for the existing branch, **not** an acceptance, merge, migration, production deploy, feature enablement or permission change. It contains no private credentials or raw business records.

## Verified at handoff
- ACTIVE Google Drive SOP index checked on 2026-10-25; use the latest ACTIVE SOPs, especially SOP 06/07, 09, 12–16, before each scoped operation.
- The latest HEAD GitHub Actions workflow runs available for PRs #167, #222, #213, #210, #197 and #209 report SUCCESS. Required checks and non-CI integration/release evidence must still be evaluated at the exact PR SHA and environment.
- All six PRs remained OPEN and DRAFT; none of these PRs was merged by this handoff.
- Current Vercel Production is READY on existing main commit a89f5b2; no P4 production rollout was performed.
- Supabase read-only inspection found proposed Express registry tables absent in Production. Do not enable master-to-DB write, cron, or merge a migration into Production until SOP gates and DB verification pass.
- Google Calendar mapping needs reconciliation of actual-progress and plan/site status. Calendar automatic write must remain disabled until Owner OAuth, complete source mapping, safe dry-run/diff and verification.
- An additional room-related Work Order source-vs-Supabase snapshot discrepancy was observed in read-only QA. Before calling that previously reported scope CLOSED, independently reconcile the exact original Work IDs, import log, source revision, DB and Web. Do not fabricate work orders or write to Production to make counts match.

## Per-PR executable next gates (independent scoped work)
1. **#167 Express Bridge**, DRAFT: verify source revision and scoped real full-history parser/E2E; assess exact supplier, line identity, Plot and qty; add/verify restart-safe atomic staging and zero duplicates; verify migration/RLS via isolated database; only then plan release. This work is independent of closing #213. NEVER infer 'received' from 'ordered'.
2. **#222 Google Calendar Sync**, DRAFT: verify source fields including actual_progress, plan_status, site_status and calendar events; use existing Owner OAuth path, run read-only dry-run and diff; keep CALENDAR_SYNC_ENABLED=false until complete authoritative mapping, no duplicates, role checks and safe runtime acceptance.
3. **#213 migration version repair**, DRAFT: exact SHA CI PASS and no active duplicate filename in proposed PR diff. Run a full-root isolated DB migration replay; document existing history/schema drift and role/RLS test effects. Never apply legacy Payroll SQL or repair migration history in Production merely to make CI green.
4. **#210 Work Order single writer**, DRAFT: preserve existing importer and disabled writer flag; test the isolated Web→authorized RPC→queue→same-ID XLSX→ACK→DB/UI flow, retries/conflicts/RLS using QA workbook and DB, never original records; only then review for release.
5. **#197 Materials/PR XLSX original-ID writeback**, DRAFT: exact HEAD CI safety PASS; verify real Apps Script identity and permissions; run disposable XLSX same-ID write/readback/rollback with formula, ZIP package, hash and idempotency protections. Original Master write stays disallowed until proven.
6. **#209 Photo Fast-Track**, DRAFT with merge conflict indication: revive investigation under user's new instruction but preserve no-live-rename gate. Resolve only scoped code/CI conflicts, verify owner-approved keyless WIF, read-only Drive inventory, same-Plot visual evidence, parser safety and private controlled rename/reverse test before any live Apply. Never weaken org IAM policy.

## Execution and exit contract
- First fetch origin and compare exact PR SHA, main, branch worktrees, latest ACTIVE SOP/revision and user rights. Do not repeat passing checks if source/config/environment unchanged.
- Work each independent PR and record: result PASS/FAIL/PENDING, changed files, exact SHA, isolated test evidence, source/DB/UI readback, blast radius, rollback, blockers, whether release permitted. Do not conflate unit/CI PASS with E2E or Production PASS.
- Preserve Defect, Materials, Daily, Payroll, Calendar, RBAC/RLS, Express and Excel Sync boundaries outside the PR under test. No stale HEAD overwrites, no generic force push, no writes to live master as a QA shortcut.
- When gates and actual permissions are satisfied, proceed within the ACTIVE release SOP and user-approved scope; otherwise stop **only the blocked task**, continue safe independent tasks.
- After each real change commit/push an isolated reviewed branch and verify remote readback. Avoid two agents writing the same branch/Production concurrently.
- An existing Daily Site Report publish remainder and Work Order snapshot discrepancy are separate P0 checks; coordinate with prior handoff without closing on unverified evidence.

## Prior handoff
Review the existing `docs/handoffs/2026-10-25_home_p0_execution_report.md` on `close_daily_site_report` before working. Update the P4 register only with independently verified outcomes.
