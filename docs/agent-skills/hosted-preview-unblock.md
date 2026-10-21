# Hosted Vercel Preview — exact-SHA on-demand unblock (SOP 15 / SOP 16)

**Authority:** The current ACTIVE Google Drive SOP Index and complete linked SOP 15/16; this is an operational reference, not authorization to deploy Production. Use only for first-party, in-scope PRs.

## Decision and diagnosis
1. Run GitHub Actions affected Build, regression and security tests first. When they **actually prove** the relevant behavior and access controls, record Hosted Preview = **NOT REQUIRED**; do not build it.
2. If Local/CI cannot prove required hosted cookies/OAuth/redirect/domain/API/runtime behavior, record the specific missing evidence. Do not label a failing functional/security test as an untested integration.
3. If no exact-HEAD READY Preview exists, check the Vercel deployment list for the PR SHA, project, Preview target and recent errors. `vercel.json` currently runs `scripts/vercel-preview-gate.cjs`; default Preview is SKIPPED by design. `.github/workflows/hosted-preview-on-demand.yml` verifies an **existing URL**; it does not create one.
4. If the cause is a real quota limit, an unavailable authorized token, missing first-party revision, invalid RBAC, unknown Production/Preview DB separation or a failing required check, do not bypass it. Repair the specific blocker or mark only the affected PR HOLD, with the actual error.

## Authorize ONE immutable Preview build
- Verify current first-party PR number, HEAD SHA, branch, diff, related changes, owner rights, mandatory GitHub required status checks, Vercel project/team and environment. Never reuse a former SHA after a branch changes.
- Preserve Vercel Authentication/SSO and existing Deployment Protection. Do not open the site publicly, change GitHub protection or relax Supabase RBAC/RLS.
- Through authenticated Vercel project environment settings, set these TWO `target=preview`, **gitBranch=the exact PR head branch** variables (do not place them in the repository or Production):
  - `KINGS_HOSTED_PREVIEW_ALLOWED_SHA` = the exact current 40-character lowercase commit SHA.
  - `KINGS_HOSTED_PREVIEW_ALLOWED_REF` = that exact branch name, not `main`.
- Both values MUST match `VERCEL_GIT_COMMIT_SHA`/`VERCEL_GIT_COMMIT_REF` (and checkout SHA when present). An incomplete or stale pair keeps default Preview SKIP. The build gate preserves the existing Production path.
- From the authenticated Vercel connection, request **one** Git-sourced deployment of that exact `ref` and `sha`, targeted to Preview only; do not force a second build or use a mutable branch alias. A build can incur Vercel quota. Confirm the Git integration still supplies the environment variables to the Ignored Build Step; if they are unavailable, inspect platform settings rather than disabling validation.
- Independently read the returned Deployment ID and wait for `READY`; verify `target=preview`, project/team, exact SHA and original immutable URL. A CANCELED/ERROR deployment is not a PASS.
- Use the existing protected Hosted Preview QA workflow on this URL, or authorized read-only equivalent. It requires owner-only dispatch on `main` and current first-party PR/commit with successful GitHub CI. The protected URL's identity still needs Vercel API verification.
- If the test needs *authenticated writes or Viewer login*, independently prove Preview uses an isolated test Supabase database and dedicated test credentials. Never test destructive flows against Production, and do not treat anonymous route smoke as RLS write proof.

## Close authorization and record result
- After the one verified build, reset `KINGS_HOSTED_PREVIEW_ALLOWED_SHA` to an invalid SHA (e.g. `DISABLED`) and `KINGS_HOSTED_PREVIEW_ALLOWED_REF` to `DISABLED` with the same branch scope, or remove these variables using an authorized administrator route. Verify readback. Re-enable only for a fresh approved SHA.
- Report commit/deployment/URL/coverage and PASS/FAIL/UNTESTED; complete required checks and SOP16 Production release verification separately when that release is explicitly authorized.
- No duplicate Vercel Build, no bypass to Production, no automatic sending of LINE, no changes to Defect/Materials/Daily/Payroll/Calendar/Excel Sync.

**No additional micro-approval:** once a user has explicitly authorized Hosted Preview for a scoped PR/release and the effective account permissions are verified, the preceding QA substeps may proceed in one operation. Platform authentication, isolation, quotas and actual release gates remain real constraints.
