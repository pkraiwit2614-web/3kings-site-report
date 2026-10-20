# 3 Kings Preview routing and safe hosted authorization (P0)

Effective only after this PR is merged, the Vercel project honors the committed `ignoreCommand`, and the read-only GitHub environment secrets are configured. This document does not authorize a Production release.

## Routes

| Purpose | Platform | Trigger | Vercel builds |
| --- | --- | --- | --- |
| Ordinary PR Build + regression | Existing GitHub Actions CI | PR | Never |
| UI / screenshot / isolated Viewer Auth, API, RLS | Existing Actions Playwright and disposable Supabase Local | PR / targeted run | Never |
| Vercel Hosted Preview verification | Authorized Hosted Preview QA workflow | Manual with a *pre-existing* exact-deployment URL | Zero new builds |
| New hosted deployment (if justified) | Separate controlled, approved on-demand workflow or authorized Vercel deployment | Explicit exceptional authorization and isolated Preview environment | On demand only |
| Production release | Existing main → Vercel integration | Explicit SOP16 release + required gates | Unchanged |

**Why this is safe:** `vercel.json` defaults to skipping all Git-triggered non-Production builds. It does not grant a Git commit or PR author the ability to bypass the quota gate using a commit marker. Returning exit 0 means SKIP. Returning exit 1 means BUILD; Production remains enabled.

## Hosted Vercel QA — permission and identity policy

The manual workflow `.github/workflows/hosted-preview-on-demand.yml` runs code checked out from trusted `main`, not PR source. Its authorizer checks:
1. GitHub actor is the verified repository owner; dispatch ref is `main`.
2. Open, non-draft, first-party PR HEAD matches the explicit commit SHA; CI for that exact SHA completed successfully.
3. URL is HTTPS root of an exact 3 Kings deployment on the allowed Vercel team hostname; never arbitrary URLs/redirects.
4. Vercel API (using a **read-only** token) proves deployment project ID, READY, non-Production and git SHA == PR SHA. Unknown/mismatched SHA → BLOCK, not PASS.
5. Protected read-only HTTP QA and optional anonymous Playwright run only after those checks. Viewer login stays UNTESTED until the actual Preview DB has independent isolation evidence.

The workflow does **not** create or rebuild a deployment; a Hosted Preview URL must already exist. Without that URL, a proven isolated data environment, or a read-only API token, Hosted QA is **BLOCKED**, not silently passed. It never uses Production Supabase service keys or Payroll records.

### Required one-time account controls

- In GitHub > Settings > Environments, protect environment `3kings-hosted-preview-qa` (restricted deployment branches: main; require reviewer if available). Keep this separate from Production environments.
- Provide `KINGS_VERCEL_READ_TOKEN` and `KINGS_VERCEL_PREVIEW_BYPASS` via GitHub Actions secrets (ideally environment-scoped); never commit them. The read token must only have deployment metadata read access if provider token scopes allow it.
- Verify Vercel project uses the repository `vercel.json` ignored-build rule; a project-level override must not supersede it. A skipped deployment is not a successful Preview.
- For a **new** Hosted URL, do not create a second Vercel Preview automatically. First confirm same-SHA existing deployment; if absent and URL/runtime test is mandatory, prepare a separately authorized short-lived Preview build and isolated Supabase credentials. No automatic Vercel deployment action is installed by this PR.

### Cloudflare and limits

As inspected on 2026-10-20, the connected Cloudflare account has Workers `3kings-i18n-qa` and `3kings-line-autopilot`, but **no Pages project**. Do not modify the existing Workers. This application's Next.js 15 uses Node runtime/native dependencies and API/Auth routes; a static export on Cloudflare Pages is not an equivalent full-stack Preview. A separate Worker/Cloudflare Pages architecture and its DB/auth compatibility must be validated before any hosted migration. GitHub Actions remains the no-Vercel Preview default today.

### QA / rollback

- `node --test tests/vercel-preview-gate.test.cjs tests/hosted-preview-authorization.test.mjs`
- Existing CI builds and all baseline regressions remain unchanged.
- Required GitHub checks must pass at the correct SHA. `SKIPPED` is never `PASS` and Local synthetic QA does not assert Hosted Auth or Production parity.
- Revert `vercel.json` ignore rule only via a reviewed PR if it blocks a required Production build; Production environment is intentionally allowed.
- None of Defect, Materials, Daily Reports, Payroll, Calendar, Excel Sync, RBAC/RLS, Supabase schema, Vercel Production environment or Cloudflare existing Workers are changed.
