# 3 Kings Agent Core — preview-only Phase 1 / Phase 2

**Scope:** Additive preview-only code. No mutation integration, production deployment, triggers, database migration, new cron or scheduled background job. Existing 17 SOP Skills, original APIs and roles are unchanged.

## Endpoint

`POST /api/agent/read-only` with a real Supabase Bearer access token of the **active 3 Kings Owner**. Body is exactly `{"commandId":13,"mode":"inspect"}` or `{"commandId":14,"mode":"inspect"}`. Other command IDs 1–17 support only `"mode":"preflight"` (live SOP audit; never execute their write workflows). Other keys, commands or modes reject. No generic tool execution.

Checks: Server authenticates token with Supabase, validates active Owner and current role permission matrix, then reads the live SOP_INDEX row and **entire current SOP** from Drive using a read-only service identity, and rechecks both revisions. Missing identity, source, permission, revision, title or link fails closed. The response never returns SOP contents or Google identity credentials. The implementation supports Google Docs and text files only; unsupported MIME blocks.

For command 13, read the last 20 available `drive_sync_runs` entries using the caller's RLS-restricted client. This is **partial** evidence, not end-to-end Excel/Drive→Script→Supabase→UI verification. For command 14, read public GitHub main and optionally read Vercel production deployment using a separately configured read-only access token. This is **partial**, not an authenticated smoke or Supabase authorization test. Results never declare full PASS without source/UI evidence.

## Preview configuration (not installed by this PR)

Configure secrets through Vercel Preview Environment settings, not in git:

- `AGENT_SOP_INDEX_ID`: the verified live Google Sheets SOP index ID, **do not put an ID into the public repo**.
- `AGENT_GOOGLE_SERVICE_ACCOUNT_JSON`: authorized Google service account JSON with read-only access to the index and 17 linked SOP documents. A service identity must explicitly have access; never make internal Drive sources public.
- Optional `AGENT_VERCEL_READONLY_TOKEN`, `AGENT_VERCEL_PROJECT_ID`, `AGENT_VERCEL_TEAM_ID` to inspect the Vercel deployment. Token is server-only, least-privilege, and never logged.

The service account uses OAuth 2.0 JWT assertion and read-only Drive + Sheets scopes. Do not create or deploy keys or grant permissions without separate review. Missing configuration returns `BLOCK_*`, not a false success. Secrets must not use `NEXT_PUBLIC_`. No persistent audit logs or automatic scheduler in this phase; gate response is request-local only.

## Tests and activation gate

Run `node --test tests/agent-core-readonly.test.cjs` and `npm run build` on PR. Verify all seven read-only command classifications, revision-change denial, scope denial, auth denial, missing credentials, and no write APIs. Then test Preview with a legitimate Owner token and an intentionally missing SOP permission (must block), and with a fully authorized service identity (must read back the latest SOP). Check preview login plus existing Defect, Materials, Payroll, Sync, print and role workflows before requesting a separate Production authorization. No claim of active automation until credentials, live tests and explicit deployment approval exist.
