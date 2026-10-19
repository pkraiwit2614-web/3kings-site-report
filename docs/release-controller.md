# 3 Kings Auto Release Controller — Phase 1 (read-only)

**State:** Test branch only. Does not auto-merge, auto-deploy, modify Supabase/Drive/Apps Script/LINE, or grant GitHub write permissions.

## Why it must be staged
The live Drive SOP 14/15/16 v1.1 requires a fresh full SOP check, exact PR/SHA authorization, CI/Preview checks, and Production/UI readback. This GitHub runner has no authenticated live Drive SOP reader and no separately isolated Vercel Preview database; those gates deliberately FAIL. A status code showing `build-rate-limit` has disappeared is not evidence of a successful exact-SHA Preview. GitHub `main` may be ahead of Production and contain unrelated SQL migrations, so automerging would affect unrelated real data.

## Queue and checks
- `config/release-queue.json` contains the existing 29 ordered PRs. #155 and #170 are **inspection candidates only**. The other 27 are on HOLD/RECONCILE.
- `.github/workflows/3kings-release-watch.yml` runs hourly at minute 13 UTC **after being merged to main**, with all GitHub permissions read-only. Pull requests run offline policy tests only.
- GitHub API checks PR state, expected GitHub Actions checks and exact SHA; Vercel API checks Production alias and exact-SHA Preview when read-only credentials are available.
- The policy blocks stale production, changes to SQL/API/Apps Script, missing SOP proof, missing approvals, Production-connected Preview tests, build-rate-limit, missing CI, missing credentials and pagination.
- Each run emits a GitHub Actions Step Summary; no secrets or business data are committed.

## Optional existing-platform configuration
Repo variables: `KINGS_VERCEL_PROJECT_ID`, `KINGS_VERCEL_TEAM_ID`, `KINGS_VERCEL_PRODUCTION_ALIAS`.
Actions secret: `KINGS_VERCEL_READ_TOKEN` (least-privilege Vercel project read access). Do not paste or commit tokens. Missing settings are reported as **UNVERIFIED**, not PASS. No additional paid product is introduced; regular provider limits still apply.

## Required next stage (not installed)
A separate executor needs: independently enforceable SOP Gate with fresh Google Drive INDEX/full SOP receipt; authorized PR+SHA grants; protected CI and branch rules; isolated authenticated Preview tests; cost/rate guard; serialized merges; full Production SHA/alias/UI/role verification; conflict/rollback handling. Grant `pull-requests:write` only to that separately reviewed executor, never to this watch workflow.

## Validation
Run `node --test tests/release-policy.test.mjs` locally. Open this PR and verify GitHub Actions policy tests, exact changed files, and branch Preview status. **Do not interpret this prototype as a deployed autonomous executor.**
