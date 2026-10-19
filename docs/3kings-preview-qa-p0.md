# 3 Kings Preview QA — unified P0 test branch

Authority: Drive SOP 15 v1.1, 2026-10-19. CI/tests/docs only. No Production release, migration, data change or SOP edit.

## P0-1 — Use existing CI
The existing .github/workflows/ci.yml retains all its original build/regression steps, and adds:
- qa_contract: dependency-free Node tests for protected Preview URL allowlists, Viewer DB isolation guards and QA status classification
- qa_local_viewer: reviewed PR #155 Supabase Local + Next.js + Playwright Viewer Auth/UI/API/selected RLS, all with synthetic data
- qa_status: reports build, contracts and local Viewer results together for each pull request
- qa_preview_probe and qa_preview_browser: event-driven protected HTTP/anonymous-browser checks after a trusted deployment_status event, without invoking Vercel build/deploy
- qa_preview_status: deployment evidence summary, never treats skipped checks as pass

GitHub deployment_status workflows must already exist on the default branch to trigger. On this test branch, a passing PR workflow is not evidence that the deployment-status workflow ran.

## P0-2 — Precise test outcomes
- PASS: mandatory job ran and succeeded.
- SKIPPED: job was not executed (never PASS).
- BLOCK: job failed/canceled/unknown/missing, required matrix fails.
- BLOCK_VERCEL_PREVIEW_NOT_VERIFIED_BY_PR: Local PR tests passed but Preview was not proven in that PR run.
- BLOCK_AUTHENTICATED_PREVIEW_NOT_ISOLATED: anonymous Preview checks may pass, but authenticated Viewer Preview remains untested until Supabase is independently isolated.

QA local result may be green while Production release remains BLOCK. Do not set branch protection to accept this QA summary as a final release gate until reviewed against SOP 16.

## P0-3 — Avoid duplicate Vercel builds
- No new Vercel CLI command, build, deploy, external Supabase project, or Vercel project-setting change.
- Existing CI still runs one normal npm build. Local E2E performs a separate local Next build against localhost Supabase solely to check database-backed Viewer flows.
- Node contracts and status reporting do not build Next.
- Protected Preview probes are read-only and run after deployment, not by triggering a new deployment.
- Vercel Git integration may still build for each pushed commit. This patch DOES NOT disable it or eliminate the existing build-rate-limit.
- GitHub Actions runner quota and billing still apply based on plan and project visibility. Do not claim unlimited free usage.

## Impact and release safeguards
Unchanged: Defect/Combine, Work Order, Materials/Express PO, Daily Reports, Payroll, Calendar, Google Drive Sync, live RBAC/RLS, printer/PNG, TH/EN/RU, all 17 Skills, SOP and AGENTS.md.
Modified: only CI workflow, synthetic test fixtures, scripts and QA docs. No GitHub Ruleset change.
Do not merge, release, create a Production Viewer or send a protected Vercel bypass to an untrusted preview.

## Acceptance checklist
1. Compare branch against latest main; verify only CI/tests/docs and no unrelated changes.
2. Check QA contracts, Local Auth/UI/API/RLS and existing baseline CI on *this branch's exact commit*, not only historical PR #155.
3. Test PASS/SKIPPED/BLOCK cases; a skipped mandatory Viewer job must fail the local matrix.
4. Confirm protected Preview SHA/origin and pinned checker hashes; missing Vercel deployment means BLOCK.
5. Inspect Vercel build-rate-limit and Actions quota. No release claim without SOP 16 and live readback.

Historical benchmark: PR #155, commit d1636279, GitHub Actions #39260952136; these results do not prove the new branch passed.
