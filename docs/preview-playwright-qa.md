# 3 Kings — Playwright protected Preview QA contract

This is **not** a production E2E approval. It extends PR #155 with browser-based, read-only tests, and is restricted to the single trusted first-party Preview branch.

## Modes
- **anonymous**: On a real protected Vercel deployment, verify Login UI, unauthenticated API HTTP 401, and direct-route redirects for Materials, Defect Report, Site Operations, Users and Payroll. Uses Vercel automation bypass header only for the verified 3 Kings Vercel hostname.
- **viewer**: Only after the browser backend is independently verified to use an **isolated** Supabase project. Log in with a dedicated \`viewer\` QA identity, verify authenticated API role/permissions, open Dashboard/Defects/Materials/Reports, and confirm Users and Payroll are rejected at API and UI route levels. Browser blocks writes (including activity_logs) and third-party access.
- **RLS**: Read-only API route authorization checked; backend write-side RLS must be tested separately on a seeded, isolated disposable DB. This suite deliberately **does not** send mutation probes, so a green check is **not** proof of write-side RLS.

## Required CI controls
- The GitHub deployment SHA must equal the HEAD of \`test/preview-qa-automation-20261019\`, under the active \`3Kings Trusted Preview\` Ruleset.
- Playwright test code must be pinned to an immutable reviewed commit, **not** the deployed PR revision.
- \`KINGS_VERCEL_PREVIEW_BYPASS\` GitHub Actions Secret: Vercel Deployment Protection Bypass for Automation. Never log it or add it to URLs, browser screenshots, traces or reports.
- Authenticated viewer mode requires all of: \`KINGS_E2E_ISOLATED_DB=CONFIRMED_ISOLATED_PREVIEW\`, \`KINGS_E2E_PREVIEW_SUPABASE_ORIGIN\` (an isolated \`https://<ref>.supabase.co\` origin DIFFERENT from the real DB), and \`KINGS_E2E_VIEWER_LOGIN\` / \`KINGS_E2E_VIEWER_PASSWORD\` GitHub Secrets. Do not enable the viewer job while Preview and Production share the same Supabase configuration.
- Authenticated tests must also verify the **deployed** Preview's public Supabase URL matches the isolated expected URL (otherwise all Supabase requests are blocked and login fails). The GitHub secret alone does not isolate the deployed app.
- Account provisioning must occur only in the isolated Supabase Auth, with its \`profiles\` row set \`role='viewer'\`, \`active=true\`, and no Owner/Admin/Payroll permissions. Do not create this account on Production.
- No storageState exports, traces, or screenshots of live user or hotel data. Do not record real room values or JWTs in CI output.
- Automatic \`viewer\` job remains **disabled** until the project has a verified isolated preview environment and viewer credentials stored via GitHub Actions Secrets, never chat.

## Change scope
Test-only files and a Preview QA workflow. No app runtime, roles, RLS, DB schema, Drive, Source of Truth, formulas, Defect, Materials, Daily Reports, payroll, or Production configurations are changed.

## Result interpretation
- HTTP 200 = Preview reached, not browser QA.
- Anonymous Playwright PASS = Login UI and no-session route gate only.
- Viewer Playwright PASS = viewer browser and read-only API authorization; not a DB write-RLS proof.
- Missing credentials, wrong target DB, unauthorized revision or bypass = **BLOCK**, never convert to PASS.
