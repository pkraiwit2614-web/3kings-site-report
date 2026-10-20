# Local viewer E2E — isolated, zero new hosted projects

This workflow runs a **disposable Supabase Local Auth + PostgreSQL + PostgREST** stack inside the GitHub hosted runner. The schema is a minimal, read-only-verified five-table source-policy snapshot as of 2026-10-19, not a complete schema clone. It intentionally does not run the repository's 99 non-bootstrappable production migrations.

1. `supabase start` under `tests/e2e/local-stack/` (not root), default Docker stack with only local ports.
2. CI creates two synthetic Supabase Auth accounts; the first is active Viewer with no Owner role, the other is a fixture for profile RLS. Password random in the runner and masked; no passwords in repo, chat or artifacts.
3. The Next.js app builds/runs only on 127.0.0.1 against `http://127.0.0.1:54321`. Playwright blocks every external request, mock-empty responses for ancillary tables absent from the minimal snapshot, and blocks all browser business-data mutations.
4. Browser performs REAL local Auth password login, verifies role through the live Next.js `/api/access-control` route, loads Dashboard, Defect, Materials, and Reports with synthetic core rows, and tests Users/Payroll route/API denial.
5. REAL local PostgREST queries prove Viewer sees only own profile, can read synthetic Defect/Materials/Reports, cannot read the seeded payroll record, and receives denied INSERT requests (local test DB only).
6. Runner always stops/removes the local stack. No cloud Supabase branch/project, no Production or Vercel changes.

**Assurance boundary:** UI/Auth and local Postgres RLS are genuine, but policy coverage is limited to copied 2026-10-19 SELECT policies for the key tables and synthetic data. Drift from Production must be checked separately; passing this is *not* a full Production RLS audit. Ancillary empty mocked tables are not data-integration tests. No real customer, defect or payroll rows are imported.
