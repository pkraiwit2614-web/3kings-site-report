# 3 Kings — P0-B Central Error Log + Apps Script Trigger Inventory

**Status:** CODE STAGED ONLY / NO DEPLOY / NO LIVE CONNECTION / NO TRIGGER / NO EXECUTOR DISPATCH  
**Date:** 2026-10-20, Asia/Bangkok  
**Baseline:** GitHub `main` commit `03d8e8bd6de8bf940eb023756a067f5b69acd976`  
**Authority:** Google Drive `00-SOP_INDEX`, SOP 13 v1.2, SOP 15 v1.2, SOP 17 v1.2. Do not copy SOP content into public logs.

## Goal and current boundary

1. Collect **actual installed trigger registrations for the executing account** from each Apps Script project via `ScriptApp.getProjectTriggers()`. It is not an all-owners list. `ScriptApp` does not expose trigger enabled state, exact recurrence, or execution history. Those fields remain **UNVERIFIED** until separate authorized execution evidence is supplied. No silent inference from source code.
2. Normalize metadata-only failures from Apps Script, Supabase sync runs, GitHub Actions, Vercel builds, Cloudflare Workers and LINE delivery into a common event format.
3. Deduplicate identical occurrences; preserve distinct repeated errors. Suggest an investigator / executor route. **Never dispatch** from this phase.
4. Keep secrets, private Drive IDs, personal details, customer rooms, payroll, raw error messages, access tokens, and stacks out of public GitHub or the central record.

## What is implemented

| Component | Staging file | Behaviour |
| --- | --- | --- |
| GAS inventory collector | `docs/apps-script/AI_Operations_Trigger_Inventory_ReadOnly_2026-10-20.gs` | Read installed triggers for current executing account; no trigger changes, network or writes |
| Error normalization + triage | `scripts/ai-operations/central-error-log.cjs` | Offline pure functions, allowlisted sources, metadata-only, hashed IDs, severity and proposed executor |
| Offline CLI | `scripts/ai-operations/triage-cli.cjs` | Read authorized local JSON snapshot, write local report only (never overwrite input/output) |
| Future DB design | `docs/sql/AI_OPERATIONS_CENTRAL_ERROR_LOG_PROPOSAL_DO_NOT_APPLY.sql` | Private schema + append-only-style log design; **not a migration and never applied** |
| Tests | `tests/ai-operations-central-error-log.test.cjs` | No dispatch, no secret retention, dedupe, quarantine, GAS coverage and CLI overwrite guards |

## Data flow (future activation, not now)

`Authorized source read -> Sanitized snapshot -> Validate -> Fingerprint/dedupe -> Central Error Log (private) -> ChatGPT read-only analysis -> Executor suggestion -> Live SOP Gate + verified permission + explicit workflow scope -> Executor -> independent QA`

Current phase stops **before** central DB writes and before any executor calls. A suggested executor is not an authorization grant.

## Proposed executor routing (never invoked)

| Source | Proposed investigator | Automatic execution |
| --- | --- | --- |
| GAS_TRIGGER / GAS_EXECUTION | apps-script-investigator | OFF |
| SUPABASE_SYNC | sync-investigator | OFF |
| GITHUB_ACTIONS | github-ci-investigator | OFF |
| VERCEL_BUILD | vercel-build-investigator | OFF |
| CLOUDFLARE_WORKER | cloudflare-worker-investigator | OFF |
| LINE_DELIVERY | line-delivery-investigator | OFF |

`AUTH`, `PERMISSION`, `RLS`, `TOKEN`, `SECRET`, `PAYROLL` or other sensitive errors always require manual security review.

## How to obtain *real* GAS status later (requires separate activation approval)

- Identify each **live** Apps Script project and the owner account(s), matching project/script IDs and current triggers against SOP 13 / P0-A Inventory. Do not infer IDs from filenames.
- In the authorized project, add the collector as a separate `.gs` file; do **not** replace or modify existing `.gs` functions, `appsscript.json`, triggers or properties.
- Run `preview3KingsAppsScriptTriggerSnapshot()` **manually** once under the owner account, then inspect returned JSON in the execution log. This is a manual read, not a scheduler installation. Running this step may require standard Google authorization; it has **not** been run as part of P0-B staging.
- Repeat per project and per account that owns triggers. Missing other-owner triggers must remain UNKNOWN, not counted as zero.
- To verify **last execution / success / error**, separately read the project’s Executions / Cloud Logging under authorized access; reconcile with Supabase audit rows and actual destination data. Do not treat registered trigger = healthy sync.
- Future connection can use a **separate authorized, least-privilege collector transport**. No webhook, OAuth scope change, service-role key, Cloudflare Worker or Supabase write has been configured in this stage.

## QA gates before future activation

1. **GAS:** prove project ID, owner coverage, trigger UID hash, handler, schedule from authoritative configuration and latest execution evidence; capture expected vs actual counts. No removal of the existing nine or any other triggers.
2. **Error log:** validate no sensitive payload retained; replay two identical events and two distinct occurrences; verify stable dedupe and no loss of historical failures.
3. **Auth:** review private-schema grants, RLS, service identity, no anon/authenticated write/read, and no exposure via the Data API; no SECURITY DEFINER escape.
4. **Executor:** each route has explicit read-only capability until a live SOP Gate and permission check; no dynamic arbitrary URL, SQL, deployment, trigger or LINE action.
5. **Rollout:** review PR/CI on an isolated branch; separately authorize staging integration and then Production only after readback. User has explicitly requested **NO DEPLOY OR ACTIVATION** for this phase.

## Risks / unresolved

- No Apps Script connector with access to the owner’s live trigger registry was available in this session. The collector code is ready but **not installed**; real trigger connection remains **PENDING**.
- A GAS project can contain installable triggers owned by other accounts; current-owner inventory is incomplete by design.
- Vercel and Cloudflare current runtime logs, GAS execution history and LINE delivery results require source-specific authorized collectors; this phase supports normalized snapshots only, not always-on monitoring.
- The proposed SQL has not been applied; **Central Error Log is not running** and ChatGPT is not receiving background notifications.
- Existing `main` and Production, Supabase schema/data, Apps Script projects/triggers, Cloudflare Workers, Vercel settings and LINE groups are unchanged.

## Offline smoke test

```bash
node --test tests/ai-operations-central-error-log.test.cjs
node scripts/ai-operations/triage-cli.cjs --input /path/to/authorized-snapshot.json --output /path/to/new-report.json
```

**Accepted event example** (synthetic, no private identifiers):

```json
[{"source":"SUPABASE_SYNC","component":"materials","state":"FAILED","code":"SYNC_RUN_ERROR","occurredAt":"2026-10-20T07:00:00Z","eventId":"synthetic-1"}]
```