# Issue #201 — SmartSync Defects three-field projection: offline QA and release hold

## Decision
**REVIEW BRANCH ONLY. NOT DEPLOYED. Issue #201 remains OPEN until protected production-facing proof exists.**

- Source: private authorized Google Apps Script `projects.getContent` HEAD snapshot supplied on 21 October 2026; source project updated 20 October 2026. Private content remains outside this public repository.
- GitHub current main uses **older** `docs/apps-script/SmartSyncDefects_v1.3_2026-10-02.gs` reference. Do **not** replace Live with Git, change the fingerprint manifest, or commit full private source.
- Private historical snapshot SHA-256 (source content only): `e66de3e7f1b7cc40bbc5d669815bf8f971226ea538c0e70cb4422a28c3f49b2b`.
- Proposed offline-only candidate SHA-256: `39ba227784dab620463bdb16ed1d484e95a25e978df8a45cab95c88f6e59b1f9`.
- Actual patch is exactly three assignments inside `runDefectSyncV13_`: pass `src.current_status`, `src.status_group`, `src.next_action` directly to the **existing SQL guard** instead of pre-projecting `old` when `latest_source='Web App manual update'`.
- Unchanged: `latest_source`, `source_note`, `defect_detail`, 263-room A162/B101 validation, exact master source check, scoped five-room pilot, trigger handlers/frequency, Script Properties, all other Live files.

## Evidence recorded in current review
- Read Google Drive ACTIVE SOP INDEX, complete related SOP 01/13/15/16, repository AGENTS/Skills and six standing rules.
- Read-only **Production** DB inspection: `public.defect_web_override_before_sync` trigger enabled; `public.defect_web_override_protect()` has approved newer Excel/per-field reconciliation, pending-override guard and special five-room safeguard. Function MD5 on inspection: `e8e902111b5f5f01d74e05d0c95d4d63`.
- Production database read-only inventory: 263 rooms (A162/B101); 75 synced override entries, of which 64 still have Web manual provenance. This is an exposure cohort, not proof of 64 incorrect records. `accepted_excel` audit records observed: 14.
- Approved master Drive workbook identity/mime verified; master modified 20 October 2026 08:11:23Z. Do not infer that the old HEAD snapshot or dry-run proves current runtime version.
- Historical 21 Oct user-run SmartSync dry-run: 263 rooms / changed 0; scheduled trigger later skipped unchanged source. This is old unmodified handler evidence and **not** candidate integration QA.
- On private historical Live snapshot: deterministic **exactly 3 removed + 3 added** assignment lines. Node 22 syntax check PASS via temporary .js copy. 6 private full-source VM fixture tests PASS: baseline reproduces pre-projection, candidate allows Excel proposals, no Web override, bad workbook guard, 263-row dry-run zero DB writes, five-room scoped guard. Mocks are **not** Supabase trigger/Apps Script integration.
- Separate public **five** synthetic no-credential regression tests PASS locally and are wired into existing GitHub build CI. This is safety of the patch tool, not a live fix.

## Public branch additions
- `scripts/ai-operations/patch-smart-sync-projection.cjs`: **OFFLINE ONLY**. Requires caller-supplied private source and distinct private output file; refuses missing/duplicated expressions, changed safety guards, overwrites, in-place output or output under repository root. Never calls Apps Script, Drive, Supabase, GitHub, Vercel or trigger installers.
- `tests/ai-operations-smart-sync-projection.test.cjs`: standalone synthetic patcher tests.
- Add one affected QA command to existing CI build, no deployment behavior change.

## Mandatory remaining gates for closing #201 / activating any candidate
1. Fresh **authorized** read-only Apps Script HEAD/version and file identity/fingerprint versus historical private snapshot. If it changed, re-diff and reassess; never apply stale patch. Verify trigger inventory/installed handler and master workbook revision.
2. Run **actual SQL-trigger integration** against disposable/isolated Supabase Local fixture with existing `defect_web_override_protect()`, field-version tables and triggers for: pending override; synced override with newer approved Excel; older/unapproved Excel; conflicting accepted revision; no override; five special Hotel Engineer room cases; exact room inventory and Combine alias. No writes to Production to create a QA fixture.
3. Code-review three-line surgical diff against current Live source, then use an **authorized Apps Script release path** with rollback copy/version; do not use this public Git reference as a deploy artifact.
4. Run actual nonwriting GAS dry-run on patched candidate (263 rooms and changed/written/verified), then controlled release/readback of script version, trigger, source revision, Supabase values + audit and signed-in Web UI. Guard against overwriting pending Web manual changes. Stop on any discrepancy.
5. Close only after proof of no unintended changes in Daily, Materials, Work Order, Payroll, OOO/OOS, Calendar, role/RLS and Excel writeback, or documented narrow verified impact.

## Status
- PASS: Surgical candidate diff, private-snapshot VM regression, public unit tests, source identity and read-only Production SQL observation.
- PENDING: Fresh HEAD revalidation, isolated *actual SQL trigger* E2E, authorized GAS runtime update, active handler and end-to-end production readback.
- NO_CHANGE: GitHub main, Apps Script Live, triggers, Properties, Defect data, Excel, Supabase, Vercel/Production.
- Hosted Vercel Preview is not necessary for this non-web candidate; it cannot validate Apps Script or the live SQL trigger.
