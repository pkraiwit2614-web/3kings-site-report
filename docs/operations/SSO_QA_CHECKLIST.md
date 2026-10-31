# 3 Kings | Protected QA access and SSO troubleshooting
Updated: 2026-10-26. Status: PREPARATION (not an active Production browser QA).

## Current boundaries
- Project: 3kings-site-report. Vercel Authentication stays enabled.
- Vercel protected-page fetch using an authorized connector has returned HTTP 200 for /login, /defects and /reports.
- Those responses show a client-side "checking permissions" shell, not a completed signed-in browser session.
- App authentication (Supabase) and RBAC/RLS are independent of Vercel deployment protection.
- Source reconciliation for hotel rooms must use authoritative Drive files and Supabase reads, not inferred browser contents.

## Standard QA path
1. **Data only:** read latest Drive source and compare to Supabase; record room count, key status fields, source revision and sync timestamp.
2. **Deployment only:** read project/deployment from the authenticated Vercel connector and fetch exact Production URL. HTTP 200 means REACHABLE_ONLY.
3. **Preview UI and authorization:** reuse .github/workflows/local-viewer-e2e.yml and preview-playwright-e2e.yml. For hosted QA use hosted-preview-on-demand.yml only with existing owner/first-party SHA and CI approval gates.
4. **Production UI:** a new, separately reviewed authenticated Playwright job is required. It must use an explicitly approved least-privilege QA identity and short-lived environment-bound credentials. Do not run it until its identity and safeguards are verified.
5. **Evidence:** collect deployment SHA, path, test role (never identity secret), rendered UI assertion, backend/RLS checks, and Bangkok timestamp. Report PASS only for observed checks.

## Error classification
| Evidence | Classification | Next step |
|---|---|---|
| Vercel authentication page or protected 401/403 | VERCEL_PROTECTION | Use authorized connector or scoped trusted QA identity; keep SSO enabled |
| HTTP 200 with permission-loading shell | REACHABLE_ONLY | Requires authenticated browser and rendered assertions |
| Application login redirect / no Supabase session | APP_AUTH_REQUIRED | Use approved app test account |
| Authenticated 403 | RBAC_DENIED | Verify intended role and RLS; do not elevate account |
| Missing QA identity / unconfigured trust | BLOCKED_SETUP | Do not claim E2E PASS |
| HTTP 5xx | DEPLOYMENT_OR_APP_ERROR | Inspect Vercel logs, commit SHA and runtime; do not assume SSO |

## Production activation prerequisites (not yet met)
- [ ] Confirm exact Production deployment and allowed test paths.
- [ ] Owner approves separate QA identity and narrowly scoped read-only access.
- [ ] Configure trusted identity with environment-specific OIDC and exact project/team scope; use short-lived credentials and reviewed environment approvals.
- [ ] Implement browser tests for /defects, /reports, hotel room A416/A727 and anonymous/non-owner denial; never perform writes.
- [ ] Confirm negative tests, secrets redaction, token expiry and no public bypass links.
- [ ] Review PR, pass CI, and authorize Production rollout separately.

## Do not change
No SSO disablement; no permanent protection bypass; no Owner password or tokens in source, screenshots, URLs or logs; no Production permission matrix, Defect lifecycle, Materials, Calendar, LINE, database migrations or deployment changes as part of this preparation.

## Completion definitions
- **READY_FOR_IMPLEMENTATION:** documentation and boundaries reviewed.
- **READY_FOR_ACTIVATION:** identity, OIDC, protected workflow, CI and security approval verified.
- **E2E_PASS:** browser actually rendered expected rooms/data after authenticated login, with evidence and no writes.

The Vercel connector path is the default for HTTP checks now; authenticated browser E2E remains PENDING until separately implemented and approved.

## Implemented in PR #225
- `scripts/production-sso-preflight.mjs`: exact-origin, GET-only, redirect-manual, no-credential SSO classifier for /login, /defects and /reports.
- `tests/production-sso-preflight.test.mjs`: verifies protected HTTP status, client-loading shell, no arbitrary host, no token/cookie, and failure handling.
- `.github/workflows/production-sso-boundary.yml`: PR contract test; after reviewed merge, optional manual main-only HTTP diagnostic. Never deploys, uses no secrets, and cannot claim UI E2E PASS.
- GitHub PR CI must pass before review. Do not merge automatically while Production identity and authorization E2E remain incomplete.

## Approved separate QA identity (2026-10-26)
- User authorized `p.kraiwit2614+3kingsqa@gmail.com` as **Viewer-only QA**, distinct from the existing base-email `manager` account. A Gmail plus alias routes to the same mailbox and is not independently secure.
- Supabase Production preflight found the QA alias absent from both `auth.users` and `public.profiles`. Account has **not** been provisioned.
- Create using the normal Supabase Auth administrative invite flow, not direct SQL writes to `auth.users`. Complete invitation and verify a distinct auth UID and a dedicated `viewer` profile. Never modify the existing manager role.
- QA session must not have write permissions. Verify allowed /defects and /reports, denied payroll and users, RLS isolation and zero mutating requests. Record FAIL/BLOCKED if not observed.
- Protect QA authentication with scoped short-lived secrets and reviewed GitHub environment gates. Keep Vercel SSO enabled; do not leak bearer tokens, share URLs, session state, passwords or bypass secrets.
- **Remaining external setup**: Auth invite/create user and GitHub environment secret administration are not supported by currently connected actions. Until configured, authenticated Production E2E must remain PENDING.
