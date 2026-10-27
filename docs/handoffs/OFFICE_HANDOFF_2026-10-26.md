# 3 Kings Construction โ€” OFFICE HANDOFF (26 Oct 2026)

> **Status: PREPARED FOR OFFICE / NOT PRODUCTION-VERIFIED.** Home prepared a guarded SQL proposal and command plan. Nothing in this handoff authorizes Production SQL, migration repair, Drive Master write, Calendar sync, Photo rename, Deploy, or bypassing a safety gate.
>
> **Handoff source:** 25 Oct FULL BACKLOG CLOSURE report (`8b9e09e` on `complete_full_backlog_closure` and `full_backlog_closure_execution`, per home report). Verify current remote SHAs on arrival; these are not asserted as current future HEADs.

## 0. Office quick start (PowerShell, from the existing repository)

```powershell
# Office Computer = Acer / Antigravity IDE. Confirm current repository first.
git rev-parse --show-toplevel
git status --short --branch
git worktree list
git fetch origin --prune
# Inspect remote branches; do NOT force checkout a branch owned by another worktree.
git branch -r --list 'origin/complete_full_backlog_closure' 'origin/full_backlog_closure_execution' 'origin/qa/pr213-full-migration-replay-20261022' 'origin/fix/duplicate-migration-20261013220000' 'origin/feat/express-po-auto-sync-preview-20261019'
git log -1 --format='%h %s' origin/complete_full_backlog_closure
# If branch is NOT checked out in a different worktree, switch/pull as usual:
git switch complete_full_backlog_closure
git pull --ff-only origin complete_full_backlog_closure
Get-Content docs/handoffs/OFFICE_HANDOFF_2026-10-26.md -TotalCount 45
```

If `git switch` says the branch is checked out elsewhere, `Set-Location` to the path from `git worktree list`, inspect status, and `git pull --ff-only` there. Never `reset --hard`, force-push, stash/commit another task's unreviewed changes, or merge other PR branches merely to view them. The QA branch `qa/pr213-full-migration-replay-20261022` and the PR #213 branch `fix/duplicate-migration-20261013220000` are **different branches**; do not conflate them.

**Verified current sources at preparation time:** Drive `00-SOP_INDEX - 3Kings Construction` (SOP 06/07 v3.0, 12, 13, 14, 15, 16 v2.0; six common rules); GitHub PR #167, #213, #222, #197 and #209; home FULL BACKLOG CLOSURE log. Freshness and credentials must be revalidated at the office before any write.

## 1. Office pending work โ€” prioritized / exact gates

| ID | Current evidence/status from 25 Oct report | Office action | Strict completion evidence |
| --- | --- | --- | --- |
| **P0-1** Daily 24 Oct (เธเธฒเธขเธเนเธฒเธเธ•เนเธญ) | Sheets/PDF/PNG prepared; owner requested **12** workers while Form gender split is 7 male + 4 female = 11. | Ask for primary source evidence for **gender of worker #12**. Keep 12 as confirmed total; DO NOT infer the sex or silently adjust male/female. | Form/source evidence, scoped update to authorized report only, Sheet/PDF/PNG readback and unchanged other teams. |
| **P0-2** A421 | 9 Work IDs `DF-A421-01` โ€ฆ `DF-A421-09` awaiting inspection; report says receipt date unconfirmed, not in confirmed Combine master. | Get onsite inspection + verified actual receipt date + authorized dispatch approval; only then perform scoped Work Order handoff under ACTIVE Defect SOP. | Dispatch source ID/revision, verified 9 Work IDs, no fabricated dates, preserve `condo_room_status` and Combine rules. |
| **PR #213** 8-digit historical migration version drift | Repo QA replay collision: several `20260924_*.sql` files share CLI version `20260924`; PR #213 remains Draft. | Execute **read-only diagnosis and isolated replay** from ยง2; create unique-version plan from actual historical evidence. **Never patch Production history automatically.** | No duplicate parsed versions, fresh isolated replay PASS on exact SHA, schema + Payroll RLS regression, approved prod history plan. |
| **PR #167** Express register | Production missing `express_register_runs/rows` per home report; existing PR #167 already has `20261022220800_express_registry_read_model.sql`. | Review proposed extra SQL `20261026000000_prepare_express_staging.sql` against original migration; isolated local QA only. Pick a **single canonical release path** before applying. | Correct schema/ACL/RLS verified in disposable QA, no unintended table/policy changes, PR safety checks, Owner release gate. |
| **PR #222** Calendar 188 baseline | 7 calendars/188 events inventoried; Owner OAuth consent missing; flag `CALENDAR_SYNC_ENABLED=false`. | Owner opens linked Apps Script project and runs approved diagnostic to grant Calendar scope (ยง3). Then **dry-run only**, check write roles before any sync. | Approved OAuth scope, runtime diagnostics, dry-run exact baseline, idempotency; feature flag remains disabled until separately cleared. |
| **PR #209** Photo WIF | Offline QA pass; live WIF acceptance gated. | Review `photo-inventory-qa` protected Environment, WIF provider/reviewer and Drive Viewer shares. Only after setup/authorization attach `photo-live-qa` label to PR #209 for **inventory-only** acceptance. | Workflow exact SHA, correct workload identity, readonly inventory logs; no Live Apply/rename based on label alone. |
| **PR #197** XLSX same-ID writeback | Unit tests pass, Home has Drive readonly only. | Use Office's authorized Drive Write on a **disposable XLSX copy** (never Master), dry-run bounded cell diff, apply once, read back identical File ID and hashes, test repeat idempotency. | Revision/ACL preflight + same-ID+formulas+layout+file bytes readback; Master unchanged. |
| **PR #210** Work Order single writer | CI/unit QA pass, writer gates off. | Preserve `WORK_ORDER_SINGLE_WRITER_ENABLED=false` and `NEXT_PUBLIC_WORK_ORDER_COMPLETION_ENABLED=false` until separate release gate. | No production write or unapproved worker status changes. |
| **P0-3** LINE gateway | Code/trigger readiness reported, not final live execution on 26 Oct. | On 26 Oct *after* 07:30 Bangkok, inspect actual execution and downstream delivery logs without duplicate manual send. | Correlated runtime logs and real delivery result, not source readiness alone. |

## 2. PR #213 โ€” migration drift runbook (read-only first)

**Reason:** Supabase CLI extracts the part before the first `_` as the migration version. Four historical September files reported as `20260924_*.sql` collide on version `20260924`. PR #213's **separate** 14-digit duplicate `20261013220000` was already handled in repository: the applied script aligned to `20261013152531`; the obsolete Payroll script was archived under `Backup/`. Do not reactivate the old Payroll SQL. This is a distinct problem from the 8-digit collision.

### Step A. Preflight โ€” Office PowerShell

```powershell
# REPOSITORY ONLY; no Production write.
git fetch origin --prune
git show --stat origin/qa/pr213-full-migration-replay-20261022
git show --stat origin/fix/duplicate-migration-20261013220000
supabase --version
supabase migration list --help
supabase migration repair --help   # HELP ONLY; do not invoke repair yet.
$files = Get-ChildItem .\supabase\migrations -File -Filter '*.sql'
$versions = $files | ForEach-Object {
  $v = if ($_.BaseName -match '^(\d{8}|\d{14})_') { $Matches[1] } else { 'INVALID' }
  [pscustomobject]@{ Version = $v; File = $_.Name }
}
$versions | Group-Object Version | Where-Object { $_.Count -gt 1 } | Format-Table Count,Name
$versions | Where-Object { $_.Version.Length -eq 8 -or $_.Version -eq 'INVALID' } | Format-Table -AutoSize
```

Run file inventory on each **specific** branch/worktree; output on `complete_full_backlog_closure` may not contain PR #213's fixes yet. Snapshot `git status` and `git log` before any checkout. Never infer a version-to-SQL mapping solely from filename/time.

### Step B. Remote history: non-mutating inventory only

```powershell
# Confirm exact Supabase project in Dashboard before linking. No project ref is assumed.
supabase projects list
supabase link --help
# If the existing link is confirmed as intended Production, READ ONLY:
supabase migration list --linked
# Optional: secure DB connection environment is configured privately by Owner/DBA.
# Use only if PRODUCTION_DB_URL has been set securely; do not paste its value to logs.
if ($env:PRODUCTION_DB_URL) {
  psql "$env:PRODUCTION_DB_URL" -X -v ON_ERROR_STOP=1 -c "SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version;"
}
```

Save remote inventory as a protected local QA artifact **outside Git**, including original `version`, `name` and applied SQL source evidence. Verify Production schema/constraints/permissions by read-only catalog queries. Explicitly identify which old SQL was run manually or by previous deploy and which SQL has no proof. Back up/restore-test the database using authorized DBA workflow before considering even a history-only repair; protect personal/payroll data and credentials.

### Step C. Construct the mapping off-Production, not by arbitrary timestamps

1. Enumerate every `20260924_*.sql` and compute a SHA-256 hash for each (PowerShell `Get-FileHash`). Read SQL bodies and chronology/commit metadata.
2. Compare each with remote history (timestamp and name), schema objects already present, dependency order and immutable historical PR/commit evidence.
3. Produce an **explicit one-to-one approved mapping** for each old file โ’ unique 14-digit filename/version. Never invent seconds from filename order; if mapping is ambiguous, leave it HOLD.
4. Use a dedicated **QA branch/worktree**, preserve original SQL bytes, and avoid rewriting an already-applied migration without reconciliation. Run fresh-root replay with the existing `tests/fixtures/ci_isolated_migration_baseline.sql` and `.github/workflows/qa-pr213-full-root-replay.yml` against an isolated disposable database. CLI `db reset` permitted **only** for verified disposable local DB, never with `--linked` or remote URL.
5. Compare QA results with Production read-only schema: tables, constraints, views, trigger dependencies, RBAC/RLS and specifically **Payroll** `private.matrix_allowed` policies. Re-run exact-SHA CI. Record before/after migration list.

### Step D. Controlled production reconciliation โ€” STOP GATE

Only after a DBA approves the per-version mapping, proves actual prior execution of each SQL, verifies backup/rollback options and authorizes an isolated maintenance window, decide whether any `supabase migration repair` is needed. **Repair changes `supabase_migrations.schema_migrations` but does not execute SQL**. Marking `applied` for an unexecuted SQL, or `reverted` for a genuine applied SQL, can break future deployment. Use no speculative commands.

```powershell
# TEMPLATE ONLY -- DO NOT RUN UNTIL EXACT VERSION, APPROVAL AND DB PROOF ARE RECORDED:
# supabase migration repair <DBA_VERIFIED_VERSION> --status applied --linked
# OR, only when separately verified and authorized:
# supabase migration repair <DBA_VERIFIED_VERSION> --status reverted --linked
# After an APPROVED history-only repair, READ BACK:
# supabase migration list --linked
```

**Never run** on Production for this handoff: `supabase db reset --linked`, `supabase db push`, `supabase migration up --linked`, auto-squash, destructive SQL, direct `DELETE/UPDATE` of `supabase_migrations.schema_migrations`, or replay the old Payroll migration. If full QA fails, retain PR #213 **Draft/HOLD** and report exact failed file/version and blocker, not a false PASS.

CLI reference: https://supabase.com/docs/reference/cli/supabase-migration-list and https://supabase.com/docs/guides/deployment/database-migrations

## 3. PR #222 โ€” Owner Action Required (ready-to-send)

> **Owner Action Required โ€” Google Calendar (PR #222).** เธเธฃเธธเธ“เธฒเน€เธเธดเธ” [Apps Script Project 1](https://script.google.com/home/projects/1sKddwvs-DOav0ltdrcxyqPXYinXE3uCgFKmDzGu_XEb4VvMvYVwDUDeT/edit) เธ”เนเธงเธขเธเธฑเธเธเธต Owner โ’ เน€เธฅเธทเธญเธ `diagnoseCalendarAccess20261024` โ’ เธเธ” **Run** โ’ เธ•เธฃเธงเธเธซเธเนเธฒเธ•เนเธฒเธเธเธญเธชเธดเธ—เธเธดเน เนเธฅเนเธงเธเธ” **Allow** เนเธซเน Scope `https://www.googleapis.com/auth/calendar` เธซเธฒเธเน€เธเนเธเธเธฑเธเธเธตเนเธฅเธฐเนเธเธฃเน€เธเธเธ•เนเธ—เธตเนเธ–เธนเธเธ•เนเธญเธ เธเธฒเธเธเธฑเนเธเธชเนเธเธเธฅ Execution Log เธเธฅเธฑเธเธกเธฒ **เธขเธฑเธเนเธกเนเน€เธเธดเธ” Calendar Sync** (`CALENDAR_SYNC_ENABLED=false`).

**Important:** Link goes to the **Apps Script editor**, not to a pre-generated one-click consent URL. Google shows its own consent screen only after a function requests the necessary scope. If the diagnostic does not trigger consent, follow the live manifest and actual function selection; do not fake a direct Allow link. Owner must review actual permissions. Never share access tokens, Owner password or OAuth secrets.

## 4. PR #167 โ€” SQL preparation, comparison and QA

**Prepared draft file:** `supabase/migrations/20261026000000_prepare_express_staging.sql`.

- The real upstream PR #167 already contains `supabase/migrations/20261022220800_express_registry_read_model.sql`, which creates both required tables with RLS and read-only procurement policies. **Do not deploy both blindly.**
- Proposed draft is an **idempotent, fail-closed supplement**: if both tables already exist with RLS/policy names, it performs no writes; if only one exists or authorization dependencies are missing, it raises an exception; if neither exists, it creates exactly the upstream table/column/check/index/policy shape. It is *not* an authorization to skip original migration or its CI.
- On Office QA, first diff the draft against original PR #167 and verify live helper function signatures, permission matrix semantics, column/index/policy equality, no conflicting version, and completed migration history. If the upstream original can be safely promoted, prefer that as the **single canonical migration**, and consider **dropping the duplicate draft from the release PR** before it enters an active migration chain.
- In a disposable local DB only, test (a) both absent, (b) both matching/exists => no-op, (c) only one exists => fails atomically, (d) helper missing => fails atomically, (e) authenticated procurement view versus denied roles, (f) `service_role` trusted writer only, (g) no new receipts/PO statuses, (h) non-Express modules unaffected.
- Production `express_register_runs` and `express_register_rows` remain **unverified by this handoff**. Home report said missing; Office must recheck before deployment review.
- Never activate `EXPRESS_REGISTER_DISPLAY_ENABLED`, import/staging writer, or touch canonical XLSX/`procurement_items` based on table existence alone. PR #167 release remains Draft/HOLD until authorized QA and Production readback after a separate approved release.

## 5. Git persistence checklist for Antigravity (Home only โ€” no Production work)

1. Confirm fresh ACTIVE SOP and branch/worktree identity; avoid changing files outside the two paths listed in this handoff.
2. If the exact files are already on GitHub (GPT or another actor), **do not duplicate commits**. Read back content/SHA and report `NO_CHANGE`.
3. If files are untracked in an otherwise clean isolated worktree, execute `git status --short` then `git add .` as requested **only after verifying that `.` includes no credentials, tokens, logs or unrelated work**. Read `git diff --cached --name-only` and `git diff --cached --check` before commit.
4. Commit only when staged diff is limited to `supabase/migrations/20261026000000_prepare_express_staging.sql` and `docs/handoffs/OFFICE_HANDOFF_2026-10-26.md`:

```powershell
git add .
git diff --cached --name-only
git diff --cached --check
git commit -m "chore(handoff): prepare pending SQL and execution plan for office environment"
git push origin complete_full_backlog_closure
```

5. For `full_backlog_closure_execution` or QA branches, do not blindly `git push --all`, force-push, or merge independent histories. Check their `git status`, `git log origin/<branch>..<branch>` and `git diff` in each owning worktree; push **only branches with verified local commits to send**, using `git push origin <exact-branch>`. If already synchronized, report `UP_TO_DATE`; if a merge/conflict occurs, HOLD that branch and record details rather than overwriting anyone else's work.
6. Verify `git ls-remote origin refs/heads/complete_full_backlog_closure refs/heads/full_backlog_closure_execution refs/heads/qa/pr213-full-migration-replay-20261022`, remote file readback and resulting commit SHAs. Record push evidence and no-impact checks in this document or a subsequent immutable checkpoint; do not claim GitHub sync before verified.

## 6. Cross-system effects and non-change proof

| System | Home handoff changes | Risk / gate |
| --- | --- | --- |
| GitHub branches | Documentation + dormant migration source only | Branch divergence, accidental secret/unrelated staging, duplicate migration version โ€” check SHA and scoped diff. |
| Supabase Production | **NONE** | Runtime may create or change tables **only** via separate approved migration deployment. No schema/migration history touched by this handoff. |
| Drive / XLSX Master / PR / Materials | **NONE** | Preserve original File IDs, formulas, format, and existing Sync. Office test uses disposable copy for PR #197. |
| Defect / Work Order / Payroll | **NONE** | P0-2 requires independent onsite evidence. No legacy Payroll policy replay. |
| Daily Reports / PDF / PNG / LINE | **NONE** | P0-1 gender incomplete; no invented worker sex or duplicate LINE send. |
| Google Calendar | **NONE** | OAuth consent is Owner action; sync flag must remain off pending separate QA. |
| Photos / WIF | **NONE** | PR #209 label enables protected inventory-only test, **not** rename. |
| Vercel / RBAC / RLS | **NONE live** | SQL draft contains proposed read model RLS for isolated QA; no live role or app changes. |

**Completion definitions:** `PREPARED` means artifacts exist and are read back; `PUSHED` means GitHub remote branch SHA readback; `QA PASS` means tests on exact commit; `RELEASE READY` needs separate SOP 16 gate; `DONE` needs actual system readback. Do not collapse these states.
