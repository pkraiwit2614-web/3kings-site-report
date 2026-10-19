# SOP 01 — Defect Agent Executor (test branch only)

## Scope
This is an owner-authenticated API contract for the existing 3 Kings Defect command. It does NOT automatically install a ChatGPT plugin or grant access to a chat conversation. The owner must connect an approved authenticated app that forwards scoped Supabase OAuth. No credential should be pasted into prompts.

## Flow
1. POST /api/agent/defect/execute action=preview commandId=1 reads live SOP INDEX and SOP 01, validates the owner, permission matrix, room membership, Combine mapping and Work Order source, returns requestId and room/work IDs. Preview never writes.
2. POST same endpoint with action=execute, the same rooms and requestId, and confirmation=HOTEL_ENGINEER_ACCEPTED_CLOSE_ALL. Mutations require Preview environment and DEFECT_AGENT_EXECUTOR_ENABLED=true. Production remains disabled.
3. SQL RPC defect_agent_hotel_accepted_apply serializes, validates revisions and idempotency, closes unfinished work IDs through the existing authenticated RPC and saves changed Defect rooms with the existing audited manual-update RPC. One SQL transaction, rollback on error. Existing room defect_detail is preserved.
4. Existing Defect web-to-Excel queue updates two original XLSX workbooks in Drive. Existing Work Order pending queue is processed by the new Apps Script worker, which edits the original Work Order XLSX in place, writes a separate Hotel OK closure date (not the actual repair-completion date), verifies the bytes and acknowledges.
5. POST action=status returns verified only if all room and Work Order Excel acknowledgements have synced. A 202 response is queued, not complete.

## Installation and QA (must be explicitly authorized)
- Inspect main/Production, Supabase drift, current Drive and Apps Script triggers. Live DB currently has Work Order complete and writeback RPCs; the GitHub migration chain may not, so reconcile environment first.
- Apply the migration only to an isolated Preview DB before Production consideration. Confirm Auth, RLS, changes to historical data, rollback, missing/dead roles, Combine, source revisions and idempotency.
- Install DefectAgentWorkOrderWriteback_2026-10-19.gs as an independent file in the existing 3 Kings Apps Script project alongside DefectExcelWriteback_2026-10-13.gs and WorkOrderAutoSync_2026-10-15.gs. Confirm WORK_ORDER_FILE_ID and existing sync key without exposing them. Run dryRunDefectAgentWorkOrder20261019; verify original file identity, two worksheet layouts, formula protections, Backup and no writes. Install its own trigger only when tests pass, keeping original triggers.
- Perform code tests + Next build + protected module regression. Test synthetic closures first; preview the requested 12 groups (14 room IDs including two Combine pairs) against the latest DB without writing Production.
- Owner must explicitly connect an authenticated ChatGPT app/plugin before normal-chat writes become possible. HTTP endpoint creation alone does not provide ChatGPT account identity. Do not disable Vercel SSO or copy Owner JWT into code.

## Safety
No general ChatGPT write access, no unrestricted service role, no bypass of SOP Gate, RBAC/RLS or original approval. No unrelated edits to Materials, Daily, Payroll, Calendar, OOO/OOS, Work Plan or Defect photos. Two-way Excel writebacks are a non-atomic cross-service saga; a failed workbook write stays pending/error and retries, without reporting completion. A date recorded as Hotel OK closure must not be represented as the actual repair date. Full readback and Excel→Supabase→Web reconciliation are mandatory before Production claims.

## Staging safeguards, status as of 2026-10-19
- Preview Vercel variable AGENT_SOP_INDEX_ID is pinned to the real live SOP INDEX; DEFECT_AGENT_EXECUTOR_ENABLED remains **false** for this Git branch.
- A dedicated staging database is required before execution. Configure both DEFECT_AGENT_STAGING_SUPABASE_URL and DEFECT_AGENT_STAGING_SUPABASE_PUBLISHABLE_KEY as encrypted, branch-scoped Preview variables; never set the URL to Production. The API rejects writes unless the separate staging project is configured and authenticated.
- Creation of a Supabase Development Branch requires explicit hourly-cost approval from the owner; do not create until approved. Production schema and rows must not be used as a test fixture for writes.
- No Google Apps Script management connector is currently installed in this chat. This repository worker is not deployed into the user's Apps Script project; run the independent in-memory dry run there before enabling its trigger.
- The original Work Order import is Excel→DB; add the closure-preserving import migration on staging so stale Excel cannot revive accepted work while outbound writeback is pending.
- ChatGPT normal-chat execution still requires an installed owner-approved external app providing OAuth and the new executor tool. A Next.js API route does not self-register as a ChatGPT plugin or automatically act for an ordinary chat.
