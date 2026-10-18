# 3 Kings Agent Core — preview-only Phase 1 / Phase 2

**Scope:** Additive preview-only code. No mutation integration, production deployment, triggers, database migration, new cron or scheduled background job. Existing 17 SOP Skills, original APIs and roles are unchanged.

## Endpoint

`POST /api/agent/read-only` with a real Supabase Bearer access token of the **active 3 Kings Owner**. Body is exactly `{"commandId":2,"mode":"inspect"}`, `{"commandId":4,"mode":"inspect"}`, `{"commandId":13,"mode":"inspect"}` or `{"commandId":14,"mode":"inspect"}`. Other command IDs 1–17 support only `"mode":"preflight"` (live SOP audit; never execute their write workflows). Other keys, commands or modes reject. No generic tool execution.

Checks: Server authenticates token with Supabase, validates active Owner and current role permission matrix, then reads the live SOP_INDEX row and **entire current SOP** from Drive using a read-only service identity, and rechecks both revisions. Missing identity, source, permission, revision, title or link fails closed. The response never returns SOP contents or Google identity credentials. The implementation supports Google Docs and text files only; unsupported MIME blocks.

For command 02, read a preliminary physical-room / Work Order / Combine inventory (not reconciled Flow counts). For command 04, flag candidate overdue source-active, not-started Work Orders by Bangkok calendar date (not hotel-verified closures); neither command changes any Defect status. For command 13, read the last 20 available `drive_sync_runs` entries using the caller's RLS-restricted client. This is **partial** evidence, not end-to-end Excel/Drive→Script→Supabase→UI verification. For command 14, read public GitHub main and optionally read Vercel production deployment using a separately configured read-only access token. This is **partial**, not an authenticated smoke or Supabase authorization test. Results never declare full PASS without source/UI evidence.

## Preview configuration (not installed by this PR)

Configure secrets through Vercel Preview Environment settings, not in git:

- `AGENT_SOP_INDEX_ID`: the verified live Google Sheets SOP index ID, **do not put an ID into the public repo**.
- **No JSON key is needed or accepted.** Vercel Preview injects a signed short-lived OIDC token in the function request header `x-vercel-oidc-token`.
- `AGENT_GCP_PROJECT_NUMBER`, `AGENT_GCP_POOL_ID`, `AGENT_GCP_PROVIDER_ID`, `AGENT_GCP_SERVICE_ACCOUNT_EMAIL` identify the existing Google Workload Identity Federation provider and impersonated Reader service account. These are non-secret identifiers.
- `AGENT_OIDC_EXPECTED_ISSUER`, `AGENT_OIDC_EXPECTED_AUDIENCE`, `AGENT_OIDC_EXPECTED_SUBJECT` constrain the token to the verified team, project and **preview** environment. Google STS checks the signature and Google IAM binding. Configure only for the dedicated PR Preview branch.
- Optional `AGENT_VERCEL_READONLY_TOKEN`, `AGENT_VERCEL_PROJECT_ID`, `AGENT_VERCEL_TEAM_ID` to inspect the Vercel deployment. Token is server-only, least-privilege, and never logged.

The server exchanges the Vercel OIDC JWT at Google STS for a short-lived federated token, then impersonates the allowlisted Reader service account via IAM Credentials to obtain Drive readonly and Sheets readonly scopes. The existing Google Cloud restriction on creating JSON private keys should stay enabled. Confirm the Google STS and IAM Credentials APIs are enabled and verify the provider's preview-only attribute condition and exact-subject `roles/iam.workloadIdentityUser` IAM binding. Do not give project-wide Owner/Editor roles. Missing configuration returns `BLOCK_*`, not a false success. Secrets must not use `NEXT_PUBLIC_`. No persistent audit logs or automatic scheduler in this phase; gate response is request-local only.

## Tests and activation gate

Run `node --test tests/agent-core-readonly.test.cjs tests/agent-readonly-inspectors.test.cjs tests/agent-oidc-google.test.cjs` and `npm run build` on PR. Verify all seven read-only command classifications, revision-change denial, scope denial, auth denial, missing credentials, and no write APIs. Then test Preview with a legitimate Owner token and an intentionally missing SOP permission (must block), and with a fully authorized service identity (must read back the latest SOP). Check preview login plus existing Defect, Materials, Payroll, Sync, print and role workflows before requesting a separate Production authorization. No claim of active automation until credentials, live tests and explicit deployment approval exist.
